import { PrismaClient } from '@prisma/client';

// Avoid spawning a new PrismaClient on every hot-reload in dev.
// In production each Lambda/Node process gets one client.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
