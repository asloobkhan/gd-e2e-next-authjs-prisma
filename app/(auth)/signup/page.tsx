'use client';

import { useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signupAction } from '@/server/actions/signup';

export default function SignupPage() {
  const router = useRouter();
  const [emailVerified, setEmailVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    const name = String(form.get('name') ?? '');

    if (!emailVerified) {
      setError('Please verify your email first (demo button).');
      return;
    }

    setSubmitting(true);
    try {
      const result = await signupAction({
        email,
        password,
        name,
        emailVerified: true,
      });

      if (!result.ok) {
        setError(
          result.error === 'EMAIL_EXISTS'
            ? 'An account with this email already exists.'
            : 'Invalid input.',
        );
        return;
      }

      // Auto sign-in after signup using the credentials we just registered.
      const signInResult = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });
      if (signInResult?.error) {
        setError('Account created but sign-in failed. Please try logging in.');
        return;
      }
      router.push('/');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: '40px auto', padding: 16 }}>
      <h1>Sign up</h1>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
        <label>
          Email
          <input name="email" type="email" required style={inputStyle} />
        </label>
        <button
          type="button"
          onClick={() => setEmailVerified(true)}
          disabled={emailVerified}
          style={secondaryButton}
        >
          {emailVerified ? '✓ Email verified (demo)' : 'Verify email (demo)'}
        </button>

        <label>
          Password
          <input
            name="password"
            type="password"
            minLength={8}
            required
            style={inputStyle}
          />
        </label>
        <label>
          Name
          <input name="name" required style={inputStyle} />
        </label>

        <button type="submit" disabled={submitting || !emailVerified} style={primaryButton}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>

        {error && <p style={{ color: 'crimson', margin: 0 }}>{error}</p>}
      </form>

      <hr style={{ margin: '24px 0' }} />

      <button
        type="button"
        onClick={() => signIn('google', { callbackUrl: '/' })}
        style={primaryButton}
      >
        Continue with Google
      </button>

      <p style={{ marginTop: 16 }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '8px 10px',
  marginTop: 4,
  border: '1px solid #ccc',
  borderRadius: 4,
};

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
  padding: '10px 12px',
  border: '1px solid #111',
  borderRadius: 4,
  background: '#fff',
  color: '#111',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 500,
};
