// --- START OF FILE main.js ---

// main.js - Final Entry Point

import 'dotenv/config';
import { commandExists } from 'command-exists';

import { startBot } from './core/connection.js';
import { handler } from './core/handler.js';
import { handleIncomingCall } from './core/callHandler.js';
import { loadCommands } from './core/commandRegistry.js';

// Inisialisasi cache global jika masih diperlukan
global.ytdlOptionsCache = global.ytdlOptionsCache || new Map();
console.log("[main.js] Global cache ytdlOptionsCache diinisialisasi.");

/**
 * Fungsi untuk memeriksa dependensi eksternal yang penting.
 */
async function checkDependencies() {
    console.log("🔍 Memeriksa dependensi eksternal...");
    
    // Cek apakah FFmpeg terinstal
    const ffmpegInstalled = await commandExists('ffmpeg');
    if (!ffmpegInstalled) {
        console.error("❌ [FATAL] FFmpeg tidak ditemukan. FFmpeg diperlukan untuk memproses audio dan video.");
        console.error("Silakan install FFmpeg terlebih dahulu. Instruksi:");
        console.error("  - Windows: Buka PowerShell sebagai Admin dan jalankan 'winget install ffmpeg'");
        console.error("  - Debian/Ubuntu: Buka terminal dan jalankan 'sudo apt-get install ffmpeg -y'");
        console.error("  - MacOS: Buka terminal dan jalankan 'brew install ffmpeg'");
        console.error("  - Termux: pkg install ffmpeg");
        console.error("Setelah instalasi, silakan restart bot.");
        process.exit(1); // Hentikan proses jika FFmpeg tidak ada
    }
    console.log("✅ [OK] FFmpeg ditemukan.");
}

/**
 * Fungsi utama untuk memulai bot.
 */
async function main() {
    try {
        console.log("🚀 Memulai SzyrineBot...");

        // 0. Periksa dependensi penting sebelum melanjutkan.
        await checkDependencies();
        
        // 1. Muat semua definisi command.
        console.log("Memuat semua command...");
        await loadCommands();

        // 2. Definisikan semua handler aplikasi.
        const handlers = {
            message: handler,
            call: handleIncomingCall,
        };

        // 3. Mulai bot. Semua logika koneksi, rekoneksi, dan shutdown
        //    sekarang sepenuhnya dikelola oleh startBot.
        await startBot(handlers);

    } catch (err) {
        console.error("❌ Gagal total saat memulai bot:", err);
        process.exit(1); 
    }
}

// Jalankan fungsi utama.
main();
// --- END OF FILE main.js ---