// /modules/downloaders/igdl.js

import { BOT_PREFIX, WATERMARK } from '../../config.js';
import { safeApiGet } from '../../libs/apiHelper.js';

export const category = 'downloaders';
export const description = 'Mengunduh media (foto/video/reels) dari Instagram.';
export const usage = `${BOT_PREFIX}igdl <link_instagram>`;
export const aliases = ['ig'];
export const energyCost = 4;

async function startInstagramDownload(sock, msg, instagramUrl) {
    const sender = msg.key.remoteJid;
    const statusMsg = await sock.sendMessage(sender, { text: '⏳ Menganalisis link Instagram...' }, { quoted: msg });
    
    try {
        const data = await safeApiGet(`https://szyrineapi.biz.id/api/downloaders/ig?url=${encodeURIComponent(instagramUrl)}`);

        if (!data?.url || data.url.length === 0) {
            throw new Error(data.message || 'Nggak bisa ngambil media dari link itu.');
        }

        const mediaList = data.url;
        const { caption, username } = data.metadata || {};
        const fullCaption = `*Username:* @${username || 'N/A'}\n\n${caption || 'Tanpa caption.'}\n\n${WATERMARK}`.trim();

        await sock.sendMessage(sender, { text: `✅ Oke, dapet *${mediaList.length}* media! Ngirim sekarang...`, edit: statusMsg.key });

        if (mediaList.length === 1) {
            const media = mediaList[0];
            await sock.sendMessage(sender, { [media.type]: { url: media.url }, caption: fullCaption }, { quoted: msg });
        } else {
            // Jika lebih dari satu, kirim sebagai album
            const albumItems = mediaList.map((item, index) => ({
                [item.type]: { url: item.url },
                caption: index === 0 ? fullCaption : ''
            }));
            await sock.sendAlbumMessage(sender, albumItems, { quoted: msg });
        }
        
        await sock.sendMessage(sender, { delete: statusMsg.key });

    } catch (error) {
        console.error('[IGDL] Error:', error);
        await sock.sendMessage(sender, { text: `❌ Gagal download: ${error.message}`, edit: statusMsg.key });
    }
}

async function handleUrlInput(sock, msg, body, waitState) {
    const url = body.trim();
    if (!url || (!url.includes('instagram.com/p/') && !url.includes('instagram.com/reel/'))) {
        return sock.sendMessage(msg.key.remoteJid, { text: 'Ini bukan link post atau reel Instagram. Coba kirim lagi.' }, { quoted: msg });
    }
    await startInstagramDownload(sock, msg, url);
}

export default async function execute(sock, msg, args, text, sender, extras) {
    const userUrl = args[0];
    if (userUrl) {
        await startInstagramDownload(sock, msg, userUrl);
    } else {
        await sock.sendMessage(sender, { text: `Kirim link post atau reel Instagram yang mau di-download.` }, { quoted: msg });
        await extras.set(sender, 'igdl_url', handleUrlInput, { extras, timeout: 120000, originalMsgKey: msg.key });
    }
}