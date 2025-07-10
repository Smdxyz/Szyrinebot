// play.js - VERSI UPGRADE DENGAN SEARCH & DOWNLOADER LEBIH BAIK

import { BOT_PREFIX } from '../../config.js';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import axios from 'axios';
import he from 'he';
const tempDir = path.join(process.env.HOME || '.', 'szyrine_bot_temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

// --- [UPGRADE] Fungsi search sekarang pakai Notube API biar dapet durasi ---
async function searchYouTube(query) {
    try {
        const res = await axios.get(`https://szyrineapi.biz.id/api/downloaders/yt/search/notube?q=${encodeURIComponent(query)}`);
        if (res.data?.status === 200 && res.data.result?.length > 0) {
            // Mapping hasil agar konsisten
            return res.data.result.slice(0, 5).map(v => ({
                title: he.decode(v.title), // Decode HTML entities seperti '
                duration: v.duration,
                channel: v.author,
                url: v.videoId.split('&list=')[0] // Membersihkan URL dari parameter playlist
            }));
        }
    } catch (e) {
        console.error("[SEARCH] Gagal melakukan pencarian lagu:", e.message);
    }
    return null;
}

// --- [UPGRADE] Daftar API downloader diperbanyak dan diurutkan berdasarkan keandalan ---
async function downloadYouTubeMp3(url) {
    const apiList = [
        `https://szyrineapi.biz.id/api/downloaders/yt/dl/flvto?url=${encodeURIComponent(url)}`,
        `https://szyrineapi.biz.id/api/downloaders/yt/mp3-scrape?url=${encodeURIComponent(url)}`,
        `https://szyrineapi.biz.id/api/downloaders/yt/mp3-v4?url=${encodeURIComponent(url)}`,
        `https://szyrineapi.biz.id/api/downloaders/yt/mp3-v2?url=${encodeURIComponent(url)}`,
        `https://szyrineapi.biz.id/api/downloaders/yt/mp3-v1?url=${encodeURIComponent(url)}`,
    ];

    for (const api of apiList) {
        try {
            console.log(`[DOWNLOAD ATTEMPT] Mencoba via: ${api.split('?')[0]}`);
            const res = await axios.get(api, { timeout: 120000 });
            
            // Parser universal untuk semua kemungkinan respons
            const result = res.data?.result;
            const link = result?.url || result?.link || result?.download || result?.downloadURL || result?.downloadUrl;
            const title = result?.title || result?.filename || "Judul Tidak Diketahui";

            if (link) {
                const filename = `${Date.now()}_raw.mp3`;
                const outputPath = path.join(tempDir, filename);
                const stream = await axios({ method: 'GET', url: link, responseType: 'stream' });
                const writer = fs.createWriteStream(outputPath);
                stream.data.pipe(writer);

                return new Promise((resolve, reject) => {
                    writer.on('finish', () => resolve({ filePath: outputPath, title }));
                    writer.on('error', (err) => reject(new Error("Gagal menyimpan file audio.")));
                });
            }
        } catch (e) {
            console.warn(`[DOWNLOAD FAIL] Gagal pada API: ${api.split('?')[0]}. Alasan: ${e.message}`);
        }
    }
    throw new Error('Semua server download lagi ngambek nih, coba nanti lagi ya.');
}

async function convertToMp3128(inputPath) {
    const outputPath = inputPath.replace(/_raw\.mp3$/, '_wa.mp3');
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .noVideo().audioCodec('libmp3lame').audioBitrate('128k').format('mp3')
            .on('error', (err) => reject(new Error(`Gagal konversi audio: ${err.message}`)))
            .on('end', () => resolve(outputPath))
            .save(outputPath);
    });
}

// --- BAGIAN 2: PENANGANAN SETELAH USER MEMILIH LAGU ---
async function handleSongSelection(sock, msg, selectedId) {
    const sender = msg.key.remoteJid;
    const url = selectedId.replace('play_dl_', '');
    
    const waitingMsg = await sock.sendMessage(sender, { text: `Oke, siap! Lagunya lagi diproses ya... 🚀` }, { quoted: msg });
    const waitingKey = waitingMsg.key;
    
    let rawPath = null, finalMp3 = null;
    try {
        const dl = await downloadYouTubeMp3(url);
        if (!dl) throw new Error('Gagal ngedapetin info download.');
        rawPath = dl.filePath;

        await sock.sendMessage(sender, { text: `🎧 Udah kelar download! Sekarang lagi di-convert biar pas buat WA...`, edit: waitingKey });
        
        const rawStats = await fsPromises.stat(rawPath);
        if (rawStats.size < 10240) throw new Error('File yang kedownload kayaknya rusak atau kosong.');
        
        finalMp3 = await convertToMp3128(rawPath);
        const finalStats = await fsPromises.stat(finalMp3);
        if (finalStats.size === 0) throw new Error('Aneh, hasil konversinya kok kosong ya.');
        
        // --- [UPGRADE] Kirim audio & caption terpisah ---
        await sock.sendMessage(sender, {
            audio: { url: finalMp3 },
            mimetype: 'audio/mpeg',
        }, { quoted: msg });
        
        await sock.sendMessage(sender, {
            text: `▶️ *Judul:* ${dl.title}`,
            edit: waitingKey
        });

    } catch (err) {
        console.error('[ERROR PLAY SELECTION]', err);
        await sock.sendMessage(sender, {
            text: `Aduh, maaf, gagal di tengah jalan 😵‍💫\n*Penyebab:* ${err.message}`,
            edit: waitingKey
        });
    } finally {
        if (rawPath && fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
        if (finalMp3 && fs.existsSync(finalMp3)) fs.unlinkSync(finalMp3);
    }
}

// --- BAGIAN 3: EKSEKUSI PERINTAH UTAMA ---
export default async (sock, msg, args, text, sender, extras) => {
    if (!text) {
        return sock.sendMessage(sender, {
            text: `Mau cari lagu apa? Tinggal ketik judulnya aja.\n\nContoh: *${BOT_PREFIX}play Laskar Pelangi*`
        }, { quoted: msg });
    }

    try {
        const sentMsg = await sock.sendMessage(sender, { text: `Oke, gass! Lagi nyari lagu *"${text}"*... 🕵️‍♂️` }, { quoted: msg });

        const results = await searchYouTube(text);
        if (!results || results.length === 0) {
            return sock.sendMessage(sender, { text: `Yah, lagunya gak ketemu 😥. Coba pake judul lain yang lebih jelas.`, edit: sentMsg.key });
        }

        // --- [UPGRADE] Deskripsi sekarang ada durasinya! ---
        const songRows = results.map((song) => ({
            title: song.title,
            description: `Durasi: ${song.duration} | Channel: ${song.channel}`,
            rowId: `play_dl_${song.url}`
        }));

        const listMessage = {
            text: "Nih, dapet beberapa hasil. Pilih salah satu ya.",
            title: "🎶 Hasil Pencarian Lagu 🎶",
            buttonText: "KLIK BUAT MILIH",
            sections: [{ title: "Pilih Lagu Dari Daftar:", rows: songRows }]
        };
        
        await sock.sendMessage(sender, listMessage);
        await sock.sendMessage(sender, { delete: sentMsg.key });

        await extras.set(sender, 'play', handleSongSelection);

    } catch (err) {
        console.error('[ERROR PLAY SEARCH]', err);
        await sock.sendMessage(sender, { text: `❌ Gagal: ${err.message}` }, { quoted: msg });
    }
};

export const category = 'downloader';
export const description = 'Cari dan kirim lagu dari YouTube sebagai MP3.';
export const usage = `${BOT_PREFIX}play <judul lagu>`;
export const requiredTier = 'Basic';
export const energyCost = 10;