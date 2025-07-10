// modules/ai/gpt4c.js

import axios from 'axios';
import { BOT_PREFIX } from '../../config.js';

export const category = 'ai';
export const description = 'Mendapatkan jawaban yang ringkas dan padat dari model GPT-4 Concise.';
export const usage = `${BOT_PREFIX}gpt4c [pertanyaan Anda]`;
export const requiredTier = 'Silver'; // Tier yang dibutuhkan
export const energyCost = 15;        // Biaya energi per penggunaan

export default async function execute(sock, msg, args, text, sender, utils) {
    if (!text) {
        const replyText = `  Mohon berikan pertanyaan yang singkat.\n\nContoh:\n*${usage}*`;
        await sock.sendMessage(sender, { text: replyText }, { quoted: msg });
        return;
    }

    try {
        await sock.sendPresenceUpdate('composing', sender);
        const encodedQuery = encodeURIComponent(text);
        const apiUrl = `https://szyrineapi.biz.id/api/ai/gpt4-concise?q=${encodedQuery}`;
        console.log(`[GPT4C] Mengirim permintaan untuk: "${text}"`);
        
        const response = await axios.get(apiUrl);
        const apiData = response.data;

        if (response.status === 200 && apiData.status === 200 && apiData.result?.success && apiData.result?.answer) {
            await sock.sendMessage(sender, { text: apiData.result.answer.trim() }, { quoted: msg });
        } else {
            console.warn('[GPT4C] Respons API tidak valid atau gagal:', apiData);
            const errorMessage = apiData.message || 'Gagal mendapatkan jawaban dari AI. Format respons tidak sesuai.';
            await sock.sendMessage(sender, { text: `  Terjadi kesalahan: ${errorMessage}` }, { quoted: msg });
        }

    } catch (error) {
        console.error('[GPT4C] Gagal menjalankan command:', error);
        let errorMessage = '  Maaf, terjadi kesalahan saat menghubungi layanan AI Concise.';
        if (error.response) {
            errorMessage += `\n*Kode Error:* ${error.response.status}`;
        } else {
            errorMessage += '\nPastikan bot terhubung dengan internet.';
        }
        await sock.sendMessage(sender, { text: errorMessage }, { quoted: msg });

    } finally {
        await sock.sendPresenceUpdate('paused', sender);
    }
}