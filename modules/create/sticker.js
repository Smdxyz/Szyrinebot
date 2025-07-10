// /modules/creator/sticker.js - BIKIN STIKER DENGAN METADATA & SUPPORT GIF/VIDEO

import { BOT_PREFIX } from '../../config.js';
import { Sticker, StickerTypes } from 'wa-sticker-formatter'; // <-- Impor library-nya
import { downloadContentFromMessage } from '@itsukichan/baileys'; // <-- Pastikan ini sesuai dengan library Baileys lu

// --- FUNGSI UTAMA ---
export default async function execute(sock, msg, args, text, sender) {
    const packname = text.split('|')[0]?.trim() || 'Szyrine Bot'; // Ambil packname dari teks, atau pake default
    const author = text.split('|')[1]?.trim() || 'Created by Sann'; // Ambil author, atau pake default
    
    // Cek apakah user me-reply gambar atau video
    const repliedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const messageType = repliedMessage ? Object.keys(repliedMessage)[0] : null;

    if (!messageType || (messageType !== 'imageMessage' && messageType !== 'videoMessage')) {
        return sock.sendMessage(sender, {
            text: `Salah, bro! Reply gambar atau video/gif yang mau dijadiin stiker.\n\n*Contoh Penggunaan:*\nReply gambar/video, terus ketik:\n*${BOT_PREFIX}sticker Pack Gw|Author Gw*`
        }, { quoted: msg });
    }

    // Kasih tau user kalo lagi diproses
    const processingMsg = await sock.sendMessage(sender, { text: 'Bentar, stikernya lagi dibikin... 👨‍🍳' }, { quoted: msg });

    try {
        // Download media dari pesan yang di-reply
        const stream = await downloadContentFromMessage(repliedMessage, messageType.replace('Message', ''));
        
        // Ubah stream jadi buffer
        let mediaBuffer = Buffer.from([]);
        for await (const chunk of stream) {
            mediaBuffer = Buffer.concat([mediaBuffer, chunk]);
        }
        
        // Tentukan tipe stiker: animasi atau statis
        const isAnimated = messageType === 'videoMessage';

        // --- INI BAGIAN AJAIBNYA ---
        // Buat instance Sticker dari library
        const sticker = new Sticker(mediaBuffer, {
            pack: packname,      // Nama pack stiker
            author: author,      // Nama author stiker
            type: StickerTypes.FULL, // Kualitas stiker (FULL atau CROP)
            categories: ['🎉', '😊'], // Emoji kategori (opsional)
            id: `szyrine-${Date.now()}`, // ID unik buat stiker (opsional)
            quality: 70,         // Kualitas stiker (1-100)
            background: 'transparent' // Background stiker (opsional)
        });

        // Konversi jadi buffer stiker .webp
        const stickerBuffer = await sticker.toBuffer();

        // Kirim stiker!
        await sock.sendMessage(sender, {
            sticker: stickerBuffer
        });

        // Hapus pesan "memproses"
        await sock.sendMessage(sender, { delete: processingMsg.key });

    } catch (error) {
        console.error('[ERROR STICKER]', error);
        await sock.sendMessage(sender, {
            text: `Aduh, gagal bikin stiker 😭\n*Penyebab:* ${error.message}`
        }, { quoted: msg });
        // Hapus pesan "memproses" jika error
        await sock.sendMessage(sender, { delete: processingMsg.key });
    }
}

// --- Metadata Command ---
export const category = 'creator';
export const description = 'Bikin stiker dari gambar/video/gif dengan custom author dan packname.';
export const usage = `${BOT_PREFIX}sticker <packname|author>`;
export const aliases = ['s', 'stiker'];
export const requiredTier = 'Basic';
export const energyCost = 5;