// Map of provider id → Auth.js account `type` value.
// Single source of truth so auto-linking (via adapter.linkAccount) and
// manual linking (via /link-account server actions) write the same value.
//
// Add a new provider here when you add it to the providers[] array in
// lib/auth/index.ts.
export const PROVIDER_TYPES: Record<string, 'oauth' | 'oidc'> = {
  google: 'oidc',
};

export function providerType(provider: string): 'oauth' | 'oidc' {
  return PROVIDER_TYPES[provider] ?? 'oauth';
}
