// /modules/uploader/tourl.js (Updated & Refactored)

import { downloadContentFromMessage } from '@itsukichan/baileys';
import { BOT_PREFIX } from '../../config.js';
// Menggunakan library uploader yang sudah kita rapikan
import { uploadToSzyrine } from '../../libs/apiUploader.js'; 

export const category = 'uploader';
export const description = 'Mengunggah gambar atau video yang dikirim ke sebuah URL.';
export const usage = `Kirim/reply gambar atau video dengan caption ${BOT_PREFIX}tourl`;

/**
 * Helper function untuk mengubah stream menjadi buffer.
 * @param {ReadableStream} stream - Stream yang akan dikonversi.
 * @returns {Promise<Buffer>} Promise yang resolve dengan buffer.
 */
async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

export default async function execute(sock, msg) {
    const sender = msg.key.remoteJid;

    // 1. Logika baru untuk mendeteksi media di pesan saat ini atau yang di-reply.
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    
    let messageContentWithMedia;
    let mediaType; // 'image' atau 'video'

    // Prioritaskan media di pesan yang di-reply
    if (quoted?.imageMessage) {
        messageContentWithMedia = quoted.imageMessage;
        mediaType = 'image';
    } else if (quoted?.videoMessage) {
        messageContentWithMedia = quoted.videoMessage;
        mediaType = 'video';
    } 
    // Jika tidak ada di reply, cek di pesan saat ini (untuk caption)
    else if (msg.message?.imageMessage) {
        messageContentWithMedia = msg.message.imageMessage;
        mediaType = 'image';
    } else if (msg.message?.videoMessage) {
        messageContentWithMedia = msg.message.videoMessage;
        mediaType = 'video';
    }

    // 2. Jika tidak ada media yang ditemukan, kirim pesan bantuan.
    if (!messageContentWithMedia) {
        await sock.sendMessage(sender, { text: `Gimana mau upload, bos? ${usage}` }, { quoted: msg });
        return;
    }

    let processingMsg;
    try {
        // 3. Kirim pesan "sedang proses"
        processingMsg = await sock.sendMessage(sender, { text: '⏳ Oke, bentar, lagi download & upload filenya...' }, { quoted: msg });

        // 4. Download media dari WhatsApp
        console.log(`[TOURL] Mendownload media (${mediaType}) dari WhatsApp...`);
        const stream = await downloadContentFromMessage(messageContentWithMedia, mediaType);
        
        console.log('[TOURL] Mengonversi stream ke buffer...');
        const mediaBuffer = await streamToBuffer(stream);

        // 5. Panggil fungsi dari library uploader kita
        console.log('[TOURL] Memanggil library upload...');
        const directLink = await uploadToSzyrine(mediaBuffer);

        // 6. Kirim hasil link ke pengguna
        const replyText = `✅ Berhasil! Ini link file-mu:\n\n${directLink}\n\nLink akan valid untuk beberapa waktu.`;
        await sock.sendMessage(sender, { text: replyText }, { quoted: msg });

        // Hapus pesan "sedang proses"
        await sock.sendMessage(sender, { delete: processingMsg.key });

    } catch (error) {
        console.error('[TOURL] Gagal:', error);
        
        const errorMessage = error.message.includes('key-not-found') 
            ? 'Media ini mungkin sudah kedaluwarsa atau tidak bisa diunduh lagi.'
            : error.message;
            
        await sock.sendMessage(sender, { text: `❌ Aduh, gagal nih: ${errorMessage}` }, { quoted: msg });
        
        if (processingMsg) {
            await sock.sendMessage(sender, { delete: processingMsg.key });
        }
    }
}