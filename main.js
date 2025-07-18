// main.js (Revised for stability)

import 'dotenv/config';
import process from 'process';
import { createRequire } from 'module';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

import { startSzyrineBot } from './core/connection.js';
import { loadCommands } from './core/commandRegistry.js';

const require = createRequire(import.meta.url);
const commandExists = require('command-exists');

// Fungsi ini tidak banyak berubah, tetap untuk shutdown yang bersih
const setupExitHandlers = (shutdownHandler) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    
    const handleExit = (signal) => {
        console.log(`\n[MAIN] Sinyal ${signal} diterima. Memulai shutdown...`);
        rl.close();
        if (shutdownHandler) {
            shutdownHandler(signal);
        } else {
            process.exit(0);
        }
    };
    
    process.on('SIGINT', () => handleExit('SIGINT'));
    process.on('SIGTERM', () => handleExit('SIGTERM'));

    return rl;
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
    // Fungsi shutdown dideklarasikan di sini tapi akan diisi oleh connection.js
    let shutdownBot; 
    const rl = setupExitHandlers(() => shutdownBot ? shutdownBot('SIGINT') : process.exit(0));

    try {
        console.log("🚀 [MAIN] Memulai SzyrineBot...");

        console.log("\n--- TAHAP 1: PERSIAPAN INTERNAL ---");
        await checkDependencies();
        await loadCommands();
        console.log("[MAIN] Persiapan internal selesai.\n");
        
        console.log("--- TAHAP 2: AUTENTIKASI & KONEKSI ---");
        // Fungsi startSzyrineBot sekarang akan menangani semuanya, termasuk pairing
        const { initiateShutdown } = await startSzyrineBot({
            // Teruskan fungsi question jika diperlukan untuk pairing
            question: (text) => new Promise(resolve => rl.question(text, resolve)),
        });

        // Simpan fungsi shutdown yang dikembalikan dari connection.js
        shutdownBot = initiateShutdown;

        // Setelah pairing (jika ada) selesai, readline bisa ditutup
        rl.close();
        
        console.log("✅ [MAIN] Bot siap menerima perintah!");
        console.log("--- BOT FULLY OPERATIONAL ---");

    } catch (err) {
        console.error("❌ [FATAL] Gagal total saat memulai bot:", err);
        rl.close();
        process.exit(1);
    }
}

main();