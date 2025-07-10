// --- START OF FILE commands/owner/update.js ---

import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import { BOT_OWNER, COMMAND_UPDATE_BASE_URL } from '../../config.js';
import 'dotenv/config'; // Memuat variabel dari .env

const command = {
    name: 'updatecmd',
    category: 'owner',
    aliases: ['updatecommand', 'upcmd'],
    description: 'Memperbarui file command dari repositori GitHub (termasuk private).',
    async execute(sock, msg, args) {
        const { sender, reply } = msg;

        if (!BOT_OWNER.includes(sender.split('@')[0])) {
            return reply('❌ Perintah ini hanya untuk Owner Bot.');
        }

        if (!COMMAND_UPDATE_BASE_URL) {
            return reply('❌ URL dasar untuk update command belum diatur di `config.js`.');
        }

        if (args.length === 0) {
            return reply(`Penggunaan: .updatecmd <path_ke_command>\nContoh: .updatecmd utility/ping`);
        }
        
        const commandPath = args[0].endsWith('.js') ? args[0] : `${args[0]}.js`;
        const localPath = path.join(process.cwd(), 'commands', commandPath);
        const remoteUrl = `${COMMAND_UPDATE_BASE_URL}commands/${commandPath}`;

        await reply(`⏳ Mencoba memperbarui \`${commandPath}\` dari GitHub...`);

        const githubToken = process.env.GITHUB_PAT;
        const axiosConfig = {};

        if (githubToken) {
            console.log("[Update] Menggunakan GitHub PAT untuk otentikasi repo private.");
            axiosConfig.headers = { 'Authorization': `token ${githubToken}` };
        } else {
            console.log("[Update] GITHUB_PAT tidak ditemukan, mencoba akses publik.");
        }

        try {
            console.log(`[Update] Mengunduh dari: ${remoteUrl}`);
            const { data: newCode } = await axios.get(remoteUrl, axiosConfig); 

            if (!newCode || typeof newCode !== 'string') {
                return reply(`❌ Gagal mendapatkan konten dari URL: ${remoteUrl}. Respon kosong atau bukan teks.`);
            }

            console.log(`[Update] Menulis file ke: ${localPath}`);
            await fs.writeFile(localPath, newCode, 'utf8');

            await reply(`✅ Berhasil memperbarui command \`${commandPath}\`.\n\n⚠️ *PENTING:* Silakan **restart bot** untuk menerapkan perubahan.`);

        } catch (error) {
            console.error('[Update Error]', error.message);
            if (error.response) {
                if (error.response.status === 404) {
                    return reply(`❌ Gagal: File tidak ditemukan (404).\nPastikan path command dan GITHUB_PAT (jika repo private) sudah benar.\nURL: ${remoteUrl}`);
                }
                if (error.response.status === 401) {
                    return reply(`❌ Gagal: Otentikasi Gagal (401).\nToken GITHUB_PAT Anda mungkin tidak valid atau tidak memiliki izin 'repo'.`);
                }
            }
            return reply(`❌ Terjadi kesalahan saat memperbarui command: ${error.message}`);
        }
    }
};

export default command;
// --- END OF FILE commands/owner/update.js ---