// main.js

/**
 * @file Titik masuk utama (entry point) untuk aplikasi bot.
 * Bertanggung jawab untuk inisialisasi, memeriksa dependensi,
 * memuat command, dan memulai koneksi.
 */

import 'dotenv/config';
import process from 'process';
import { createRequire } from 'module';
import readline from 'readline';

// Impor fungsi inti dari modul terpisah
import { startBot, initiateShutdown } from './core/connection.js';
import { handler } from './core/handler.js';
import { handleIncomingCall } from './core/callHandler.js';
import { loadCommands } from './core/commandRegistry.js';

// Setup untuk command-exists di lingkungan ESM
const require = createRequire(import.meta.url);
const commandExists = require('command-exists');

// Variabel global untuk cache jika diperlukan di modul lain
global.ytdlOptionsCache = new Map();
console.log("[MAIN] Global cache ytdlOptionsCache diinisialisasi.");

// Variabel untuk menyimpan instance socket yang aktif untuk proses shutdown
let activeSock = null;

/**
 * Helper untuk menanyakan sesuatu di terminal dan mendapatkan jawaban.
 * @param {string} text - Pertanyaan yang akan ditampilkan.
 * @returns {Promise<string>} - Jawaban dari pengguna (dibersihkan dan lowercase).
 */
const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(text, (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase());
    }));
};

/**
 * Memeriksa dependensi eksternal yang krusial (seperti FFmpeg) sebelum bot berjalan.
 */
async function checkDependencies() {
    console.log("🔍 [CHECK] Memeriksa dependensi eksternal...");
    try {
        const ffmpegInstalled = await commandExists('ffmpeg');
        if (!ffmpegInstalled) {
            console.error("❌ [FATAL] Dependensi FFmpeg tidak ditemukan. FFmpeg diperlukan untuk fitur media. Silakan install FFmpeg.");
            process.exit(1);
        }
        console.log("✅ [OK] Dependensi FFmpeg ditemukan.");
    } catch (e) {
        console.error("❌ [FATAL] Terjadi kesalahan saat memeriksa FFmpeg:", e.message);
        process.exit(1);
    }
}

/**
 * Menangani sinyal shutdown dari sistem operasi (misalnya Ctrl+C).
 * @param {string} signal - Nama sinyal yang diterima.
 */
const handleShutdownSignal = (signal) => {
    initiateShutdown(activeSock, signal);
};

/**
 * Fungsi utama untuk mengorkestrasi startup bot.
 */
async function main() {
    try {
        console.log("🚀 [MAIN] Memulai SzyrineBot...");

        // Daftarkan listener sinyal shutdown sekali di awal.
        process.on('SIGINT', () => handleShutdownSignal('SIGINT'));
        process.on('SIGTERM', () => handleShutdownSignal('SIGTERM'));

        // 1. Jalankan pemeriksaan dependensi
        await checkDependencies();

        // 2. Muat semua command dari modul
        console.log("[MAIN] Memuat semua command...");
        await loadCommands();

        // 3. Tanyakan mode login kepada pengguna
        console.log("\n=================================");
        console.log("  Pilih Mode Login Pairing");
        console.log("=================================");
        console.log("1. Otomatis (menggunakan nomor dari config.js)");
        console.log("2. Manual (ketik nomor telepon secara manual)");
        
        let loginMode = '';
        while (loginMode !== 'auto' && loginMode !== 'manual') {
            const choice = await question("\nMasukkan pilihan (1 atau 2): ");
            if (choice === '1') {
                loginMode = 'auto';
            } else if (choice === '2') {
                loginMode = 'manual';
            } else {
                console.log("Pilihan tidak valid. Harap masukkan 1 atau 2.");
            }
        }
        
        // 4. Siapkan objek handlers untuk diserahkan ke connection.js
        const handlers = {
            message: handler,
            call: handleIncomingCall,
        };

        // 5. Mulai koneksi Baileys dan simpan instance socket
        console.log(`[MAIN] Memulai koneksi Baileys dalam mode '${loginMode}'...`);
        activeSock = await startBot(handlers, loginMode);

    } catch (err) {
        console.error("❌ [FATAL] Gagal total saat memulai bot:", err);
        process.exit(1);
    }
}

// Jalankan fungsi utama untuk memulai semuanya.
main();