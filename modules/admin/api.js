// modules/owner/api.js (New Power Tool)
import axios from 'axios';
import path from 'path';
import { URL } from 'url';
import { BOT_OWNER, BOT_PREFIX } from '../../config.js';

// --- Metadata ---
export const category = 'owner';
export const description = 'Mengirim permintaan ke API dan menampilkan responsnya. Khusus Owner.';
export const usage = `${BOT_PREFIX}api <METHOD> <URL> [JSON_Body]`;
export const aliases = ['fetch', 'curl'];
export const requiredTier = 'Admin';
export const energyCost = 0;

/**
 * Helper untuk mencoba mendapatkan nama file dari URL.
 * @param {string} url - URL untuk di-parse.
 * @returns {string} Nama file yang disarankan.
 */
function getFileNameFromUrl(url) {
    try {
        const parsedUrl = new URL(url);
        const fileName = path.basename(parsedUrl.pathname);
        // Jika path-nya hanya "/", berikan nama default
        if (fileName && fileName !== '/') {
            return fileName;
        }
    } catch (e) {
        // Abaikan jika URL tidak valid
    }
    // Fallback jika tidak ada nama file yang bisa dideteksi
    return `api-response-${Date.now()}.bin`;
}

// --- Logic ---
export default async function execute(sock, msg, args) {
    const senderId = msg.key.remoteJid.split('@')[0];
    if (!BOT_OWNER.includes(senderId)) {
        return sock.sendMessage(msg.key.remoteJid, { text: '❌ Perintah ini adalah tool khusus untuk Owner Bot.' }, { quoted: msg });
    }

    const method = args[0]?.toUpperCase();
    const url = args[1];
    const bodyData = args.slice(2).join(' ');

    const supportedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

    if (!method || !url || !supportedMethods.includes(method)) {
        const usageText = `
*API Power Tool*

Perintah ini digunakan untuk berinteraksi dengan API endpoint manapun.

*Cara Penggunaan:*
\`\`\`${usage}\`\`\`

*Methods yang Didukung:*
- GET
- POST
- PUT
- DELETE
- PATCH

*Contoh GET:*
\`\`\`${BOT_PREFIX}api GET https://api.github.com/users/openai\`\`\`

*Contoh POST dengan data:*
\`\`\`${BOT_PREFIX}api POST https://reqres.in/api/users {"name": "Szyrine", "job": "Bot Dev"}\`\`\`
        `.trim();
        return sock.sendMessage(msg.key.remoteJid, { text: usageText }, { quoted: msg });
    }

    const initialMsg = await sock.sendMessage(msg.key.remoteJid, { text: `⏳ Mengirim permintaan *${method}* ke *${url}*...` }, { quoted: msg });
    const editMsg = (text) => sock.editMessage(msg.key.remoteJid, initialMsg.key, text);

    try {
        const axiosConfig = {
            method,
            url,
            responseType: 'arraybuffer', // Minta buffer mentah, kita akan proses nanti
            headers: {
                'User-Agent': 'Szyrine-WhatsApp-Bot/1.0'
            }
        };

        if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && bodyData) {
            try {
                axiosConfig.data = JSON.parse(bodyData);
            } catch (e) {
                return editMsg(`❌ *JSON Tidak Valid*\n\nData body yang Anda berikan bukan format JSON yang benar.\n\n*Error:* ${e.message}`);
            }
        }

        console.log(`[API TOOL] Requesting:`, axiosConfig);
        const response = await axios(axiosConfig);
        
        const contentType = response.headers['content-type'] || 'application/octet-stream';
        const responseBuffer = Buffer.from(response.data);

        const caption = `*✅ Respons Diterima*\n\n*Status:* ${response.status} ${response.statusText}\n*Content-Type:* ${contentType}\n*Size:* ${responseBuffer.length} bytes`;
        
        await sock.editMessage(msg.key.remoteJid, initialMsg.key, caption);

        // --- Logika Pemrosesan Respons ---
        if (contentType.includes('application/json')) {
            const jsonString = responseBuffer.toString('utf-8');
            const prettyJson = JSON.stringify(JSON.parse(jsonString), null, 2);
            await sock.sendMessage(msg.key.remoteJid, { text: `\`\`\`json\n${prettyJson}\`\`\`` }, { quoted: msg });

        } else if (contentType.includes('image/')) {
            await sock.sendMessage(msg.key.remoteJid, { image: responseBuffer, caption: caption }, { quoted: msg });

        } else if (contentType.includes('video/')) {
            await sock.sendMessage(msg.key.remoteJid, { video: responseBuffer, caption: caption }, { quoted: msg });

        } else if (contentType.includes('text/')) {
            const textContent = responseBuffer.toString('utf-8');
            await sock.sendMessage(msg.key.remoteJid, { text: textContent }, { quoted: msg });

        } else {
            // Fallback untuk tipe lain (PDF, ZIP, audio, dll)
            await sock.sendMessage(msg.key.remoteJid, {
                document: responseBuffer,
                mimetype: contentType,
                fileName: getFileNameFromUrl(url),
                caption: caption
            }, { quoted: msg });
        }

    } catch (error) {
        console.error('[API TOOL ERROR]', error);
        if (error.response) {
            // Server merespons dengan status error (4xx, 5xx)
            const errorBody = Buffer.from(error.response.data).toString('utf-8');
            const errorMessage = `
*❌ API Gagal Merespons dengan Benar*

*Status:* ${error.response.status} ${error.response.statusText}
*URL:* ${url}

*Response Body:*
\`\`\`
${errorBody.substring(0, 1000)}
\`\`\`
            `.trim();
            await editMsg(errorMessage);
        } else if (error.request) {
            // Request dikirim tapi tidak ada respons (masalah jaringan)
            await editMsg(`❌ *Tidak Ada Respons*\n\nPermintaan dikirim tapi tidak ada respons dari server. Cek koneksi internet bot atau URL API.`);
        } else {
            // Error lain (misal, salah konfigurasi)
            await editMsg(`❌ *Error Saat Mengirim Permintaan*\n\nTerjadi kesalahan saat mencoba mengirim permintaan.\n\n*Pesan:* ${error.message}`);
        }
    }
}