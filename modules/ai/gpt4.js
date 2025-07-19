// modules/ai/gpt4.js (UPGRADED WITH SESSION HANDLING)

import axios from 'axios';
import { BOT_PREFIX } from '../../config.js';
import { randomBytes } from 'crypto';

export const category = 'ai';
export const description = 'Mengajukan pertanyaan ke model AI (GPT-4) dengan dukungan riwayat percakapan.';
export const usage = `${BOT_PREFIX}gpt4 [pertanyaan]\n${BOT_PREFIX}gpt4 new [pertanyaan baru]`;
export const requiredTier = 'Gold'; // Tier yang dibutuhkan
export const energyCost = 20;      // Biaya energi per penggunaan

// Map untuk menyimpan sessionId per pengguna
// Format: senderJid => "session-id-string"
const gpt4Sessions = new Map();

export default async function execute(sock, msg, args, text, sender, utils) {
    let prompt = text;
    let userSessionId = gpt4Sessions.get(sender);

    // Cek jika pengguna ingin memulai sesi baru
    if (args[0]?.toLowerCase() === 'new') {
        if (userSessionId) {
            gpt4Sessions.delete(sender);
            console.log(`[GPT-4] Sesi untuk ${sender} telah direset.`);
        }
        userSessionId = null; // Hapus session id agar dibuat yang baru
        prompt = args.slice(1).join(' ').trim(); // Gunakan prompt setelah kata 'new'
    }

    if (!prompt) {
        return sock.sendMessage(sender, { text: `  Anda belum memberikan pertanyaan.\n\n*Contoh Penggunaan:*\n\`${usage}\`\n\n*Untuk memulai topik baru:*\n\`${BOT_PREFIX}gpt4 new [pertanyaan]\`` }, { quoted: msg });
    }

    // Jika pengguna belum punya sesi, buat sesi baru
    if (!userSessionId) {
        userSessionId = `SzyrineBot-GPT4-${sender.split('@')[0]}-${randomBytes(4).toString('hex')}`;
        gpt4Sessions.set(sender, userSessionId);
        console.log(`[GPT-4] Sesi baru dibuat untuk ${sender}: ${userSessionId}`);
    }

    try {
        await sock.sendPresenceUpdate('composing', sender);
        
        // Sesuai dokumentasi, tambahkan parameter q dan sessionId
        const encodedQuery = encodeURIComponent(prompt);
        const apiUrl = `https://szyrineapi.biz.id/api/ai/gpt4?q=${encodedQuery}&sessionId=${userSessionId}`;
        
        console.log(`[GPT-4] Mengirim permintaan dari ${sender} dengan sesi ${userSessionId}`);
        
        const response = await axios.get(apiUrl);
        const apiData = response.data;

        if (response.status === 200 && apiData.result?.message) {
            const sessionInfo = `\n\n* percakapan ini diingat. Untuk ganti topik, gunakan \`${BOT_PREFIX}gpt4 new [topik]\`.*`;
            await sock.sendMessage(sender, { text: apiData.result.message.trim() + sessionInfo }, { quoted: msg });
        } else {
            console.warn('[GPT-4] Respons API tidak valid atau gagal:', apiData);
            const errorMessage = apiData.message || 'Gagal mendapatkan jawaban dari AI. Struktur respons tidak sesuai.';
            await sock.sendMessage(sender, { text: `  Terjadi kesalahan: ${errorMessage}` }, { quoted: msg });
        }

    } catch (error) {
        console.error('[GPT-4] Gagal menjalankan command:', error.response?.data || error.message);
        let errorMessage = '  Maaf, terjadi kesalahan saat menghubungi layanan GPT-4.';
        if (error.response) {
            errorMessage += `\n*Status:* ${error.response.status} - ${JSON.stringify(error.response.data.message || error.response.data)}`;
        }
        await sock.sendMessage(sender, { text: errorMessage }, { quoted: msg });
    } finally {
        await sock.sendPresenceUpdate('paused', sender);
    }
}