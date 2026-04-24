import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { Boom } from '@hapi/boom';

export const activeSessions = new Map<string, any>();

export async function initWhatsAppChannel(channelId: string, ipv6Config?: string) {
    const { state, saveCreds } = await useMultiFileAuthState(`sessions/${channelId}`);
    
    // 1. TAMBAHAN BARU: Ambil versi WA Web paling mutakhir secara otomatis
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`\n🔍 Menggunakan WhatsApp Web v${version.join('.')} (Terbaru: ${isLatest})`);

    const sock = makeWASocket({
        version, // Masukkan versi terbaru ke sini
        auth: state,
        printQRInTerminal: false, 
        logger: pino({ level: 'silent' }) as any, 
        // 2. UBAH BROWSER: Pakai custom name agar lebih "sopan" di mata server Meta
        browser: ['WaMeta', 'Chrome', '1.0.0'], 
        syncFullHistory: false 
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log(`\n📱 [Channel: ${channelId}] Silakan SCAN QR Code ini:`);
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`❌ [Channel: ${channelId}] Koneksi terputus. Alasan: ${(lastDisconnect?.error as Error)?.message || 'Unknown'}`);
            
            activeSessions.delete(channelId);

            if (shouldReconnect) {
                console.log(`⏳ Menunggu 5 detik sebelum menghubungkan ulang...`);
                setTimeout(() => {
                    initWhatsAppChannel(channelId, ipv6Config);
                }, 5000);
            } else {
                console.log(`🚨 Klien telah Logout. Session dihapus.`);
            }
        } else if (connection === 'open') {
            console.log(`✅ [Channel: ${channelId}] WhatsApp Berhasil Terhubung!`);
        }
    });

    sock.ev.on('creds.update', saveCreds);
    activeSessions.set(channelId, sock);
}