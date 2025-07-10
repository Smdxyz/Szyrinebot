// playspo.js - VERSI LEBIH TANGGUH DENGAN RETRY DOWNLOAD ✨ (FIXED)

import { BOT_PREFIX } from '../../config.js';
import axios from 'axios';
import he from 'he'; // Pastikan library 'he' sudah terinstal (npm install he)

// =================================================================
// BAGIAN 1: FUNGSI-FUNGSI HELPER
// =================================================================

async function searchSpotify(query) {
    try {
        const endpoint = `https://szyrineapi.biz.id/api/downloaders/spotify/search?q=${encodeURIComponent(query)}&limit=5`;
        const res = await axios.get(endpoint);
        
        if (res.data?.status === 200 && Array.isArray(res.data.result) && res.data.result.length > 0) {
            return res.data.result.map(item => ({
                 ...item,
                 title: he.decode(item.title || 'Judul Tidak Diketahui'),
                 artists: he.decode(item.artists || 'Artis Tidak Diketahui'),
                 album: {
                     ...item.album,
                     name: he.decode(item.album?.name || 'Album Tidak Diketahui')
                 }
            }));
        } else {
             console.warn(`[SPO-SEARCH] API returned status ${res.data?.status} or empty results for query "${query}".`);
             return null;
        }
    } catch (e) {
        console.error(`[SPO-SEARCH] Gagal nyari lagu Spotify "${query}":`, e.message);
    }
    return null;
}

async function downloadSpotifyToBuffer(spotifyUrl, maxRetries = 3, retryDelayMs = 3000) {
    let downloadUrl = null;
    let lastApiError = null;

    try {
        const apiEndpoint = `https://szyrineapi.biz.id/api/downloaders/spotify?url=${encodeURIComponent(spotifyUrl)}`;
        const apiRes = await axios.get(apiEndpoint, { timeout: 120000 });
        
        // ======================================================================
        // [FIX] BUG KRITIS: Path ke downloadUrl salah. Seharusnya di dalam `result.results`.
        // ======================================================================
        if (apiRes.data?.status === 200 && apiRes.data.result?.results?.downloadUrl) {
             downloadUrl = apiRes.data.result.results.downloadUrl;
        } else {
            const errorReason = apiRes.data?.result?.status === false 
                ? `Status result: ${apiRes.data.result.status}` 
                : 'Tidak ada downloadUrl di dalam objek `results` pada respons API';
             throw new Error(`API Spotify gagal memberikan link download: ${errorReason}`);
        }

    } catch (e) {
        lastApiError = e;
        console.error(`[SPO-DOWNLOAD] Gagal panggil API download:`, e.message);
         throw new Error(`Gagal menghubungi server download Spotify: ${e.message}`);
    }

    if (!downloadUrl) {
        throw new Error('Tidak dapat menemukan link download dari API Spotify.');
    }

    let audioBuffer = null;
    let lastDownloadError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`[SPO-DOWNLOAD] Mencoba unduh dari link (Percobaan ${attempt}/${maxRetries})`);
        try {
            const audioRes = await axios({
                method: 'GET',
                url: downloadUrl,
                responseType: 'arraybuffer',
                timeout: 180000
            });
            audioBuffer = Buffer.from(audioRes.data);

            if (audioBuffer.length < 1024) {
                 throw new Error(`File yang diunduh terlalu kecil (${audioBuffer.length} bytes).`);
            }

            console.log(`[SPO-DOWNLOAD] Berhasil mengunduh (Percobaan ${attempt}). Ukuran: ${audioBuffer.length} bytes.`);
            return audioBuffer;

        } catch (e) {
            lastDownloadError = e;
            console.warn(`[SPO-DOWNLOAD FAIL] Percobaan ${attempt} gagal: ${e.message}`);
            if (attempt < maxRetries) {
                console.log(`[SPO-DOWNLOAD] Menunggu ${retryDelayMs}ms sebelum coba lagi...`);
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
            }
        }
    }

    console.error(`[SPO-DOWNLOAD FAIL] Gagal mengunduh dari link setelah ${maxRetries} percobaan.`);
    throw new Error(`Gagal mengunduh file audio dari link download setelah beberapa percobaan. (Penyebab terakhir: ${lastDownloadError ? lastDownloadError.message : 'Unknown error'})`);
}

// =================================================================
// BAGIAN 2: EKSEKUSI PERINTAH UTAMA (Logika utama di sini)
// =================================================================

export default async (sock, msg, args, text, sender, extras) => {
    if (!text) {
        return sock.sendMessage(sender, {
            text: `Mau cari lagu apa dari Spotify? Tinggal ketik judulnya.\n\nContoh: *${BOT_PREFIX}playspo JKT48 Seventeen*`
        }, { quoted: msg });
    }

    let sentMsg;
    try {
        sentMsg = await sock.sendMessage(sender, { text: `Oke, gass! Nyari lagu *"${text}"* di Spotify... 🎵` }, { quoted: msg });

        const results = await searchSpotify(text);
        if (!results || results.length === 0) {
            return sock.sendMessage(sender, { text: `Yah, lagunya gak nemu di Spotify 😥. Coba judul lain.`, edit: sentMsg.key });
        }
        
        const songRows = results.map((song) => ({
            title: song.title,
            description: `Artis: ${song.artists} | Album: ${song.album.name} | Durasi: ${song.duration.formatted}`,
            rowId: `spotify_dl_${song.url}`
        }));

        const listMessage = {
            text: "Nih, dapet beberapa lagu dari Spotify. Pilih satu ya.",
            title: "🎶 Hasil Pencarian Spotify 🎶",
            buttonText: "PILIH LAGUNYA",
            sections: [{ title: "Pilih Lagu Dari Daftar:", rows: songRows }]
        };
        
        await sock.sendMessage(sender, listMessage);
        await sock.sendMessage(sender, { delete: sentMsg.key });

        const handleSpotifySelection = async (sock, msg, selectedId) => {
            const selectedUrl = selectedId.replace('spotify_dl_', '');
            const selectedSong = results.find(song => song.url === selectedUrl);

            if (!selectedSong) {
                console.error(`[SPO-SELECTION] Invalid selectedId: ${selectedId} or song not found in results.`);
                return sock.sendMessage(sender, { text: `Waduh, pilihan lagunya aneh atau data tidak ditemukan. Coba ulang pencarian deh.` }, { quoted: msg });
            }

            const waitingMsg = await sock.sendMessage(sender, {
                text: `Oke, siap! Lagi nyiapin...\n\n*Lagu:* ${selectedSong.title}\n*Artis:* ${selectedSong.artists}`
            }, { quoted: msg });
            const waitingKey = waitingMsg.key;

            try {
                const audioBuffer = await downloadSpotifyToBuffer(selectedSong.url);
                await sock.sendMessage(sender, { text: `✅ Download kelar! Siap dikirim...`, edit: waitingKey });

                const fullCaption = `
🎵 *Judul:* ${selectedSong.title}
🎤 *Artis:* ${selectedSong.artists}
💿 *Album:* ${selectedSong.album.name}
⏱️ *Durasi:* ${selectedSong.duration.formatted}
🗓️ *Rilis:* ${selectedSong.album.release_date || 'Tidak Diketahui'}

_Powered by Szyrine API_
                `.trim();

                 let thumbnailBuffer = undefined;
                 if (selectedSong.album?.image_url) {
                      try {
                          const thumbRes = await axios({ url: selectedSong.album.image_url, responseType: 'arraybuffer', timeout: 15000 });
                          thumbnailBuffer = Buffer.from(thumbRes.data);
                      } catch (thumbError) {
                          console.warn("[SPO-THUMBNAIL] Gagal mengunduh thumbnail:", thumbError.message);
                      }
                 }

                await sock.sendMessage(sender, {
                    image: thumbnailBuffer,
                    caption: fullCaption
                }, { quoted: msg });

                await sock.sendMessage(sender, {
                    audio: audioBuffer,
                    mimetype: 'audio/mpeg',
                    fileName: `${selectedSong.title.replace(/[^\w\s-]/gi, '')} - ${selectedSong.artists.replace(/[^\w\s-]/gi, '')}.mp3`,
                }, { quoted: msg });

                await sock.sendMessage(sender, { delete: waitingKey });

            } catch (err) {
                console.error('[ERROR SPOTIFY SELECTION]', err);
                 const errorMessage = `Waduh, gagal proses lagunya 😵‍💫\n*Penyebab:* ${err.message}`;
                 try {
                      await sock.sendMessage(sender, { text: errorMessage, edit: waitingKey });
                 } catch (editError) {
                      await sock.sendMessage(sender, { text: errorMessage }, { quoted: msg });
                 }
            }
        };
        
        if (extras && typeof extras.set === 'function') {
             await extras.set(sender, 'playspo', handleSpotifySelection);
        } else {
             console.error("Warning: 'extras' object or its 'set' method is not available. Song selection won't work.");
             await sock.sendMessage(sender, { text: "Warning: Bot mungkin tidak dapat memproses pilihan lagu saat ini. Hubungi admin." }, { quoted: msg });
        }

    } catch (err) {
        console.error('[ERROR SPOTIFY SEARCH]', err);
        const targetKey = sentMsg ? { edit: sentMsg.key } : { quoted: msg };
        const messageContent = sentMsg ? `❌ Gagal melakukan pencarian: ${err.message}` : `❌ Gagal melakukan pencarian: ${err.message}`;
        await sock.sendMessage(sender, { text: messageContent }, targetKey);
    }
};

// --- Metadata command ---
export const category = 'downloader';
export const description = 'Cari dan kirim lagu dari Spotify lengkap dengan gambar album.';
export const usage = `${BOT_PREFIX}playspo <judul lagu>`;
export const requiredTier = 'Silver';
export const energyCost = 20;