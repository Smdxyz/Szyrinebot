// core/connection.js (MODIFIED FOR @fizzxydev/baileys-pro)

// 1. IMPORT DARI LIBRARY BARU
import {
    makeWASocket, // Langsung impor makeWASocket dari library baru
    DisconnectReason,
    useMultiFileAuthState,
    Browsers,
    makeCacheableSignalKeyStore
} from '@fizzxydev/baileys-pro';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import process from 'process';
import { BOT_PHONE_NUMBER } from '../config.js';

let isShuttingDown = false;
let isInitialPairing = false;

// Fungsi initiateShutdown tetap sama, tidak perlu diubah
export function initiateShutdown(sock, signal) {
    if (isShuttingDown) {
        console.log("Proses shutdown sudah berjalan...");
        return;
    }
    console.log(`\nMemulai proses shutdown yang diinisiasi oleh ${signal}...`);
    isShuttingDown = true;
    if (sock) {
        sock.end(new Error(`Shutdown diinisiasi oleh sinyal ${signal}.`));
        console.log("Menunggu koneksi Baileys ditutup...");
    } else {
        console.log("Koneksi tidak aktif, keluar dari proses secara langsung.");
        process.exit(0);
    }
}

async function startBot(handlers) {
    const authFolderPath = './auth';
    const { state, saveCreds } = await useMultiFileAuthState(authFolderPath);

    // Bagian ini tidak perlu diubah, karena struktur opsinya sama
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
    });

    // Sisa dari kode di file ini SAMA PERSIS dengan kode aslimu.
    // Tidak ada perubahan dari sini ke bawah.
    if (!sock.authState.creds.registered) {
        isInitialPairing = true;
        const phoneNumber = BOT_PHONE_NUMBER;
        if (!phoneNumber) {
             console.error("❌ [FATAL] Nomor telepon bot belum diatur di config.js untuk pairing code.");
             process.exit(1);
        }
        const cleanedPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');
         if (!cleanedPhoneNumber) {
             console.error(`❌ [FATAL] Nomor telepon "${phoneNumber}" di config.js tidak valid.`);
             process.exit(1);
         }
        try {
            console.log(`\n=======================================\nMeminta Kode Pairing untuk +${cleanedPhoneNumber} ...`);
            const code = await sock.requestPairingCode(cleanedPhoneNumber);
            console.log(`\n=======================================\n📟 KODE PAIRING: ${code}`);
            console.log("=======================================");
            console.log("⚠️ Masukkan kode di atas ke aplikasi WhatsApp Anda.");
            console.log("\nMenunggu koneksi...");
        } catch (error) {
            console.error("Gagal meminta pairing code:", error);
            throw new Error("Proses pairing gagal.");
        }
    } else {
        console.log("Sesi terdeteksi. Mencoba terhubung menggunakan sesi yang ada...");
    }

    sock.ev.on('messages.upsert', (m) => handlers.message(sock, m));
    sock.ev.on('call', (calls) => handlers.call(sock, calls));
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = (lastDisconnect.error instanceof Boom)
                ? lastDisconnect.error.output?.statusCode
                : 500;
            if (isShuttingDown) {
                console.log("Koneksi berhasil ditutup. Bot dimatikan sepenuhnya.");
                process.exit(0);
            }
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`Koneksi ditutup. Alasan: "${lastDisconnect.error?.message || 'Tidak diketahui'}". Status: ${statusCode}.`);
            if (shouldReconnect) {
                console.log("Mencoba menyambung kembali dalam 5 detik...");
                await new Promise(resolve => setTimeout(resolve, 5000));
                startBot(handlers);
            } else {
                console.error("Koneksi ditutup permanen (Logged Out).");
                try {
                    console.log("Menghapus folder 'auth' untuk sesi baru...");
                    fs.rmSync('./auth', { recursive: true, force: true });
                    console.log("Folder 'auth' berhasil dihapus. Silakan restart bot.");
                } catch (e) {
                    console.error("Gagal menghapus folder 'auth'. Harap hapus manual.", e);
                }
                process.exit(1);
            }
        } else if (connection === 'open') {
            console.log('🎉 Koneksi berhasil dibuka!');
            console.log(`Terhubung sebagai: ${sock.user?.name || sock.user?.id}`);
            if (isInitialPairing) {
                 isInitialPairing = false;
                 console.log("[CONNECTION] Koneksi pertama setelah pairing berhasil. Memicu restart...");
                 await new Promise(resolve => setTimeout(resolve, 2000));
                 initiateShutdown(sock, "Initial Pairing Restart");
            } else {
                 console.log("[CONNECTION] Koneksi ulang berhasil.");
            }
        } else if (connection === 'connecting') {
             console.log("⏳ Menghubungkan ke WhatsApp...");
        }
    });

    return sock;
}

export { startBot };