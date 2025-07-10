// main.js - Final Entry Point

import 'dotenv/config';
import process from 'process';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const commandExists = require('command-exists');

// Impor dari file-file core kita, tidak ada yang berubah di sini
import { startBot, initiateShutdown } from './core/connection.js';
import { handler } from './core/handler.js';
import { handleIncomingCall } from './core/callHandler.js';
import { loadCommands } from './core/commandRegistry.js';

global.ytdlOptionsCache = global.ytdlOptionsCache || new Map();
console.log("[main.js] Global cache ytdlOptionsCache diinisialisasi.");

// Variabel untuk menyimpan instance sock dari startBot
let activeSock = null;

/**
 * Fungsi untuk memeriksa dependensi eksternal yang penting.
 */
async function checkDependencies() {
    console.log("🔍 Memeriksa dependensi eksternal...");
    try {
        const ffmpegInstalled = await commandExists('ffmpeg');
        if (!ffmpegInstalled) {
            console.error("❌ [FATAL] FFmpeg tidak ditemukan. FFmpeg diperlukan.");
            process.exit(1);
        }
        console.log("✅ [OK] FFmpeg ditemukan.");
    } catch (e) {
        console.error("❌ [FATAL] Terjadi kesalahan saat memeriksa FFmpeg:", e.message);
        process.exit(1);
    }
}

/**
 * Fungsi untuk menangani sinyal shutdown (Ctrl+C, dsb.)
 */
const handleShutdownSignal = (signal) => {
    // Cukup panggil fungsi shutdown terpusat dari connection.js
    initiateShutdown(activeSock, signal);
};

/**
 * Fungsi utama untuk memulai bot.
 */
async function main() {
    try {
        console.log("🚀 Memulai SzyrineBot...");

        // Daftarkan listener sinyal sekali di awal.
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('SIGTERM');
        process.on('SIGINT', handleShutdownSignal);
        process.on('SIGTERM', handleShutdownSignal);

        await checkDependencies();

        console.log("Memuat semua command...");
        await loadCommands();

        const handlers = {
            message: handler,
            call: handleIncomingCall,
        };

        console.log("Memulai koneksi Baileys...");
        activeSock = await startBot(handlers); // Simpan instance sock yang aktif

    } catch (err) {
        console.error("❌ Gagal total saat memulai bot:", err);
        process.exit(1);
    }
}

// Jalankan fungsi utama.
main();