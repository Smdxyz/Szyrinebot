// /modules/downloaders/playspo.js (REVISI FINAL: PARSING EKSPLISIT & TANGGUH)

import { BOT_PREFIX } from '../../config.js';
import axios from 'axios';
import he from 'he';

// Helper untuk search, sudah bagus dan pakai axios. Tidak perlu diubah.
async function searchSpotify(query) {
    try {
        const endpoint = `https://szyrineapi.biz.id/api/downloaders/spotify/search?q=${encodeURIComponent(query)}&limit=5`;
        const res = await axios.get(endpoint);
        
        if (res.data?.status === 200 && Array.isArray(res.data.result) && res.data.result.length > 0) {
            return res.data.result.map(item => ({
                 ...item,
                 title: he.decode(item.title || 'Judul Tidak Diketahui'),
                 artists: he.decode(item.artists || 'Artis Tidak Diketahui'),
                 album: { ...item.album, name: he.decode(item.album?.name || 'Album Tidak Diketahui') }
            }));
        } else {
             console.warn(`[SPO-SEARCH] API return status ${res.data?.status} atau hasil kosong untuk "${query}".`);
             return null;
        }
    } catch (e) {
        console.error(`[SPO-SEARCH] Gagal nyari lagu Spotify "${query}":`, e.message);
    }
    return null;
}

// Helper untuk download, sekarang dengan parsing eksplisit dan tanpa safeApiGet.
async function downloadSpotifyToBuffer(spotifyUrl, maxRetries = 3, retryDelayMs = 3000) {
    let downloadUrl = null;

    try {
        const apiEndpoint = `https://szyrineapi.biz.id/api/downloaders/spotify?url=${encodeURIComponent(spotifyUrl)}`;
        const apiRes = await axios.get(apiEndpoint, { timeout: 120000 });
        const rawData = apiRes.data;
        
        // [FIX] Parsing langsung ke target berdasarkan dokumentasi Spotify.txt
        if (rawData?.status === 200 && rawData.result?.results?.downloadUrl) {
             downloadUrl = rawData.result.results.downloadUrl;
        } else {
            const errorReason = rawData.result?.status === false 
                ? `Status result: ${rawData.result.status}` 
                : 'Struktur respons API tidak sesuai, `downloadUrl` tidak ditemukan di `result.results`';
             throw new Error(`API Spotify gagal memberikan link download: ${errorReason}`);
        }

    } catch (e) {
        console.error(`[SPO-DOWNLOAD] Gagal panggil API download:`, e.message);
         throw new Error(`Gagal menghubungi server download Spotify: ${e.message}`);
    }

    if (!downloadUrl) {
        throw new Error('Tidak dapat menemukan link download dari API Spotify.');
    }

    // Logika retry download sudah sangat tangguh, tidak perlu diubah.
    let lastDownloadError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`[SPO-DOWNLOAD] Mencoba unduh dari link (Percobaan ${attempt}/${maxRetries})`);
        try {
            const audioRes = await axios({
                method: 'GET', url: downloadUrl, responseType: 'arraybuffer', timeout: 180000
            });
            const audioBuffer = Buffer.from(audioRes.data);

            if (audioBuffer.length < 10240) { // Cek file korup
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
    
    throw new Error(`Gagal mengunduh file audio setelah ${maxRetries} percobaan. (Penyebab: ${lastDownloadError ? lastDownloadError.message : 'Unknown error'})`);
}


// EKSEKUSI PERINTAH UTAMA (Tidak ada perubahan signifikan di sini, sudah bagus)
export default async (sock, msg, args, text, sender, extras) => {
    if (!text) {
        return sock.sendMessage(sender, { text: `Mau cari lagu apa dari Spotify?\n\nContoh: *${BOT_PREFIX}playspo JKT48 Seventeen*` }, { quoted: msg });
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
            description: `Artis: ${song.artists} | Album: ${song.album.name}`,
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
                return sock.sendMessage(sender, { text: `Waduh, pilihan lagunya aneh. Coba ulang.` }, { quoted: msg });
            }

            const waitingMsg = await sock.sendMessage(sender, { text: `Oke, siap! Lagi nyiapin...\n\n*Lagu:* ${selectedSong.title}\n*Artis:* ${selectedSong.artists}`}, { quoted: msg });
            const waitingKey = waitingMsg.key;

            try {
                const audioBuffer = await downloadSpotifyToBuffer(selectedSong.url);
                await sock.sendMessage(sender, { text: `✅ Download kelar! Siap dikirim...`, edit: waitingKey });

                const fullCaption = `
🎵 *Judul:* ${selectedSong.title}
🎤 *Artis:* ${selectedSong.artists}
💿 *Album:* ${selectedSong.album.name}
⏱️ *Durasi:* ${selectedSong.duration.formatted}
🗓️ *Rilis:* ${selectedSong.album.release_date || 'N/A'}

_Powered by Szyrine API_`.trim();

                 let thumbnailBuffer;
                 if (selectedSong.album?.image_url) {
                      try {
                          const thumbRes = await axios({ url: selectedSong.album.image_url, responseType: 'arraybuffer' });
                          thumbnailBuffer = Buffer.from(thumbRes.data);
                      } catch (thumbError) {
                          console.warn("[SPO-THUMBNAIL] Gagal unduh thumbnail:", thumbError.message);
                      }
                 }

                await sock.sendMessage(sender, { image: thumbnailBuffer, caption: fullCaption }, { quoted: msg });
                await sock.sendMessage(sender, { audio: audioBuffer, mimetype: 'audio/mpeg', fileName: `${selectedSong.title}.mp3` }, { quoted: msg });
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
             console.error("Warning: 'extras.set' tidak tersedia. Pilihan lagu tidak akan berfungsi.");
        }

    } catch (err) {
        console.error('[ERROR SPOTIFY SEARCH]', err);
        const targetKey = sentMsg ? { edit: sentMsg.key } : { quoted: msg };
        await sock.sendMessage(sender, { text: `❌ Gagal melakukan pencarian: ${err.message}` }, targetKey);
    }
};

export const category = 'downloader';
export const description = 'Cari dan kirim lagu dari Spotify lengkap dengan gambar album.';
export const usage = `${BOT_PREFIX}playspo <judul lagu>`;
export const requiredTier = 'Silver';
export const energyCost = 20;