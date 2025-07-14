// main.js (Final Orchestrator Version)

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

// ... fungsi checkDependencies tetap sama ...
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

        process.on('SIGINT', () => handleShutdownSignal('SIGINT'));
        process.on('SIGTERM', () => handleShutdownSignal('SIGTERM'));

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
        
        // --- PERUBAHAN UTAMA DI SINI ---
        
        // 1. Dapatkan objek 'sock' dari connection.js
        console.log("[MAIN] Memulai koneksi bot...");
        activeSock = await startBot(loginMode);

        // 2. PASANG "KUPING" (EVENT HANDLER) LANGSUNG DI SINI
        console.log("[MAIN] Memasang event handler untuk pesan dan panggilan...");
        activeSock.ev.on('messages.upsert', (m) => handler(activeSock, m));
        activeSock.ev.on('call', (calls) => handleIncomingCall(activeSock, calls));
        
        console.log("✅ [MAIN] Bot siap menerima perintah!");
        console.log("--- BOT FULLY OPERATIONAL ---");

    } catch (err) {
        console.error("❌ [FATAL] Gagal total saat memulai bot:", err);
        process.exit(1);
    }
}

main();