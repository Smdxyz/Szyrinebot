// modules/general/menu.js (REVISI FINAL - FIX TypeError)
import { generateWAMessageFromContent, proto } from '@fizzxydev/baileys-pro';
import { getCategorizedCommands } from '../../core/commandRegistry.js';
import { BOT_PREFIX, BOT_NAME, BOT_OWNER, WATERMARK, TIERS, MAX_ENERGY_BY_TIER } from '../../config.js';
import { BOT_START_TIME } from '../../core/bot.js';
import os from 'os';
import process from 'process';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// --- Helper Functions ---
function formatUptime(ms) {
    if (ms < 0) ms = 0; const d = Math.floor(ms / 86400000); const h = Math.floor(ms / 3600000) % 24; const m = Math.floor(ms / 60000) % 60; const s = Math.floor(ms / 1000) % 60;
    return `${d > 0 ? `${d} H, ` : ''}${h > 0 ? `${h} J, ` : ''}${m > 0 ? `${m} M, ` : ''}${s} D`;
}
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes'; const k = 1024; const dm = decimals < 0 ? 0 : decimals; const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
function getCurrentDate() {
    return new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// URL ASLI ANDA
const MENU_HEADER_IMAGE_URL = 'https://cloudkuimages.com/uploads/images/1L96I25S.jpg';

async function getImageBuffer(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(response.data, 'binary');
    } catch (error) {
        console.warn(`⚠️ Gagal mengambil gambar dari URL: ${url}. Error: ${error.message}`);
        const localPath = path.join(process.cwd(), 'media', 'pepobot-thumbnail.png');
        if (fs.existsSync(localPath)) return fs.readFileSync(localPath);
        return null;
    }
}


export default async function menu(sock, msg, argsArray, argsString, sender, extras) {
    const { localUserData } = extras;

    try {
        // --- DATA PREPARATION (LOGIKA TIDAK HILANG) ---
        const senderName = msg.pushName || sender.split('@')[0];
        const ownerNumber = BOT_OWNER[0];
        const uptime = formatUptime(Date.now() - BOT_START_TIME);
        const categorizedCommands = getCategorizedCommands();
        const totalMem = os.totalmem();
        const usedMem = totalMem - os.freemem();
        const cpu = os.cpus()[0];
        const cpuModel = cpu ? cpu.model.split('@')[0].trim() : 'N/A';

        // --- PESAN PERTAMA: GAMBAR + SEMUA INFORMASI TEKS ---
        const fullMenuText =
`Halo, *${senderName}*! 👋
Selamat datang di panel bantuan *${BOT_NAME}*.

*USER INFO*
› Tier: *${localUserData.tier}*
› Energi: *${localUserData.energy} / ${MAX_ENERGY_BY_TIER[localUserData.tier]}*

*BOT INFO*
› Owner: @${ownerNumber}
› Prefix: *${BOT_PREFIX}*
› Aktif: *${uptime}*
› Tanggal: *${getCurrentDate()}*

*SERVER INFO*
› OS: *${os.platform()}*
› CPU: *${cpuModel}*
› RAM: *${formatBytes(usedMem)} / ${formatBytes(totalMem)}*
› Node.js: *${process.version}*

*DAFTAR PERINTAH (VERSI TEKS)*
${categorizedCommands.map(catData => {
    if (catData.category.toLowerCase() === 'internal' || catData.category.toLowerCase() === 'admin' || catData.commands.length === 0) return '';
    return `\n╭─「 *${catData.category.toUpperCase()}* 」\n│ ◦ ${catData.commands.map(cmd => `${BOT_PREFIX}${cmd.name}`).join('\n│ ◦ ')}\n╰═════════════`;
}).join('')}
`;

        const menuImageBuffer = await getImageBuffer(MENU_HEADER_IMAGE_URL);
        
        await sock.sendMessage(sender, {
            image: menuImageBuffer,
            caption: fullMenuText,
            footer: WATERMARK,
            mentions: [`${ownerNumber}@s.whatsapp.net`]
        }, { quoted: msg });


        // --- PESAN KEDUA: TOMBOL INTERAKTIF (ANTI-RUSAK) ---
        
        const categoryRows = categorizedCommands
            .filter(cat => cat.category.toLowerCase() !== 'internal' && cat.category.toLowerCase() !== 'admin' && cat.commands.length > 0)
            .map(catData => ({
                title: `📁 ${catData.category.toUpperCase()}`,
                description: `Lihat ${catData.commands.length} perintah di kategori ini.`,
                id: `${BOT_PREFIX}showcategory_${catData.category.toLowerCase()}`
            }));

        const menuSections = [{
            title: "PILIH KATEGORI UNTUK DETAIL",
            rows: categoryRows
        }];

        const interactiveMessagePayload = {
            body: { text: `Gunakan tombol di bawah untuk navigasi cepat.` },
            footer: { text: `© ${new Date().getFullYear()} ${BOT_NAME}` },
            header: { title: "MENU INTERAKTIF", subtitle: "Navigasi Cepat", hasMediaAttachment: false },
            nativeFlowMessage: {
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({ title: "📂 Daftar Kategori Perintah", sections: menuSections })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({ display_text: "GitHub/Smdxyz", url: "https://github.com/SmdxOfficial" })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({ display_text: "WhatsApp Channel", url: "https://whatsapp.com/channel/0029VbBGIQE5K3zOmOXl6y0t" })
                    }
                ]
            }
        };

        // --- INI BAGIAN YANG DIPERBAIKI ---
        // Menambahkan parameter ketiga `{ quoted: msg }` untuk memberikan konteks.
        const prepMsg = generateWAMessageFromContent(sender, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage: proto.Message.InteractiveMessage.create(interactiveMessagePayload)
                }
            }
        }, { quoted: msg }); // <--- KONTEKS DITAMBAHKAN DI SINI

        await sock.relayMessage(prepMsg.key.remoteJid, prepMsg.message, { messageId: prepMsg.key.id });

    } catch (error) {
        console.error("❌ Error saat mengirim menu 'gacor':", error);
        await sock.sendMessage(sender, { text: "😥 Maaf, terjadi kesalahan saat memuat menu. Silakan coba lagi nanti." }, { quoted: msg });
    }
}

// --- METADATA COMMAND ---
export const description = 'Menampilkan menu informasi bot dan daftar command.';
export const usage = '!menu';
export const category = 'main';
export const energyCost = 1;