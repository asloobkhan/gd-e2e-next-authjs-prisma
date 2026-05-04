import { PrismaAdapter } from '@auth/prisma-adapter';
import type { Adapter, AdapterAccount, AdapterSession } from 'next-auth/adapters';
import { prisma } from '../db';
import { ACTIVITY_THROTTLE_MS, IDLE_TIMEOUT_MS } from './constants';

const base = PrismaAdapter(prisma);

// Sliding-window-aware adapter.
// Wraps PrismaAdapter to handle two concerns the base adapter doesn't:
//   1. getSessionAndUser  — applies idle expiry and throttled
//      lastActivityAt updates without requiring a custom adapter.
//   2. linkAccount        — strips OAuth tokens (access_token,
//      refresh_token, id_token, etc.) before they reach the DB.
//      This boilerplate authenticates with OAuth but doesn't call
//      provider APIs, so the tokens are dead weight and a needless
//      security surface. Stripping them here also makes the auto-link
//      path (this method) match the manual /link-account path, which
//      doesn't store tokens either — Account rows look identical
//      regardless of which path created them.
export const adapter: Adapter = {
  ...base,

  async linkAccount(account) {
    const {
      access_token: _at,
      refresh_token: _rt,
      id_token: _it,
      expires_at: _exp,
      token_type: _tt,
      scope: _sc,
      session_state: _ss,
      ...withoutTokens
    } = account;
    await base.linkAccount!(withoutTokens as AdapterAccount);
  },

  async getSessionAndUser(sessionToken) {
    const result = await base.getSessionAndUser!(sessionToken);
    if (!result) return null;

    // Cast: lastActivityAt is on our schema but not in the AdapterSession type.
    const session = result.session as AdapterSession & { lastActivityAt: Date };
    const idleMs = Date.now() - session.lastActivityAt.getTime();

    if (idleMs > IDLE_TIMEOUT_MS) {
      await base.deleteSession!(sessionToken);
      return null;
    }

    if (idleMs > ACTIVITY_THROTTLE_MS) {
      await prisma.session.update({
        where: { sessionToken },
        data: { lastActivityAt: new Date() },
      });
    }

    return result;
  },
};
