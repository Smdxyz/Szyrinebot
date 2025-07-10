// --- START OF FILE commands/owner/update.js ---

import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import { BOT_OWNER, COMMAND_UPDATE_BASE_URL, BOT_PREFIX } from '../../config.js';
import 'dotenv/config';
import process from 'process';

// Pastikan __dirname terdefinisi jika menggunakan ES Modules
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- PERBAIKAN: Export fungsi default yang mengembalikan objek gabungan ---
// Fungsi execute ini adalah fungsi utama yang dipanggil oleh handler
async function execute(sock, msg, args) {
    const { sender, reply } = msg; // Gunakan reply helper jika tersedia, atau sock.sendMessage

    // Ambil remoteJid dari key pesan
    const senderJid = msg.key.remoteJid;

    // Gunakan properti yang ditambahkan ke fungsi ini (dari commandMetaData di bawah)
    // console.log(`[DEBUG UPDATE] Execute command: ${execute.name}, Category: ${execute.category}`);

    if (!BOT_OWNER.includes(senderJid.split('@')[0])) {
        return sock.sendMessage(senderJid, { text: '❌ Perintah ini hanya untuk Owner Bot.' }, { quoted: msg });
    }

    if (!COMMAND_UPDATE_BASE_URL) {
        return sock.sendMessage(senderJid, { text: '❌ URL dasar untuk update command belum diatur di `config.js`.' }, { quoted: msg });
    }

    if (args.length === 0) {
        return sock.sendMessage(senderJid, { text: `Penggunaan: ${BOT_PREFIX}${execute.name} <path_ke_command>\nContoh: ${BOT_PREFIX}${execute.name} utility/ping` }, { quoted: msg });
    }

    const commandPath = args[0].endsWith('.js') ? args[0] : `${args[0]}.js`;
    // Pastikan jalur lokal dibangun dengan benar relative terhadap direktori bot
    // Asumsi file update.js ada di <bot_root>/commands/owner/update.js
    // Maka folder commands ada di <bot_root>/commands/
    const localCommandsDir = path.join(__dirname, '..', '..'); // Naik dua tingkat dari commands/owner
    const localPath = path.join(localCommandsDir, 'commands', commandPath); // Turun lagi ke commands/<category>/<command>.js

    const remoteUrl = `${COMMAND_UPDATE_BASE_URL}commands/${commandPath}`;

    const initialMsg = await sock.sendMessage(senderJid, { text: `⏳ Mencoba memperbarui \`${commandPath}\` dari GitHub...` }, { quoted: msg });
    const initialMsgKey = initialMsg.key;

    const githubToken = process.env.GITHUB_PAT;
    const axiosConfig = {
         responseType: 'text' // Pastikan response type adalah text
    };

    if (githubToken) {
        console.log("[Update] Menggunakan GitHub PAT untuk otentikasi repo private.");
        axiosConfig.headers = { 'Authorization': `token ${githubToken}` };
    } else {
        console.log("[Update] GITHUB_PAT tidak ditemukan, mencoba akses publik.");
    }

    try {
        console.log(`[Update] Mengunduh dari: ${remoteUrl}`);
        const { data: newCode } = await axios.get(remoteUrl, axiosConfig);

        if (!newCode || typeof newCode !== 'string' || newCode.trim().length === 0) {
             await sock.sendMessage(senderJid, { text: `❌ Gagal mendapatkan konten dari URL: ${remoteUrl}. Respon kosong atau bukan teks.` }, { edit: initialMsgKey });
            return;
        }

        // Pastikan direktori target ada sebelum menulis file
        const targetDir = path.dirname(localPath);
        await fs.mkdir(targetDir, { recursive: true }).catch(err => {
             // Tangani error mkdir jika terjadi, terutama jika bukan karena sudah ada
             if (err.code !== 'EEXIST') throw err;
        });
        console.log(`[Update] Direktori target (${targetDir}) dipastikan ada.`);


        console.log(`[Update] Menulis file ke: ${localPath}`);
        await fs.writeFile(localPath, newCode, 'utf8');

        // --- Langkah Tambahan: Beri tahu pengguna dan siapkan restart ---
        await sock.sendMessage(senderJid, { text: `✅ Berhasil memperbarui command \`${commandPath}\`.\n\n🔄 Bot akan me-restart dalam beberapa detik untuk menerapkan perubahan.`, edit: initialMsgKey });

        console.log(`[Update] Berhasil memperbarui ${commandPath}. Mempersiapkan restart...`);

        // Beri sedikit waktu untuk pesan terkirim sebelum keluar
        setTimeout(() => {
            console.log("[Update] Melakukan restart proses bot...");
            process.exit(0); // Keluar dengan kode 0 (sukses)
        }, 3000); // Tunggu 3 detik

    } catch (error) {
        console.error('[Update Error]', error); // Log seluruh objek error untuk detail
        const errorMessage = `❌ Terjadi kesalahan saat memperbarui command \`${commandPath}\`: ${error.message}`;

        // Cek error spesifik untuk respons yang lebih informatif
        if (error.response) {
            if (error.response.status === 404) {
                await sock.sendMessage(senderJid, { text: `${errorMessage}\nPastikan path command dan GITHUB_PAT (jika repo private) sudah benar.\nURL: ${remoteUrl}\nStatus: 404 Not Found` }, { edit: initialMsgKey });
            } else if (error.response.status === 401 || error.response.status === 403) { // Tambah 403 Forbidden
                await sock.sendMessage(senderJid, { text: `${errorMessage}\nOtentikasi Gagal (Status: ${error.response.status}). Token GITHUB_PAT Anda mungkin tidak valid, tidak punya izin 'repo', atau URL repo salah jika private.` }, { edit: initialMsgKey });
            } else {
                 await sock.sendMessage(senderJid, { text: `${errorMessage}\nStatus HTTP: ${error.response.status}` }, { edit: initialMsgKey });
            }
        } else if (error.code === 'ENOENT') {
             // Error jika targetDir gagal dibuat, meskipun recursive: true
             await sock.sendMessage(senderJid, { text: `${errorMessage}\nGagal membuat direktori untuk menyimpan file.` }, { edit: initialMsgKey });
        }
         else {
            await sock.sendMessage(senderJid, { text: errorMessage }, { edit: initialMsgKey });
        }
    }
}

// --- properti metadata command ---
const commandMetaData = {
     name: 'updatecmd',
     category: 'owner',
     aliases: ['updatecommand', 'upcmd'],
     description: 'Memperbarui file command dari repositori GitHub (termasuk private) dan me-restart bot otomatis (membutuhkan PM2/proses manager).',
     requiredTier: 'Admin', // Biasanya command owner adalah Admin tier
     energyCost: 0, // Command owner biasanya gratis energi
};

// Mengembalikan objek yang berisi properti metadata dan fungsi execute.
// Command registry akan membaca properti ini dari objek fungsi yang diekspor.
export default Object.assign(execute, commandMetaData);
// --- END OF FILE commands/owner/update.js ---