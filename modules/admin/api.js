// modules/owner/api.js (FIXED for Baileys-Pro)
import axios from 'axios';
import path from 'path';
import { URL } from 'url';
import { BOT_OWNER, BOT_PREFIX } from '../../config.js';

// --- Metadata (tetap sama) ---
export const category = 'owner';
export const description = 'Mengirim permintaan ke API dan menampilkan responsnya. Khusus Owner.';
export const usage = `${BOT_PREFIX}api <METHOD> <URL> [JSON_Body]`;
export const aliases = ['fetch', 'curl'];
export const requiredTier = 'Admin';
export const energyCost = 0;

function getFileNameFromUrl(url) {
    try {
        const parsedUrl = new URL(url);
        const fileName = path.basename(parsedUrl.pathname);
        if (fileName && fileName !== '/') {
            return fileName;
        }
    } catch (e) { /* Abaikan */ }
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

*Cara Penggunaan:*
\`\`\`${usage}\`\`\`

*Methods:* GET, POST, PUT, DELETE, PATCH

*Contoh GET:*
\`\`\`${BOT_PREFIX}api GET https://szyrineapi.biz.id/api/test\`\`\`

*Contoh POST:*
\`\`\`${BOT_PREFIX}api POST https://reqres.in/api/users {"name": "Szyrine", "job": "Bot Dev"}\`\`\`
        `.trim();
        return sock.sendMessage(msg.key.remoteJid, { text: usageText }, { quoted: msg });
    }

    const initialMsg = await sock.sendMessage(msg.key.remoteJid, { text: `⏳ Mengirim permintaan *${method}* ke *${url}*...` }, { quoted: msg });

    // --- PERBAIKAN UTAMA DI SINI ---
    // Baileys tidak punya sock.editMessage.
    // Untuk mengedit, kita gunakan sock.sendMessage dengan menyertakan key dari pesan awal.
    const editMsg = (newText) => {
        return sock.sendMessage(msg.key.remoteJid, {
            text: newText,
            edit: initialMsg.key // <-- Kunci untuk memberitahu Baileys pesan mana yang harus diedit
        });
    };
    // ------------------------------------

    try {
        const axiosConfig = {
            method,
            url,
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Szyrine-WhatsApp-Bot/1.0' }
        };

        if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && bodyData) {
            try {
                axiosConfig.data = JSON.parse(bodyData);
            } catch (e) {
                return editMsg(`❌ *JSON Tidak Valid*\n\n*Error:* ${e.message}`);
            }
        }

        console.log(`[API TOOL] Requesting:`, axiosConfig);
        const response = await axios(axiosConfig);
        
        const contentType = response.headers['content-type'] || 'application/octet-stream';
        const responseBuffer = Buffer.from(response.data);

        const caption = `*✅ Respons Diterima*\n\n*Status:* ${response.status} ${response.statusText}\n*Content-Type:* ${contentType}\n*Size:* ${responseBuffer.length} bytes`;
        
        // Edit pesan awal untuk menampilkan status sukses
        await editMsg(caption);

        // --- Logika Pemrosesan Respons (tetap sama, sudah benar) ---
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
            const errorBody = Buffer.from(error.response.data).toString('utf-8');
            const errorMessage = `*❌ API Gagal*\n\n*Status:* ${error.response.status} ${error.response.statusText}\n\n*Body:*\n\`\`\`${errorBody.substring(0, 1000)}\`\`\``;
            await editMsg(errorMessage);
        } else if (error.request) {
            await editMsg(`❌ *Tidak Ada Respons*\n\nServer tidak merespons. Cek koneksi bot atau URL API.`);
        } else {
            await editMsg(`❌ *Error*\n\n*Pesan:* ${error.message}`);
        }
    }
}