// core/connection.js

/**
 * @file Mengelola seluruh siklus hidup koneksi Baileys.
 * Termasuk autentikasi, pairing code, penanganan reconnect, dan shutdown.
 */

// Impor modul yang diperlukan
import { makeWASocket, DisconnectReason, useMultiFileAuthState, Browsers, makeCacheableSignalKeyStore } from '@fizzxydev/baileys-pro';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import process from 'process';
import readline from 'readline';
import { BOT_PHONE_NUMBER } from '../config.js';

let isShuttingDown = false; // Flag untuk mengontrol proses shutdown

/**
 * Memulai proses shutdown yang aman dan terkelola.
 * @param {import('@fizzxydev/baileys-pro').WASocket | null} sock - Instance socket Baileys yang aktif.
 * @param {string} signal - Sinyal yang memicu shutdown (misal: 'SIGINT').
 */
export function initiateShutdown(sock, signal) {
    if (isShuttingDown) return;
    console.log(`\n[SHUTDOWN] Memulai proses shutdown yang diinisiasi oleh ${signal}...`);
    isShuttingDown = true;
    if (sock) {
        sock.end(new Error(`Shutdown diinisiasi oleh sinyal ${signal}.`));
        console.log("[SHUTDOWN] Menunggu koneksi Baileys ditutup dengan baik...");
    } else {
        console.log("[SHUTDOWN] Koneksi tidak aktif, keluar dari proses secara langsung.");
        process.exit(0);
    }
}

const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(text, (answer) => {
        rl.close();
        resolve(answer);
    }));
};

/**
 * Fungsi utama untuk membuat, mengonfigurasi, dan memulai koneksi bot.
 * @param {object} handlers - Objek yang berisi fungsi handler untuk event (message, call, dll).
 * @param {string | null} loginMode - Mode login ('auto' atau 'manual'), atau null jika sesi sudah ada.
 * @returns {Promise<import('@fizzxydev/baileys-pro').WASocket>} - Instance socket yang berhasil terkoneksi.
 */
export async function startBot(handlers, loginMode) {
    const authFolderPath = path.resolve('session');
    const { state, saveCreds } = await useMultiFileAuthState(authFolderPath);

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
    });
    
    // Logika pairing hanya berjalan jika loginMode disediakan (artinya, sesi tidak ada)
    if (loginMode) {
        let phoneNumber;
        if (loginMode === 'manual') {
            console.log("[PAIRING] Mode login manual dipilih.");
            const inputNumber = await question("Silakan masukkan nomor WhatsApp Anda (cth: 62812...): ");
            phoneNumber = inputNumber.replace(/[^0-9]/g, '');
        } else { // Mode 'auto'
            console.log("[PAIRING] Mode login otomatis dipilih.");
            if (!BOT_PHONE_NUMBER) {
                console.error("❌ [FATAL] Mode otomatis gagal. Nomor telepon (BOT_PHONE_NUMBER) belum diatur di config.js.");
                process.exit(1);
            }
            phoneNumber = BOT_PHONE_NUMBER.replace(/[^0-9]/g, '');
        }

        if (!phoneNumber) {
            console.error(`❌ [FATAL] Nomor telepon yang diberikan tidak valid.`);
            process.exit(1);
        }

        try {
            console.log(`\n=================================================\n  Meminta Kode Pairing untuk +${phoneNumber} ...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            const code = await sock.requestPairingCode(phoneNumber);
            console.log(`\n  📟 KODE PAIRING ANDA: ${code}\n=================================================`);
            console.log("  Buka WhatsApp di HP Anda > Perangkat Tertaut > Tautkan Perangkat, lalu masukkan kode di atas.");
            console.log("\n[PAIRING] Menunggu koneksi setelah kode dimasukkan...");
        } catch (error) {
            console.error("❌ [FATAL] Gagal meminta pairing code:", error);
            process.exit(1);
        }
    } else {
        console.log("[AUTH] Sesi ditemukan. Mencoba terhubung menggunakan sesi yang ada...");
    }

    // Hanya daftarkan 'creds.update' di awal
    sock.ev.on('creds.update', saveCreds);

    // Handler utama untuk event koneksi, yang mengontrol seluruh alur hidup bot
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log('🎉 [CONNECTION] Koneksi WhatsApp berhasil dibuka!');
            console.log(`[INFO] Terhubung sebagai: ${sock.user?.name || 'Tidak Diketahui'} (${sock.user?.id.split(':')[0]})`);
            
            // AKTIFKAN HANDLER pesan dan panggilan HANYA setelah koneksi stabil.
            console.log('[HANDLER] Mengaktifkan message & call handlers...');
            sock.ev.on('messages.upsert', (m) => handlers.message(sock, m));
            sock.ev.on('call', (calls) => handlers.call(sock, calls));

        } else if (connection === 'close') {
            const statusCode = (lastDisconnect.error instanceof Boom) ? lastDisconnect.error.output?.statusCode : 500;
            if (isShuttingDown) {
                console.log("[SHUTDOWN] Koneksi berhasil ditutup. Bot dimatikan sepenuhnya.");
                process.exit(0);
                return;
            }
            
            console.log(`[CONNECTION] Koneksi ditutup! Alasan: "${lastDisconnect.error?.message || 'Tidak diketahui'}", Status: ${statusCode}.`);
            
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log("[RECONNECT] Mencoba menyambung kembali dalam 5 detik...");
                await new Promise(resolve => setTimeout(resolve, 5000));
                startBot(handlers, null); // Coba reconnect, tidak perlu login mode lagi
            } else {
                console.error("❌ [FATAL] Koneksi ditutup permanen (Logged Out). Sesi tidak valid lagi.");
                try {
                    console.log("[AUTH] Menghapus folder sesi yang korup untuk memulai dari awal...");
                    fs.rmSync(authFolderPath, { recursive: true, force: true });
                    console.log("[AUTH] Folder sesi berhasil dihapus. Silakan restart bot untuk melakukan pairing ulang.");
                } catch (e) {
                    console.error("❌ [AUTH] Gagal menghapus folder sesi. Harap hapus manual.", e);
                }
                process.exit(1);
            }
        } else if (connection === 'connecting') {
            console.log("⏳ [CONNECTION] Menghubungkan ke WhatsApp...");
        }
    });

    return sock;
}