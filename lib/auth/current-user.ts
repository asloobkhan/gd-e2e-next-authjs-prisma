import { redirect } from 'next/navigation';
import { auth } from './index';

export type AuthSource = 'session' | 'api-token';

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  source: AuthSource;
}

/**
 * Single entry point for "who is the caller?" across pages, route handlers,
 * and server actions. Today it only resolves the session cookie. When API
 * tokens land later, the Bearer-token branch slots in here without
 * touching any caller.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // (Future: Authorization: Bearer <token> check goes here.)

  const session = await auth();
  if (!session?.user?.id) return null;

  return {
    id: session.user.id,
    email: session.user.email ?? '',
    name: session.user.name ?? null,
    image: session.user.image ?? null,
    source: 'session',
  };
}

/** Convenience guard for protected pages — redirects to /login if absent. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}
