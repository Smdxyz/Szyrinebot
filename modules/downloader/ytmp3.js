// /modules/downloaders/ytmp3.js (REVISI OTOMATIS & PESAN TERPISAH)

import { BOT_PREFIX } from '../../config.js';
import { safeApiGet } from '../../libs/apiHelper.js';
import { formatBytes } from '../../core/handler.js';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import fluent from 'fluent-ffmpeg';
import axios from 'axios';

const tempDir = path.join(process.env.HOME || '.', 'szyrine_bot_temp');

// --- [UPGRADE] Daftar provider di-tuning ulang, FLVTO masuk! ---
const API_PROVIDERS = [
    { name: 'Server Cepat (Scrape)', key: 's0', url: 'https://szyrineapi.biz.id/api/downloaders/yt/mp3-scrape' },
    { name: 'Server Stabil (FLVTO)', key: 's_flvto', url: 'https://szyrineapi.biz.id/api/downloaders/yt/dl/flvto' },
    { name: 'Server Cadangan 1 (v1)', key: 's1', url: 'https://szyrineapi.biz.id/api/downloaders/yt/mp3-v1' },
    { name: 'Server Cadangan 2 (v2)', key: 's2', url: 'https://szyrineapi.biz.id/api/downloaders/yt/mp3-v2' },
    { name: 'Server Cadangan 3 (v4)', key: 's4', url: 'https://szyrineapi.biz.id/api/downloaders/yt/mp3-v4' },
];

async function ensureTempDir() {
    try { await fsPromises.access(tempDir); }
    catch { await fsPromises.mkdir(tempDir, { recursive: true }); }
}

function getYouTubeThumbnail(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/;
    const match = url.match(regex);
    return match ? `https://i.ytimg.com/vi/${match[1]}/hqdefault.jpg` : null;
}

// --- [UPGRADE] Parser lebih pintar, kenal semua jenis respons ---
function parseResult(data) {
    if (!data || !data.result) return null;
    const res = data.result;
    const url = res.url || res.link || res.download || res.downloadURL || res.downloadUrl || res.download_url;
    const title = res.title || res.filename || 'Audio dari YouTube';
    return url ? { url, title } : null;
}

// --- [UPGRADE] Bobot di-tuning, scrape & flvto jadi andalan ---
function selectProviderWeighted() {
    const weightedPool = [
        's0', 's0', 's0',         // Scrape (cepat)
        's_flvto', 's_flvto',   // FLVTO (stabil)
        's1', 's2', 's4'       // Cadangan
    ];
    const selectedKey = weightedPool[Math.floor(Math.random() * weightedPool.length)];
    return API_PROVIDERS.find(p => p.key === selectedKey);
}

// --- BAGIAN UTAMA YANG DIROMBAK TOTAL ---
async function processAudioDownload(sock, msg, youtubeUrl) {
    const sender = msg.key.remoteJid;
    const pushName = msg.pushName || 'User';

    const progressMessage = await sock.sendMessage(sender, { text: `⏳ Oke, sedang memproses permintaan Anda...` }, { quoted: msg });
    const progressKey = progressMessage.key;

    const inputPath = path.join(tempDir, `${Date.now()}_input`);
    const outputPath = path.join(tempDir, `${Date.now()}_output.mp3`);

    try {
        const provider = selectProviderWeighted();
        await sock.sendMessage(sender, { text: `🎲 Server terpilih: *${provider.name}*.\nMenghubungi server...`, edit: progressKey });

        const apiUrl = `${provider.url}?url=${encodeURIComponent(youtubeUrl)}`;
        const result = await safeApiGet(apiUrl);
        const downloadInfo = parseResult(result);
        if (!downloadInfo || !downloadInfo.url) throw new Error(`Gagal mendapatkan link unduhan dari ${provider.name}.`);

        await sock.sendMessage(sender, { text: `📥 Mengunduh audio...\n*Judul:* ${downloadInfo.title}`, edit: progressKey });
        
        const writer = fs.createWriteStream(inputPath);
        const response = await axios({ url: downloadInfo.url, method: 'GET', responseType: 'stream', timeout: 180000 });
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', (err) => reject(new Error(`Gagal menyimpan file: ${err.message}`)));
        });

        const inputStats = await fsPromises.stat(inputPath);
        if (inputStats.size < 10240) throw new Error('File yang diunduh rusak atau ukurannya terlalu kecil.');

        await sock.sendMessage(sender, { text: `⚙️ Mengonversi audio ke format MP3...`, edit: progressKey });
        await new Promise((resolve, reject) => {
            fluent(inputPath)
                .audioCodec('libmp3lame').audioBitrate('128k').format('mp3')
                .on('error', (err) => reject(new Error(`FFmpeg gagal: ${err.message}`)))
                .on('end', resolve)
                .save(outputPath);
        });
        
        const audioBuffer = await fsPromises.readFile(outputPath);
        const outputStats = await fsPromises.stat(outputPath);

        // Langkah 2: Kirim file audio dulu (pesan bersih)
        await sock.sendMessage(sender, { 
            audio: audioBuffer, 
            mimetype: 'audio/mpeg'
        }, { quoted: msg });
        
        // Langkah 3: Siapkan dan kirim pesan informasi (mengedit pesan awal)
        const thumbnailUrl = getYouTubeThumbnail(youtubeUrl);
        const contextInfo = { 
            externalAdReply: {
                title: "YouTube MP3 Downloader",
                body: pushName,
                thumbnailUrl: thumbnailUrl,
                sourceUrl: youtubeUrl,
                mediaUrl: "http://wa.me/6283110928302",
                renderLargerThumbnail: true,
                showAdAttribution: false,
                mediaType: 2,
            },
        };
        
        const infoText = `✅ *Proses Selesai!*\n\n*Judul:* ${downloadInfo.title}\n*Ukuran File:* ${formatBytes(outputStats.size)}`;

        await sock.sendMessage(sender, {
            text: infoText,
            contextInfo: contextInfo,
            edit: progressKey 
        });

    } catch (error) {
        console.error(`[YTMP3] Proses gagal:`, error);
        await sock.sendMessage(sender, { text: `❌ Aduh, gagal di tahap proses:\n${error.message}`, edit: progressKey });
    } finally {
        for (const file of [inputPath, outputPath]) {
            try { await fsPromises.unlink(file); } catch {}
        }
    }
}

export default async function execute(sock, msg, args) {
    const userUrl = args[0];
    if (!userUrl) return sock.sendMessage(msg.key.remoteJid, { text: `Format salah. Silakan kirimkan link YouTube.\n\n*Contoh:* ${BOT_PREFIX}ytmp3 https://youtu.be/example` }, { quoted: msg });
    const ytRegex = /^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com|youtu\.be)\/.+$/;
    if (!ytRegex.test(userUrl)) return sock.sendMessage(msg.key.remoteJid, { text: "URL YouTube yang Anda berikan sepertinya tidak valid." }, { quoted: msg });
    
    await ensureTempDir();
    await processAudioDownload(sock, msg, userUrl);
}

export const category = 'downloaders';
export const description = 'Mengunduh audio dari link YouTube sebagai file MP3 secara otomatis.';
export const usage = `${BOT_PREFIX}ytmp3 <url_youtube>`;
export const aliases = ['ytvn'];
export const requiredTier = 'Basic';
export const energyCost = 10;