import Link from 'next/link';
import { requireUser } from '@/lib/auth/current-user';
import { SignOutButton } from './sign-out-button';

export default async function HomePage() {
  const user = await requireUser();

  return (
    <main style={{ maxWidth: 480, margin: '40px auto', padding: 16 }}>
      <h1>Welcome, {user.name ?? user.email}</h1>
      <p>You are signed in as {user.email}.</p>
      <ul>
        <li>
          <Link href="/account">Manage sign-in methods</Link>
        </li>
      </ul>
      <SignOutButton />
    </main>
  );
}
