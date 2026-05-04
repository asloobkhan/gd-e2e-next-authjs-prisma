import { PrismaAdapter } from '@auth/prisma-adapter';
import type { Adapter, AdapterSession } from 'next-auth/adapters';
import { prisma } from '../db';
import { ACTIVITY_THROTTLE_MS, IDLE_TIMEOUT_MS } from './constants';

const base = PrismaAdapter(prisma);

// Sliding-window-aware adapter.
// Wraps PrismaAdapter so the only customization point — `getSessionAndUser` —
// applies idle expiry and throttled lastActivityAt updates without requiring
// a custom adapter from scratch.
export const adapter: Adapter = {
  ...base,

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
