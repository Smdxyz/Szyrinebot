// /modules/images/remini.js (Self-Contained)

import { downloadContentFromMessage } from '@fizzxydev/baileys-pro'; // <-- NAMA LIBRARY BARU
import { BOT_PREFIX } from '../../config.js';
import axios from 'axios'; // Command ini butuh axios untuk API call-nya sendiri
import { uploadToSzyrine } from '../../libs/apiUploader.js'; // Import fungsi upload yang reusable

export const category = 'images';
export const description = 'Meningkatkan kualitas gambar menjadi HD menggunakan AI.';
export const usage = `Kirim/reply gambar dengan caption ${BOT_PREFIX}remini`;

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

/**
 * (LOKAL) Fungsi untuk memanggil API Remini. Hanya ada di file ini.
 */
async function reminiEnhance(imageUrl) {
    console.log('[REMINI] Memanggil API Remini Enhance...');
    const apiUrl = `https://szyrineapi.biz.id/api/image/upscale/remini?url=${encodeURIComponent(imageUrl)}&level=4&format=png`;
    try {
        const response = await axios.get(apiUrl, { timeout: 90000 });
        const data = response.data;
        if (data.status !== 200 || !data.result?.url) {
            throw new Error(data.message || 'Gagal Remini, respons API tidak valid.');
        }
        return data.result.url;
    } catch (error) {
        throw new Error(`Gagal menghubungi server Remini: ${error.message}`);
    }
}

export default async function execute(sock, msg) {
    const sender = msg.key.remoteJid;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    let messageContentWithMedia = quoted?.imageMessage || msg.message?.imageMessage;

    if (!messageContentWithMedia) {
        return await sock.sendMessage(sender, { text: `Hanya untuk gambar, bos. ${usage}` }, { quoted: msg });
    }

    let processingMsg;
    try {
        processingMsg = await sock.sendMessage(sender, { text: '⏳ Oke, bentar, lagi proses gambarnya... Ini bisa agak lama.' }, { quoted: msg });

        console.log('[REMINI] Mendownload & mengupload gambar...');
        const stream = await downloadContentFromMessage(messageContentWithMedia, 'image');
        const buffer = await streamToBuffer(stream);
        const directLink = await uploadToSzyrine(buffer);

        await sock.sendMessage(sender, { text: '✅ Gambar terupload! Sekarang proses upscale ke HD...' }, { quoted: msg });
        
        console.log('[REMINI] Proses enhance gambar...');
        const enhancedUrl = await reminiEnhance(directLink);

        await sock.sendMessage(sender, { image: { url: enhancedUrl }, caption: `✅ Selesai! Ini dia gambar versi HD-nya.` }, { quoted: msg });
        await sock.sendMessage(sender, { delete: processingMsg.key });

    } catch (error) {
        console.error('[REMINI] Gagal:', error);
        await sock.sendMessage(sender, { text: `❌ Aduh, gagal nih: ${error.message}` }, { quoted: msg });
        if (processingMsg) {
            await sock.sendMessage(sender, { delete: processingMsg.key });
        }
    }
}