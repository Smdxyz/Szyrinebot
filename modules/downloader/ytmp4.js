// /modules/downloaders/ytmp4.js (REVISI FINAL: PARSER MANDIRI & STABIL)

import { BOT_PREFIX } from '../../config.js';
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

const API_PROVIDERS = [
    { name: 'Server Stabil (FLVTO)', key: 'p_flvto', endpoint: 'https://szyrineapi.biz.id/api/downloaders/yt/dl/flvto' },
    { name: 'Server Cadangan v3', key: 'p1', endpoint: 'https://szyrineapi.biz.id/api/downloaders/yt/dl-v3' },
    { name: 'Server Cadangan v1', key: 'p5', endpoint: 'https://szyrineapi.biz.id/api/downloaders/yt/dl-v1' },
    { name: 'Server Cadangan v2', key: 'p2', endpoint: 'https://szyrineapi.biz.id/api/downloaders/yt/dl-v2' },
    { name: 'Server Cadangan Notube', key: 'p3', endpoint: 'https://szyrineapi.biz.id/api/downloaders/yt/dl/notube' },
];

function getYouTubeVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

function selectBestVideoLink(options) {
     if (!options || !Array.isArray(options)) return null;
     const preferredQuality = ['720p', '480p', '360p'];
     const videoOptions = options.filter(opt => opt.url && (opt.type === 'video' || opt.quality.includes('p')));
     if (videoOptions.length === 0) return null;

     videoOptions.sort((a, b) => {
          const qualityA = preferredQuality.findIndex(q => a.quality.includes(q));
          const qualityB = preferredQuality.findIndex(q => b.quality.includes(q));
          if (qualityA !== -1 && qualityB !== -1) return qualityA - qualityB;
          if (qualityA !== -1) return -1;
          if (qualityB !== -1) return 1;
          return 0;
     });
     return videoOptions[0].url;
}

// [STRATEGI BARU] Parser mandiri untuk ytmp4, menerima data mentah.
function parseYtmp4Result(providerKey, rawData) {
    console.log(`[YTMP4 PARSER] Mencoba parse untuk provider: ${providerKey}`);
    if (!rawData || rawData.status !== 200 || !rawData.result) {
        console.warn(`[YTMP4 PARSER] Provider ${providerKey}: Data mentah tidak valid.`);
        return null;
    }

    const result = rawData.result;
    let title = null;
    let downloadUrl = null;

    switch (providerKey) {
        case 'p_flvto':
            title = result.title;
            downloadUrl = result.url;
            break;
        case 'p1': // dl-v3
            title = result.result?.title;
            downloadUrl = result.result?.download;
            break;
        case 'p2': // dl-v2
            title = result.title;
            const videoOption = result.video?.find(v => v.fileType?.includes('360p')) || result.video?.[0];
            downloadUrl = videoOption?.downloadLink;
            break;
        case 'p3': // notube
            title = result.title;
            downloadUrl = result.download_url;
            break;
         case 'p5': // dl-v1
             title = result.result?.videoInfo?.title;
             downloadUrl = selectBestVideoLink(result.result?.downloadOptions);
             break;
        default:
             console.warn(`[YTMP4 PARSER] Key provider tidak dikenal: ${providerKey}`);
            return null;
    }
    
    if (downloadUrl) {
        console.log(`[YTMP4 PARSER] Sukses! Link ditemukan untuk ${providerKey}.`);
        return { title: title || 'Video dari YouTube', downloadUrl };
    }
    
    console.warn(`[YTMP4 PARSER] Gagal menemukan link download valid dari provider ${providerKey}`);
    return null;
}


async function processVideoDownload(sock, msg, youtubeUrl) {
    const sender = msg.key.remoteJid;
    const progressMessage = await sock.sendMessage(sender, { text: `Oke, bentar ya... lagi disiapin videonya 😉` }, { quoted: msg });
    const progressKey = progressMessage.key;

    const rawDownloadPath = path.join(tempDir, `${Date.now()}_raw_video`);
    const processedPath = path.join(tempDir, `${Date.now()}_processed_video.mp4`);

    let downloadInfo = null;
    let lastError = new Error("Unknown error.");

    try {
        for (const provider of API_PROVIDERS) {
            await sock.sendMessage(sender, { text: `🎲 Mencoba server *${provider.name}*...`, edit: progressKey });

            let apiUrl;
            const videoId = getYouTubeVideoId(youtubeUrl);

            if (provider.key === 'p3') {
                 if (!videoId) { lastError = new Error(`Gagal ambil ID video untuk ${provider.name}.`); continue; }
                 apiUrl = `${provider.endpoint}?id=${videoId}&format=mp4`;
            } else {
                 apiUrl = `${provider.endpoint}?url=${encodeURIComponent(youtubeUrl)}`;
                 if(provider.key === 'p_flvto') apiUrl += '&type=mp4';
            }

            try {
                // Panggil axios langsung
                const apiResponse = await axios.get(apiUrl, { timeout: 120000 });
                // Panggil parser mandiri kita
                downloadInfo = parseYtmp4Result(provider.key, apiResponse.data);

                if (downloadInfo && downloadInfo.downloadUrl) {
                    await sock.sendMessage(sender, { text: `✅ Berhasil dapat link dari *${provider.name}*. Mengunduh...`, edit: progressKey });
                    break;
                } else {
                    lastError = new Error(`Server ${provider.name} tidak memberikan link download valid.`);
                    await sock.sendMessage(sender, { text: `❌ ${provider.name} gagal. Coba server lain...`, edit: progressKey });
                }
            } catch (apiError) {
                lastError = new Error(`Error saat panggil ${provider.name}: ${apiError.message}`);
                console.error(`[DOWNLOAD FAIL] Error calling ${provider.name}:`, apiError);
                await sock.sendMessage(sender, { text: `❌ Error dari ${provider.name}. Coba server lain...`, edit: progressKey });
            }
        }

        if (!downloadInfo || !downloadInfo.downloadUrl) {
            throw new Error(`Gagal mendapatkan link video setelah mencoba semua server.\nTerakhir error: ${lastError.message}`);
        }

        await sock.sendMessage(sender, { text: `📥 Menyedot video...\n*Judul:* ${downloadInfo.title || 'Memuat judul...'}`, edit: progressKey });

        const response = await axios({
             url: downloadInfo.downloadUrl, method: 'GET', responseType: 'stream', timeout: 300000
        });

        const writer = fs.createWriteStream(rawDownloadPath);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
            response.data.on('error', reject);
        });

        const rawStats = await fsPromises.stat(rawDownloadPath);
        if (rawStats.size < 51200) {
             await fsPromises.unlink(rawDownloadPath).catch(e => {});
             throw new Error("File yang diunduh terlalu kecil atau rusak.");
        }

        await sock.sendMessage(sender, { text: `⚙️ Dikit lagi, videonya lagi di-format biar pas buat WA...`, edit: progressKey });

        await new Promise((resolve, reject) => {
            fluent(rawDownloadPath)
                .videoCodec('libx264').audioCodec('aac')
                .outputOptions(['-pix_fmt yuv420p', '-profile:v baseline', '-level 3.0', '-crf 23', '-preset medium', '-movflags +faststart'])
                .on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
                .on('end', resolve)
                .save(processedPath);
        });

        const processedStats = await fsPromises.stat(processedPath);
        if (processedStats.size === 0) {
             throw new Error('Hasil konversi video kosong.');
        }

        const videoBuffer = await fsPromises.readFile(processedPath);

        await sock.sendMessage(sender, {
            video: videoBuffer,
            mimetype: 'video/mp4',
            caption: `🎬 *Judul:* ${downloadInfo.title}\n📦 *Ukuran:* ${formatBytes(processedStats.size)}`,
        }, { quoted: msg });

        await sock.sendMessage(sender, { delete: progressKey });

    } catch (error) {
        console.error(`[YTMP4] Gagal proses unduh:`, error);
         const errorMessage = `Waduh, ada masalah nih 😭\n*Error:* ${error.message}`;
         try {
              await sock.sendMessage(sender, { text: errorMessage, edit: progressKey });
         } catch (editError) {
              await sock.sendMessage(sender, { text: errorMessage }, { quoted: msg });
         }
    } finally {
        for (const file of [rawDownloadPath, processedPath]) {
            if (fs.existsSync(file)) {
                await fsPromises.unlink(file).catch(e => console.error(`Gagal hapus file temp ${file}:`, e));
            }
        }
    }
}

export default async function execute(sock, msg, args) {
    const userUrl = args[0];
    if (!userUrl) {
        return sock.sendMessage(msg.key.remoteJid, { text: `Eh, link YouTube-nya mana? 🤔\nContoh: *${BOT_PREFIX}ytmp4 https://youtu.be/linknya*` }, { quoted: msg });
    }
    const ytRegex = /^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com|youtu\.be)\/.+$/;
    if (!ytRegex.test(userUrl)) {
        return sock.sendMessage(msg.key.remoteJid, { text: "Link YouTube-nya kayaknya salah deh, coba cek lagi." }, { quoted: msg });
    }
    await processVideoDownload(sock, msg, userUrl);
}

export const category = 'downloaders';
export const description = 'Download video dari YouTube secara otomatis.';
export const usage = `${BOT_PREFIX}ytmp4 <url_youtube>`;
export const aliases = ['ytvideo'];
export const requiredTier = 'Basic';
export const energyCost = 15;