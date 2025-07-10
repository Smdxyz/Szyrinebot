// /modules/downloaders/fb.js

import { BOT_PREFIX, WATERMARK } from '../../config.js';
import { safeApiGet } from '../../libs/apiHelper.js';

export const category = 'downloaders';
export const description = 'Mengunduh video dari tautan Facebook.';
export const usage = `${BOT_PREFIX}fb <url_video_facebook>`;
export const aliases = ['facebook', 'fbdl'];
export const energyCost = 6;

async function handleQualitySelection(sock, msg, body, waitState) {
    const sender = msg.key.remoteJid;
    const { sd, hd, title } = waitState.dataTambahan;
    
    let urlToDownload, quality;

    if (body === 'fb_dl_sd') { urlToDownload = sd; quality = 'SD'; } 
    else if (body === 'fb_dl_hd') { urlToDownload = hd; quality = 'HD'; } 
    else { return; } // Abaikan jika tidak valid

    if (!urlToDownload) { return sock.sendMessage(sender, { text: `Maaf bos, link buat kualitas ${quality} nggak ada.` }, { quoted: msg }); }
    
    const statusMsg = await sock.sendMessage(sender, { text: `✅ Oke, siapin video kualitas *${quality}*. Sabar ya...` }, { quoted: msg });
    
    try {
        await sock.sendMessage(sender, { video: { url: urlToDownload }, caption: `*${title || 'Video Facebook'}*\n\nKualitas: ${quality}\n${WATERMARK}` }, { quoted: msg });
        await sock.sendMessage(sender, { delete: statusMsg.key });
    } catch (error) {
        console.error('[FB DL] Gagal mengirim video:', error);
        await sock.sendMessage(sender, { text: `❌ Aduh, gagal pas ngirim video: ${error.message}`, edit: statusMsg.key });
    }
}

async function startFacebookDownload(sock, msg, userUrl, extras) {
    const { set: setWaitingState } = extras;
    const sender = msg.key.remoteJid;
    const statusMsg = await sock.sendMessage(sender, { text: '⏳ Lagi ngambil data video, harap tunggu...' }, { quoted: msg });
    
    try {
        const result = await safeApiGet(`https://szyrineapi.biz.id/api/downloaders/fb?url=${encodeURIComponent(userUrl)}`);
        const videoData = Array.isArray(result) ? result[0] : result; // Handle API yang return object atau array

        if (!videoData || (!videoData.normalQualityLink && !videoData.hdQualityLink)) {
            throw new Error('Nggak nemu link unduhan video di respons API.');
        }

        const buttons = [];
        if (videoData.normalQualityLink) buttons.push({ buttonId: 'fb_dl_sd', buttonText: { displayText: 'Kualitas SD' }, type: 1 });
        if (videoData.hdQualityLink) buttons.push({ buttonId: 'fb_dl_hd', buttonText: { displayText: 'Kualitas HD' }, type: 1 });
        
        const buttonMessage = {
            image: { url: videoData.thumbnail },
            caption: `*${videoData.title || 'Video Facebook'}*\n\n${videoData.description || ''}\n\nPilih kualitas video di bawah ini.`,
            footer: `Durasi: ${videoData.duration || 'N/A'}`,
            buttons: buttons,
            headerType: 4
        };

        await sock.sendMessage(sender, { delete: statusMsg.key });
        const sentMsg = await sock.sendMessage(sender, buttonMessage, { quoted: msg });
        
        await setWaitingState(sender, 'fb_quality', handleQualitySelection, {
            dataTambahan: { sd: videoData.normalQualityLink, hd: videoData.hdQualityLink, title: videoData.title },
            timeout: 120000,
            originalMsgKey: sentMsg.key
        });

    } catch (error) {
        console.error('[FB DL] Gagal:', error);
        await sock.sendMessage(sender, { text: `❌ Aduh, gagal ngambil data video: ${error.message}`, edit: statusMsg.key });
    }
}

async function handleUrlInput(sock, msg, body, waitState) {
    const url = body.trim();
    if (!url || !url.includes('facebook.com') && !url.includes('fb.watch')) {
        return sock.sendMessage(msg.key.remoteJid, { text: 'Ini bukan link Facebook. Coba kirim lagi.' }, { quoted: msg });
    }
    await startFacebookDownload(sock, msg, url, waitState.extras);
}

export default async function execute(sock, msg, args, text, sender, extras) {
    const userUrl = args[0];
    if (userUrl) {
        await startFacebookDownload(sock, msg, userUrl, extras);
    } else {
        await sock.sendMessage(sender, { text: `Kirim link video Facebook yang mau di-download.` }, { quoted: msg });
        await extras.set(sender, 'fb_url', handleUrlInput, { extras, timeout: 120000, originalMsgKey: msg.key });
    }
}