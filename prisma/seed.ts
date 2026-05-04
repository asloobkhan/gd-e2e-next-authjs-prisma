import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('demopass1', 10);
  const user = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      email: 'demo@example.com',
      password,
      name: 'Demo User',
      emailVerified: new Date(),
      accounts: {
        create: {
          type: 'credentials',
          provider: 'credentials',
          providerAccountId: 'demo@example.com',
        },
      },
    },
  });
  console.log(`Seeded user: ${user.email} (id=${user.id}, password=demopass1)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
