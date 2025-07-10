// /modules/creator/sticker.js - BIKIN STIKER DENGAN METADATA & SUPPORT GIF/VIDEO

import { BOT_PREFIX } from '../../config.js';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { downloadContentFromMessage } from '@itsukichan/baileys';
import { v4 as uuidv4 } from 'uuid';

// --- FUNGSI UTAMA ---
export default async function execute(sock, msg, args, text, sender) {
    const packname = text.split('|')[0]?.trim() || 'Szyrine Bot';
    const author = text.split('|')[1]?.trim() || 'Created by Sann';
    
    // Objek pesan yang di-reply oleh pengguna
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    let mediaMessage;
    let mediaType;

    // Logika ini secara eksplisit mencari media di lokasi yang benar,
    // termasuk pesan standar dan pesan "View Once" (Lihat Sekali).
    if (quoted?.imageMessage) {
        mediaMessage = quoted.imageMessage;
        mediaType = 'image';
    } else if (quoted?.videoMessage) {
        mediaMessage = quoted.videoMessage;
        mediaType = 'video';
    } else if (quoted?.viewOnceMessageV2?.message?.imageMessage) {
        mediaMessage = quoted.viewOnceMessageV2.message.imageMessage;
        mediaType = 'image';
    } else if (quoted?.viewOnceMessageV2?.message?.videoMessage) {
        mediaMessage = quoted.viewOnceMessageV2.message.videoMessage;
        mediaType = 'video';
    }

    // Jika setelah semua pengecekan, media tidak ditemukan, kirim pesan error.
    if (!mediaMessage) {
        return sock.sendMessage(sender, {
            text: `Perintah salah! Reply gambar, video, atau media "Lihat Sekali" (View Once) yang ingin dijadikan stiker.\n\n*Contoh Penggunaan:*\nReply gambar/video, lalu ketik:\n*${BOT_PREFIX}sticker Pack Saya|Author Saya*`
        }, { quoted: msg });
    }

    // Kasih tahu user kalau lagi diproses
    const processingMsg = await sock.sendMessage(sender, { text: 'Bentar, stikernya lagi dibikin... 👨‍🍳' }, { quoted: msg });

    try {
        // Download media menggunakan objek dan tipe yang sudah benar
        const stream = await downloadContentFromMessage(mediaMessage, mediaType);
        
        let mediaBuffer = Buffer.from([]);
        for await (const chunk of stream) {
            mediaBuffer = Buffer.concat([mediaBuffer, chunk]);
        }
        
        // Buat instance Sticker
        const sticker = new Sticker(mediaBuffer, {
            pack: packname,
            author: author,
            type: StickerTypes.FULL,
            categories: ['🎉', '😊'],
            id: uuidv4(),
            quality: 70,
            background: 'transparent'
        });

        const stickerBuffer = await sticker.toBuffer();

        // Kirim stiker
        await sock.sendMessage(sender, {
            sticker: stickerBuffer
        });

        // Hapus pesan "memproses"
        await sock.sendMessage(sender, { delete: processingMsg.key });

    } catch (error) {
        console.error('[ERROR STICKER]', error);
        
        await sock.sendMessage(sender, { delete: processingMsg.key });
        
        let errorMessage = `Aduh, gagal bikin stiker 😭\n*Penyebab:* ${error.message}`;
        if (error.message?.includes('empty media key') || error.message?.includes('cannot derive')) {
            errorMessage = 'Aduh, gagal bikin stiker 😭\nMedia yang Anda reply mungkin sudah terlalu lama (kadaluwarsa), merupakan "View Once" yang sudah dibuka, atau tidak bisa diunduh lagi.';
        }
        
        await sock.sendMessage(sender, { text: errorMessage }, { quoted: msg });
    }
}

// --- Metadata Command ---
export const category = 'creator';
export const description = 'Bikin stiker dari gambar/video/gif dengan custom author dan packname.';
export const usage = `${BOT_PREFIX}sticker <packname|author>`;
export const aliases = ['s', 'stiker'];
export const requiredTier = 'Basic';
export const energyCost = 5;