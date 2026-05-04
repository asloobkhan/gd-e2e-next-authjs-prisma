'use client';

import { signOut } from 'next-auth/react';

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      style={{
        padding: '8px 12px',
        border: '1px solid #111',
        borderRadius: 4,
        background: '#fff',
        color: '#111',
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 500,
      }}
    >
      Sign out
    </button>
  );
}
