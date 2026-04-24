import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
// IMPORT WA MANAGER KITA
import { initWhatsAppChannel, activeSessions } from './waManager.js';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

console.log('👷 Worker menyala...');

// ==========================================
// BOOTLOADER: Nyalakan WA untuk Testing
// ==========================================
// KARENA KITA SEDANG TESTING, kita paksa nyalakan 1 channel dulu saat worker hidup.
// Masukkan ID Channel Anda yang didapat dari seed.ts kemarin:
const TESTING_CHANNEL_ID = '34de8080-e3be-4f44-ac7f-3f811412d1a5';
initWhatsAppChannel(TESTING_CHANNEL_ID);


// ==========================================
// TUKANG EKSEKUSI ANTRIAN
// ==========================================
const worker = new Worker('GatewayQueue', async (job: Job) => {
    const { messageId, destination, content, channelId } = job.data;
    console.log(`\n🛠️ Memproses Job #${job.id} -> Tujuan: ${destination}`);

    try {
        // 1. Cek apakah session Baileys untuk channel ini ada dan siap?
        const waSocket = activeSessions.get(channelId);

        if (!waSocket) {
            throw new Error(`Koneksi WhatsApp untuk Channel ${channelId} belum siap / tidak ada.`);
        }

        // 2. Format nomor ke standar internasional (contoh: 0812... jadi 62812...@s.whatsapp.net)
        let formattedNumber = destination;
        if (formattedNumber.startsWith('0')) {
            formattedNumber = '62' + formattedNumber.substring(1);
        }
        formattedNumber = formattedNumber + '@s.whatsapp.net';

        // 3. TEMBAK PESAN ASLI VIA BAILEYS! 🚀
        await waSocket.sendMessage(formattedNumber, { text: content });

        // 4. Update Database
        await prisma.message.update({ where: { id: messageId }, data: { status: 'SENT' } });
        console.log(`✅ Pesan ke ${destination} Berhasil Terkirim!`);

    } catch (error) {
        console.error(`❌ Gagal:`, (error as Error).message);
        await prisma.message.update({
            where: { id: messageId },
            data: { status: 'FAILED', errorMessage: (error as Error).message }
        });
    }
}, { connection: { host: '127.0.0.1', port: 6379, maxRetriesPerRequest: null }, concurrency: 5 });

worker.on('error', err => console.error('🔥 Worker Error:', err));