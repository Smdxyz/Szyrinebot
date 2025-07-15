// /modules/ai/deepimg.js (AI Image Generator with Preset System)

import { BOT_PREFIX } from '../../config.js';
import { safeApiGet } from '../../libs/apiHelper.js';
// Tidak perlu uploader, karena ini murni dari teks

export const category = 'ai';
export const description = 'Membuat gambar dari deskripsi teks menggunakan AI (DeepImg).';
export const usage = `Ketik ${BOT_PREFIX}deepimg <deskripsi gambar>\n\nContoh: ${BOT_PREFIX}deepimg kucing astronot di bulan`;

// --- PRESET GAYA & UKURAN (SUDAH DISESUAIKAN DENGAN API) ---
const presets = {
    anime_square: {
        style: 'anime', size: '1:1',
        title: 'Anime (Persegi 1:1)', description: 'Gambar gaya anime, cocok untuk foto profil.'
    },
    // 'photorealistic' diganti dengan 'portrait' yang didukung API
    portrait_square: {
        style: 'portrait', size: '1:1',
        title: 'Realistis (Persegi 1:1)', description: 'Foto potret realistis, bagus untuk profil.'
    },
    anime_tall: {
        style: 'anime', size: '2:3',
        title: 'Anime (Potrait 2:3)', description: 'Gambar anime tinggi, cocok untuk wallpaper HP.'
    },
    // 'photorealistic' diganti dengan 'portrait'
    portrait_tall: {
        style: 'portrait', size: '2:3',
        title: 'Realistis (Potrait 2:3)', description: 'Foto potret tinggi, untuk story atau wallpaper.'
    },
    // Menambahkan style 'cyberpunk' dari dokumentasi
    cyberpunk_wide: {
        style: 'cyberpunk', size: '3:2',
        title: 'Cyberpunk (Landscape 3:2)', description: 'Gambar gaya cyberpunk lebar, untuk wallpaper desktop.'
    },
    // Mengganti 'photorealistic' dengan 'portrait'
    portrait_wide: {
        style: 'portrait', size: '3:2',
        title: 'Realistis (Landscape 3:2)', description: 'Foto potret lebar, untuk thumbnail atau wallpaper.'
    }
};

/**
 * (LOKAL) Fungsi untuk memanggil API DeepImg.
 * --- SUDAH DIPERBAIKI ---
 */
async function createWithDeepImg(prompt, style, size) {
    console.log(`[DEEPIMG] Calling API. Style: ${style}, Size: ${size}, Prompt: ${prompt.substring(0, 50)}...`);
    
    const encodedPrompt = encodeURIComponent(prompt);
    const apiUrl = `https://szyrineapi.biz.id/api/image/create/deepimg?prompt=${encodedPrompt}&style=${style}&size=${size}`;
    
    const response = await safeApiGet(apiUrl);

    // [FIX] Mengakses object 'result' terlebih dahulu sesuai struktur API
    if (response?.result?.success !== true || !response?.result?.url) {
        console.error('[DEEPIMG] Invalid API Response:', response);
        throw new Error('Gagal membuat gambar, respons API tidak valid atau tidak berisi URL hasil.');
    }
    
    // [FIX] Mengembalikan URL dari dalam object 'result'
    return response.result.url;
}

/**
 * Fungsi yang dijalankan setelah pengguna memilih preset.
 */
async function handlePresetSelection(sock, msg, body, waitState) {
    const sender = msg.key.remoteJid;
    const selectedPresetId = body;
    const { prompt } = waitState.dataTambahan; // Ambil prompt yang disimpan

    const config = presets[selectedPresetId];
    if (!config) {
        return sock.sendMessage(sender, { text: "Pilihan preset tidak valid." }, { quoted: msg });
    }

    let processingMsg;
    try {
        processingMsg = await sock.sendMessage(sender, { text: `✅ Preset "${config.title}" dipilih. AI sedang menggambar imajinasimu... Ini mungkin butuh satu menit.` }, { quoted: msg });

        const resultUrl = await createWithDeepImg(prompt, config.style, config.size);

        const caption = `✅ Selesai! Ini hasil dari imajinasimu:\n\n*"${prompt}"*\n\n*Gaya*: ${config.title}`;
        await sock.sendMessage(sender, { image: { url: resultUrl }, caption: caption }, { quoted: msg });

        if (processingMsg) await sock.sendMessage(sender, { delete: processingMsg.key });

    } catch (error) {
        console.error('[DEEPIMG] Gagal saat handlePresetSelection:', error);
        await sock.sendMessage(sender, { text: `❌ Aduh, AI-nya lagi pusing: ${error.message}` }, { quoted: msg });
        if (processingMsg) await sock.sendMessage(sender, { delete: processingMsg.key });
    }
}


export default async function execute(sock, msg, args, text, sender, extras) {
    const { set: setWaitingState } = extras;
    const userPrompt = text.trim();

    if (!userPrompt) {
        return await sock.sendMessage(sender, { text: `Tulis dulu deskripsi gambar yang kamu mau.\n\n${usage}` }, { quoted: msg });
    }

    try {
        const listRows = Object.entries(presets).map(([id, config]) => ({
            title: config.title,
            description: config.description,
            rowId: id
        }));

        const sections = [{
            title: "Pilih Gaya & Ukuran Gambar",
            rows: listRows
        }];

        await sock.sendMessage(sender, {
            text: `*"${userPrompt}"*\n\nOke, imajinasimu tercatat! Sekarang, pilih gaya dan ukuran untuk hasil gambarnya.`,
            footer: "AI akan mulai menggambar setelah kamu memilih.",
            title: "✨ DeepImg AI Generator ✨",
            buttonText: "Lihat Pilihan Gaya",
            sections
        }, { quoted: msg });

        // Set wait state untuk menunggu pilihan pengguna
        // Simpan prompt agar bisa digunakan di langkah selanjutnya
        await setWaitingState(sender, 'deepimg', handlePresetSelection, {
            dataTambahan: { prompt: userPrompt },
            timeout: 120000 
        });

    } catch (error) {
        console.error('[DEEPIMG] Gagal pada tahap awal:', error);
        await sock.sendMessage(sender, { text: `❌ Aduh, gagal menyiapkan perintah: ${error.message}` }, { quoted: msg });
    }
}