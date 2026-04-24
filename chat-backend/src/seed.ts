import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';

// 1. Baca file .env
dotenv.config();

// 2. Setup Koneksi via Driver PostgreSQL bawaan Node
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

// 3. Injeksi Adapter ke dalam PrismaClient (Aturan Wajib Prisma 7)
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Memulai seeding database...');

  const tenant = await prisma.tenant.create({
    data: {
      name: 'Klinik Gigi Sehat',
      email: 'admin@kliniksehat.com',
    },
  });
  console.log(`\n✅ Tenant dibuat!`);
  console.log(`TENANT_ID: ${tenant.id}`);

  const channel = await prisma.channel.create({
    data: {
      tenantId: tenant.id,
      type: 'WA_UNOFFICIAL',
      config: { assignedIpv6: '2a01:4f9:c014:56e6::10' }, 
      status: 'CONNECTED',
    },
  });
  console.log(`\n✅ Channel dibuat!`);
  console.log(`CHANNEL_ID: ${channel.id}\n`);

  console.log('🎉 Selesai! Gunakan ID di atas untuk menguji API pengiriman pesan.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end(); // Jangan lupa tutup pool koneksi PG-nya
  });