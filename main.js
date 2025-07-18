// main.js (Versi dengan Shutdown Langsung dan Cepat)

import 'dotenv/config';
import process from 'process';
import { createRequire } from 'module';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

// Impor fungsi inti
import { startBot } from './core/connection.js'; // initiateShutdown tidak kita gunakan lagi dari sini
import { handler } from './core/handler.js';
import { handleIncomingCall } from './core/callHandler.js';
import { loadCommands } from './core/commandRegistry.js';

const require = createRequire(import.meta.url);
const commandExists = require('command-exists');

// --- KONTROL SHUTDOWN YANG LANGSUNG DAN EFISIEN ---
// Saat CTRL+C (SIGINT) ditekan, tampilkan pesan dan langsung matikan proses.
process.on('SIGINT', () => {
    console.log('\n[MAIN] Sinyal SIGINT diterima. Memaksa keluar...');
    process.exit(0); // Langsung matikan proses, tidak ada penundaan.
});

// Lakukan hal yang sama untuk sinyal TERM (biasa digunakan oleh manajer proses)
process.on('SIGTERM', () => {
    console.log('\n[MAIN] Sinyal SIGTERM diterima. Memaksa keluar...');
    process.exit(0);
});
// ----------------------------------------------------

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const question = (text) => {
    return new Promise((resolve) => {
        rl.question(text, (answer) => {
            // Jangan tutup rl di sini agar tidak error jika user menekan CTRL+C saat bertanya
            resolve(answer.trim().toLowerCase());
        });
    });
};

async function checkDependencies() {
    console.log("🔍 [CHECK] Memeriksa dependensi eksternal...");
    try {
        await commandExists('ffmpeg');
        console.log("✅ [OK] FFmpeg ditemukan.");
    } catch (e) {
        console.error("❌ [FATAL] FFmpeg tidak ditemukan. Silakan install FFmpeg.", e.message);
        process.exit(1);
    }
}

async function main() {
    try {
        console.log("🚀 [MAIN] Memulai SzyrineBot...");

        console.log("\n--- TAHAP 1: PERSIAPAN INTERNAL ---");
        await checkDependencies();
        await loadCommands();
        console.log("[MAIN] Persiapan internal selesai.\n");

        console.log("--- TAHAP 2: AUTENTIKASI & KONEKSI ---");
        const authFolderPath = path.resolve('session');
        const sessionExists = fs.existsSync(authFolderPath);
        let loginMode = null;

        if (!sessionExists) {
            console.log("[AUTH] Folder sesi tidak ditemukan.");
            const choice = await question("Pilih Mode Pairing: [1] Otomatis | [2] Manual: ");
            if (choice === '1') loginMode = 'auto';
            else if (choice === '2') loginMode = 'manual';
            else {
                console.log("Pilihan tidak valid, keluar.");
                process.exit(1); // Langsung keluar jika input salah
            }
        }
        
        rl.close(); // Tutup readline setelah selesai digunakan

        console.log("[MAIN] Memulai koneksi bot...");
        const activeSock = await startBot(loginMode);

        console.log("[MAIN] Memasang event handler untuk pesan dan panggilan...");
        activeSock.ev.on('messages.upsert', (m) => handler(activeSock, m));
        activeSock.ev.on('call', (calls) => handleIncomingCall(activeSock, calls));
        
        console.log("✅ [MAIN] Bot siap menerima perintah!");
        console.log("--- BOT FULLY OPERATIONAL ---");

    } catch (err) {
        console.error("❌ [FATAL] Gagal total saat memulai bot:", err);
        process.exit(1); // Jika ada error saat startup, langsung matikan
    }
}

main();