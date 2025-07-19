// modules/owner/delete.js (UPGRADED & SAFER)
import { promises as fs } from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import { unloadCommand } from '../../core/commandRegistry.js'; 
import { BOT_OWNER, BOT_PREFIX } from '../../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const category = 'owner';
export const description = 'Menghapus file command & mengeluarkannya dari memori (no-restart).';
export const usage = `${BOT_PREFIX}delete <path_file_dari_root_proyek>`;
export const aliases = ['del', 'delcmd'];
export const requiredTier = 'Admin';
export const energyCost = 0;

// --- DAFTAR FILE KRITIS YANG TIDAK BOLEH DIHAPUS ---
const CRITICAL_FILES = [
    'main.js',
    'package.json',
    'config.js',
    'core/connection.js',
    'core/handler.js',
    'core/commandRegistry.js',
    'modules/owner/delete.js', // Jangan biarkan command ini menghapus dirinya sendiri
    'modules/owner/update.js',
];

export default async function execute(sock, msg, args) {
    const senderId = msg.key.remoteJid.split('@')[0];
    if (!BOT_OWNER.includes(senderId)) {
        return sock.sendMessage(msg.key.remoteJid, { text: '❌ Perintah ini khusus untuk Owner Bot.' }, { quoted: msg });
    }
    
    if (args.length === 0) {
        return sock.sendMessage(msg.key.remoteJid, { text: `*Perintah untuk menghapus file.*\n\n*Cara Penggunaan:*\n\`\`\`${usage}\`\`\`\n\n*Contoh:*\n\`\`\`${BOT_PREFIX}delete modules/other/test.js\`\`\`` }, { quoted: msg });
    }

    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    const targetPath = args[0].endsWith('.js') ? args[0] : `${args[0]}.js`;
    const localPath = path.resolve(projectRoot, targetPath);

    // --- SECURITY CHECKS ---
    if (!localPath.startsWith(projectRoot)) {
        return sock.sendMessage(msg.key.remoteJid, { text: '❌ Peringatan Keamanan: Anda hanya dapat menghapus file di dalam direktori proyek.' }, { quoted: msg });
    }
    if (CRITICAL_FILES.includes(targetPath.replace(/\\/g, '/'))) {
        return sock.sendMessage(msg.key.remoteJid, { text: `❌ Gagal: File \`${targetPath}\` adalah file sistem yang kritis dan dilindungi dari penghapusan.` }, { quoted: msg });
    }

    const initialMsg = await sock.sendMessage(msg.key.remoteJid, { text: `⏳ Mencoba menghapus \`${targetPath}\`...` }, { quoted: msg });

    const editMsg = (newText) => {
        return sock.sendMessage(msg.key.remoteJid, { text: newText, edit: initialMsg.key });
    };

    try {
        await fs.access(localPath);
        await fs.unlink(localPath);

        // --- LOGIKA UNLOAD CERDAS ---
        if (localPath.includes(path.sep + 'modules' + path.sep)) {
             await editMsg(`✅ Berhasil menghapus file fisik \`${targetPath}\`.\n\n🔄 Mengeluarkan command dari memori...`);
            const unloadResult = await unloadCommand(localPath);
            if (unloadResult.success) {
                await editMsg(`✅ Command \`${targetPath}\` berhasil dihapus permanen dan dikeluarkan dari memori.`);
            } else {
                await editMsg(`⚠️ File fisik berhasil dihapus, namun terjadi masalah saat unload dari memori:\n\n\`${unloadResult.message}\``);
            }
        } else {
            await editMsg(`✅ File \`${targetPath}\` berhasil dihapus.\n\n⚠️ *Perubahan mungkin memerlukan restart untuk efek penuh.*`);
        }

    } catch (error) {
        console.error('[DELETE ERROR]', error);
        let errorMessage = `❌ Gagal: ${error.message}`;
        if (error.code === 'ENOENT') {
            errorMessage = `❌ Gagal, file \`${targetPath}\` tidak ditemukan.`;
        }
        await editMsg(errorMessage);
    }
}