// play.js - VERSI FINAL: SEARCH & DOWNLOADER STABIL

import { BOT_PREFIX } from '../../config.js';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import axios from 'axios';
import he from 'he';
import { formatBytes } from '../../core/handler.js';

const tempDir = path.join(process.env.HOME || '.', 'szyrine_bot_temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

// --- [FIX] Fungsi search sekarang pakai Google API yang WORK ---
async function searchYouTube(query) {
    try {
        // Menggunakan API search dari Google API yang sudah dikonfirmasi bekerja
        const res = await axios.get(`https://szyrineapi.biz.id/api/downloaders/yt/search?q=${encodeURIComponent(query)}`);
        
        if (res.data?.status === 200 && Array.isArray(res.data.result) && res.data.result.length > 0) {
            // Mapping hasil agar konsisten, hanya ambil 5 hasil teratas
            return res.data.result.slice(0, 5).map(v => ({
                title: he.decode(v.title || 'Judul Tidak Diketahui'),
                channel: v.channel || v.author || 'Channel Tidak Diketahui',
                url: v.url // URL video lengkap, ini yang kita butuhkan
            }));
        } else {
             console.warn(`[PLAY SEARCH] API search tidak mengembalikan hasil valid untuk query "${query}".`);
             return null;
        }
    } catch (e) {
        console.error(`[PLAY SEARCH] Gagal melakukan pencarian lagu "${query}":`, e.message);
        return null;
    }
}

// --- [FIX] Parser Universal untuk semua kemungkinan respons API download ---
function parseDownloadResult(data) {
    if (!data || !data.result) {
        console.warn("[PARSER] Data atau data.result tidak ditemukan.");
        return null;
    }
    const res = data.result;
    
    // Mencoba semua kemungkinan kunci untuk link download
    const downloadLink = 
        res.url ||                  // Prioritas utama (v1, flvto)
        res.link ||                 // (mp3-scrape)
        res.download ||
        res.downloadURL ||          // (v2)
        res.downloadUrl ||          // (v4, di dalam `data`)
        res.download_url ||         // (notube)
        res.data?.downloadUrl;      // (v4, akses aman jika `data` ada)

    // Mencoba semua kemungkinan kunci untuk judul
    const title = 
        res.title ||                // Prioritas utama
        res.filename ||             // (mp3-scrape)
        res.data?.title;            // (v4)

    // Hanya kembalikan jika link download ditemukan
    if (downloadLink) {
        return { downloadLink, title: title || "Judul Tidak Diketahui" };
    }
    
    console.warn("[PARSER] Gagal menemukan link download dari respons:", JSON.stringify(res, null, 2));
    return null;
}


// --- [UPGRADE] Daftar API downloader diperbanyak dan diurutkan ---
async function downloadYouTubeMp3(youtubeUrl) {
    const videoIdMatch = youtubeUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;

    const apiList = [
        { name: 'FLVTO', url: `https://szyrineapi.biz.id/api/downloaders/yt/dl/flvto?url=${encodeURIComponent(youtubeUrl)}` },
        { name: 'Scrape', url: `https://szyrineapi.biz.id/api/downloaders/yt/mp3-scrape?url=${encodeURIComponent(youtubeUrl)}` },
        { name: 'Notube', url: videoId ? `https://szyrineapi.biz.id/api/downloaders/yt/dl/notube?id=${videoId}&format=mp3` : null },
        { name: 'v4', url: `https://szyrineapi.biz.id/api/downloaders/yt/mp3-v4?url=${encodeURIComponent(youtubeUrl)}` },
        { name: 'v2', url: `https://szyrineapi.biz.id/api/downloaders/yt/mp3-v2?url=${encodeURIComponent(youtubeUrl)}` },
        { name: 'v1', url: `https://szyrineapi.biz.id/api/downloaders/yt/mp3-v1?url=${encodeURIComponent(youtubeUrl)}` },
    ].filter(api => api.url !== null);

    for (const apiInfo of apiList) {
        try {
            console.log(`[PLAY DOWNLOAD] Mencoba via: ${apiInfo.name}`);
            const res = await axios.get(apiInfo.url, { timeout: 180000 });
            
            // Gunakan parser universal yang baru
            const downloadInfo = parseDownloadResult(res.data);

            if (downloadInfo && downloadInfo.downloadLink) {
                const filename = `${Date.now()}_raw`;
                const inputPath = path.join(tempDir, filename);

                const response = await axios({ 
                    method: 'GET', 
                    url: downloadInfo.downloadLink, 
                    responseType: 'stream',
                    timeout: 240000 
                });
                
                const writer = fs.createWriteStream(inputPath);
                response.data.pipe(writer);

                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                    response.data.on('error', reject);
                });

                const downloadedStats = await fsPromises.stat(inputPath);
                if (downloadedStats.size < 10240) {
                     await fsPromises.unlink(inputPath).catch(e => {});
                     throw new Error(`File dari ${apiInfo.name} rusak atau terlalu kecil.`);
                }
                 
                console.log(`[PLAY DOWNLOAD] Berhasil mengunduh dari ${apiInfo.name}.`);
                return { filePath: inputPath, title: downloadInfo.title };
            } else {
                console.warn(`[PLAY DOWNLOAD] ${apiInfo.name} tidak memberikan link valid.`);
            }
        } catch (e) {
            console.error(`[PLAY DOWNLOAD] Gagal total dari ${apiInfo.name}:`, e.message);
        }
    }
    
    throw new Error("Gagal mengunduh lagu setelah mencoba semua penyedia layanan.");
}


// --- FUNGSI LAINNYA (processAndSendAudio, handleSongSelection, execute) TETAP SAMA ---
// --- KODE DI BAWAH INI TIDAK PERLU DIUBAH ---

async function processAndSendAudio(sock, msg, rawPath, title, progressKey) {
     const sender = msg.key.remoteJid;
     const finalMp3Path = rawPath.replace(/_raw$/, '_wa.mp3');

     try {
         await sock.sendMessage(sender, { text: `⚙️ Mengonversi audio ke MP3...`, edit: progressKey });
         
         await new Promise((resolve, reject) => {
             ffmpeg(rawPath)
                 .noVideo().audioCodec('libmp3lame').audioBitrate('128k').format('mp3')
                 .on('error', (err) => reject(new Error(`Gagal konversi audio: ${err.message}`)))
                 .on('end', () => resolve())
                 .save(finalMp3Path);
         });

         const audioBuffer = await fsPromises.readFile(finalMp3Path);
         const finalStats = await fsPromises.stat(finalMp3Path);

         if (finalStats.size === 0) throw new Error('Hasil konversi MP3 kosong.');

         await sock.sendMessage(sender, {
             audio: audioBuffer,
             mimetype: 'audio/mpeg',
             fileName: `${title.replace(/[^\w\s-]/gi, '')}.mp3`,
         }, { quoted: msg });

         await sock.sendMessage(sender, {
             text: `✅ *Download Selesai!*\n\n*Judul:* ${title}\n*Ukuran File:* ${formatBytes(finalStats.size)}`,
             edit: progressKey
         });

     } catch (err) {
         console.error('[ERROR PROCESSING/SENDING]', err);
         const errorMessage = `❌ Aduh, gagal di tengah jalan 😵‍💫\n*Penyebab:* ${err.message}`;
         try {
              await sock.sendMessage(sender, { text: errorMessage, edit: progressKey });
         } catch (editError) {
              await sock.sendMessage(sender, { text: errorMessage }, { quoted: msg });
         }
     } finally {
         if (fs.existsSync(rawPath)) await fsPromises.unlink(rawPath).catch(e => {});
         if (fs.existsSync(finalMp3Path)) await fsPromises.unlink(finalMp3Path).catch(e => {});
     }
}

async function handleSongSelection(sock, msg, selectedId) {
    const sender = msg.key.remoteJid;
    const youtubeUrl = selectedId.replace('play_dl_', '');
    const ytRegex = /^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com|youtu\.be)\/.+$/;
    if (!ytRegex.test(youtubeUrl)) {
         return sock.sendMessage(sender, { text: "Link YouTube yang dipilih sepertinya tidak valid." }, { quoted: msg });
    }

    const waitingMsg = await sock.sendMessage(sender, { text: `Oke, siap! Lagunya lagi diproses ya... 🚀` }, { quoted: msg });
    try {
        const dlResult = await downloadYouTubeMp3(youtubeUrl);
        await processAndSendAudio(sock, msg, dlResult.filePath, dlResult.title, waitingMsg.key);
    } catch (err) {
        console.error('[ERROR PLAY SELECTION]', err);
         const errorMessage = `Aduh, maaf, gagal memulai proses download 😵‍💫\n*Penyebab:* ${err.message}`;
         try {
              await sock.sendMessage(sender, { text: errorMessage, edit: waitingMsg.key });
         } catch (editError) {
              await sock.sendMessage(sender, { text: errorMessage }, { quoted: msg });
         }
    }
}

export default async (sock, msg, args, text, sender, extras) => {
    if (!text) {
        return sock.sendMessage(sender, { text: `Mau cari lagu apa?\nContoh: *${BOT_PREFIX}play Laskar Pelangi*` }, { quoted: msg });
    }
    let sentMsg;
    try {
        sentMsg = await sock.sendMessage(sender, { text: `Oke, gass! Lagi nyari lagu *"${text}"*... 🕵️‍♂️` }, { quoted: msg });
        const results = await searchYouTube(text);

        if (!results || results.length === 0) {
            return sock.sendMessage(sender, { text: `Yah, lagunya gak ketemu 😥. Coba pake judul lain.`, edit: sentMsg.key });
        }

        const songRows = results.map((song) => ({
            title: song.title,
            description: `Channel: ${song.channel}`,
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
        
        if (extras && typeof extras.set === 'function') {
             await extras.set(sender, 'play', handleSongSelection);
        } else {
             console.error("Warning: 'extras.set' tidak tersedia. Pilihan lagu tidak akan berfungsi.");
        }
    } catch (err) {
        console.error('[ERROR PLAY SEARCH]', err);
         const errorMessage = `❌ Gagal mencari: ${err.message}`;
         try {
              await sock.sendMessage(sender, { text: errorMessage, edit: sentMsg.key });
         } catch (editError) {
              await sock.sendMessage(sender, { text: errorMessage }, { quoted: msg });
         }
    }
};

export const category = 'downloader';
export const description = 'Cari dan kirim lagu dari YouTube sebagai MP3.';
export const usage = `${BOT_PREFIX}play <judul lagu>`;
export const requiredTier = 'Basic';
export const energyCost = 10;