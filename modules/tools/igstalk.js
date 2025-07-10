// /modules/tools/igstalk.js (Instagram Stalker with Improved Fallback & Wait State)

import axios from 'axios';
import { BOT_PREFIX } from '../../config.js';
import { safeApiGet } from '../../libs/apiHelper.js';

export const category = 'tools';
export const description = 'Melihat informasi detail dari profil pengguna Instagram.';
export const usage = `${BOT_PREFIX}igstalk <username>`;
export const aliases = ['igstalk'];
export const requiredTier = 'Silver'; // Tier yang dibutuhkan
export const energyCost = 10;        // Biaya energi per penggunaan

const API_V2_URL = 'https://szyrineapi.biz.id/api/tools/stalk/instagram-v2'; // Prioritas
const API_V1_URL = 'https://szyrineapi.biz.id/api/tools/stalk/instagram';   // Cadangan

function parseProfileData(result, source) {
    if (!result) return null;
    let profile;
    if (source === 'V2') {
        profile = {
            username: result.username, fullName: result.full_name, bio: result.biography || '_Tidak ada bio_',
            followers: result.follower_count, following: result.following_count, posts: result.media_count,
            isVerified: result.is_verified, isPrivate: result.is_private,
            avatarUrl: result.profile_pic_url_hd || result.profile_pic_url, source: result.source
        };
    } else if (source === 'V1') {
        const parseStat = (s) => { if (typeof s !== 'string') return 0; const n=parseFloat(s); if(s.toLowerCase().includes('k')) return n*1000; if(s.toLowerCase().includes('m')) return n*1000000; return n; };
        profile = {
            username: result.username, fullName: result.full_name, bio: result.bio || '_Tidak ada bio_',
            followers: parseStat(result.statistics?.followers), following: parseStat(result.statistics?.following), posts: parseStat(result.statistics?.posts),
            isVerified: result.is_verified, isPrivate: null, avatarUrl: result.profile_picture, source: result.source
        };
    } else { return null; }
    if (!profile.username || !profile.avatarUrl) return null;
    return profile;
}

/**
 * Fungsi utama yang mengambil data, memformat, dan mengirimkan pesan.
 */
async function stalkInstagramUser(sock, msg, username, extras) {
    const sender = msg.key.remoteJid;
    let processingMsg;
    try {
        processingMsg = await sock.sendMessage(sender, { text: `🔎 Mencari profil Instagram untuk *${username}*...` }, { quoted: msg });
        
        let profileData = null;
        let finalError = null;

        try {
            console.log(`[IGSTALK] Mencoba API V2 untuk ${username}...`);
            const resultV2 = await safeApiGet(`${API_V2_URL}?username=${encodeURIComponent(username)}`);
            profileData = parseProfileData(resultV2, 'V2');
            if (!profileData) throw new Error("Data dari API V2 tidak valid atau kosong.");
        } catch (errorV2) {
            console.warn(`[IGSTALK] API V2 gagal: ${errorV2.message}`);
            finalError = errorV2;
            
            await sock.sendMessage(sender, { text: `Server utama sibuk, mencoba server cadangan...`, edit: processingMsg.key });
            
            try {
                console.log(`[IGSTALK] Mencoba API V1 (fallback) untuk ${username}...`);
                const resultV1 = await safeApiGet(`${API_V1_URL}?username=${encodeURIComponent(username)}`);
                profileData = parseProfileData(resultV1, 'V1');
                if (!profileData) throw new Error("Data dari API V1 juga tidak valid.");
            } catch (errorV1) {
                console.warn(`[IGSTALK] API V1 (fallback) juga gagal: ${errorV1.message}`);
                finalError = new Error(`Tidak dapat menemukan pengguna '${username}' setelah mencoba semua sumber.`);
                profileData = null;
            }
        }
        
        if (profileData) {
            const caption = `
*Profil Instagram Ditemukan!* ✨

🔖 *Username:* @${profileData.username}
👤 *Nama Lengkap:* ${profileData.fullName}
✍️ *Bio:* ${profileData.bio}

*📊 Statistik:*
- *Pengikut:* ${profileData.followers.toLocaleString('id-ID')}
- *Mengikuti:* ${profileData.following.toLocaleString('id-ID')}
- *Postingan:* ${profileData.posts.toLocaleString('id-ID')}

✅ *Terverifikasi:* ${profileData.isVerified ? 'Ya' : 'Tidak'}
${profileData.isPrivate !== null ? `🔒 *Akun Privat:* ${profileData.isPrivate ? 'Ya' : 'Tidak'}` : ''}

*Sumber Data:* ${profileData.source}
`.trim().replace(/^\s*\n/gm, "");

            const imageBuffer = await extras.getImageBufferFromUrl(profileData.avatarUrl);

            if (imageBuffer) {
                await sock.sendMessage(sender, { image: imageBuffer, caption: caption }, { quoted: msg });
            } else {
                await sock.sendMessage(sender, { text: caption }, { quoted: msg });
            }

        } else {
            throw finalError;
        }

    } catch (error) {
        console.error('[IGSTALK] Gagal total menjalankan command:', error);
        await sock.sendMessage(sender, { text: `❌ Gagal: ${error.message}` }, { quoted: msg });
    } finally {
        if (processingMsg) {
            await sock.sendMessage(sender, { delete: processingMsg.key });
        }
    }
}

async function handleUsernameInput(sock, msg, body, waitState) {
    const username = body.trim().replace('@', '');
    if (!username) {
        return sock.sendMessage(msg.key.remoteJid, { text: "Anda tidak memasukkan username. Coba kirim lagi." }, { quoted: msg });
    }
    await stalkInstagramUser(sock, msg, username, waitState.extras);
}

export default async function execute(sock, msg, args, text, sender, extras) {
    const username = text.trim().replace('@', '');
    if (username) {
        await stalkInstagramUser(sock, msg, username, extras);
    } else {
        await sock.sendMessage(sender, { text: `Masukkan username Instagram yang ingin Anda lihat profilnya.` }, { quoted: msg });
        await extras.set(sender, 'igstalk_username', handleUsernameInput, {
            extras: extras,
            timeout: 60000
        });
    }
}