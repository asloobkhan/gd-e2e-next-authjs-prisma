import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * Demo-only force-logout endpoint.
 *
 *   curl -X DELETE http://localhost:3000/api/admin/sessions \
 *        -H 'content-type: application/json' \
 *        -d '{"userId":"<id>"}'
 *
 * Real services should put this behind an admin role gate. The
 * NODE_ENV check below is just a guardrail so a deployed boilerplate
 * doesn't accidentally expose a "log everyone out" button.
 */
export async function DELETE(req: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'admin route disabled outside development' },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as
    | { userId?: string; sessionToken?: string }
    | null;

  if (!body || (!body.userId && !body.sessionToken)) {
    return NextResponse.json(
      { error: 'pass userId or sessionToken' },
      { status: 400 },
    );
  }

  const result = await prisma.session.deleteMany({
    where: body.userId
      ? { userId: body.userId }
      : { sessionToken: body.sessionToken },
  });

  return NextResponse.json({ deleted: result.count });
}
