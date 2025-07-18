// core/connection.js (Revised with correct reconnection logic)

import { makeWASocket, DisconnectReason, useMultiFileAuthState, Browsers, makeCacheableSignalKeyStore } from '@fizzxydev/baileys-pro';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import path from 'path';
import process from 'process';
import fs from 'fs';

import { handler } from './handler.js';
import { handleIncomingCall } from './callHandler.js';
import { BOT_PHONE_NUMBER } from '../config.js';

let sock;
let isShuttingDown = false;

// Fungsi koneksi utama, hanya dipanggil sekali
async function connectToWhatsApp(options) {
    const authFolderPath = path.resolve('session');
    const { state, saveCreds } = await useMultiFileAuthState(authFolderPath);

    console.log("[CONNECTION] Membuat instance socket...");
    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, // Penting, kita handle QR/Pairing code manual
        browser: Browsers.ubuntu('Chrome'),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
    });

    // Pasang listener untuk menyimpan sesi
    sock.ev.on('creds.update', saveCreds);

    // *** INI ADALAH EVENT HANDLER UTAMA UNTUK KONEKSI ***
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (connection === 'open') {
            console.log('🎉 [CONNECTION] Koneksi WhatsApp berhasil dibuka!');
            console.log(`[INFO] Terhubung sebagai: ${sock.user?.name || 'Unknown'} (${sock.user?.id.split(':')[0]})`);
            // Set handler di sini saat koneksi pertama kali berhasil
            // Tidak perlu di-reload karena instance sock tetap sama
            sock.ev.on('messages.upsert', (m) => handler(sock, m));
            sock.ev.on('call', (calls) => handleIncomingCall(sock, calls));
        } 
        else if (connection === 'close') {
            if (isShuttingDown) {
                console.log("[SHUTDOWN] Koneksi ditutup. Bot dimatikan.");
                process.exit(0);
                return;
            }

            const shouldReconnect = (lastDisconnect.error instanceof Boom) && lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut;
            const reason = lastDisconnect.error?.message || 'Tidak diketahui';
            
            console.log(`[CONNECTION] Koneksi ditutup. Alasan: "${reason}". ${shouldReconnect ? 'Mencoba menyambung kembali...' : 'Tidak akan menyambung kembali.'}`);
            
            if (shouldReconnect) {
                // Biarkan Baileys yang handle, atau panggil fungsi connect lagi jika perlu
                connectToWhatsApp(options); 
            } else {
                console.error("❌ [FATAL] Logged Out. Hapus folder 'session' dan restart untuk pairing ulang.");
                process.exit(1);
            }
        } 
        else if (connection === 'connecting') {
            console.log("⏳ [CONNECTION] Menghubungkan ke WhatsApp...");
        }

        // Penanganan Pairing Code jika tidak ada sesi
        if (!sock.user && (qr || !state.creds.me)) {
            const sessionExists = fs.existsSync(authFolderPath);
            if (!sessionExists && options.question) {
                try {
                    let phoneNumber;
                    const choice = await options.question("Pilih Mode Pairing: [1] Otomatis | [2] Manual: ");
                    if (choice.toLowerCase() === '1') {
                        if (!BOT_PHONE_NUMBER) throw new Error("BOT_PHONE_NUMBER belum diatur di config.js");
                        phoneNumber = BOT_PHONE_NUMBER.replace(/[^0-9]/g, '');
                    } else {
                        const inputNumber = await options.question("Masukkan nomor WhatsApp Anda (cth: 62812...): ");
                        phoneNumber = inputNumber.replace(/[^0-9]/g, '');
                    }

                    if (!phoneNumber) throw new Error("Nomor telepon tidak valid.");
                    
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    const code = await sock.requestPairingCode(phoneNumber);
                    console.log(`\n=================================================`);
                    console.log(`  📟 KODE PAIRING ANDA: ${code}`);
                    console.log(`=================================================`);
                    console.log('Silakan masukkan kode ini di perangkat WhatsApp Anda.');
                } catch (error) {
                    console.error("❌ [FATAL] Gagal meminta pairing code:", error);
                    process.exit(1);
                }
            } else if (qr) {
                // Fallback jika pairing code gagal dan QR muncul
                console.log("[AUTH] Silakan scan QR code untuk terhubung.");
            }
        }
    });

    return sock;
}

// Fungsi pembungkus yang akan diekspor
export async function startSzyrineBot(options) {
    await connectToWhatsApp(options);

    const initiateShutdown = (signal) => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        if (sock) {
            sock.end(new Error(`Shutdown diinisiasi oleh sinyal ${signal}.`));
        }
    };
    
    // Kembalikan fungsi shutdown ke main.js
    return { initiateShutdown };
}