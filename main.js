// main.js (Final Version - Correct Initialization Order)

import 'dotenv/config';
import process from 'process';
import { createRequire } from 'module';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

import { startBot, initiateShutdown } from './core/connection.js';
import { handler } from './core/handler.js';
import { handleIncomingCall } from './core/callHandler.js';
import { loadCommands } from './core/commandRegistry.js';

const require = createRequire(import.meta.url);
const commandExists = require('command-exists');

let activeSock = null;

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
            console.error("❌ [FATAL] FFmpeg tidak ditemukan. Silakan install FFmpeg untuk fungsionalitas media.");
            process.exit(1);
        }
        console.log("✅ [OK] FFmpeg ditemukan.");
    } catch (e) {
        console.error("❌ [FATAL] Gagal memeriksa FFmpeg:", e.message);
        process.exit(1);
    }
}

async function main() {
    try {
        console.log("🚀 [MAIN] Memulai SzyrineBot...");

        process.on('SIGINT', () => handleShutdownSignal('SIGINT'));
        process.on('SIGTERM', () => handleShutdownSignal('SIGTERM'));

        console.log("\n--- TAHAP 1: PERSIAPAN INTERNAL ---");
        
        await checkDependencies();

        console.log("[MAIN] Memuat semua command dari direktori modules...");
        await loadCommands();
        console.log("[MAIN] Pemuatan command selesai.");

        const handlers = {
            message: handler,
            call: handleIncomingCall,
        };
        console.log("[MAIN] Semua handler internal telah disiapkan.");
        console.log("--- PERSIAPAN INTERNAL SELESAI ---\n");
        
        console.log("--- TAHAP 2: AUTENTIKASI & KONEKSI ---");
        
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
        
        activeSock = await startBot(handlers, loginMode);

    } catch (err) {
        console.error("❌ [FATAL] Gagal total saat memulai bot:", err);
        process.exit(1);
    }
}

main();