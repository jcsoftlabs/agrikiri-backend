import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();
async function main() {
  const passwordHash = await bcrypt.hash('Agrikiri2024!', 10);
  await prisma.user.upsert({
    where: { email: 'livreur@agrikiri.com' },
    update: {},
    create: {
      email: 'livreur@agrikiri.com',
      firstName: 'Pierre',
      lastName: 'Livreur',
      phone: '+509 9999-0000',
      passwordHash,
      role: Role.DELIVERY_AGENT,
      isActive: true,
    }
  });
  console.log('Demo Delivery Agent account created: livreur@agrikiri.com / Agrikiri2024!');
}
main().finally(() => prisma.$disconnect());
