// /modules/ai/feloai.js (Felo AI Search)

import { BOT_PREFIX } from '../../config.js';
import { safeApiGet } from '../../libs/apiHelper.js';

export const category = 'ai';
export const description = 'Mengajukan pertanyaan ke Felo AI, yang akan melakukan riset dan memberikan jawaban lengkap dengan sumber.';
export const usage = `${BOT_PREFIX}feloai <pertanyaan_anda>`;
export const aliases = ['felo', 'askfelo'];
export const requiredTier = 'Gold'; // Tier yang dibutuhkan
export const energyCost = 25;      // Biaya energi per penggunaan

const API_URL = 'https://szyrineapi.biz.id/api/ai/felo-search';

async function askFeloAI(sock, msg, query) {
    const sender = msg.key.remoteJid;
    let processingMsg;

    try {
        processingMsg = await sock.sendMessage(sender, { text: `🧠 Felo AI sedang melakukan riset untuk pertanyaan Anda... Ini mungkin butuh waktu beberapa saat. Mohon tunggu.` }, { quoted: msg });
        await sock.sendPresenceUpdate('composing', sender);

        const result = await safeApiGet(`${API_URL}?q=${encodeURIComponent(query)}`);
        await sock.sendPresenceUpdate('paused', sender);

        if (!result) {
            throw new Error("API tidak memberikan respons atau terjadi kesalahan jaringan.");
        }
        
        await sock.sendMessage(sender, { text: result }, { quoted: msg });

    } catch (error) {
        await sock.sendPresenceUpdate('paused', sender);
        console.error('[FELOAI] Gagal mendapatkan jawaban:', error);
        await sock.sendMessage(sender, { text: `❌ Maaf, terjadi kesalahan saat berkomunikasi dengan Felo AI: ${error.message}` }, { quoted: msg });

    } finally {
        if (processingMsg) {
            await sock.sendMessage(sender, { delete: processingMsg.key });
        }
    }
}

async function handleQueryInput(sock, msg, body) {
    const query = body.trim();
    if (!query) {
        return sock.sendMessage(msg.key.remoteJid, { text: "Anda tidak memasukkan pertanyaan. Coba kirim lagi." }, { quoted: msg });
    }
    await askFeloAI(sock, msg, query);
}

export default async function execute(sock, msg, args, text, sender, extras) {
    const query = text.trim();

    if (query) {
        await askFeloAI(sock, msg, query);
    } else {
        await sock.sendMessage(sender, { text: `Apa yang ingin Anda tanyakan kepada Felo AI?` }, { quoted: msg });
        await extras.set(sender, 'feloai_query', handleQueryInput, {
            timeout: 120000
        });
    }
}