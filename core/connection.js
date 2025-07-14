// core/connection.js (Final Simplified Version)
import { makeWASocket, DisconnectReason, useMultiFileAuthState, Browsers, makeCacheableSignalKeyStore } from '@fizzxydev/baileys-pro';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import process from 'process';
import readline from 'readline';
import { BOT_PHONE_NUMBER } from '../config.js';

let isShuttingDown = false;

export function initiateShutdown(sock, signal) {
    if (isShuttingDown) return;
    console.log(`\n[SHUTDOWN] Memulai proses shutdown oleh ${signal}...`);
    isShuttingDown = true;
    if (sock) {
        sock.end(new Error(`Shutdown diinisiasi oleh sinyal ${signal}.`));
    } else {
        process.exit(0);
    }
}

const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(text, (answer) => {
        rl.close();
        resolve(answer);
    }));
};

// --- PERUBAHAN UTAMA ---
// Fungsi ini sekarang tidak lagi menerima 'handlers'
export async function startBot(loginMode) {
    const authFolderPath = path.resolve('session');
    const { state, saveCreds } = await useMultiFileAuthState(authFolderPath);

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
    });

    // Pairing logic tetap sama
    if (loginMode) {
        let phoneNumber;
        if (loginMode === 'manual') {
            const inputNumber = await question("Masukkan nomor WhatsApp Anda (cth: 62812...): ");
            phoneNumber = inputNumber.replace(/[^0-9]/g, '');
        } else {
            if (!BOT_PHONE_NUMBER) {
                console.error("❌ [FATAL] BOT_PHONE_NUMBER belum diatur di config.js.");
                process.exit(1);
            }
            phoneNumber = BOT_PHONE_NUMBER.replace(/[^0-9]/g, '');
        }

        if (!phoneNumber) {
            console.error(`❌ [FATAL] Nomor telepon tidak valid.`);
            process.exit(1);
        }

        try {
            console.log(`\n[PAIRING] Meminta Kode Pairing untuk +${phoneNumber} ...`);
            const code = await sock.requestPairingCode(phoneNumber);
            console.log(`\n=================================================`);
            console.log(`  📟 KODE PAIRING ANDA: ${code}`);
            console.log(`=================================================`);
        } catch (error) {
            console.error("❌ [FATAL] Gagal meminta pairing code:", error);
            process.exit(1);
        }
    } else {
        console.log("[AUTH] Sesi ditemukan. Mencoba terhubung...");
    }

    // --- PERUBAHAN KRUSIAL ---
    // Handler pesan & panggilan sudah DIHAPUS dari sini.
    // Kita hanya mendaftarkan handler yang esensial untuk koneksi itu sendiri.
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log('🎉 [CONNECTION] Koneksi WhatsApp berhasil dibuka!');
            console.log(`[INFO] Terhubung sebagai: ${sock.user?.name || 'Unknown'} (${sock.user?.id.split(':')[0]})`);
        } else if (connection === 'close') {
            const statusCode = (lastDisconnect.error instanceof Boom) ? lastDisconnect.error.output?.statusCode : 500;
            if (isShuttingDown) {
                console.log("[SHUTDOWN] Koneksi ditutup. Bot dimatikan.");
                process.exit(0);
                return;
            }
            console.log(`[CONNECTION] Koneksi ditutup! Status: ${statusCode}, Alasan: "${lastDisconnect.error?.message || 'Tidak Diketahui'}".`);
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log("[RECONNECT] Mencoba menyambung kembali...");
            } else {
                console.error("❌ [FATAL] Logged Out. Hapus folder 'session' dan restart.");
                process.exit(1);
            }
        } else if (connection === 'connecting') {
            console.log("⏳ [CONNECTION] Menghubungkan ke WhatsApp...");
        }
    });

    // Kembalikan objek 'sock' agar bisa digunakan di main.js
    return sock;
}