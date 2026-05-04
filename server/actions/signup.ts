'use server';

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  // Demo: the client flips this to true after the (fake) "Verify email"
  // button. In a real implementation this would be the result of a
  // verified token round-trip and the action would re-check it server-side.
  emailVerified: z.literal(true),
});

export type SignupResult =
  | { ok: true; userId: string }
  | { ok: false; error: 'EMAIL_EXISTS' | 'INVALID_INPUT' };

export async function signupAction(input: unknown): Promise<SignupResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const data = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) return { ok: false, error: 'EMAIL_EXISTS' };

  const hashed = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: {
      email: data.email,
      password: hashed,
      name: data.name,
      emailVerified: new Date(),
      accounts: {
        create: {
          type: 'credentials',
          provider: 'credentials',
          providerAccountId: data.email,
        },
      },
    },
  });

  return { ok: true, userId: user.id };
}
