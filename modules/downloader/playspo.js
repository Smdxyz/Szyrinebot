// playspo.js - VERSI SULTAN DENGAN GAMBAR & INFO LENGKAP 👑✨

import { BOT_PREFIX } from '../../config.js';
import axios from 'axios';

// =================================================================
// BAGIAN 1: FUNGSI-FUNGSI HELPER (Tidak ada perubahan di sini)
// =================================================================

async function searchSpotify(query) {
    try {
        const endpoint = `https://szyrineapi.biz.id/api/downloaders/spotify/search?q=${encodeURIComponent(query)}&limit=5`;
        const res = await axios.get(endpoint);
        if (res.data?.status === 200 && res.data.result?.length > 0) {
            return res.data.result;
        }
    } catch (e) {
        console.error("[SPO-SEARCH] Gagal nyari lagu Spotify:", e.message);
    }
    return null;
}

async function downloadSpotifyToBuffer(spotifyUrl) {
    try {
        const apiEndpoint = `https://szyrineapi.biz.id/api/downloaders/spotify?url=${encodeURIComponent(spotifyUrl)}`;
        const apiRes = await axios.get(apiEndpoint, { timeout: 120000 });
        const downloadUrl = apiRes.data?.result?.downloadUrl;
        if (!downloadUrl) {
            throw new Error('API-nya gak ngasih link download, coba lagi nanti.');
        }
        const audioRes = await axios({
            method: 'GET',
            url: downloadUrl,
            responseType: 'arraybuffer'
        });
        return Buffer.from(audioRes.data);
    } catch (e) {
        console.warn(`[SPO-BUFFER-FAIL] Gagal download. Alasan: ${e.message}`);
        throw new Error('Server download Spotify lagi gak mood, coba bentar lagi ya.');
    }
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
        
        // --- [UPGRADE] Deskripsi di list jadi lebih informatif ---
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

        // --- [UPGRADE TOTAL] Handler-nya sekarang lebih canggih ---
        const handleSpotifySelection = async (sock, msg, selectedId) => {
            const selectedUrl = selectedId.replace('spotify_dl_', '');
            const selectedSong = results.find(song => song.url === selectedUrl);

            if (!selectedSong) {
                return sock.sendMessage(sender, { text: `Waduh, pilihan lagunya aneh. Coba ulang lagi deh.` }, { quoted: msg });
            }
            
            // --- Pesan tunggu yang lebih keren ---
            const waitingMsg = await sock.sendMessage(sender, { 
                text: `Oke, siap! Lagi nyiapin...\n\n*Lagu:* ${selectedSong.title}\n*Artis:* ${selectedSong.artists}` 
            }, { quoted: msg });
            
            try {
                const audioBuffer = await downloadSpotifyToBuffer(selectedSong.url);

                if (audioBuffer.length < 1024) {
                     throw new Error('File yang kedownload kayaknya rusak atau kosong.');
                }
                
                await sock.sendMessage(sender, { text: `✅ Download kelar! Siap dikirim...`, edit: waitingMsg.key });

                // --- [UPGRADE] Bikin caption yang super lengkap ---
                const fullCaption = `
🎵 *Judul:* ${selectedSong.title}
🎤 *Artis:* ${selectedSong.artists}
💿 *Album:* ${selectedSong.album.name}
⏱️ *Durasi:* ${selectedSong.duration.formatted}
🗓️ *Rilis:* ${selectedSong.album.release_date}

_Powered by Szyrine API_
                `.trim();

                // --- [UPGRADE] Kirim gambar albumnya dengan caption lengkap ---
                await sock.sendMessage(sender, {
                    image: { url: selectedSong.album.image_url },
                    caption: fullCaption
                }, { quoted: msg });

                // --- Kirim file audionya secara terpisah ---
                await sock.sendMessage(sender, {
                    audio: audioBuffer,
                    mimetype: 'audio/mpeg',
                    // ptt: true // Uncomment kalo mau jadi Voice Note
                }, { quoted: msg });

                await sock.sendMessage(sender, { delete: waitingMsg.key });

            } catch (err) {
                console.error('[ERROR SPOTIFY SELECTION]', err);
                await sock.sendMessage(sender, {
                    text: `Waduh, gagal proses lagunya 😵‍💫\n*Penyebab:* ${err.message}`,
                    edit: waitingMsg.key
                });
            }
        };

        await extras.set(sender, 'playspo', handleSpotifySelection);

    } catch (err) {
        console.error('[ERROR SPOTIFY SEARCH]', err);
        const targetKey = sentMsg ? { edit: sentMsg.key } : { quoted: msg };
        const message = sentMsg ? `❌ Gagal: ${err.message}` : { text: `❌ Gagal: ${err.message}` };
        await sock.sendMessage(sender, message, targetKey);
    }
};

// --- Metadata command ---
export const category = 'downloader';
export const description = 'Cari dan kirim lagu dari Spotify lengkap dengan gambar album.';
export const usage = `${BOT_PREFIX}playspo <judul lagu>`;
export const requiredTier = 'Silver'; // Naikin gengsinya hehe
export const energyCost = 20;