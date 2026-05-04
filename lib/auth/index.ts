import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { encode as defaultEncode } from 'next-auth/jwt';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db';
import { adapter } from './adapter';
import { SESSION_MAX_AGE_MS } from './constants';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { auth, signIn, signOut, handlers } = NextAuth({
  adapter,

  providers: [
    Credentials({
      credentials: {
        email: { type: 'email' },
        password: { type: 'password' },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        // OAuth-only accounts have no password — block credentials login.
        if (!user?.password) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.password);
        return ok ? user : null;
      },
    }),

    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      // Don't auto-merge an OAuth login with a same-email existing user.
      // The signIn callback below redirects to /link-account for explicit
      // confirmation instead.
      allowDangerousEmailAccountLinking: false,
    }),
  ],

  callbacks: {
    /**
     * OAuth-only branching. Credentials always passes through here.
     *
     *   1. (provider, providerAccountId) is already linked → adapter handles
     *      the rest. Return true.
     *   2. The OAuth email matches an existing user → bounce to
     *      /link-account so the user explicitly confirms (or proves
     *      ownership via password) before the link is created.
     *   3. New email → adapter auto-creates user + account. Return true.
     */
    async signIn({ user, account, profile }) {
      if (!account || account.provider === 'credentials') return true;

      const existing = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
        },
      });
      if (existing) return true;

      const email = user.email ?? profile?.email;
      if (!email) return false;

      const emailOwner = await prisma.user.findUnique({ where: { email } });
      if (emailOwner) {
        const params = new URLSearchParams({
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          email,
        });
        return `/link-account?${params.toString()}`;
      }

      return true;
    },

    // Mark credentials sessions so jwt.encode below can branch on it.
    async jwt({ token, account }) {
      if (account?.provider === 'credentials') {
        token.credentials = true;
      }
      return token;
    },

    // Surface the user id; sliding-window updates happen in the adapter.
    async session({ session, user }) {
      if (user?.id) {
        session.user.id = user.id;
      }
      return session;
    },
  },

  /**
   * The compatibility trick that lets Credentials coexist with database
   * sessions. For OAuth, NextAuth never calls jwt.encode — the adapter
   * sets the cookie to a sessionToken directly. For Credentials, encode
   * is called; we mint a sessionToken, persist a Session row through the
   * adapter, and return that token as the cookie value. From here on the
   * cookie shape is identical for both providers.
   */
  jwt: {
    async encode(params) {
      if (params.token?.credentials) {
        if (!params.token.sub) {
          throw new Error('Missing user id on credentials token');
        }
        const sessionToken = uuidv4();
        const created = await adapter.createSession!({
          sessionToken,
          userId: params.token.sub,
          expires: new Date(Date.now() + SESSION_MAX_AGE_MS),
        });
        if (!created) throw new Error('Failed to create credentials session');
        return sessionToken;
      }
      return defaultEncode(params);
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },
});
