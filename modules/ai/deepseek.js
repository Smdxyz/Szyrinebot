// modules/ai/deepseek.js

import axios from 'axios';
import { BOT_PREFIX } from '../../config.js';

export const category = 'ai';
export const description = 'Berinteraksi dengan DeepSeek Coder AI, mendukung percakapan berkelanjutan.';
export const usage = `${BOT_PREFIX}deepseek [pertanyaan]\n${BOT_PREFIX}deepseek new [pertanyaan baru]`;
export const requiredTier = 'Gold'; // Tier yang dibutuhkan
export const energyCost = 20;      // Biaya energi per penggunaan

const deepseekSessions = new Map();

export default async function execute(sock, msg, args, text, sender, utils) {
    let prompt = text;
    let userSession = deepseekSessions.get(sender);
    let sessionId = null;

    if (args[0]?.toLowerCase() === 'new') {
        if (deepseekSessions.has(sender)) {
            deepseekSessions.delete(sender);
            console.log(`[DEEPSEEK] Sesi lama untuk ${sender} dihapus.`);
        }
        userSession = null;
        prompt = args.slice(1).join(' ');
    }

    if (!prompt) {
        const replyText = `  Silakan berikan pertanyaan atau kode yang ingin Anda diskusikan.\n\n*Untuk melanjutkan percakapan:*\n\`${BOT_PREFIX}deepseek [lanjutan pertanyaan]\`\n\n*Untuk memulai percakapan baru:*\n\`${BOT_PREFIX}deepseek new [pertanyaan baru]\``;
        await sock.sendMessage(sender, { text: replyText }, { quoted: msg });
        return;
    }
    
    await sock.sendPresenceUpdate('composing', sender);

    if (userSession) {
        if (Date.now() > userSession.expiresAt) {
            console.log(`[DEEPSEEK] Sesi untuk ${sender} telah kedaluwarsa.`);
            deepseekSessions.delete(sender);
        } else {
            sessionId = userSession.sessionId;
            console.log(`[DEEPSEEK] Melanjutkan sesi untuk ${sender} dengan ID: ${sessionId}`);
        }
    }

    try {
        const apiUrl = new URL('https://szyrineapi.biz.id/api/ai/deepseek');
        apiUrl.searchParams.append('q', prompt);
        if (sessionId) {
            apiUrl.searchParams.append('sessionId', sessionId);
        }
        console.log(`[DEEPSEEK] Mengirim permintaan ke: ${apiUrl.toString()}`);

        const response = await axios.get(apiUrl.toString());
        const apiData = response.data;

        if (response.status === 200 && apiData.result?.success) {
            const result = apiData.result;
            const newSessionId = result.sessionId;
            const expiryDate = new Date(result.sessionExpiry).getTime();
            deepseekSessions.set(sender, { sessionId: newSessionId, expiresAt: expiryDate });
            
            console.log(`[DEEPSEEK] Sesi untuk ${sender} diperbarui. ID baru: ${newSessionId}, Kedaluwarsa: ${result.sessionExpiry}`);

            const answer = result.result.trim();
            const sessionInfo = `\n\n*💡 Sesi percakapan aktif. Untuk memulai dari awal, gunakan \`${BOT_PREFIX}deepseek new [prompt]\`*`;
            await sock.sendMessage(sender, { text: answer + sessionInfo }, { quoted: msg });

        } else {
            console.warn('[DEEPSEEK] Respons API tidak valid atau gagal:', apiData);
            const errorMessage = apiData.message || 'Gagal mendapatkan jawaban, format respons tidak sesuai.';
            await sock.sendMessage(sender, { text: `  Terjadi kesalahan: ${errorMessage}` }, { quoted: msg });
        }

    } catch (error) {
        console.error('[DEEPSEEK] Gagal menjalankan command:', error);
        let errorMessage = '  Maaf, terjadi kesalahan saat menghubungi DeepSeek AI.';
        if (error.response) {
            errorMessage += `\n*Status:* ${error.response.status} - ${error.response.statusText}`;
        } else {
            errorMessage += '\nPastikan bot memiliki koneksi internet.';
        }
        await sock.sendMessage(sender, { text: errorMessage }, { quoted: msg });

    } finally {
        await sock.sendPresenceUpdate('paused', sender);
    }
}