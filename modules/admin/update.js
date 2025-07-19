// modules/owner/update.js (UPGRADED)
import axios from 'axios';
import { promises as fs } from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import { reloadCommand } from '../../core/commandRegistry.js'; 
import { BOT_OWNER, COMMAND_UPDATE_BASE_URL, BOT_PREFIX } from '../../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const category = 'owner';
export const description = 'Memperbarui file bot dari GitHub (mendukung hot-reload).';
export const usage = `${BOT_PREFIX}update <path_file_dari_root_proyek>`;
export const aliases = ['up', 'updatecmd'];
export const requiredTier = 'Admin';
export const energyCost = 0;

export default async function execute(sock, msg, args) {
    const senderId = msg.key.remoteJid.split('@')[0];
    if (!BOT_OWNER.includes(senderId)) {
        return sock.sendMessage(msg.key.remoteJid, { text: '❌ Perintah ini khusus untuk Owner Bot.' }, { quoted: msg });
    }
    
    if (!COMMAND_UPDATE_BASE_URL || args.length === 0) {
        return sock.sendMessage(msg.key.remoteJid, { text: `*Cara Penggunaan:*\n\`\`\`${usage}\`\`\`\n\n*Contoh Update Command:*\n\`\`\`${BOT_PREFIX}update modules/creator/sticker.js\`\`\`\n\n*Contoh Update File Sistem:*\n\`\`\`${BOT_PREFIX}update core/handler.js\`\`\`` }, { quoted: msg });
    }

    // --- LOGIKA PATH BARU ---
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    const targetPath = args[0].endsWith('.js') ? args[0] : `${args[0]}.js`;
    const localPath = path.resolve(projectRoot, targetPath);

    // --- SECURITY CHECK ---
    // Pastikan path yang dituju berada di dalam direktori proyek
    if (!localPath.startsWith(projectRoot)) {
        return sock.sendMessage(msg.key.remoteJid, { text: '❌ Peringatan Keamanan: Anda hanya dapat memperbarui file di dalam direktori proyek.' }, { quoted: msg });
    }

    const remoteUrl = new URL(targetPath, COMMAND_UPDATE_BASE_URL).href;

    const initialMsg = await sock.sendMessage(msg.key.remoteJid, { text: `⏳ Mencoba memperbarui file sistem:\n\`${targetPath}\`...` }, { quoted: msg });

    const editMsg = (newText) => {
        return sock.sendMessage(msg.key.remoteJid, { text: newText, edit: initialMsg.key });
    };

    try {
        const { data: newCode } = await axios.get(remoteUrl, { responseType: 'text' });
        if (!newCode || typeof newCode !== 'string' || newCode.trim().length === 0) {
            return editMsg(`❌ Gagal, file yang diunduh dari ${remoteUrl} kosong.`);
        }
        
        await fs.mkdir(path.dirname(localPath), { recursive: true });
        await fs.writeFile(localPath, newCode, 'utf8');
        
        // --- LOGIKA HOT-RELOAD CERDAS ---
        // Hanya lakukan hot-reload jika file berada di dalam folder 'modules'
        if (localPath.includes(path.sep + 'modules' + path.sep)) {
            await editMsg(`✅ Berhasil menyimpan \`${targetPath}\`.\n\n🔄 Melakukan Hot-Reload...`);
            const reloadResult = await reloadCommand(localPath);
            if (reloadResult.success) {
                await editMsg(`✅ Command \`${targetPath}\` berhasil diperbarui dan aktif tanpa restart!`);
            } else {
                await editMsg(`❌ File diunduh, tapi gagal hot-reload:\n\n\`${reloadResult.message}\``);
            }
        } else {
            // Jika file sistem, berikan pemberitahuan
            await editMsg(`✅ File sistem \`${targetPath}\` berhasil diperbarui.\n\n⚠️ *Restart bot diperlukan agar perubahan dapat diterapkan.*`);
        }
        
    } catch (error) {
        console.error('[UPDATE ERROR]', error);
        let errorMessage = `❌ Gagal total: ${error.message}`;
        if (error.response?.status === 404) {
            errorMessage = `❌ File tidak ditemukan di GitHub (404).\nPastikan path \`${targetPath}\` sudah benar.`;
        }
        await editMsg(errorMessage);
    }
}