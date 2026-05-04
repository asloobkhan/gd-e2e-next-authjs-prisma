import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current-user';
import { LinkAlreadySignedIn, LinkWithPasswordForm } from './forms';

interface PageProps {
  searchParams: Promise<{
    provider?: string;
    providerAccountId?: string;
    email?: string;
  }>;
}

export default async function LinkAccountPage({ searchParams }: PageProps) {
  const { provider, providerAccountId, email } = await searchParams;
  if (!provider || !providerAccountId || !email) {
    redirect('/login');
  }

  const current = await getCurrentUser();
  const owner = await prisma.user.findUnique({ where: { email } });

  // Sanity: the email is supposed to match an existing user — that's the
  // whole reason signIn callback bounced here.
  if (!owner) redirect('/login');

  // Path A: caller is signed in as the same user → just confirm.
  if (current && current.id === owner.id) {
    return (
      <LinkAlreadySignedIn
        provider={provider}
        providerAccountId={providerAccountId}
        email={email}
      />
    );
  }

  // Path B: caller is signed out (or signed in as someone else).
  // Require password to prove ownership.
  return (
    <LinkWithPasswordForm
      provider={provider}
      providerAccountId={providerAccountId}
      email={email}
      hasPassword={!!owner.password}
    />
  );
}
