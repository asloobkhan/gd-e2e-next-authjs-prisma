'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import {
  linkOAuthToCurrentUser,
  linkOAuthWithPassword,
} from '@/server/actions/link-account';

interface BaseProps {
  provider: string;
  providerAccountId: string;
  email: string;
}

export function LinkAlreadySignedIn(props: BaseProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setError(null);
    setSubmitting(true);
    const result = await linkOAuthToCurrentUser({
      provider: props.provider,
      providerAccountId: props.providerAccountId,
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push('/account');
    router.refresh();
  }

  return (
    <main style={pageStyle}>
      <h1>Link {props.provider}</h1>
      <p>
        Link <strong>{props.provider}</strong> ({props.email}) to your existing
        account?
      </p>
      <button onClick={onConfirm} disabled={submitting} style={buttonStyle}>
        {submitting ? 'Linking…' : 'Confirm and link'}
      </button>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </main>
  );
}

export function LinkWithPasswordForm(props: BaseProps & { hasPassword: boolean }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!props.hasPassword) {
    return (
      <main style={pageStyle}>
        <h1>Cannot link {props.provider}</h1>
        <p>
          The account for <strong>{props.email}</strong> has no password set
          (it was created via another OAuth provider). Sign in with that
          provider first, then connect {props.provider} from your account
          page.
        </p>
      </main>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    const password = String(form.get('password') ?? '');

    const result = await linkOAuthWithPassword({
      provider: props.provider,
      providerAccountId: props.providerAccountId,
      email: props.email,
      password,
    });

    if (!result.ok) {
      setSubmitting(false);
      setError(
        result.error === 'INVALID_PASSWORD'
          ? 'Incorrect password.'
          : result.error,
      );
      return;
    }

    // Linked successfully — sign the user in via the OAuth provider so a
    // session is created without forcing them to log in again.
    await signIn(props.provider, { callbackUrl: '/account' });
  }

  return (
    <main style={pageStyle}>
      <h1>Link {props.provider} to existing account</h1>
      <p>
        An account for <strong>{props.email}</strong> already exists. Confirm
        ownership by entering its password.
      </p>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            style={inputStyle}
          />
        </label>
        <button type="submit" disabled={submitting} style={buttonStyle}>
          {submitting ? 'Linking…' : 'Confirm and link'}
        </button>
        {error && <p style={{ color: 'crimson', margin: 0 }}>{error}</p>}
      </form>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 420,
  margin: '40px auto',
  padding: 16,
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '8px 10px',
  marginTop: 4,
  border: '1px solid #ccc',
  borderRadius: 4,
};

const buttonStyle: React.CSSProperties = {
  padding: '10px 12px',
  border: '1px solid #333',
  borderRadius: 4,
  background: '#fafafa',
  cursor: 'pointer',
};
