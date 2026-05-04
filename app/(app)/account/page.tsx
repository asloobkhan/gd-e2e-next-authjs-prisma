import Link from 'next/link';
import { requireUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db';
import { ConnectGoogleButton, DisconnectButton } from './buttons';

export default async function AccountPage() {
  const user = await requireUser();
  const accounts = await prisma.account.findMany({
    where: { userId: user.id },
    select: { provider: true, providerAccountId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const hasGoogle = accounts.some((a) => a.provider === 'google');

  return (
    <main style={{ maxWidth: 520, margin: '40px auto', padding: 16 }}>
      <p>
        <Link href="/">← Home</Link>
      </p>
      <h1>Sign-in methods</h1>
      <p>Signed in as {user.email}</p>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {accounts.map((a) => (
          <li
            key={a.provider}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '12px 0',
              borderBottom: '1px solid #eee',
            }}
          >
            <span>
              <strong>{a.provider}</strong>
              <br />
              <small style={{ color: '#666' }}>
                {a.providerAccountId}
              </small>
            </span>
            <DisconnectButton
              provider={a.provider}
              disabled={accounts.length <= 1}
            />
          </li>
        ))}
      </ul>

      {!hasGoogle && (
        <div style={{ marginTop: 24 }}>
          <ConnectGoogleButton />
        </div>
      )}
    </main>
  );
}
