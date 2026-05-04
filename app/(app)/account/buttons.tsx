'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { disconnectProvider } from '@/server/actions/link-account';

export function ConnectGoogleButton() {
  return (
    <button
      onClick={() => signIn('google', { callbackUrl: '/account' })}
      style={primaryButton}
    >
      Connect Google
    </button>
  );
}

export function DisconnectButton({
  provider,
  disabled,
}: {
  provider: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span>
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await disconnectProvider(provider);
            if (!result.ok) {
              setError(
                result.error === 'LAST_METHOD'
                  ? 'Cannot remove your only sign-in method.'
                  : result.error,
              );
              return;
            }
            router.refresh();
          });
        }}
        title={
          disabled
            ? 'Cannot remove your only sign-in method'
            : `Disconnect ${provider}`
        }
        style={secondaryButton}
      >
        {pending ? 'Disconnecting…' : 'Disconnect'}
      </button>
      {error && (
        <div style={{ color: 'crimson', fontSize: 12, marginTop: 4 }}>
          {error}
        </div>
      )}
    </span>
  );
}

const primaryButton: React.CSSProperties = {
  padding: '10px 12px',
  border: '1px solid #111',
  borderRadius: 4,
  background: '#111',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 500,
};

const secondaryButton: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #111',
  borderRadius: 4,
  background: '#fff',
  color: '#111',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 500,
};
