'use server';

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { providerType } from '@/lib/auth/provider-types';

export type LinkResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | 'ALREADY_LINKED'
        | 'INVALID_INPUT'
        | 'USER_NOT_FOUND'
        | 'INVALID_PASSWORD'
        | 'NO_PASSWORD_ON_ACCOUNT'
        | 'LAST_METHOD';
    };

const linkInputSchema = z.object({
  provider: z.string().min(1),
  providerAccountId: z.string().min(1),
});

/**
 * Path A: the user is already signed in. They came from /account → "Connect
 * Google", went through OAuth, the email matched themselves, and we want to
 * link explicitly. No additional proof needed beyond the existing session.
 */
export async function linkOAuthToCurrentUser(input: unknown): Promise<LinkResult> {
  const parsed = linkInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const user = await requireUser();
  const data = parsed.data;

  const existing = await prisma.account.findUnique({
    where: {
      userId_provider: { userId: user.id, provider: data.provider },
    },
  });
  if (existing) return { ok: false, error: 'ALREADY_LINKED' };

  await prisma.account.create({
    data: {
      userId: user.id,
      provider: data.provider,
      providerAccountId: data.providerAccountId,
      type: providerType(data.provider),
    },
  });
  return { ok: true };
}

/**
 * Path B: the user is signed out. OAuth came back with an email that
 * matches an existing user. They prove ownership of that account by
 * entering its password before we link the new provider.
 */
const linkWithPasswordSchema = linkInputSchema.extend({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function linkOAuthWithPassword(input: unknown): Promise<LinkResult> {
  const parsed = linkWithPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const data = parsed.data;
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user) return { ok: false, error: 'USER_NOT_FOUND' };
  if (!user.password) return { ok: false, error: 'NO_PASSWORD_ON_ACCOUNT' };

  const ok = await bcrypt.compare(data.password, user.password);
  if (!ok) return { ok: false, error: 'INVALID_PASSWORD' };

  const existing = await prisma.account.findUnique({
    where: {
      userId_provider: { userId: user.id, provider: data.provider },
    },
  });
  if (existing) return { ok: false, error: 'ALREADY_LINKED' };

  await prisma.account.create({
    data: {
      userId: user.id,
      provider: data.provider,
      providerAccountId: data.providerAccountId,
      type: providerType(data.provider),
    },
  });
  return { ok: true };
}

/**
 * Disconnect a linked provider. Refuses to remove the user's last sign-in
 * method — losing it would lock them out.
 *
 * Every sign-in method (credentials included) has a row in `accounts`
 * because signup inserts one with provider='credentials'. So "remaining
 * methods" is simply the count of remaining account rows.
 *
 * Disconnecting credentials also nulls out user.password so the
 * authorize() guard rejects future credentials attempts.
 */
export async function disconnectProvider(provider: string): Promise<LinkResult> {
  const user = await requireUser();

  const accounts = await prisma.account.findMany({
    where: { userId: user.id },
    select: { provider: true },
  });

  const willRemain = accounts.filter((a) => a.provider !== provider).length;
  if (willRemain < 1) return { ok: false, error: 'LAST_METHOD' };

  await prisma.$transaction(async (tx) => {
    await tx.account.deleteMany({ where: { userId: user.id, provider } });
    if (provider === 'credentials') {
      await tx.user.update({ where: { id: user.id }, data: { password: null } });
    }
  });
  return { ok: true };
}
