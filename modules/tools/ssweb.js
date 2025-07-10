// /modules/tools/ssweb.js (Website Screenshot with Presets and Wait State)

import axios from 'axios';
import { BOT_PREFIX } from '../../config.js';

export const category = 'tools';
export const description = 'Mengambil screenshot dari sebuah website dengan berbagai pilihan format.';
export const usage = `${BOT_PREFIX}ssweb <url_website>`;
export const aliases = ['ss', 'screenshot'];
export const requiredTier = 'Silver'; // Tier yang dibutuhkan
export const energyCost = 15;        // Biaya energi per penggunaan

// URL API utama
const API_URL = 'https://szyrineapi.biz.id/api/tools/ssweb';

// --- Daftar Preset Screenshot ---
const SCREENSHOT_PRESETS = [
    {
        id: 'ss_desktop_full',
        title: '🖥️ Desktop - Halaman Penuh',
        description: 'Mengambil seluruh halaman dari atas ke bawah (mode desktop).',
        params: { full: true, width: 1920, height: 1080, delay: 2000 }
    },
    {
        id: 'ss_desktop_view',
        title: '🖥️ Desktop - Area Terlihat',
        description: 'Hanya mengambil bagian yang terlihat di layar pertama (mode desktop).',
        params: { full: false, width: 1920, height: 1080, delay: 2000 }
    },
    {
        id: 'ss_mobile_full',
        title: '📱 Mobile - Halaman Penuh',
        description: 'Mengambil seluruh halaman dari atas ke bawah (mode mobile).',
        params: { full: true, width: 414, height: 896, delay: 3000 }
    },
    {
        id: 'ss_mobile_view',
        title: '📱 Mobile - Area Terlihat',
        description: 'Hanya mengambil bagian yang terlihat di layar pertama (mode mobile).',
        params: { full: false, width: 414, height: 896, delay: 3000 }
    }
];

/**
 * Fungsi inti yang mengambil screenshot berdasarkan preset yang dipilih.
 */
async function takeScreenshot(sock, msg, userUrl, preset) {
    const sender = msg.key.remoteJid;
    let processingMsg;
    try {
        processingMsg = await sock.sendMessage(sender, { text: `⏳ Oke, sedang membuat screenshot untuk *${userUrl}* dengan format *${preset.title}*...` }, { quoted: msg });

        const apiParams = new URLSearchParams(preset.params);
        const fullApiUrl = `${API_URL}?url=${encodeURIComponent(userUrl)}&${apiParams.toString()}`;
        console.log(`[SSWEB] Calling API: ${fullApiUrl}`);

        const response = await axios.get(fullApiUrl, { responseType: 'arraybuffer' });

        if (response.headers['content-type'].startsWith('image/')) {
            await sock.sendMessage(sender, {
                image: Buffer.from(response.data, 'binary'),
                caption: `✅ Screenshot berhasil!\n\n*URL:* ${userUrl}\n*Preset:* ${preset.title}`
            }, { quoted: msg });
        } else {
            const errorData = JSON.parse(Buffer.from(response.data).toString('utf-8'));
            throw new Error(errorData.message || "API tidak mengembalikan gambar.");
        }
    } catch (error) {
        console.error('[SSWEB] Gagal mengambil screenshot:', error);
        let errorMessage = error.message;
        if(error.response && error.response.data) {
            try {
                const apiError = JSON.parse(Buffer.from(error.response.data).toString('utf-8'));
                errorMessage = apiError.message || errorMessage;
            } catch (e) { /* Abaikan */ }
        }
        await sock.sendMessage(sender, { text: `❌ Gagal mengambil screenshot: ${errorMessage}` }, { quoted: msg });
    } finally {
        if (processingMsg) {
            await sock.sendMessage(sender, { delete: processingMsg.key });
        }
    }
}

/**
 * Handler yang dipanggil setelah pengguna memilih preset dari menu.
 */
async function handlePresetSelection(sock, msg, body, waitState) {
    const { userUrl } = waitState.dataTambahan;
    const selectedPresetId = body;
    const selectedPreset = SCREENSHOT_PRESETS.find(p => p.id === selectedPresetId);

    if (!selectedPreset) {
        return sock.sendMessage(msg.key.remoteJid, { text: "Pilihan preset tidak valid." }, { quoted: msg });
    }
    await takeScreenshot(sock, msg, userUrl, selectedPreset);
}

/**
 * Fungsi untuk menampilkan menu pilihan preset kepada pengguna.
 */
async function showPresetMenu(sock, msg, userUrl, extras) {
    const sender = msg.key.remoteJid;
    const rows = SCREENSHOT_PRESETS.map(preset => ({
        title: preset.title,
        description: preset.description,
        rowId: preset.id
    }));
    const sections = [{ title: "Pilih Format Screenshot", rows: rows }];

    const listMessage = {
        text: `Anda ingin mengambil screenshot untuk:\n*${userUrl}*\n\nSilakan pilih format yang Anda inginkan dari daftar di bawah.`,
        footer: "Bot akan memproses setelah Anda memilih.",
        title: "Pilihan Screenshot",
        buttonText: "Lihat Opsi",
        sections
    };
    await sock.sendMessage(sender, listMessage, { quoted: msg });
    await extras.set(sender, 'ssweb_preset', handlePresetSelection, {
        dataTambahan: { userUrl },
        timeout: 60000
    });
}

/**
 * Handler untuk wait state saat bot meminta URL.
 */
async function handleUrlInput(sock, msg, body, waitState) {
    let url = body.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    try {
        new URL(url);
    } catch (e) {
        return sock.sendMessage(msg.key.remoteJid, { text: "URL yang Anda masukkan sepertinya tidak valid. Coba lagi." }, { quoted: msg });
    }
    await showPresetMenu(sock, msg, url, waitState.extras);
}

/**
 * Fungsi utama yang dieksekusi oleh handler.
 */
export default async function execute(sock, msg, args, text, sender, extras) {
    let userUrl = args[0];
    if (userUrl) {
        if (!userUrl.startsWith('http://') && !userUrl.startsWith('https://')) {
            userUrl = 'https://' + userUrl;
        }
        await showPresetMenu(sock, msg, userUrl, extras);
    } else {
        await sock.sendMessage(sender, { text: `Kirimkan alamat website (URL) yang ingin Anda screenshot.` }, { quoted: msg });
        await extras.set(sender, 'ssweb_url', handleUrlInput, {
            extras: extras,
            timeout: 60000
        });
    }
}