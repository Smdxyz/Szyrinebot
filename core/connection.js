// core/connection.js (FINAL FIX - Robust Reconnect & Shutdown)

import baileys, { DisconnectReason, useMultiFileAuthState } from '@itsukichan/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import readline from 'readline';
import fs from 'fs';

const { default: makeWASocket } = baileys;

let isShuttingDown = false; // Flag tunggal untuk mengontrol status shutdown

/**
 * Fungsi utama yang mengelola seluruh siklus hidup bot.
 * @param {object} handlers - Objek berisi fungsi handler untuk 'message' dan 'call'.
 */
async function startBot(handlers) {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
    });
    
    // Proses pairing code jika sesi tidak ada (tetap sama, sudah bagus)
    if (!sock.authState.creds.registered) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const question = (text) => new Promise((resolve) => rl.question(text, resolve));
        try {
            const phoneNumber = await question('Masukkan nomor WhatsApp Anda (contoh: 6281234567890): ');
            const code = await sock.requestPairingCode(phoneNumber);
            console.log(`\n=======================================\n📟 Kode Pairing Anda: ${code}\n=======================================`);
        } catch (error) {
            console.error("Gagal meminta pairing code:", error);
            throw new Error("Proses pairing gagal.");
        } finally {
            rl.close();
        }
    }

    // --- Mendaftarkan Handler Aplikasi & Internal ---
    // Ini didaftarkan sebelum koneksi untuk mencegah race condition.
    sock.ev.on('messages.upsert', (m) => handlers.message(sock, m));
    sock.ev.on('call', (calls) => handlers.call(sock, calls));
    sock.ev.on('creds.update', saveCreds);

    // --- Handler untuk Update Koneksi (INI BAGIAN UTAMA YANG DIPERBAIKI) ---
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const statusCode = (lastDisconnect.error instanceof Boom)
                ? lastDisconnect.error.output?.statusCode
                : 500; // Default error code

            // --- PERBAIKAN #1: LOGIKA SHUTDOWN DIUTAMAKAN ---
            // Jika bot sedang dalam proses shutdown manual, hentikan semua proses dan keluar.
            if (isShuttingDown) {
                console.log("Proses shutdown selesai. Bot dimatikan.");
                process.exit(0); // <-- KELUAR DARI PROSES
            }
            
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            console.log(`Koneksi ditutup. Alasan: "${lastDisconnect.error?.message}". Status: ${statusCode}.`);

            if (shouldReconnect) {
                console.log("Mencoba menyambung kembali...");
                startBot(handlers); // <-- MEMULAI ULANG LOGIKA KONEKSI
            } else {
                console.error("Koneksi ditutup permanen (Logged Out). Sesi tidak valid.");
                try {
                    console.log("Menghapus folder 'auth' untuk sesi baru...");
                    fs.rmSync('./auth', { recursive: true, force: true });
                    console.log("Folder 'auth' berhasil dihapus. Silakan restart bot.");
                } catch (e) {
                    console.error("Gagal menghapus folder 'auth'. Harap hapus manual.", e);
                }
                process.exit(1); // Keluar dengan kode error
            }

        } else if (connection === 'open') {
            console.log('🎉 Koneksi berhasil dibuka!');
            console.log(`Terhubung sebagai: ${sock.user?.name || sock.user?.id}`);
        }
    });

    // --- Fungsi Shutdown yang dipanggil oleh SIGINT/SIGTERM ---
    const shutdown = () => {
        if (!isShuttingDown) {
            isShuttingDown = true;
            console.log("\nSIGINT diterima. Memulai proses shutdown...");
            // Memaksa koneksi untuk ditutup, yang akan memicu event 'connection.close'
            // di mana logika `process.exit(0)` akan dieksekusi.
            sock.end(new Error("Shutdown manual diinisiasi."));
        }
    };
    
    // Daftarkan listener shutdown hanya sekali.
    if (!process.listeners('SIGINT').length) {
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    }
    
    return sock;
}

export { startBot };