// core/connection.js (Final Version - Export Fixed)
import { makeWASocket, DisconnectReason, useMultiFileAuthState, Browsers, makeCacheableSignalKeyStore } from '@fizzxydev/baileys-pro';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import process from 'process';
import readline from 'readline';
import { BOT_PHONE_NUMBER } from '../config.js';

let isShuttingDown = false;

// ===========================================
// INI BAGIAN YANG DIPERBAIKI (MENAMBAHKAN 'export')
// ===========================================
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
    
    if (loginMode) {
        let phoneNumber;
        if (loginMode === 'manual') {
            const inputNumber = await question("Silakan masukkan nomor WhatsApp Anda (cth: 62812...): ");
            phoneNumber = inputNumber.replace(/[^0-9]/g, '');
        } else { // 'auto'
            if (!BOT_PHONE_NUMBER) {
                console.error("❌ [FATAL] Mode otomatis gagal. BOT_PHONE_NUMBER belum diatur di config.js.");
                process.exit(1);
            }
            phoneNumber = BOT_PHONE_NUMBER.replace(/[^0-9]/g, '');
        }

        if (!phoneNumber) {
            console.error(`❌ [FATAL] Nomor telepon tidak valid.`);
            process.exit(1);
        }

        try {
            console.log(`\n[PAIRING] Meminta Kode Pairing untuk +${phoneNumber} ...`);
            const code = await sock.requestPairingCode(phoneNumber);
            console.log(`\n=================================================`);
            console.log(`  📟 KODE PAIRING ANDA: ${code}`);
            console.log(`=================================================`);
            console.log(`  Masukkan kode di HP: WhatsApp > Perangkat Tertaut > Tautkan Perangkat.`);
        } catch (error) {
            console.error("❌ [FATAL] Gagal meminta pairing code:", error);
            process.exit(1);
        }
    } else {
        console.log("[AUTH] Sesi ditemukan. Mencoba terhubung...");
    }

    // Daftarkan semua handler yang sudah disiapkan DARI AWAL
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('messages.upsert', (m) => handlers.message(sock, m));
    sock.ev.on('call', (calls) => handlers.call(sock, calls));
    
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log('🎉 [CONNECTION] Koneksi WhatsApp berhasil dibuka!');
            console.log(`[INFO] Terhubung sebagai: ${sock.user?.name || 'Tidak Diketahui'} (${sock.user?.id.split(':')[0]})`);
        } else if (connection === 'close') {
            const statusCode = (lastDisconnect.error instanceof Boom) ? lastDisconnect.error.output?.statusCode : 500;
            if (isShuttingDown) {
                console.log("[SHUTDOWN] Koneksi ditutup. Bot dimatikan.");
                process.exit(0);
                return;
            }
            
            console.log(`[CONNECTION] Koneksi ditutup! Status: ${statusCode}, Alasan: "${lastDisconnect.error?.message || 'Tidak Diketahui'}".`);
            
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log("[RECONNECT] Mencoba menyambung kembali...");
                // Baileys akan mencoba reconnect secara otomatis. Tidak perlu memanggil startBot lagi.
            } else {
                console.error("❌ [FATAL] Logged Out. Sesi tidak valid.");
                try {
                    fs.rmSync(authFolderPath, { recursive: true, force: true });
                    console.log("[AUTH] Folder sesi dihapus. Silakan restart bot untuk pairing ulang.");
                } catch (e) {
                    console.error("❌ [AUTH] Gagal menghapus folder sesi.", e);
                }
                process.exit(1);
            }
        } else if (connection === 'connecting') {
            console.log("⏳ [CONNECTION] Menghubungkan ke WhatsApp...");
        }
    });

    return sock;
}