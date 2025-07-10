// /modules/images/upscale.js (Self-Contained)

import { downloadContentFromMessage } from '@fizzxydev/baileys-pro'; // <-- NAMA LIBRARY BARU
import { BOT_PREFIX } from '../../config.js';
import axios from 'axios'; // Command ini juga butuh axios
import { uploadToSzyrine } from '../../libs/apiUploader.js'; // Import fungsi upload yang sama

export const category = 'images';
export const description = 'Meningkatkan resolusi gambar (upscale).';
export const usage = `Kirim/reply gambar dengan caption ${BOT_PREFIX}upscale [skala]\nContoh: ${BOT_PREFIX}upscale atau ${BOT_PREFIX}upscale 4`;

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

/**
 * (LOKAL) Fungsi untuk memanggil API Picsart Upscale. Hanya ada di file ini.
 */
async function picsartUpscale(imageUrl, scale) {
    console.log(`[UPSCALE] Memanggil API PicsArt Upscale dengan skala ${scale}x...`);
    const apiUrl = `https://szyrineapi.biz.id/api/image/upscale/picsart-v1?url=${encodeURIComponent(imageUrl)}&scale=${scale}`;
    try {
        const response = await axios.get(apiUrl, { timeout: 90000 });
        const data = response.data;
        if (data.status !== 200 || !data.result?.url) {
            throw new Error(data.message || 'Gagal upscale, respons API tidak valid.');
        }
        return data.result.url;
    } catch (error) {
        throw new Error(`Gagal menghubungi server PicsArt Upscale: ${error.message}`);
    }
}

export default async function execute(sock, msg, args) {
    const sender = msg.key.remoteJid;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    let messageContentWithMedia = quoted?.imageMessage || msg.message?.imageMessage;

    if (!messageContentWithMedia) {
        return await sock.sendMessage(sender, { text: `Hanya untuk gambar, bos. ${usage}` }, { quoted: msg });
    }
    
    let scale = parseInt(args[0]) || 2;

    let processingMsg;
    try {
        processingMsg = await sock.sendMessage(sender, { text: `⏳ Oke, bentar, lagi proses upscale gambar dengan skala ${scale}x...` }, { quoted: msg });

        console.log('[UPSCALE] Mendownload & mengupload gambar...');
        const stream = await downloadContentFromMessage(messageContentWithMedia, 'image');
        const buffer = await streamToBuffer(stream);
        const directLink = await uploadToSzyrine(buffer);

        await sock.sendMessage(sender, { text: '✅ Gambar terupload! Sekarang proses upscale...' }, { quoted: msg });
        
        console.log(`[UPSCALE] Proses upscale gambar...`);
        const upscaledUrl = await picsartUpscale(directLink, scale);

        await sock.sendMessage(sender, { image: { url: upscaledUrl }, caption: `✅ Selesai! Ini dia gambar hasil upscale ${scale}x nya.` }, { quoted: msg });
        await sock.sendMessage(sender, { delete: processingMsg.key });

    } catch (error) {
        console.error('[UPSCALE] Gagal:', error);
        await sock.sendMessage(sender, { text: `❌ Aduh, gagal nih: ${error.message}` }, { quoted: msg });
        if (processingMsg) {
            await sock.sendMessage(sender, { delete: processingMsg.key });
        }
    }
}