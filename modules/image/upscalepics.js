// /modules/images/upscalepics.js (Preset System for Lazy People - The Best System)

import { downloadContentFromMessage } from '@fizzxydev/baileys-pro'; // <-- NAMA LIBRARY BARU
import { BOT_PREFIX } from '../../config.js';
import { safeApiGet } from '../../libs/apiHelper.js';
import { uploadToSzyrine } from '../../libs/apiUploader.js';

export const category = 'images';
export const description = 'Mengubah resolusi gambar menggunakan preset aspek rasio.';
export const usage = `Kirim/reply gambar dengan caption ${BOT_PREFIX}upscalepics`;

// --- PRESET ANTI-MALAS ---
const presets = {
    hd_landscape: {
        title: "HD Landscape (16:9)", width: 1920, height: 1080, isAnime: false,
        description: "Cocok untuk wallpaper Desktop atau thumbnail YouTube."
    },
    hd_portrait: {
        title: "HD Portrait (9:16)", width: 1080, height: 1920, isAnime: false,
        description: "Cocok untuk status WhatsApp atau story Instagram."
    },
    square: {
        title: "HD Square (1:1)", width: 2048, height: 2048, isAnime: false,
        description: "Cocok untuk foto profil atau postingan Instagram."
    },
    classic: {
        title: "Classic (4:3)", width: 2048, height: 1536, isAnime: false,
        description: "Aspek rasio standar untuk fotografi digital."
    },
    // Versi ANIME untuk preset paling populer
    hd_landscape_anime: {
        title: "HD Landscape ANIME (16:9)", width: 1920, height: 1080, isAnime: true,
        description: "Versi optimasi anime/kartun untuk wallpaper."
    },
    hd_portrait_anime: {
        title: "HD Portrait ANIME (9:16)", width: 1080, height: 1920, isAnime: true,
        description: "Versi optimasi anime/kartun untuk story."
    }
};

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

async function processWithUpscalepics(imageUrl, width, height, isAnime) {
    console.log(`[UPSCALE-PICS] Calling API. W: ${width}, H: ${height}, Anime: ${isAnime}`);
    let apiUrl = `https://szyrineapi.biz.id/api/image/upscale/upscalepics?url=${encodeURIComponent(imageUrl)}&width=${width}&height=${height}&anime=${isAnime}`;
    
    const result = await safeApiGet(apiUrl);

    if (result?.success !== true || !result?.result?.url) {
        throw new Error('Gagal memproses, respons API tidak valid atau tidak berisi URL hasil.');
    }
    return result.result.url;
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

        const resultUrl = await processWithUpscalepics(imageUrl, config.width, config.height, config.isAnime);

        const caption = `✅ Selesai! Ini hasilnya menggunakan preset *${config.title}*.`;
        await sock.sendMessage(sender, { image: { url: resultUrl }, caption: caption }, { quoted: msg });

        if (processingMsg) await sock.sendMessage(sender, { delete: processingMsg.key });

    } catch (error) {
        console.error('[UPSCALE-PICS] Gagal saat handlePresetSelection:', error);
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
        const tempMsg = await sock.sendMessage(sender, { text: '⏳ Mengunggah gambar untuk diubah ukurannya...' }, { quoted: msg });
        
        const stream = await downloadContentFromMessage(messageContentWithMedia, 'image');
        const buffer = await streamToBuffer(stream);
        const directLink = await uploadToSzyrine(buffer);

        await sock.sendMessage(sender, { delete: tempMsg.key });

        const listRows = Object.entries(presets).map(([id, config]) => ({
            title: config.title,
            description: config.description,
            rowId: id
        }));

        const sections = [{
            title: "Pilih Aspek Rasio & Resolusi",
            rows: listRows
        }];

        await sock.sendMessage(sender, {
            text: "✅ Gambar siap! Mau diubah jadi ukuran apa gambarnya?",
            footer: "Bot akan mengubah resolusi sesuai pilihanmu.",
            title: "✨ UpscalePics Resizer ✨",
            buttonText: "Lihat Pilihan Ukuran",
            sections
        }, { quoted: msg });

        // Tunggu pilihan pengguna
        await setWaitingState(sender, 'upscalepics', handlePresetSelection, {
            dataTambahan: { imageUrl: directLink },
            timeout: 120000
        });

    } catch (error) {
        console.error('[UPSCALE-PICS] Gagal pada tahap awal:', error);
        await sock.sendMessage(sender, { text: `❌ Aduh, gagal pada tahap persiapan: ${error.message}` }, { quoted: msg });
    }
}