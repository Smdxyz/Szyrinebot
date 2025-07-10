// modules/tools/ttstalk.js

import axios from 'axios';
import { BOT_PREFIX } from '../../config.js';

export const category = 'tools';
export const description = 'Melihat informasi detail dari profil pengguna TikTok.';
export const usage = `${BOT_PREFIX}ttstalk [username]`;
export const aliases = ['tiktokstalk'];
export const requiredTier = 'Silver'; // Tier yang dibutuhkan
export const energyCost = 10;        // Biaya energi per penggunaan

const API_URL = 'https://szyrineapi.biz.id/api/tools/stalk/tiktok';

/**
 * Fungsi utama yang akan dieksekusi.
 * @param {object} sock - Instance koneksi Baileys.
 * @param {object} msg - Objek pesan yang diterima.
 * @param {string[]} args - Argumen command.
 * @param {string} text - Teks setelah command (username).
 * @param {string} sender - JID pengirim.
 * @param {object} extras - Objek utilitas, termasuk getImageBufferFromUrl.
 */
export default async function execute(sock, msg, args, text, sender, extras) {
    const username = text.trim();
    
    // 1. Validasi input
    if (!username) {
        return await sock.sendMessage(sender, { text: `  Masukkan username TikTok yang ingin dicari.\n\nContoh:\n*${usage}*` }, { quoted: msg });
    }
    
    let processingMsg;
    try {
        // 2. Kirim pesan pemrosesan
        processingMsg = await sock.sendMessage(sender, { text: `🔎 Mencari profil TikTok untuk *${username}*...` }, { quoted: msg });
        
        // 3. Panggil API
        const apiUrl = `${API_URL}?username=${encodeURIComponent(username)}`;
        const response = await axios.get(apiUrl);
        const data = response.data;
        
        // 4. Validasi dan proses respons API
        if (response.status === 200 && data.status === 200 && data.result) {
            const profile = data.result;

            // 5. Format pesan balasan
            const caption = `
*Profil TikTok Ditemukan!* ✨

👤 *Nickname:* ${profile.nickname}
🔖 *Username:* @${profile.uniqueId}
✍️ *Bio:* ${profile.signature || '_Tidak ada bio_'}

*📊 Statistik:*
- *Pengikut:* ${profile.followerCount.toLocaleString('id-ID')}
- *Mengikuti:* ${profile.followingCount.toLocaleString('id-ID')}
- *Total Suka:* ${profile.heartCount.toLocaleString('id-ID')} ❤️
- *Jumlah Video:* ${profile.videoCount.toLocaleString('id-ID')} 📹

✅ *Terverifikasi:* ${profile.verified ? 'Ya' : 'Tidak'}
🔒 *Akun Privat:* ${profile.privateAccount ? 'Ya' : 'Tidak'}
🌍 *Region:* ${profile.region || 'Tidak diketahui'}
`.trim();

            // 6. Ambil buffer gambar dari URL avatar
            const avatarUrl = profile.avatarMedium || profile.avatarThumb;
            const imageBuffer = await extras.getImageBufferFromUrl(avatarUrl);

            // 7. Kirim gambar dengan caption
            if (imageBuffer) {
                await sock.sendMessage(sender, {
                    image: imageBuffer,
                    caption: caption,
                    mimetype: 'image/jpeg'
                }, { quoted: msg });
            } else {
                // Fallback jika gambar gagal diunduh, kirim teks saja
                await sock.sendMessage(sender, { text: caption }, { quoted: msg });
            }

        } else {
            throw new Error(data.message || `Tidak dapat menemukan pengguna dengan username '${username}'.`);
        }

    } catch (error) {
        // 8. Tangani error
        console.error('[TTSTALK] Gagal menjalankan command:', error);
        await sock.sendMessage(sender, { text: `❌ Gagal: ${error.message}` }, { quoted: msg });

    } finally {
        // Hapus pesan pemrosesan setelah selesai
        if (processingMsg) {
            await sock.sendMessage(sender, { delete: processingMsg.key });
        }
    }
}