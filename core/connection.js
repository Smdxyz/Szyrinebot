// core/connection.js (Versi yang cocok dengan main.js sederhana)

import { makeWASocket, DisconnectReason, useMultiFileAuthState, Browsers, makeCacheableSignalKeyStore } from '@fizzxydev/baileys-pro';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import process from 'process';
import readline from 'readline';
import { BOT_PHONE_NUMBER } from '../config.js';

// Fungsi ini tidak perlu lagi isShuttingDown karena kita pakai process.exit()
// let isShuttingDown = false; 

const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(text, (answer) => {
        rl.close();
        resolve(answer);
    }));
};

// Pastikan fungsi ini diekspor agar bisa diimpor oleh main.js
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

    if (loginMode) {
        let phoneNumber;
        if (loginMode === 'manual') {
            const inputNumber = await question("Masukkan nomor WhatsApp Anda (cth: 62812...): ");
            phoneNumber = inputNumber.replace(/[^0-9]/g, '');
        } else { // mode 'auto'
            if (!BOT_PHONE_NUMBER) {
                console.error("❌ [FATAL] BOT_PHONE_NUMBER belum diatur di config.js untuk mode otomatis.");
                process.exit(1);
            }
            phoneNumber = BOT_PHONE_NUMBER.replace(/[^0-9]/g, '');
        }

        if (!phoneNumber) {
            console.error(`❌ [FATAL] Nomor telepon tidak valid.`);
            process.exit(1);
        }

        try {
            await new Promise(resolve => setTimeout(resolve, 1500));
            console.log(`\n[PAIRING] Meminta Kode Pairing untuk +${phoneNumber} ...`);
            const code = await sock.requestPairingCode(phoneNumber);
            console.log(`\n=================================================`);
            console.log(`  📟 KODE PAIRING ANDA: ${code}`);
            console.log(`=================================================`);
            console.log('Silakan masukkan kode ini di perangkat WhatsApp Anda.');
        } catch (error) {
            console.error("❌ [FATAL] Gagal meminta pairing code:", error);
            process.exit(1);
        }
    } else {
        console.log("[AUTH] Sesi ditemukan. Mencoba terhubung...");
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log('🎉 [CONNECTION] Koneksi WhatsApp berhasil dibuka!');
            console.log(`[INFO] Terhubung sebagai: ${sock.user?.name || 'Unknown'} (${sock.user?.id.split(':')[0]})`);
        } else if (connection === 'close') {
            const statusCode = (lastDisconnect.error instanceof Boom) ? lastDisconnect.error.output?.statusCode : 500;
            
            // Logika shutdown sudah dihandle oleh process.on('SIGINT') di main.js
            // Jadi tidak perlu flag isShuttingDown di sini.

            console.log(`[CONNECTION] Koneksi ditutup! Status: ${statusCode}, Alasan: "${lastDisconnect.error?.message || 'Tidak Diketahui'}".`);
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log("[RECONNECT] Mencoba menyambung kembali setelah 5 detik...");
                // Panggil lagi startBot untuk rekoneksi.
                setTimeout(() => startBot(null), 5000); 
            } else {
                console.error("❌ [FATAL] Logged Out. Hapus folder 'session' dan restart untuk pairing ulang.");
                process.exit(1); // Keluar jika ter-logout
            }
        } else if (connection === 'connecting') {
            console.log("⏳ [CONNECTION] Menghubungkan ke WhatsApp...");
        }
    });

    return sock;
}