// /modules/images/removebg.js (Self-Contained)

import { downloadContentFromMessage } from '@itsukichan/baileys';
import { BOT_PREFIX } from '../../config.js';
import axios from 'axios'; // Command ini butuh axios untuk API call-nya
import { uploadToSzyrine } from '../../libs/apiUploader.js'; // Import fungsi upload yang reusable

export const category = 'images';
export const description = 'Menghapus background dari sebuah gambar.';
export const usage = `Kirim/reply gambar dengan caption ${BOT_PREFIX}removebg`;

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

/**
 * (LOKAL) Fungsi untuk memanggil API Picsart RemoveBG. Hanya ada di file ini.
 * @param {string} imageUrl - URL gambar yang akan diproses.
 * @returns {Promise<string>} URL gambar hasil remove background.
 */
async function picsartRemoveBg(imageUrl) {
    console.log('[REMOVEBG] Memanggil API Picsart RemoveBG...');
    const apiUrl = `https://szyrineapi.biz.id/api/image/removebg/picsart?url=${encodeURIComponent(imageUrl)}`;
    try {
        const response = await axios.get(apiUrl, { timeout: 60000 }); // 60 detik timeout
        const data = response.data;
        if (data.status !== 200 || !data.result?.url) {
            throw new Error(data.message || 'Gagal remove background, respons API tidak valid.');
        }
        return data.result.url;
    } catch (error) {
        throw new Error(`Gagal menghubungi server RemoveBG: ${error.message}`);
    }
}

export default async function execute(sock, msg) {
    const sender = msg.key.remoteJid;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    // Cek media di pesan yang di-reply atau di pesan saat ini
    let messageContentWithMedia = quoted?.imageMessage || msg.message?.imageMessage;

    if (!messageContentWithMedia) {
        return await sock.sendMessage(sender, { text: `Kirim atau reply gambar dulu, bos. ${usage}` }, { quoted: msg });
    }

    let processingMsg;
    try {
        processingMsg = await sock.sendMessage(sender, { text: '⏳ Oke, bentar, lagi misahin gambar dari backgroundnya...' }, { quoted: msg });

        console.log('[REMOVEBG] Mendownload & mengupload gambar...');
        const stream = await downloadContentFromMessage(messageContentWithMedia, 'image');
        const buffer = await streamToBuffer(stream);
        const directLink = await uploadToSzyrine(buffer);

        await sock.sendMessage(sender, { text: '✅ Gambar terupload! Sekarang proses hapus background...' }, { quoted: msg });
        
        console.log('[REMOVEBG] Memproses gambar untuk hapus background...');
        const resultUrl = await picsartRemoveBg(directLink);

        // Kirim sebagai stiker jika user menginginkan, atau sebagai gambar
        // Untuk sekarang, kita kirim sebagai gambar dokumen agar transparan
        await sock.sendMessage(
            sender, 
            { 
                // Mengirim sebagai document dengan mimetype png agar background transparan tetap terjaga
                document: { url: resultUrl },
                mimetype: 'image/png',
                fileName: 'removed_bg.png',
                caption: `✅ Selesai! Background-nya udah ilang.`
            }, 
            { quoted: msg }
        );
        
        await sock.sendMessage(sender, { delete: processingMsg.key });

    } catch (error) {
        console.error('[REMOVEBG] Gagal:', error);
        await sock.sendMessage(sender, { text: `❌ Aduh, gagal nih: ${error.message}` }, { quoted: msg });
        if (processingMsg) {
            await sock.sendMessage(sender, { delete: processingMsg.key });
        }
    }
}