// /modules/downloaders/ytmp4.js (REVISI FINAL: Parsing, Fallback, dl-v1 Ditambahkan)

import { BOT_PREFIX } from '../../config.js';
import { safeApiGet } from '../../libs/apiHelper.js'; // Assume safeApiGet handles network errors and basic JSON parsing
import { formatBytes } from '../../core/handler.js'; // Assume this utility exists
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import fluent from 'fluent-ffmpeg';
import axios from 'axios';

// Pastikan ffmpeg terinstal di sistem tempat bot berjalan
// Contoh instalasi di Ubuntu/Debian: sudo apt-get install ffmpeg

const tempDir = path.join(process.env.HOME || '.', 'szyrine_bot_temp');

// Ensure temp directory exists synchronously on module load
if (!fs.existsSync(tempDir)) {
    try {
        fs.mkdirSync(tempDir, { recursive: true });
        console.log(`Temporary directory created at ${tempDir}`);
    } catch (e) {
        console.error(`Failed to create temporary directory ${tempDir}:`, e);
        // Bot might not function correctly without temp dir, but don't crash immediately
    }
}


// --- [UPGRADE] Provider lengkap, termasuk FLVTO dan dl-v1 ---
// Diurutkan berdasarkan preferensi/keandalan yang diasumsikan
const API_PROVIDERS = [
    { name: 'Server Stabil (FLVTO)', key: 'p_flvto', endpoint: 'https://szyrineapi.biz.id/api/downloaders/yt/dl/flvto' },
    { name: 'Server Cadangan 1 (dl-v3)', key: 'p1', endpoint: 'https://szyrineapi.biz.id/api/downloaders/yt/dl-v3' },
    { name: 'Server Cadangan 5 (dl-v1)', key: 'p5', endpoint: 'https://szyrineapi.biz.id/api/downloaders/yt/dl-v1' }, // Ditambahkan dari docs
    { name: 'Server Cadangan 2 (dl-v2)', key: 'p2', endpoint: 'https://szyrineapi.biz.id/api/downloaders/yt/dl-v2' },
    { name: 'Server Cadangan 3 (notube)', key: 'p3', endpoint: 'https://szyrineapi.biz.id/api/downloaders/yt/dl/notube' },
];

// Helper to extract video ID
function getYouTubeVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// Helper to get best video download link from array of options (used by dl-v2, dl-v1)
function selectBestVideoLink(options, preferredQuality = ['720p', '480p', '360p']) {
     if (!options || !Array.isArray(options)) return null;

     // Filter for video options and prioritize MP4 if possible
     const videoOptions = options.filter(opt =>
          (opt.type === 'video' || opt.fileType?.includes('video')) &&
          opt.downloadLink // Ensure a download link exists
     );

     if (videoOptions.length === 0) return null;

     // Sort by preferred quality and then potentially file type (e.g., mp4 over webm)
     videoOptions.sort((a, b) => {
          // Simple quality ranking based on index in preferredQuality array
          const qualityA = preferredQuality.findIndex(q => a.quality?.includes(q) || a.fileType?.includes(q));
          const qualityB = preferredQuality.findIndex(q => b.quality?.includes(q) || b.fileType?.includes(q));

          // Prioritize higher preferred quality (lower index is higher priority)
          if (qualityA !== -1 && qualityB !== -1) return qualityA - qualityB;
          if (qualityA !== -1) return -1; // a is preferred
          if (qualityB !== -1) return 1;  // b is preferred

          // Fallback: if no preferred quality match, just take the first available video option
          return 0;
     });

     // Return the link of the highest ranked option
     return videoOptions[0].downloadLink;
}


// --- [UPGRADE] Parser lebih pintar, kenal semua jenis respons (termasuk dl-v1) ---
function parseDownloadResult(providerKey, data) {
    // console.log(`[DEBUG PARSE] Provider: ${providerKey}, Data:`, JSON.stringify(data, null, 2));

    if (!data || data.status !== 200) {
        console.error(`[PARSE ERROR] Invalid data or status: ${data?.status}`);
        return null;
    }

    const result = data.result || {};
    let title = null;
    let downloadUrl = null;

    switch (providerKey) {
        case 'p_flvto': // flvto structure: { status, author, result: { title, url, ... } }
            title = result.title;
            downloadUrl = result.url;
            break;
        case 'p1': // dl-v3 structure: { status, author, result: { status, code, result: { title, download, ... } } }
            title = result.result?.title;
            downloadUrl = result.result?.download;
            break;
        case 'p2': // dl-v2 structure: { status, author, result: { success, title, video: [...], audio: [...], ... } }
            title = result.title;
            // dl-v2 provides separate video and audio streams.
            // This parser will try to find *a* suitable video link.
            // FFmpeg will be needed to merge video and audio if the link is video-only.
             // Look for a video link that is not video-only if possible, or a suitable quality.
             const videoOption = result.video?.find(v => v.fileType?.includes('360p') && !v.fileType?.includes('Video Only')) // Try finding a 360p with audio first
                                || result.video?.find(v => !v.fileType?.includes('Video Only')) // Then any video option with audio
                                || result.video?.find(v => v.fileType?.includes('720p') && v.fileType?.includes('Video Only')) // Then 720p video-only
                                || result.video?.find(v => v.fileType?.includes('480p') && v.fileType?.includes('Video Only')) // Then 480p video-only
                                || result.video?.find(v => v.fileType?.includes('360p') && v.fileType?.includes('Video Only')) // Then 360p video-only
                                || result.video?.[0]; // Fallback to the first video option
            downloadUrl = videoOption?.downloadLink;
            break;
        case 'p3': // notube structure: { status, author, result: { title, download_url, ... } }
            title = result.title;
            downloadUrl = result.download_url;
            break;
         case 'p5': // dl-v1 structure: { status, author, result: { status, result: { videoInfo: { title, ... }, downloadOptions: [...] } } }
             title = result.result?.videoInfo?.title;
             // dl-v1 also provides an array of options
             downloadUrl = selectBestVideoLink(result.result?.downloadOptions);
             break;
        default:
             console.warn(`[PARSE WARNING] Unknown provider key: ${providerKey}`);
            return null;
    }

    // Use a default title if none was found
     if (!title) title = 'Video dari YouTube';

    // console.log(`[PARSE RESULT] Title: ${title}, Download URL: ${downloadUrl}`);

    // Only return info if both title (even default) and a download URL were found
    return title && downloadUrl ? { title, downloadUrl } : null;
}


async function processVideoDownload(sock, msg, youtubeUrl) {
    const sender = msg.key.remoteJid;
    const pushName = msg.pushName || 'User';

    const progressMessage = await sock.sendMessage(sender, { text: `Oke, bentar ya... lagi disiapin videonya 😉` }, { quoted: msg });
    const progressKey = progressMessage.key;

    // Paths for temporary files
    const rawDownloadPath = path.join(tempDir, `${Date.now()}_raw_video`); // No extension yet
    const processedPath = path.join(tempDir, `${Date.now()}_processed_video.mp4`); // Final MP4 path

    let downloadInfo = null;
    let lastError = new Error("Unknown error before download attempts.");
    const triedProviders = new Set();

    try {
        // --- API Call Loop with Fallback ---
        for (const provider of API_PROVIDERS) {
             // Skip if this provider was already tried (e.g., in a weighted selection phase, though not implemented here)
             // Or if the provider requires videoId and we failed to get it
             if (triedProviders.has(provider.key)) continue;

            await sock.sendMessage(sender, { text: `🎲 Mencoba server *${provider.name}*...`, edit: progressKey });
            triedProviders.add(provider.key);

            let apiUrl;
            const videoId = getYouTubeVideoId(youtubeUrl);

            // Construct API URL based on provider needs
            if (provider.key === 'p3') { // Notube needs ID
                 if (!videoId) {
                     console.warn(`[DOWNLOAD] Skipping ${provider.name}: Failed to get video ID.`);
                     lastError = new Error(`Gagal ngambil ID videonya untuk server ${provider.name}.`);
                     continue; // Try next provider
                 }
                 apiUrl = `${provider.endpoint}?id=${videoId}&format=mp4`;
            } else if (provider.key === 'p5') { // dl-v1 needs URL
                 apiUrl = `${provider.endpoint}?url=${encodeURIComponent(youtubeUrl)}`;
            }
            else if (provider.key === 'p1') { // dl-v3 needs URL and format
                 apiUrl = `${provider.endpoint}?url=${encodeURIComponent(youtubeUrl)}&format=360`; // Requesting 360p explicitly
            }
             else if (provider.key === 'p2') { // dl-v2 needs URL
                 apiUrl = `${provider.endpoint}?url=${encodeURIComponent(youtubeUrl)}`;
             }
             else if (provider.key === 'p_flvto') { // flvto needs URL and type
                 apiUrl = `${provider.endpoint}?url=${encodeURIComponent(youtubeUrl)}&type=mp4`;
             }
            else {
                 console.warn(`[DOWNLOAD] Skipping unknown provider key: ${provider.key}`);
                 lastError = new Error(`Provider dengan key ${provider.key} tidak dikenali.`);
                 continue; // Try next provider
            }

            try {
                // console.log(`[DEBUG API CALL] Calling: ${apiUrl}`);
                const apiResult = await safeApiGet(apiUrl);
                downloadInfo = parseDownloadResult(provider.key, apiResult);

                if (downloadInfo && downloadInfo.downloadUrl) {
                    await sock.sendMessage(sender, { text: `✅ Berhasil dapat link dari *${provider.name}*. Mengunduh...`, edit: progressKey });
                    break; // Success! Exit the provider loop
                } else {
                    lastError = new Error(`Server ${provider.name} tidak memberikan link download valid.`);
                    console.warn(`[DOWNLOAD FAIL] ${provider.name} - No valid download link found in response.`);
                     await sock.sendMessage(sender, { text: `❌ ${provider.name} gagal dapat link. Coba server lain...`, edit: progressKey });
                }
            } catch (apiError) {
                lastError = new Error(`Error saat panggil ${provider.name}: ${apiError.message}`);
                console.error(`[DOWNLOAD FAIL] Error calling ${provider.name}:`, apiError);
                await sock.sendMessage(sender, { text: `❌ Error dari ${provider.name}. Coba server lain...`, edit: progressKey });
            }
        } // End of provider loop

        if (!downloadInfo || !downloadInfo.downloadUrl) {
            throw new Error(`Gagal mendapatkan link video setelah mencoba semua server.\nTerakhir error: ${lastError.message}`);
        }

        // --- Stream Download to Raw File ---
        await sock.sendMessage(sender, { text: `📥 Menyedot video...\n*Judul:* ${downloadInfo.title || 'Memuat judul...'}`, edit: progressKey });

        const response = await axios({
             url: downloadInfo.downloadUrl,
             method: 'GET',
             responseType: 'stream',
             timeout: 300000 // 5 minutes for download stream
        });

        // Get content type to potentially adjust rawDownloadPath extension
        const contentType = response.headers['content-type'];
        let currentRawPath = rawDownloadPath;
        if (contentType && contentType.includes('video/mp4')) {
             currentRawPath += '.mp4'; // Add .mp4 extension if it's clearly MP4
        } else if (contentType && contentType.includes('video/webm')) {
             currentRawPath += '.webm'; // Add .webm extension
        } else {
             currentRawPath += '.raw'; // Fallback extension
        }

        const writer = fs.createWriteStream(currentRawPath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', err => {
                 console.error(`[DOWNLOAD STREAM FAIL] Error writing file ${currentRawPath}:`, err);
                 reject(new Error(`Gagal menyimpan file video: ${err.message}`));
            });
            response.data.on('error', err => {
                  console.error(`[DOWNLOAD STREAM FAIL] Error on response stream from ${downloadInfo.downloadUrl}:`, err);
                  writer.destroy(); // Clean up partial file
                  reject(new Error(`Download stream error: ${err.message}`));
            });
        });

        const rawStats = await fsPromises.stat(currentRawPath);
        if (rawStats.size < 51200) { // Check for tiny/corrupt files (e.g., less than 50KB)
             await fsPromises.unlink(currentRawPath).catch(e => console.error("Failed to delete tiny raw file:", e));
             throw new Error("File yang diunduh terlalu kecil atau rusak.");
        }

        // --- FFmpeg Processing ---
        await sock.sendMessage(sender, { text: `⚙️ Dikit lagi, videonya lagi di-format biar pas buat WA...`, edit: progressKey });

        await new Promise((resolve, reject) => {
            fluent(currentRawPath) // Use the actual path with determined extension
                .videoCodec('libx264').audioCodec('aac')
                .outputOptions([
                     '-pix_fmt yuv420p', // Pixel format for broad compatibility
                     '-profile:v baseline', // H.264 Baseline profile for mobile
                     '-level 3.0', // H.264 Level 3.0
                     '-crf 23', // Constant Rate Factor (quality setting, lower is better quality but larger file)
                     '-preset medium', // Encoding speed vs compression efficiency
                     '-movflags +faststart' // Allows playback while downloading
                 ])
                .on('start', (commandLine) => {
                    console.log('FFmpeg command:', commandLine);
                })
                .on('progress', (progress) => {
                    // Optional: Update progress message based on conversion progress
                    // console.log('FFmpeg progress:', progress.percent);
                })
                .on('error', (err) => {
                    console.error('FFmpeg Error during conversion:', err.message);
                     // Clean up partial output file
                    fsPromises.unlink(processedPath).catch(e => console.error("Failed to delete partial processed file:", e));
                    reject(new Error(`FFmpeg-nya error pas ngubah video: ${err.message}`));
                })
                .on('end', () => {
                    console.log('FFmpeg conversion finished.');
                    resolve();
                })
                .save(processedPath); // Save to the final processed path
        });

        // Check processed file size
        const processedStats = await fsPromises.stat(processedPath);
        if (processedStats.size === 0) {
             throw new Error('Hasil konversi video kosong.');
        }
        // Optional: Add a check for max file size compatible with WhatsApp if needed
        // const maxFileSize = 16 * 1024 * 1024; // 16MB example limit
        // if (processedStats.size > maxFileSize) {
        //      await sock.sendMessage(sender, { text: `✅ Done, tapi file videonya (${formatBytes(processedStats.size)}) mungkin terlalu besar buat WhatsApp. Kamu bisa download langsung lewat link ini: ${downloadInfo.downloadUrl}`, edit: progressKey });
        //       // Maybe send a smaller quality version if available and within size limits? Or just send the link.
        //      return; // Exit after sending link/message
        // }


        // --- Send Video Message ---
        const videoBuffer = await fsPromises.readFile(processedPath); // Read the processed file into a buffer

        await sock.sendMessage(sender, {
            video: videoBuffer,
            mimetype: 'video/mp4',
            caption: `🎬 *Judul:* ${downloadInfo.title}\n📦 *Ukuran:* ${formatBytes(processedStats.size)}`,
            // Optional: add thumbnail
            // thumbnail: getYouTubeThumbnail(youtubeUrl) ? await axios({ url: getYouTubeThumbnail(youtubeUrl), responseType: 'arraybuffer' }).then(res => res.data).catch(e => { console.error("Failed to get thumbnail buffer:", e); return undefined; }) : undefined,
        }, { quoted: msg });

        // Delete the progress message after sending the video
        await sock.sendMessage(sender, { delete: progressKey });

    } catch (error) {
        console.error(`[YTMP4] Gagal proses unduh:`, error);
         // Attempt to edit the message with error
         const errorMessage = `Waduh, ada masalah nih 😭\n*Error:* ${error.message}`;
         try {
              await sock.sendMessage(sender, { text: errorMessage, edit: progressKey });
         } catch (editError) {
              // If editing fails (e.g., message deleted), send a new error message
              await sock.sendMessage(sender, { text: errorMessage }, { quoted: msg });
         }
    } finally {
        // --- Cleanup Temporary Files ---
        // Use the actual raw file path if it was determined
        const filesToClean = [processedPath];
        if (typeof currentRawPath !== 'undefined') { // Check if currentRawPath variable was set
             filesToClean.push(currentRawPath);
        }

        for (const file of filesToClean) {
            if (fs.existsSync(file)) { // Check if file exists before attempting delete
                try {
                     await fsPromises.unlink(file);
                     console.log(`Cleaned up temporary file: ${file}`);
                } catch (e) {
                    console.error(`Error cleaning up file ${file}:`, e);
                }
            }
        }
    }
}

export default async function execute(sock, msg, args) {
    const userUrl = args[0];
    if (!userUrl) {
        return sock.sendMessage(msg.key.remoteJid, { text: `Eh, link YouTube-nya mana? 🤔\nContoh: *${BOT_PREFIX}ytmp4 https://youtu.be/linknya*` }, { quoted: msg });
    }
    // More specific regex for YouTube video URLs
    const ytRegex = /^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com|youtu\.be)\/(watch\?v=|embed\/|v\/|)([a-zA-Z0-9_-]{11})(\S+)?$/;
    if (!ytRegex.test(userUrl)) {
        return sock.sendMessage(msg.key.remoteJid, { text: "Link YouTube-nya kayaknya salah deh, coba cek lagi." }, { quoted: msg });
    }

    // ensureTempDir is now called synchronously on module load, but calling it here again is harmless.
    // await ensureTempDir(); // Not strictly necessary here anymore

    await processVideoDownload(sock, msg, userUrl);
}

export const category = 'downloaders'; // Sesuaikan dengan kategori bot Anda
export const description = 'Download video dari YouTube secara otomatis.';
export const usage = `${BOT_PREFIX}ytmp4 <url_youtube>`;
export const aliases = ['ytvideo']; // Alias yang relevan
export const requiredTier = 'Basic'; // Sesuaikan jika menggunakan sistem tier
export const energyCost = 15; // Sesuaikan dengan biaya energi