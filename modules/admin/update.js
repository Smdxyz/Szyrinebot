// modules/owner/update.js (Final Version)
import axios from 'axios';
import { promises as fs } from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import process from 'process';
import 'dotenv/config';

import { BOT_OWNER, COMMAND_UPDATE_BASE_URL, BOT_PREFIX } from '../../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Metadata ---
export const category = 'owner';
export const description = 'Memperbarui file command dari GitHub & me-restart bot.';
export const usage = `${BOT_PREFIX}update <category/command_name>`;
export const aliases = ['up', 'updatecmd'];
export const requiredTier = 'Admin';
export const energyCost = 0;

// --- Logic ---
export default async function execute(sock, msg, args) {
    const senderId = msg.key.remoteJid.split('@')[0];

    if (!BOT_OWNER.includes(senderId)) {
        return sock.sendMessage(msg.key.remoteJid, { text: '❌ Perintah ini khusus untuk Owner Bot.' }, { quoted: msg });
    }

    if (!COMMAND_UPDATE_BASE_URL) {
        return sock.sendMessage(msg.key.remoteJid, { text: '❌ Konfigurasi `COMMAND_UPDATE_BASE_URL` belum diatur di `config.js`.' }, { quoted: msg });
    }

    if (args.length === 0) {
        return sock.sendMessage(msg.key.remoteJid, { text: `*Cara Penggunaan:*\n\`\`\`${usage}\`\`\`\n\n*Contoh:*\n\`\`\`${BOT_PREFIX}update creator/sticker\`\`\`` }, { quoted: msg });
    }

    const commandPath = args[0].endsWith('.js') ? args[0] : `${args[0]}.js`;
    const modulesDir = path.join(__dirname, '..', '..', 'modules');
    const localPath = path.join(modulesDir, commandPath);
    const remoteUrl = new URL(path.join('modules', commandPath), COMMAND_UPDATE_BASE_URL).href;

    const initialMsg = await sock.sendMessage(msg.key.remoteJid, { text: `⏳ Mencoba memperbarui \`${commandPath}\`...` }, { quoted: msg });

    try {
        console.log(`[UPDATE] Mengunduh dari: ${remoteUrl}`);
        const { data: newCode } = await axios.get(remoteUrl, { responseType: 'text' });

        if (!newCode || typeof newCode !== 'string' || newCode.trim().length === 0) {
            return sock.editMessage(msg.key.remoteJid, initialMsg.key, `❌ Gagal, file yang diunduh kosong.`);
        }
        
        await fs.mkdir(path.dirname(localPath), { recursive: true });
        await fs.writeFile(localPath, newCode, 'utf8');

        await sock.editMessage(msg.key.remoteJid, initialMsg.key, `✅ Berhasil memperbarui \`${commandPath}\`.\n\n🔄 Bot akan me-restart dalam 3 detik...`);

        setTimeout(() => {
            console.log("[UPDATE] Melakukan restart proses bot...");
            process.exit(1);
        }, 3000);

    } catch (error) {
        console.error('[UPDATE ERROR]', error);
        let errorMessage = `❌ Gagal total: ${error.message}`;
        if (error.response?.status === 404) {
            errorMessage = `❌ Command tidak ditemukan di GitHub (404).\nPastikan path \`${commandPath}\` sudah benar.`;
        }
        await sock.editMessage(msg.key.remoteJid, initialMsg.key, errorMessage);
    }
}