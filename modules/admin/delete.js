// modules/owner/delete.js (New File)
import { promises as fs } from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import { unloadCommand } from '../../core/commandRegistry.js'; 
import { BOT_OWNER, BOT_PREFIX } from '../../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Metadata ---
export const category = 'owner';
export const description = 'Menghapus file command & mengeluarkannya dari memori (no-restart).';
export const usage = `${BOT_PREFIX}delete <category/command_name>`;
export const aliases = ['del', 'delcmd'];
export const requiredTier = 'Admin';
export const energyCost = 0;

// --- Logic ---
export default async function execute(sock, msg, args) {
    const senderId = msg.key.remoteJid.split('@')[0];

    if (!BOT_OWNER.includes(senderId)) {
        return sock.sendMessage(msg.key.remoteJid, { text: '❌ Perintah ini khusus untuk Owner Bot.' }, { quoted: msg });
    }

    if (args.length === 0) {
        return sock.sendMessage(msg.key.remoteJid, { text: `*Perintah untuk menghapus command.*\n\n*Cara Penggunaan:*\n\`\`\`${usage}\`\`\`\n\n*Contoh:*\n\`\`\`${BOT_PREFIX}delete other/test\`\`\`` }, { quoted: msg });
    }

    const commandPath = args[0].endsWith('.js') ? args[0] : `${args[0]}.js`;
    const modulesDir = path.join(__dirname, '..', '..', 'modules');
    const localPath = path.join(modulesDir, commandPath);

    const initialMsg = await sock.sendMessage(msg.key.remoteJid, { text: `⏳ Mencoba menghapus \`${commandPath}\`...` }, { quoted: msg });

    try {
        // Langkah 1: Pastikan file ada sebelum mencoba menghapus
        await fs.access(localPath);

        // Langkah 2: Hapus file fisik dari disk
        await fs.unlink(localPath);
        await sock.editMessage(msg.key.remoteJid, initialMsg.key, `✅ Berhasil menghapus file fisik \`${commandPath}\`.\n\n🔄 Mengeluarkan command dari memori...`);

        // Langkah 3: Keluarkan command dari memori bot (hot-unload)
        const unloadResult = await unloadCommand(localPath);

        if (unloadResult.success) {
            await sock.editMessage(msg.key.remoteJid, initialMsg.key, `✅ Command \`${commandPath}\` berhasil dihapus permanen dan dikeluarkan dari memori.`);
        } else {
             await sock.editMessage(msg.key.remoteJid, initialMsg.key, `⚠️ File fisik berhasil dihapus, namun terjadi masalah saat unload dari memori:\n\n\`${unloadResult.message}\``);
        }

    } catch (error) {
        console.error('[DELETE ERROR]', error);
        let errorMessage = `❌ Gagal: ${error.message}`;
        if (error.code === 'ENOENT') { // ENOENT = Error No Entry (file not found)
            errorMessage = `❌ Gagal, file \`${commandPath}\` tidak ditemukan di direktori.`;
        }
        await sock.editMessage(msg.key.remoteJid, initialMsg.key, errorMessage);
    }
}