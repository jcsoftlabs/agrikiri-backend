import { PrismaClient, Role, AssociateType, MlmLevel } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Agrikiri2024!', 10);

  const associates = [
    // PDG
    {
      firstName: 'Mackenson',
      lastName: 'JEAN LOUIS',
      email: 'mackenson.jeanlouis@agrikiri.com',
      role: Role.ASSOCIATE,
      associateType: AssociateType.PDG,
      mlmLevel: MlmLevel.JEAN_JACQUES_DESSALINES,
    },
    // Voting Partners
    {
      firstName: 'Grégory',
      lastName: 'Desroches',
      email: 'gregory.desroches@agrikiri.com',
      role: Role.ASSOCIATE,
      associateType: AssociateType.VOTING,
    },
    {
      firstName: 'Micheline',
      lastName: 'Seymour',
      email: 'micheline.seymour@agrikiri.com',
      role: Role.ASSOCIATE,
      associateType: AssociateType.VOTING,
    },
    {
      firstName: 'Yuri',
      lastName: 'Dossous',
      email: 'yuri.dossous@agrikiri.com',
      role: Role.ASSOCIATE,
      associateType: AssociateType.VOTING,
    },
    {
      firstName: 'Johnny',
      lastName: 'St-Lot',
      email: 'johnny.stlot@agrikiri.com',
      role: Role.ASSOCIATE,
      associateType: AssociateType.VOTING,
    },
    {
      firstName: 'Claudy Yvar',
      lastName: 'Dieudonné',
      email: 'claudy.dieudonne@agrikiri.com',
      role: Role.ASSOCIATE,
      associateType: AssociateType.VOTING,
    },
    // Observer Partners
    {
      firstName: 'Dorcilien',
      lastName: 'Félix Junior',
      email: 'felix.junior@agrikiri.com',
      role: Role.ASSOCIATE,
      associateType: AssociateType.OBSERVER,
    },
    {
      firstName: 'Damien Junior',
      lastName: 'Joseph',
      email: 'damien.joseph@agrikiri.com',
      role: Role.ASSOCIATE,
      associateType: AssociateType.OBSERVER,
    },
    {
      firstName: 'Dimitri',
      lastName: 'Pierre',
      email: 'dimitri.pierre@agrikiri.com',
      role: Role.ASSOCIATE,
      associateType: AssociateType.OBSERVER,
    },
    {
      firstName: 'Leonard Weston Gregory',
      lastName: 'Lubin',
      email: 'leonard.lubin@agrikiri.com',
      role: Role.ASSOCIATE,
      associateType: AssociateType.OBSERVER,
    },
    {
      firstName: 'Fedjy',
      lastName: 'St-Vil',
      email: 'fedjy.stvil@agrikiri.com',
      role: Role.ASSOCIATE,
      associateType: AssociateType.OBSERVER,
    },
    {
      firstName: 'Clinederson',
      lastName: 'Guerrier',
      email: 'clinederson.guerrier@agrikiri.com',
      role: Role.ASSOCIATE,
      associateType: AssociateType.OBSERVER,
    },
    {
      firstName: 'Deric Anthony Kareem',
      lastName: 'Armand',
      email: 'deric.armand@agrikiri.com',
      role: Role.ASSOCIATE,
      associateType: AssociateType.OBSERVER,
    },
  ];

  console.log('Seeding associates...');

  for (const associate of associates) {
    const phone = Math.floor(Math.random() * 1000000000).toString(); // Placeholder unique phone
    await prisma.user.upsert({
      where: { email: associate.email },
      update: {
        role: associate.role,
        associateType: associate.associateType,
        mlmLevel: (associate as any).mlmLevel || MlmLevel.CUSTOMER,
      },
      create: {
        ...associate,
        phone,
        passwordHash,
        mlmLevel: (associate as any).mlmLevel || MlmLevel.CUSTOMER,
      },
    });
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
