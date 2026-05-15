import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();
async function main() {
  const passwordHash = await bcrypt.hash('Agrikiri2024!', 10);
  await prisma.user.update({
    where: { email: 'admin@agrikiri.com' },
    data: { passwordHash }
  });
  console.log('Admin password updated to Agrikiri2024!');
}
main().finally(() => prisma.$disconnect());
