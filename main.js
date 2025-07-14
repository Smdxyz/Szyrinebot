// main.js (Final Revised - Correct Initialization Order)

/**
 * @file Titik masuk utama (entry point) untuk aplikasi bot.
 */

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

// Helper question dan handleShutdownSignal tetap sama
const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(text, (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase());
    }));
};
const handleShutdownSignal = (signal) => {
    initiateShutdown(activeSock, signal);
};

async function checkDependencies() {
    console.log("🔍 [CHECK] Memeriksa dependensi eksternal...");
    try {
        const ffmpegInstalled = await commandExists('ffmpeg');
        if (!ffmpegInstalled) {
            console.error("❌ [FATAL] FFmpeg tidak ditemukan. Silakan install FFmpeg.");
            process.exit(1);
        }
        console.log("✅ [OK] FFmpeg ditemukan.");
    } catch (e) {
        console.error("❌ [FATAL] Gagal memeriksa FFmpeg:", e.message);
        process.exit(1);
    }
}

/**
 * Fungsi utama untuk mengorkestrasi startup bot.
 */
async function main() {
    try {
        console.log("🚀 [MAIN] Memulai SzyrineBot...");

        // Daftarkan listener sinyal shutdown di awal
        process.on('SIGINT', () => handleShutdownSignal('SIGINT'));
        process.on('SIGTERM', () => handleShutdownSignal('SIGTERM'));

        // =================================================================
        // LANGKAH 1: PERSIAPAN INTERNAL BOT (SELESAIKAN SEMUA SEBELUM KONEKSI)
        // =================================================================
        console.log("\n--- TAHAP 1: PERSIAPAN INTERNAL ---");
        
        // 1.1. Cek dependensi eksternal
        await checkDependencies();

        // 1.2. Muat semua command. Bot kini "tahu" semua perintahnya.
        console.log("[MAIN] Memuat semua command dari direktori modules...");
        await loadCommands();
        console.log("[MAIN] Pemuatan command selesai.");

        // 1.3. Siapkan semua handler yang akan digunakan.
        const handlers = {
            message: handler,
            call: handleIncomingCall,
        };
        console.log("[MAIN] Semua handler internal telah disiapkan.");
        console.log("--- PERSIAPAN INTERNAL SELESAI ---\n");
        
        // =================================================================
        // LANGKAH 2: PROSES AUTENTIKASI DAN KONEKSI
        // =================================================================
        console.log("--- TAHAP 2: AUTENTIKASI & KONEKSI ---");
        
        // 2.1. Cek sesi login yang ada.
        const authFolderPath = path.resolve('session');
        const sessionExists = fs.existsSync(authFolderPath);
        let loginMode = null;

        if (!sessionExists) {
            console.log("[AUTH] Folder sesi tidak ditemukan. Memulai setup awal.");
            let choice = '';
            while (choice !== '1' && choice !== '2') {
                choice = await question("Pilih Mode Pairing:\n1. Otomatis (dari config.js)\n2. Manual (ketik nomor)\nPilihan (1/2): ");
                if (choice === '1') loginMode = 'auto';
                else if (choice === '2') loginMode = 'manual';
                else console.log("Pilihan tidak valid.");
            }
        }
        
        // 2.2. Mulai koneksi. Semua persiapan sudah selesai, kita tinggal menghubungkan bot.
        activeSock = await startBot(handlers, loginMode);

    } catch (err) {
        console.error("❌ [FATAL] Gagal total saat memulai bot:", err);
        process.exit(1);
    }
}

// Jalankan!
main();