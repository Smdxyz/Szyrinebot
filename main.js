// main.js (Final Orchestrator Version with Robust Signal Handling)

import 'dotenv/config';
import process from 'process';
import { createRequire } from 'module';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

// Impor fungsi inti
import { startBot, initiateShutdown } from './core/connection.js';
import { handler } from './core/handler.js';
import { handleIncomingCall } from './core/callHandler.js';
import { loadCommands } from './core/commandRegistry.js';

const require = createRequire(import.meta.url);
const commandExists = require('command-exists');

let activeSock = null;

// --- PERBAIKAN UNTUK CTRL+C ---
// 1. Buat satu instance readline yang bisa kita kontrol.
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

// 2. Buat satu fungsi shutdown yang terpusat.
const handleShutdown = (signal) => {
    // Pastikan readline ditutup agar proses tidak menggantung.
    rl.close(); 
    console.log(`\n[MAIN] Sinyal ${signal} diterima. Memulai proses shutdown...`);
    initiateShutdown(activeSock, signal);
};

// 3. Pasang listener sinyal di awal untuk menangkap CTRL+C (SIGINT) dan sinyal lainnya.
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// 4. Modifikasi fungsi question untuk menggunakan instance 'rl' yang sudah ada.
const question = (text) => {
    return new Promise((resolve) => {
        // Jangan membuat atau menutup rl di sini.
        rl.question(text, (answer) => {
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

        // Listener sinyal sudah dipasang di atas.

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
            let choice = await question("Pilih Mode Pairing: [1] Otomatis | [2] Manual: ");
            if (choice === '1') loginMode = 'auto';
            else if (choice === '2') loginMode = 'manual';
            else {
                console.log("Pilihan tidak valid, keluar.");
                process.exit(1);
            }
        }
        
        // 5. Setelah selesai bertanya, tutup readline agar tidak memblokir proses.
        rl.close();

        console.log("[MAIN] Memulai koneksi bot...");
        activeSock = await startBot(loginMode);

        console.log("[MAIN] Memasang event handler untuk pesan dan panggilan...");
        activeSock.ev.on('messages.upsert', (m) => handler(activeSock, m));
        activeSock.ev.on('call', (calls) => handleIncomingCall(activeSock, calls));
        
        console.log("✅ [MAIN] Bot siap menerima perintah!");
        console.log("--- BOT FULLY OPERATIONAL ---");

    } catch (err) {
        console.error("❌ [FATAL] Gagal total saat memulai bot:", err);
        // Pastikan readline ditutup jika terjadi error.
        rl.close();
        process.exit(1);
    }
}

main();