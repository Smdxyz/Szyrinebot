// modules/ai/aira.js (UPGRADED WITH MULTIMODAL/IMAGE SUPPORT)

import axios from 'axios';
import { downloadContentFromMessage } from '@fizzxydev/baileys-pro';
import { BOT_PREFIX } from '../../config.js';
// Impor fungsi upload dari library yang sudah ada di proyek Anda
import { uploadToSzyrine } from '../../libs/apiUploader.js'; 

export const category = 'ai';
export const description = 'Mengobrol dengan Aira (Gemini) yang mendukung teks dan gambar.';
export const usage = `Kirim teks: ${BOT_PREFIX}aira [pertanyaan]\nKirim gambar: Kirim/reply gambar dengan caption ${BOT_PREFIX}aira [pertanyaan]\nUntuk ganti topik: ${BOT_PREFIX}aira new [topik baru]`;
export const requiredTier = 'Basic';
export const energyCost = 15; // Sedikit lebih mahal karena bisa proses gambar

const airaSessions = new Map();
const initialHistory = [
    { role: "user", content: "Hai Aira!" },
    { role: "model", content: "Hai juga! Ada yang bisa Aira bantu?" }
];

// Helper untuk mengubah stream menjadi buffer
async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

export default async function execute(sock, msg, args, text, sender, utils) {
    let prompt = text;
    let userHistory = airaSessions.get(sender);

    // --- LOGIKA RESET SESI ---
    if (args[0]?.toLowerCase() === 'new') {
        if (airaSessions.has(sender)) {
            airaSessions.delete(sender);
            console.log(`[AIRA] Riwayat percakapan untuk ${sender} telah dihapus.`);
        }
        prompt = args.slice(1).join(' ').trim();
    }
    
    // Ambil riwayat atau buat baru
    if (!userHistory) {
        userHistory = [...initialHistory];
        console.log(`[AIRA] Percakapan baru dimulai untuk ${sender}.`);
    }

    // --- LOGIKA MULTIMODAL (GAMBAR) ---
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const messageWithMedia = quoted?.imageMessage || msg.message?.imageMessage;
    let imageUrls = [];

    // Jika ada gambar, proses gambar tersebut
    if (messageWithMedia) {
        const tempMsg = await sock.sendMessage(sender, { text: '⏳ Mengunduh & menganalisis gambar...' }, { quoted: msg });
        try {
            const stream = await downloadContentFromMessage(messageWithMedia, 'image');
            const buffer = await streamToBuffer(stream);
            const directLink = await uploadToSzyrine(buffer);
            
            // Sesuai dokumentasi API: [{ url: "...", mimeType: "..." }]
            imageUrls.push({ url: directLink, mimeType: 'image/jpeg' });
            
            await sock.sendMessage(sender, { text: '✅ Gambar berhasil dianalisis. Mengirim ke Aira...', edit: tempMsg.key });

        } catch (uploadError) {
            console.error('[AIRA] Gagal mengunggah gambar:', uploadError);
            await sock.sendMessage(sender, { text: `❌ Gagal memproses gambar: ${uploadError.message}`, edit: tempMsg.key });
            return;
        }
    }
    
    if (!prompt && imageUrls.length === 0) {
        return sock.sendMessage(sender, { text: `  Kamu mau ngobrol apa dengan Aira?\n\n${usage}` }, { quoted: msg });
    }

    await sock.sendPresenceUpdate('composing', sender);

    // --- PAYLOAD SESUAI DOKUMENTASI API BARU ---
    const payload = {
        q: prompt,
        history: userHistory,
        imageUrls: imageUrls // Kirim array URL gambar
    };

    try {
        console.log(`[AIRA] Mengirim prompt dari ${sender}. Teks: "${prompt}". Gambar: ${imageUrls.length}`);
        const response = await axios.post('https://szyrineapi.biz.id/api/ai/aira-gemini', payload, {
            headers: { 'Content-Type': 'application/json' }
        });
        
        const apiData = response.data;

        if (response.status === 200 && apiData.result?.success) {
            const aiResponse = apiData.result.response.trim();
            // API mengembalikan history terbaru, kita gunakan itu
            const updatedHistory = apiData.result.history;
            airaSessions.set(sender, updatedHistory); 

            const sessionInfo = `\n\n* percakapan ini diingat. Untuk ganti topik, gunakan \`${BOT_PREFIX}aira new [topik]\`.*`;
            await sock.sendMessage(sender, { text: aiResponse + sessionInfo }, { quoted: msg });
        } else {
            const errorMessage = apiData.message || 'Gagal mendapat balasan dari Aira, coba lagi.';
            await sock.sendMessage(sender, { text: `  Maaf, terjadi kendala: ${errorMessage}` }, { quoted: msg });
        }
    } catch (error) {
        console.error('[AIRA] Gagal:', error.response?.data || error.message);
        let errorMessage = '  Duh, Aira sedang tidak bisa dihubungi.';
        if (error.response) {
            errorMessage += `\n*Detail:* ${error.response.status} - ${JSON.stringify(error.response.data)}`;
        }
        await sock.sendMessage(sender, { text: errorMessage }, { quoted: msg });
    } finally {
        await sock.sendPresenceUpdate('paused', sender);
    }
}