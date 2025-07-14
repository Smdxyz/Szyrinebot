// core/connection.js

/**
 * @file Mengelola seluruh siklus hidup koneksi Baileys.
 * Termasuk autentikasi, pairing code, penanganan reconnect, dan shutdown.
 */

// Import modul yang diperlukan
import {
    makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    Browsers,
    makeCacheableSignalKeyStore
} from '@fizzxydev/baileys-pro';
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
 * Mencegah proses keluar secara tiba-tiba yang bisa merusak sesi.
 * @param {import('@fizzxydev/baileys-pro').WASocket | null} sock - Instance socket Baileys yang aktif.
 * @param {string} signal - Sinyal yang memicu shutdown (misal: 'SIGINT').
 */
export function initiateShutdown(sock, signal) {
    if (isShuttingDown) {
        console.log("Proses shutdown sudah berjalan...");
        return;
    }
    console.log(`\n[SHUTDOWN] Memulai proses shutdown yang diinisiasi oleh ${signal}...`);
    isShuttingDown = true;
    if (sock) {
        // Beri tahu WhatsApp bahwa kita akan offline dan tutup koneksi
        sock.end(new Error(`Shutdown diinisiasi oleh sinyal ${signal}.`));
        console.log("[SHUTDOWN] Menunggu koneksi Baileys ditutup dengan baik...");
    } else {
        console.log("[SHUTDOWN] Koneksi tidak aktif, keluar dari proses secara langsung.");
        process.exit(0);
    }
}

/**
 * Helper untuk menanyakan sesuatu di terminal dan mendapatkan jawaban.
 * @param {string} text - Pertanyaan yang akan ditampilkan.
 * @returns {Promise<string>} - Jawaban dari pengguna.
 */
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
 * @param {string} loginMode - Mode login yang dipilih pengguna ('auto' atau 'manual').
 * @returns {Promise<import('@fizzxydev/baileys-pro').WASocket>} - Instance socket yang berhasil terkoneksi.
 */
export async function startBot(handlers, loginMode) {
    const authFolderPath = path.resolve('session');
    console.log(`[AUTH] Menggunakan folder sesi di: ${authFolderPath}`);

    const { state, saveCreds } = await useMultiFileAuthState(authFolderPath);

    // Konfigurasi socket dengan praktik terbaik untuk stabilitas dan performa
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
    });

    // Logika pairing code jika sesi tidak ada (login pertama kali)
    if (!sock.authState.creds.registered) {
        console.log("[PAIRING] Sesi tidak ditemukan, memulai proses pairing code...");
        let phoneNumber;

        // Tentukan nomor telepon berdasarkan mode login yang dipilih di main.js
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
            console.log(`\n=================================================`);
            console.log(`  Meminta Kode Pairing untuk +${phoneNumber} ...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Jeda untuk menghindari rate-limit
            const code = await sock.requestPairingCode(phoneNumber);

            console.log(`\n  📟 KODE PAIRING ANDA: ${code}`);
            console.log(`=================================================`);
            console.log("  Buka WhatsApp di HP Anda > Perangkat Tertaut > Tautkan Perangkat, lalu masukkan kode di atas.");
            console.log("\n[PAIRING] Menunggu koneksi setelah kode dimasukkan...");
        } catch (error) {
            console.error("❌ [FATAL] Gagal meminta pairing code:", error);
            process.exit(1);
        }
    } else {
        console.log("[AUTH] Sesi ditemukan. Mencoba terhubung menggunakan sesi yang ada...");
    }

    // Daftarkan semua event handler yang diteruskan dari main.js
    sock.ev.on('messages.upsert', (m) => handlers.message(sock, m));
    sock.ev.on('call', (calls) => handlers.call(sock, calls));
    sock.ev.on('creds.update', saveCreds);

    // Handler utama untuk event koneksi
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const statusCode = (lastDisconnect.error instanceof Boom)
                ? lastDisconnect.error.output?.statusCode
                : 500;

            if (isShuttingDown) {
                console.log("[SHUTDOWN] Koneksi berhasil ditutup. Bot dimatikan sepenuhnya.");
                process.exit(0);
            }

            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`[CONNECTION] Koneksi ditutup! Alasan: "${lastDisconnect.error?.message || 'Tidak diketahui'}", Status: ${statusCode}.`);

            if (shouldReconnect) {
                console.log("[RECONNECT] Mencoba menyambung kembali dalam 5 detik...");
                await new Promise(resolve => setTimeout(resolve, 5000));
                startBot(handlers, loginMode); // Coba mulai lagi dengan mode yang sama
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
        } else if (connection === 'open') {
            console.log('🎉 [CONNECTION] Koneksi WhatsApp berhasil dibuka!');
            console.log(`[INFO] Terhubung sebagai: ${sock.user?.name || 'Tidak Diketahui'} (${sock.user?.id.split(':')[0]})`);
        } else if (connection === 'connecting') {
            console.log("⏳ [CONNECTION] Menghubungkan ke WhatsApp...");
        }
    });

    return sock;
}