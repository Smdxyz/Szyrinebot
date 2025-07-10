// /modules/downloaders/ytmp4.js (REVISI OTOMATIS & BAHASA SANTAI)

import { BOT_PREFIX } from '../../config.js';
import { safeApiGet } from '../../libs/apiHelper.js';
import { formatBytes } from '../../core/handler.js';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import fluent from 'fluent-ffmpeg';
import axios from 'axios';

const tempDir = path.join(process.env.HOME || '.', 'szyrine_bot_temp');

// --- [UPGRADE] Provider lengkap, termasuk FLVTO sebagai andalan ---
const API_PROVIDERS = [
    { name: 'Server Stabil (FLVTO)', key: 'p_flvto', endpoint: 'https://szyrineapi.biz.id/api/downloaders/yt/dl/flvto' },
    { name: 'Server Cadangan 1 (dl-v3)', key: 'p1', endpoint: 'https://szyrineapi.biz.id/api/downloaders/yt/dl-v3' },
    { name: 'Server Cadangan 2 (dl-v2)', key: 'p2', endpoint: 'https://szyrineapi.biz.id/api/downloaders/yt/dl-v2' },
    { name: 'Server Cadangan 3 (notube)', key: 'p3', endpoint: 'https://szyrineapi.biz.id/api/downloaders/yt/dl/notube' },
];

async function ensureTempDir() {
    try { await fsPromises.access(tempDir); }
    catch { await fsPromises.mkdir(tempDir, { recursive: true }); }
}

function getYouTubeVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

function getYouTubeThumbnail(url) {
    const videoId = getYouTubeVideoId(url);
    return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}

// --- [UPGRADE] Parser lebih pintar, kenal semua jenis respons ---
function parseDownloadResult(providerKey, data) {
    const result = data.result || {};
    let title, downloadUrl;
    switch (providerKey) {
        case 'p_flvto': // flvto
            title = result.title;
            downloadUrl = result.url;
            break;
        case 'p1': // dl-v3
            title = result.result?.title;
            downloadUrl = result.result?.download;
            break;
        case 'p2': // dl-v2
            title = result.title;
            const videoOption = result.video?.find(v => v.fileType?.includes('360')) || result.video?.[0];
            downloadUrl = videoOption?.downloadLink;
            break;
        case 'p3': // notube
            title = result.title;
            downloadUrl = result.download_url;
            break;
        default:
            return null;
    }
    return title && downloadUrl ? { title, downloadUrl } : null;
}

function selectProviderRandomly() {
    const randomIndex = Math.floor(Math.random() * API_PROVIDERS.length);
    return API_PROVIDERS[randomIndex];
}

async function processVideoDownload(sock, msg, youtubeUrl) {
    const sender = msg.key.remoteJid;
    const pushName = msg.pushName || 'User';

    const progressMessage = await sock.sendMessage(sender, { text: `Oke, bentar ya... lagi disiapin videonya 😉` }, { quoted: msg });
    const progressKey = progressMessage.key;

    const rawDownloadPath = path.join(tempDir, `${Date.now()}_raw_video.mp4`);
    const processedPath = path.join(tempDir, `${Date.now()}_processed_video.mp4`);

    try {
        const provider = selectProviderRandomly();
        await sock.sendMessage(sender, { text: `🎲 Dapet server *${provider.name}*! Nyambung dulu ya...`, edit: progressKey });

        let apiUrl;
        if (provider.key === 'p3') { // Notube butuh ID
            const videoId = getYouTubeVideoId(youtubeUrl);
            if (!videoId) throw new Error("Gagal ngambil ID videonya.");
            apiUrl = `${provider.endpoint}?id=${videoId}&format=mp4`;
        } else { // Provider lain butuh URL lengkap
            const type = provider.key === 'p_flvto' ? '&type=mp4' : '';
            const format = provider.key === 'p1' ? '&format=360' : '';
            apiUrl = `${provider.endpoint}?url=${encodeURIComponent(youtubeUrl)}${type}${format}`;
        }
        
        const apiResult = await safeApiGet(apiUrl);
        const downloadInfo = parseDownloadResult(provider.key, apiResult);
        if (!downloadInfo) throw new Error("Servernya nggak ngasih link download, coba lagi nanti atau ganti link.");

        await sock.sendMessage(sender, { text: `📥 Mulai sedot videonya...\n*Judul:* ${downloadInfo.title}`, edit: progressKey });
        
        const writer = fs.createWriteStream(rawDownloadPath);
        const response = await axios({ url: downloadInfo.downloadUrl, method: 'GET', responseType: 'stream', timeout: 300000 });
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', err => reject(new Error(`Gagal pas nyimpen file: ${err.message}`)));
        });

        const rawStats = await fsPromises.stat(rawDownloadPath);
        if (rawStats.size < 51200) throw new Error("File yang kedownload kayaknya rusak atau kekecilan.");

        await sock.sendMessage(sender, { text: `⚙️ Dikit lagi, videonya lagi di-format biar pas buat WA...`, edit: progressKey });
        
        await new Promise((resolve, reject) => {
            fluent(rawDownloadPath)
                .videoCodec('libx264').audioCodec('aac')
                .outputOptions(['-pix_fmt yuv420p', '-profile:v baseline', '-level 3.0', '-crf 23', '-preset medium', '-movflags +faststart'])
                .on('error', (err) => reject(new Error(`FFmpeg-nya error: ${err.message}`)))
                .on('end', resolve)
                .save(processedPath);
        });

        const videoBuffer = await fsPromises.readFile(processedPath);
        const processedStats = await fsPromises.stat(processedPath);
        
        await sock.sendMessage(sender, { 
            video: videoBuffer, 
            mimetype: 'video/mp4',
            caption: `🎬 *Judul:* ${downloadInfo.title}\n📦 *Ukuran:* ${formatBytes(processedStats.size)}`
        }, { quoted: msg });
        
        await sock.sendMessage(sender, { delete: progressKey });

    } catch (error) {
        console.error(`[YTMP4] Gagal proses unduh:`, error);
        await sock.sendMessage(sender, { text: `Waduh, ada masalah nih 😭\n*Error:* ${error.message}`, edit: progressKey });
    } finally {
        for (const file of [rawDownloadPath, processedPath]) {
            try { await fsPromises.unlink(file); } catch {}
        }
    }
}

export default async function execute(sock, msg, args) {
    const userUrl = args[0];
    if (!userUrl) return sock.sendMessage(msg.key.remoteJid, { text: `Eh, link YouTube-nya mana? 🤔\nContoh: *${BOT_PREFIX}ytmp4 https://youtu.be/linknya*` }, { quoted: msg });
    const ytRegex = /^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com|youtu\.be)\/.+$/;
    if (!ytRegex.test(userUrl)) return sock.sendMessage(msg.key.remoteJid, { text: "Link YouTube-nya kayaknya salah deh, coba cek lagi." }, { quoted: msg });
    
    await ensureTempDir();
    await processVideoDownload(sock, msg, userUrl);
}

export const category = 'downloaders';
export const description = 'Download video dari YouTube secara otomatis.';
export const usage = `${BOT_PREFIX}ytmp4 <url_youtube>`;
export const aliases = ['ytvideo'];
export const requiredTier = 'Basic';
export const energyCost = 15;