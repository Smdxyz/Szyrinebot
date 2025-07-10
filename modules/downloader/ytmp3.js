// /modules/downloaders/ytmp3.js (REVISI FINAL: PARSER UNIVERSAL & CLEANED)

import { BOT_PREFIX } from '../../config.js';
import { safeApiGet } from '../../libs/apiHelper.js';
import { formatBytes } from '../../core/handler.js';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import fluent from 'fluent-ffmpeg';
import axios from 'axios';

const tempDir = path.join(process.env.HOME || '.', 'szyrine_bot_temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

function getYouTubeVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

function getYouTubeThumbnail(videoId) {
    if (!videoId) return null;
    return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
}

// --- [FIX] Parser Universal yang sama seperti di play.js, tapi untuk ytmp3.js ---
function parseDownloadResult(providerKey, data) {
    console.log(`[YTMP3 PARSER] Mencoba parse untuk provider: ${providerKey}`);
    if (!data || !data.result) {
        console.warn(`[YTMP3 PARSER] Provider ${providerKey}: Data atau data.result tidak ditemukan.`);
        return null;
    }
    
    const res = data.result;
    
    const downloadLink = 
        res.url ||
        res.link ||
        res.download ||
        res.downloadURL ||
        res.download_url ||
        res.data?.downloadUrl;

    const title = 
        res.title ||
        res.filename ||
        res.data?.title;

    if (downloadLink) {
        console.log(`[YTMP3 PARSER] Sukses! Link ditemukan.`);
        return { url: downloadLink, title: title || 'Audio dari YouTube' };
    }
    
    console.warn(`[YTMP3 PARSER] Gagal menemukan link download valid dari provider ${providerKey}`);
    return null;
}

const API_PROVIDERS = [
    { name: 'Server Stabil (FLVTO)', key: 's_flvto', url: 'https://szyrineapi.biz.id/api/downloaders/yt/dl/flvto' },
    { name: 'Server Cepat (Scrape)', key: 's0', url: 'https://szyrineapi.biz.id/api/downloaders/yt/mp3-scrape' },
    { name: 'Server Cadangan (Notube)', key: 's_notube', url: 'https://szyrineapi.biz.id/api/downloaders/yt/dl/notube' },
    { name: 'Server v4', key: 's4', url: 'https://szyrineapi.biz.id/api/downloaders/yt/mp3-v4' },
    { name: 'Server v2', key: 's2', url: 'https://szyrineapi.biz.id/api/downloaders/yt/mp3-v2' },
    { name: 'Server v1', key: 's1', url: 'https://szyrineapi.biz.id/api/downloaders/yt/mp3-v1' },
];

async function processAudioDownload(sock, msg, youtubeUrl) {
    const sender = msg.key.remoteJid;
    const videoId = getYouTubeVideoId(youtubeUrl);
    if (!videoId) {
        return sock.sendMessage(sender, { text: `❌ Format link YouTube tidak valid.` }, { quoted: msg });
    }

    const progressMessage = await sock.sendMessage(sender, { text: `⏳ Oke, sedang memproses permintaan...` }, { quoted: msg });
    const progressKey = progressMessage.key;
    const outputPath = path.join(tempDir, `${Date.now()}_output.mp3`);
    let downloadInfo = null;

    try {
        for (const provider of API_PROVIDERS) {
            try {
                await sock.sendMessage(sender, { text: `🎲 Mencoba server: *${provider.name}*...`, edit: progressKey });
                let apiUrl = (provider.key === 's_notube')
                    ? `${provider.url}?id=${videoId}&format=mp3`
                    : `${provider.url}?url=${encodeURIComponent(youtubeUrl)}`;

                const apiResult = await safeApiGet(apiUrl);
                
                // ======================================================================
                // [FIX] Cara pemanggilan parser disederhanakan, tidak perlu dibungkus
                //       objek { result: ... } lagi.
                // ======================================================================
                downloadInfo = parseDownloadResult(provider.key, apiResult);

                if (downloadInfo && downloadInfo.url) {
                    await sock.sendMessage(sender, { text: `✅ Berhasil dapat link dari *${provider.name}*.\n*Judul:* ${downloadInfo.title}`, edit: progressKey });
                    break;
                } else {
                    console.warn(`[YTMP3] Provider ${provider.name} tidak mengembalikan link valid.`);
                }
            } catch (apiError) {
                console.error(`[YTMP3] Error dari provider ${provider.name}:`, apiError.message);
            }
        }

        if (!downloadInfo || !downloadInfo.url) {
            throw new Error("Gagal mendapatkan link unduhan setelah mencoba semua server.");
        }

        await sock.sendMessage(sender, { text: `📥 Mengunduh & mengonversi audio...`, edit: progressKey });
        
        const response = await axios({ method: 'GET', url: downloadInfo.url, responseType: 'stream', timeout: 300000 });

        await new Promise((resolve, reject) => {
            fluent(response.data)
                .audioCodec('libmp3lame').audioBitrate('128k').format('mp3')
                .on('error', (err) => reject(new Error(`FFmpeg gagal konversi: ${err.message}`)))
                .on('end', resolve)
                .pipe(fs.createWriteStream(outputPath), { end: true });
        });

        const outputStats = await fsPromises.stat(outputPath);
        if (outputStats.size < 51200) {
            throw new Error(`Hasil konversi MP3 terlalu kecil atau rusak.`);
        }

        const audioBuffer = await fsPromises.readFile(outputPath);

        await sock.sendMessage(sender, {
            audio: audioBuffer,
            mimetype: 'audio/mpeg',
            fileName: `${downloadInfo.title.replace(/[^\w\s.-]/gi, '')}.mp3`,
        }, { quoted: msg });

        const infoText = `✅ *Proses Selesai!*\n\n*Judul:* ${downloadInfo.title}\n*Ukuran File:* ${formatBytes(outputStats.size)}`;
        await sock.sendMessage(sender, { text: infoText, edit: progressKey });

    } catch (error) {
        console.error(`[YTMP3] Proses gagal total:`, error);
        const errorMessage = `❌ Aduh, gagal:\n${error.message}`;
        try {
             await sock.sendMessage(sender, { text: errorMessage, edit: progressKey });
        } catch (editError) {
             await sock.sendMessage(sender, { text: errorMessage }, { quoted: msg });
        }
    } finally {
        if (fs.existsSync(outputPath)) {
            await fsPromises.unlink(outputPath).catch(e => console.error("Gagal hapus file temp:", e));
        }
    }
}

export default async function execute(sock, msg, args) {
    const userUrl = args[0];
    if (!userUrl) return sock.sendMessage(msg.key.remoteJid, { text: `Format salah.\nContoh: *${BOT_PREFIX}ytmp3 <url_youtube>*` }, { quoted: msg });

    const ytRegex = /^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com|youtu\.be)\/.+$/;
    if (!ytRegex.test(userUrl)) {
        return sock.sendMessage(msg.key.remoteJid, { text: "URL YouTube tidak valid." }, { quoted: msg });
    }
    await processAudioDownload(sock, msg, userUrl);
}

export const category = 'downloaders';
export const description = 'Mengunduh audio dari link YouTube sebagai file MP3.';
export const usage = `${BOT_PREFIX}ytmp3 <url_youtube>`;
export const aliases = ['ytvn'];
export const requiredTier = 'Basic';
export const energyCost = 10;