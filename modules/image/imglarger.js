// /modules/images/imglarger.js (Using Preset System)

import { downloadContentFromMessage } from '@itsukichan/baileys';
import { BOT_PREFIX } from '../../config.js';
import { safeApiGet } from '../../libs/apiHelper.js';
import { uploadToSzyrine } from '../../libs/apiUploader.js';

export const category = 'images';
export const description = 'Memperbaiki kualitas gambar dengan berbagai mode dari ImgLarger.';
export const usage = `Kirim/reply gambar dengan caption ${BOT_PREFIX}imglarger`;

// --- DEFINISI PRESET UNTUK ImgLarger ---
const presets = {
    upscale_2x: {
        type: 'upscale',
        scale: '2',
        title: 'Upscale 2x',
        description: 'Perbesar resolusi gambar menjadi 2 kali lipat.'
    },
    upscale_4x: {
        type: 'upscale',
        scale: '4',
        title: 'Upscale 4x',
        description: 'Perbesar resolusi gambar menjadi 4 kali lipat.'
    },
    enhance: {
        type: 'enhance',
        scale: null, // Scale tidak digunakan untuk tipe ini
        title: 'Enhance',
        description: 'Tingkatkan kualitas, warna, dan detail gambar secara umum.'
    },
    sharpener: {
        type: 'sharpener',
        scale: null,
        title: 'Sharpen',
        description: 'Pertajam detail pada gambar yang sedikit buram.'
    }
};

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

/**
 * (LOKAL) Fungsi untuk memanggil API ImgLarger.
 */
async function processWithImgLarger(imageUrl, type, scale) {
    console.log(`[IMGLARGER] Calling API with type: ${type}, scale: ${scale || 'N/A'}`);
    
    // Bangun URL dengan parameter yang relevan
    let apiUrl = `https://szyrineapi.biz.id/api/image/upscale/imglarger?url=${encodeURIComponent(imageUrl)}&type=${type}`;
    if (type === 'upscale' && scale) {
        apiUrl += `&scale=${scale}`;
    }
    
    // Gunakan helper kita yang tangguh
    const result = await safeApiGet(apiUrl);

    if (result?.success !== true || !result?.result_url) {
        throw new Error('Gagal memproses, respons API tidak valid atau tidak berisi URL hasil.');
    }
    
    return result.result_url;
}

/**
 * Fungsi yang dijalankan setelah pengguna memilih preset dari list.
 */
async function handlePresetSelection(sock, msg, body, waitState) {
    const sender = msg.key.remoteJid;
    const selectedPresetId = body;
    const { imageUrl } = waitState.dataTambahan;

    const config = presets[selectedPresetId];
    if (!config) {
        return sock.sendMessage(sender, { text: "Pilihan preset tidak valid." }, { quoted: msg });
    }

    let processingMsg;
    try {
        processingMsg = await sock.sendMessage(sender, { text: `✅ Preset "${config.title}" dipilih. Memulai proses...` }, { quoted: msg });

        const resultUrl = await processWithImgLarger(imageUrl, config.type, config.scale);

        const caption = `✅ Selesai! Ini hasilnya menggunakan mode *${config.title}*.`;
        await sock.sendMessage(sender, { image: { url: resultUrl }, caption: caption }, { quoted: msg });

        if (processingMsg) await sock.sendMessage(sender, { delete: processingMsg.key });

    } catch (error) {
        console.error('[IMGLARGER] Gagal saat handlePresetSelection:', error);
        await sock.sendMessage(sender, { text: `❌ Aduh, gagal nih: ${error.message}` }, { quoted: msg });
        if (processingMsg) await sock.sendMessage(sender, { delete: processingMsg.key });
    }
}


export default async function execute(sock, msg, args, text, sender, extras) {
    const { set: setWaitingState } = extras;

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const messageContentWithMedia = quoted?.imageMessage || msg.message?.imageMessage;

    if (!messageContentWithMedia) {
        return await sock.sendMessage(sender, { text: `Kirim atau reply gambar dulu, bos. ${usage}` }, { quoted: msg });
    }

    try {
        const tempMsg = await sock.sendMessage(sender, { text: '⏳ Mengunggah gambar untuk diproses...' }, { quoted: msg });
        
        const stream = await downloadContentFromMessage(messageContentWithMedia, 'image');
        const buffer = await streamToBuffer(stream);
        const directLink = await uploadToSzyrine(buffer);

        await sock.sendMessage(sender, { delete: tempMsg.key });

        // Buat baris untuk List Message dari preset yang kita definisikan
        const listRows = Object.entries(presets).map(([id, config]) => ({
            title: config.title,
            description: config.description,
            rowId: id
        }));

        const sections = [{
            title: "Pilih Mode Proses Gambar",
            rows: listRows
        }];

        await sock.sendMessage(sender, {
            text: "✅ Gambar siap! Silakan pilih mode proses yang Anda inginkan.",
            footer: "Setiap mode memiliki fungsi yang berbeda.",
            title: "✨ ImgLarger AI Toolkit ✨",
            buttonText: "Lihat Pilihan Mode",
            sections
        }, { quoted: msg });

        // Set wait state untuk menunggu pilihan pengguna
        await setWaitingState(sender, 'imglarger', handlePresetSelection, {
            dataTambahan: { imageUrl: directLink, },
            timeout: 120000 
        });

    } catch (error) {
        console.error('[IMGLARGER] Gagal pada tahap awal:', error);
        await sock.sendMessage(sender, { text: `❌ Aduh, gagal pada tahap persiapan: ${error.message}` }, { quoted: msg });
    }
}