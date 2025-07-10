// modules/ai/gpt4.js

import axios from 'axios';
import { BOT_PREFIX } from '../../config.js';

export const category = 'ai';
export const description = 'Mengajukan pertanyaan ke model AI (GPT-4) melalui API.';
export const usage = `${BOT_PREFIX}gpt4 [pertanyaan Anda]`;
export const requiredTier = 'Gold'; // Tier yang dibutuhkan
export const energyCost = 20;      // Biaya energi per penggunaan

export default async function execute(sock, msg, args, text, sender, utils) {
    if (!text) {
        const replyText = `  Anda belum memberikan pertanyaan.\n\nContoh penggunaan:\n*${usage}*`;
        await sock.sendMessage(sender, { text: replyText }, { quoted: msg });
        return;
    }

    try {
        await sock.sendPresenceUpdate('composing', sender);
        const encodedQuery = encodeURIComponent(text);
        const apiUrl = `https://szyrineapi.biz.id/api/ai/gpt4?q=${encodedQuery}`;
        console.log(`[GPT-4] Mengirim permintaan untuk: "${text}"`);
        
        const response = await axios.get(apiUrl);
        const apiData = response.data;

        if (response.status === 200 && apiData.status === 200 && apiData.result) {
            await sock.sendMessage(sender, { text: apiData.result.trim() }, { quoted: msg });
        } else {
            console.warn('[GPT-4] Respons API tidak valid atau gagal:', apiData);
            const errorMessage = apiData.message || 'Gagal mendapatkan jawaban dari AI. Coba lagi nanti.';
            await sock.sendMessage(sender, { text: `  Terjadi kesalahan: ${errorMessage}` }, { quoted: msg });
        }

    } catch (error) {
        console.error('[GPT-4] Gagal menjalankan command:', error);
        let errorMessage = '  Maaf, terjadi kesalahan saat menghubungi layanan GPT-4.';
        if (error.response) {
            errorMessage += `\n*Status:* ${error.response.status} - ${error.response.statusText}`;
        } else {
            errorMessage += '\nPastikan bot terhubung ke internet.';
        }
        await sock.sendMessage(sender, { text: errorMessage }, { quoted: msg });

    } finally {
        await sock.sendPresenceUpdate('paused', sender);
    }
}