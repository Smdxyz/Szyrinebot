// modules/ai/aira.js

import axios from 'axios';
import { BOT_PREFIX } from '../../config.js';

export const category = 'ai';
export const description = 'Mengobrol dengan Aira, asisten AI (Gemini) yang mendukung riwayat percakapan.';
export const usage = `${BOT_PREFIX}aira [pertanyaan Anda]\n${BOT_PREFIX}aira new [topik baru]`;
export const requiredTier = 'Basic'; // Tier yang dibutuhkan
export const energyCost = 10;       // Biaya energi per penggunaan

// --- Manajemen Sesi & History ---
// Map untuk menyimpan riwayat percakapan per pengguna
// Format: senderJid => [{ role: 'user'/'model', content: '...' }, ...]
const airaSessions = new Map();

// Persona awal untuk memulai percakapan agar AI lebih terarah
const initialHistory = [
    { role: "user", content: "Hai Aira!" },
    { role: "model", content: "Hai juga! Ada yang bisa Aira bantu?" }
];


export default async function execute(sock, msg, args, text, sender, utils) {
    let prompt = text;

    // 1. Cek jika pengguna ingin memulai sesi/percakapan baru
    if (args[0]?.toLowerCase() === 'new') {
        if (airaSessions.has(sender)) {
            airaSessions.delete(sender);
            console.log(`[AIRA] Riwayat percakapan untuk ${sender} telah dihapus.`);
        }
        prompt = args.slice(1).join(' '); // Gunakan prompt setelah kata 'new'
    }
    
    // 2. Validasi input pengguna
    if (!prompt) {
        const replyText = `  Kamu mau ngobrol apa dengan Aira?\n\n*Untuk melanjutkan obrolan:*\n\`${BOT_PREFIX}aira [lanjutan obrolan]\`\n\n*Untuk memulai topik baru:*\n\`${BOT_PREFIX}aira new [topik baru]\``;
        await sock.sendMessage(sender, { text: replyText }, { quoted: msg });
        return;
    }

    await sock.sendPresenceUpdate('composing', sender);

    // 3. Ambil riwayat percakapan yang ada atau mulai dengan yang baru
    let userHistory = airaSessions.get(sender);
    if (!userHistory) {
        // Salin (bukan referensi) initialHistory agar tidak terpengaruh user lain
        userHistory = [...initialHistory]; 
        console.log(`[AIRA] Percakapan baru dimulai untuk ${sender}.`);
    }

    // 4. Siapkan payload untuk permintaan POST
    const payload = {
        q: prompt,
        history: userHistory
    };

    try {
        // 5. Kirim permintaan POST ke API
        console.log(`[AIRA] Mengirim prompt dari ${sender}: "${prompt}" dengan ${userHistory.length} riwayat.`);
        
        const response = await axios.post('https://szyrineapi.biz.id/api/ai/aira-gemini', payload, {
            headers: { 'Content-Type': 'application/json' }
        });
        
        const apiData = response.data;

        // 6. Proses respons yang berhasil
        if (response.status === 200 && apiData.result?.success) {
            const aiResponse = apiData.result.response.trim();

            // 7. Perbarui riwayat percakapan dengan prompt baru dan respons AI
            userHistory.push({ role: "user", content: prompt });
            userHistory.push({ role: "model", content: aiResponse });
            airaSessions.set(sender, userHistory); // Simpan kembali riwayat yang sudah diperbarui

            // 8. Kirim jawaban ke pengguna
            const sessionInfo = `\n\n* percakapan ini diingat. Untuk ganti topik, gunakan \`${BOT_PREFIX}aira new [topik]\`.*`;
            await sock.sendMessage(sender, { text: aiResponse + sessionInfo }, { quoted: msg });

        } else {
            console.warn('[AIRA] Respons API tidak valid:', apiData);
            const errorMessage = apiData.message || 'Gagal mendapat balasan dari Aira, coba lagi.';
            await sock.sendMessage(sender, { text: `  Maaf, terjadi kendala: ${errorMessage}` }, { quoted: msg });
        }

    } catch (error) {
        console.error('[AIRA] Gagal menjalankan command:', error.response ? error.response.data : error.message);
        let errorMessage = '  Duh, Aira sedang tidak bisa dihubungi. Sepertinya ada masalah koneksi.';
        if (error.response) {
            errorMessage += `\n*Detail:* ${error.response.status} - ${JSON.stringify(error.response.data)}`;
        }
        await sock.sendMessage(sender, { text: errorMessage }, { quoted: msg });

    } finally {
        await sock.sendPresenceUpdate('paused', sender);
    }
}