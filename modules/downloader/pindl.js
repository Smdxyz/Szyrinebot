// /modules/downloaders/pindl.js

import { BOT_PREFIX, WATERMARK } from '../../config.js';
import { safeApiGet } from '../../libs/apiHelper.js';

export const category = 'downloaders';
export const description = 'Mengunduh foto atau video dari tautan Pinterest.';
export const usage = `${BOT_PREFIX}pindl <url_pinterest>`;
export const aliases = ['savet', 'pindownload'];
export const energyCost = 3;

// API diurutkan dari yang paling mungkin berhasil ke cadangan
const API_PROVIDERS = [
    { url: (url) => `https://szyrineapi.biz.id/api/downloaders/pinterest/savepin?url=${encodeURIComponent(url)}`,
      parser: (data) => data?.video_url ? { type: 'video', url: data.video_url } : (data?.image_urls?.[0] ? { type: 'image', url: data.image_urls[0] } : null) },
    { url: (url) => `https://szyrineapi.biz.id/api/downloaders/pinterest/dl?url=${encodeURIComponent(url)}`,
      parser: (data) => data?.media?.[0]?.url ? { type: data.media[0].extension === 'mp4' ? 'video' : 'image', url: data.media[0].url } : null }
];

async function startPinterestDownload(sock, msg, userUrl) {
    const sender = msg.key.remoteJid;
    const statusMsg = await sock.sendMessage(sender, { text: '⏳ Menganalisis link Pinterest...' }, { quoted: msg });
    
    try {
        let mediaInfo = null;
        for (const [index, provider] of API_PROVIDERS.entries()) {
            try {
                await sock.sendMessage(sender, { text: `⏳ Nyoba Server unduhan #${index + 1}...`, edit: statusMsg.key });
                const result = await safeApiGet(provider.url(userUrl));
                mediaInfo = provider.parser(result);
                if (mediaInfo) break; // Jika berhasil, keluar dari loop
            } catch (e) {
                console.warn(`[PINDL] Server #${index + 1} gagal: ${e.message}`);
            }
        }

        if (mediaInfo && mediaInfo.url) {
            await sock.sendMessage(sender, { text: `✅ Nemu! Ngirim file ${mediaInfo.type} sekarang...`, edit: statusMsg.key });
            await sock.sendMessage(sender, { [mediaInfo.type]: { url: mediaInfo.url }, caption: `Ini dia hasilnya!\n\n${WATERMARK}` }, { quoted: msg });
            await sock.sendMessage(sender, { delete: statusMsg.key });
        } else {
            throw new Error("Gagal ngambil media setelah nyoba semua server. Linknya mungkin salah atau privat.");
        }
    } catch (error) {
        console.error('[PINDL] Gagal total:', error);
        await sock.sendMessage(sender, { text: `❌ Aduh, gagal total: ${error.message}`, edit: statusMsg.key });
    }
}

async function handleUrlInput(sock, msg, body, waitState) {
    const url = body.trim();
    if (!url || (!url.includes('pinterest.com') && !url.includes('pin.it'))) {
        return sock.sendMessage(msg.key.remoteJid, { text: 'Ini bukan link Pinterest. Coba kirim lagi.' }, { quoted: msg });
    }
    await startPinterestDownload(sock, msg, url);
}

export default async function execute(sock, msg, args, text, sender, extras) {
    const userUrl = args[0];
    if (userUrl) {
        await startPinterestDownload(sock, msg, userUrl);
    } else {
        await sock.sendMessage(sender, { text: `Kirim link Pinterest yang mau di-download.` }, { quoted: msg });
        await extras.set(sender, 'pindl_url', handleUrlInput, { extras, timeout: 120000, originalMsgKey: msg.key });
    }
}