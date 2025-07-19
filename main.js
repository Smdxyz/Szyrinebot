// main.js (VERSI DIPERBAIKI DENGAN LOGIKA REKONEKSI)

import 'dotenv/config';
import process from 'process';
import { createRequire } from 'module';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { Boom } from '@hapi/boom';
import { DisconnectReason } from '@fizzxydev/baileys-pro';

// Impor fungsi yang namanya sudah diubah untuk kejelasan
import { createBotConnection } from './core/connection.js'; 
import { handler } from './core/handler.js';
import { handleIncomingCall } from './core/callHandler.js';
import { loadCommands } from './core/commandRegistry.js';

const require = createRequire(import.meta.url);
const commandExists = require('command-exists');

// Kontrol shutdown tetap sama
process.on('SIGINT', () => {
    console.log('\n[MAIN] Sinyal SIGINT diterima. Memaksa keluar...');
    process.exit(0);
});
process.on('SIGTERM', () => {
    console.log('\n[MAIN] Sinyal SIGTERM diterima. Memaksa keluar...');
    process.exit(0);
});

// Fungsi pembantu untuk pertanyaan CLI
const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(text, (answer) => {
            rl.close();
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

// --- FUNGSI UTAMA YANG MENGONTROL SIKLUS HIDUP BOT ---
async function runBot() {
    console.log("[MAIN] Memulai koneksi bot...");

    // Cek apakah sesi ada untuk menentukan mode login
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
            process.exit(1);
        }
    }

    const sock = await createBotConnection(loginMode);

    console.log("[MAIN] Memasang event handler untuk pesan dan panggilan...");
    sock.ev.on('messages.upsert', (m) => handler(sock, m));
    sock.ev.on('call', (calls) => handleIncomingCall(sock, calls));
    
    // --- INI BAGIAN KUNCI UNTUK REKONEKSI ---
    // Monitor event 'connection.update' DI SINI (di main.js)
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = (lastDisconnect.error instanceof Boom) ? lastDisconnect.error.output?.statusCode : 500;
            
            // Jika BUKAN logout, coba sambungkan kembali
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log("[MAIN] Koneksi terputus, mencoba menyambung kembali dalam 10 detik...");
                setTimeout(runBot, 10000); // Panggil kembali fungsi runBot untuk memulai ulang siklus
            } else {
                console.error("❌ [FATAL] Logged Out. Hapus folder 'session' dan restart untuk pairing ulang.");
                // Hapus folder session secara otomatis untuk kemudahan
                fs.rmSync(path.resolve('session'), { recursive: true, force: true });
                process.exit(1);
            }
        }
    });
    
    console.log("✅ [MAIN] Bot siap menerima perintah!");
    console.log("--- BOT FULLY OPERATIONAL ---");
}

async function main() {
    try {
        console.log("🚀 [MAIN] Memulai SzyrineBot...");
        console.log("\n--- TAHAP 1: PERSIAPAN INTERNAL ---");
        await checkDependencies();
        await loadCommands();
        console.log("[MAIN] Persiapan internal selesai.\n");

        // Memulai siklus hidup bot
        await runBot();

    } catch (err) {
        console.error("❌ [FATAL] Gagal total saat memulai bot:", err);
        process.exit(1);
    }
}

main();