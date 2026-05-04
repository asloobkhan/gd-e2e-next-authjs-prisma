'use client';

import { signOut } from 'next-auth/react';

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      style={{
        padding: '8px 12px',
        border: '1px solid #333',
        borderRadius: 4,
        background: '#fafafa',
        cursor: 'pointer',
      }}
    >
      Sign out
    </button>
  );
}
