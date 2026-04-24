import express from 'express';
import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { Queue } from 'bullmq';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// 1. Inisialisasi Database (Postgres) untuk Prisma 7
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// 2. Inisialisasi Antrian (Redis / BullMQ)
const messageQueue = new Queue('GatewayQueue', {
  connection: {
    host: '127.0.0.1', 
    port: 6379,
    maxRetriesPerRequest: null // Tambahkan ini (Wajib untuk BullMQ + Redis terbaru)
  }
});

// ==========================================
// ENDPOINT: Menerima Pesan Baru dari Klien
// ==========================================
app.post('/api/send-message', async (req: Request, res: Response): Promise<any> => {
  const { tenantId, channelId, destination, content } = req.body;

  // Validasi input agar tidak ada data kosong yang masuk
  if (!tenantId || !channelId || !destination || !content) {
    return res.status(400).json({ success: false, error: 'Semua field wajib diisi' });
  }

  try {
    // A. Simpan ke Database sebagai "PENDING" (Jejak Audit)
    const newMessage = await prisma.message.create({
      data: {
        tenantId: tenantId,
        channelId: channelId,
        destination: destination,
        content: content,
        status: 'PENDING' 
      }
    });

    console.log(`📥 [API] Request masuk: Klien ${tenantId} -> tujuan: ${destination}`);

    // B. Dorong tugas ke keranjang Redis (BullMQ)
    await messageQueue.add('sendMessageJob', {
      messageId: newMessage.id,
      tenantId: tenantId,
      channelId: channelId,
      destination: destination,
      content: content
    }, {
      attempts: 3, // Otomatis coba lagi 3 kali jika server nge-lag
      backoff: { type: 'exponential', delay: 2000 }
    });

    // C. Kembalikan respons Sukses seketika agar UI Klien tidak loading lama
    return res.status(200).json({
      success: true,
      message: 'Pesan berhasil masuk antrian!',
      data: {
        messageId: newMessage.id,
        status: 'PENDING'
      }
    });

  } catch (error) {
    console.error('❌ Error API:', error);
    return res.status(500).json({ success: false, error: 'Gagal memasukkan pesan ke antrian' });
  }
});

// 3. Jalankan Server API
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 API Server (Manajer) siap menerima pesanan di http://localhost:${PORT}`);
});