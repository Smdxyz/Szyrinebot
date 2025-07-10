// modules/ai/blackbox.js

import axios from 'axios';
import { BOT_PREFIX } from '../../config.js';

export const category = 'ai';
export const description = 'Mengajukan pertanyaan ke Blackbox AI untuk mendapatkan jawaban beserta sumber referensinya.';
export const usage = `${BOT_PREFIX}blackbox [pertanyaan Anda]`;
export const aliases = ['bb'];
export const requiredTier = 'Silver'; // Tier yang dibutuhkan
export const energyCost = 15;        // Biaya energi per penggunaan

const API_URL = 'https://szyrineapi.biz.id/api/ai/blackbox';

/**
 * Fungsi utama yang akan dieksekusi oleh handler.
 */
export default async function execute(sock, msg, args, text, sender) {
    if (!text) {
        const replyText = `  Mohon berikan pertanyaan Anda.\n\nContoh:\n*${usage}*`;
        await sock.sendMessage(sender, { text: replyText }, { quoted: msg });
        return;
    }

    try {
        await sock.sendPresenceUpdate('composing', sender);
        const encodedQuery = encodeURIComponent(text);
        const apiUrl = `${API_URL}?q=${encodedQuery}`;
        console.log(`[BLACKBOX] Mengirim permintaan untuk: "${text}"`);
        
        const response = await axios.get(apiUrl);
        const apiData = response.data;
        
        if (response.status === 200 && apiData.status === 200 && typeof apiData.result === 'string') {
            const rawResult = apiData.result;
            const delimiter = '$~~~$';
            const parts = rawResult.split(delimiter);

            if (parts.length >= 2) {
                const sourcesJsonString = parts[1];
                const explanation = parts[2] ? parts[2].trim() : 'Tidak ada penjelasan tambahan.';
                
                let sourcesText = '\n\n--- 📚 Sumber Referensi ---\n';
                try {
                    const sources = JSON.parse(sourcesJsonString);
                    if (Array.isArray(sources)) {
                        sources.forEach(source => {
                            sourcesText += `\n*[${source.position}] ${source.title}*\n`;
                            sourcesText += `_${source.link}_\n`;
                            if (source.snippet) {
                                sourcesText += `> _${source.snippet.replace(/\n/g, ' ')}_\n`;
                            }
                        });
                    }
                } catch (e) {
                    console.warn('[BLACKBOX] Gagal mem-parsing JSON sumber referensi:', e);
                    sourcesText += '\n_Gagal memuat sumber referensi._';
                }

                const finalReply = explanation + sourcesText;
                await sock.sendMessage(sender, { text: finalReply }, { quoted: msg });

            } else {
                await sock.sendMessage(sender, { text: rawResult.trim() }, { quoted: msg });
            }

        } else {
            console.warn('[BLACKBOX] Respons API tidak valid atau gagal:', apiData);
            const errorMessage = apiData.message || 'Gagal mendapatkan jawaban dari Blackbox AI.';
            await sock.sendMessage(sender, { text: `  Terjadi kesalahan: ${errorMessage}` }, { quoted: msg });
        }

    } catch (error) {
        console.error('[BLACKBOX] Gagal menjalankan command:', error);
        let errorMessage = '  Maaf, terjadi kesalahan saat menghubungi layanan Blackbox AI.';
        if (error.response) {
            errorMessage += `\n*Status:* ${error.response.status}`;
        } else {
            errorMessage += '\nPastikan bot memiliki koneksi internet yang stabil.';
        }
        await sock.sendMessage(sender, { text: errorMessage }, { quoted: msg });

    } finally {
        await sock.sendPresenceUpdate('paused', sender);
    }
}