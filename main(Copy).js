// =======================================================
//          KODE ESM DIPERBAIKI SESUAI DOKUMENTASI
// =======================================================
console.log('Memulai bot dalam mode ESM (versi perbaikan)...');

// 1. TAMBAHKAN 'Browsers' dan 'makeCacheableSignalKeyStore' DI SINI
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers, // <--- IMPORT HELPER BROWSER
  makeCacheableSignalKeyStore, // <--- IMPORT HELPER AUTH
} from "@fizzxydev/baileys-pro";
import pino from "pino";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("session-esm-fixed");

  const sock = makeWASocket({
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    
    // SOLUSI #1: Gunakan browser standar dari library
    browser: Browsers.ubuntu('Chrome'), // <-- INI PERUBAHAN PALING PENTING

    // SOLUSI #2: Gunakan struktur auth yang lebih robust
    auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
  });

  if (!sock.authState.creds.registered) {
    console.log("Sesi tidak ditemukan, memulai pairing code...");
    const phoneNumber = await question(
      "Masukkan nomor WhatsApp Anda (cth: 62812...): "
    );
    try {
      // Tunggu sebentar sebelum request, untuk menghindari rate-limit
      await new Promise(resolve => setTimeout(resolve, 2000)); 

      const code = await sock.requestPairingCode(phoneNumber);
      console.log(`\n===================================`);
      console.log(`   KODE PAIRING ANDA: ${code}   `);
      console.log(`===================================\n`);
    } catch (error) {
      console.error("Gagal meminta pairing code:", error);
      rl.close();
      return;
    }
  }

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        connectToWhatsApp();
      } else {
        console.log("Koneksi terputus permanen.");
        rl.close();
      }
    } else if (connection === "open") {
      console.log("Koneksi WhatsApp berhasil!");
      rl.close();
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

connectToWhatsApp();