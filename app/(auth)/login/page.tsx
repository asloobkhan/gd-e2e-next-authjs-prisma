'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/';
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    const result = await signIn('credentials', {
      email: form.get('email'),
      password: form.get('password'),
      redirect: false,
    });

    setSubmitting(false);
    if (result?.error) {
      setError('Invalid email or password.');
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 360, margin: '40px auto', padding: 16 }}>
      <h1>Sign in</h1>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
        <label>
          Email
          <input name="email" type="email" required style={inputStyle} />
        </label>
        <label>
          Password
          <input name="password" type="password" required style={inputStyle} />
        </label>
        <button type="submit" disabled={submitting} style={primaryButton}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        {error && <p style={{ color: 'crimson', margin: 0 }}>{error}</p>}
      </form>

      <hr style={{ margin: '24px 0' }} />

      <button
        type="button"
        onClick={() => signIn('google', { callbackUrl })}
        style={primaryButton}
      >
        Continue with Google
      </button>

      <p style={{ marginTop: 16 }}>
        New here? <Link href="/signup">Create an account</Link>
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
