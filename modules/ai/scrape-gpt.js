// modules/ai/scrape-gpt.js

import axios from 'axios';
import { BOT_PREFIX } from '../../config.js';

export const category = 'ai';
export const description = 'Mengajukan pertanyaan ke model AI (GPT-4o Mini) melalui API.';
export const usage = `${BOT_PREFIX}scrape-gpt [pertanyaan Anda]`;
export const requiredTier = 'Basic'; // Tier yang dibutuhkan
export const energyCost = 5;         // Biaya energi per penggunaan

export default async function execute(sock, msg, args, text, sender, utils) {
    if (!text) {
        const replyText = `  Silakan berikan pertanyaan Anda.\n\nContoh:\n*${usage}*`;
        await sock.sendMessage(sender, { text: replyText }, { quoted: msg });
        return;
    }

    try {
        await sock.sendPresenceUpdate('composing', sender);
        const encodedPrompt = encodeURIComponent(text);
        const apiUrl = `https://szyrineapi.biz.id/api/ai/scrape-gpt?prompt=${encodedPrompt}`;
        console.log(`[SCRAPE-GPT] Mengirim permintaan untuk: "${text}"`);
        
        const response = await axios.get(apiUrl);
        const apiData = response.data;

        if (response.status === 200 && apiData.status === 200 && apiData.result) {
            await sock.sendMessage(sender, { text: apiData.result.trim() }, { quoted: msg });
        } else {
            console.warn('[SCRAPE-GPT] Respons API tidak valid:', apiData);
            const errorMessage = apiData.message || 'Gagal mendapatkan jawaban dari AI. Mungkin server sedang sibuk.';
            await sock.sendMessage(sender, { text: `  Terjadi kesalahan: ${errorMessage}` }, { quoted: msg });
        }

    } catch (error) {
        console.error('[SCRAPE-GPT] Gagal menjalankan command:', error);
        let errorMessage = '  Maaf, terjadi kesalahan saat mencoba menghubungi layanan AI.';
        if (error.response) {
            errorMessage += `\n*Status:* ${error.response.status} - ${error.response.statusText}`;
        } else {
            errorMessage += '\nPastikan bot memiliki koneksi internet dan coba lagi nanti.';
        }
        await sock.sendMessage(sender, { text: errorMessage }, { quoted: msg });

    } finally {
        await sock.sendPresenceUpdate('paused', sender);
    }
}