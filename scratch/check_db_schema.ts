import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Querying information_schema to check columns of the Order table
  const columns: any = await prisma.$queryRaw`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'Order' AND column_name = 'amountCollected';
  `;

  console.log("=== Column amountCollected in table Order ===");
  console.log(JSON.stringify(columns, null, 2));

  // Querying enum values for PaymentStatus
  const enumValues: any = await prisma.$queryRaw`
    SELECT e.enumlabel
    FROM pg_type t 
    JOIN pg_enum e ON t.oid = e.enumtypid  
    WHERE t.typname = 'PaymentStatus';
  `;

  console.log("\n=== Enum values for PaymentStatus ===");
  console.log(JSON.stringify(enumValues.map((ev: any) => ev.enumlabel), null, 2));
}

main()
  .catch((err) => {
    console.error("Error checking schema:", err);
  })
  .finally(() => prisma.$disconnect());
