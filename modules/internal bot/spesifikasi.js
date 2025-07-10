//---- START OF FILE modules/info/spesifikasi.js ---

import os from 'os';
import disk from 'diskusage';
import { BOT_START_TIME } from '../../core/bot.js';
import { formatBytes } from '../../core/handler.js';

// Metadata Command
export const category = 'info';
export const description = 'Nge-spill spesifikasi detail dari server (VPS) yang ngejalanin bot ini.';
export const usage = 'spesifikasi';
export const requiredTier = 'Silver'; // HANYA TIER SILVER & DI ATASNYA BISA PAKAI
export const energyCost = 5;           // Butuh 5 energi buat nge-flexing server

// Fungsi utama command
export default async function execute(sock, msg, args, text, sender, extras) {
    
    // --- FITUR EDIT MESSAGE DIMULAI ---
    // Kirim pesan "loading" dulu, dan simpan key-nya buat diedit nanti
    const loadingMessage = await sock.sendMessage(sender, { text: "🔍 Menganalisis jeroan server... Mohon tunggu sebentar!" }, { quoted: msg });
    const initialKey = loadingMessage.key;

    try {
        // --- 1. INFORMASI CPU (OTAK SERVER) ---
        const cpus = os.cpus();
        const cpuModel = cpus[0].model;
        const cpuCores = cpus.length;
        const cpuSpeed = (cpus[0].speed / 1000).toFixed(2); // Dikonversi ke GHz

        // --- 2. INFORMASI RAM (MEMORI JANGKA PENDEK) ---
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;

        // --- 3. INFORMASI DISK (PENYIMPANAN) ---
        const diskPath = os.platform() === 'win32' ? 'c:' : '/';
        const diskInfo = await disk.check(diskPath);
        
        // --- 4. INFORMASI SISTEM & UPTIME (WAKTU HIDUP) ---
        const platform = os.platform();
        const arch = os.arch();
        const systemUptime = os.uptime();
        const botUptime = (Date.now() - BOT_START_TIME) / 1000;

        // Fungsi buat ubah detik jadi format hari, jam, menit, detik yang gampang dibaca
        const formatUptime = (seconds) => {
            const d = Math.floor(seconds / (3600 * 24));
            const h = Math.floor(seconds % (3600 * 24) / 3600);
            const m = Math.floor(seconds % 3600 / 60);
            const s = Math.floor(seconds % 60);
            let result = '';
            if (d > 0) result += `${d} hari, `;
            if (h > 0) result += `${h} jam, `;
            if (m > 0) result += `${m} menit, `;
            result += `${s} detik`;
            return result;
        };

        // --- 5. RAKIT TEKS KERENNYA! ---
        const specText = `
⚙️ *Spill Jeroan Server ${extras.localUserData.tier === 'Admin' ? 'Sultan' : 'Bot'}* ⚙️

💻 *CPU (Otak Server)*
- *Model:* ${cpuModel}
- *Total Core:* ${cpuCores} Core
- *Kecepatan:* ~${cpuSpeed} GHz

🧠 *RAM (Memori Lari)*
- *Keterpakai:* ${formatBytes(usedMem)}
- *Sisa:* ${formatBytes(freeMem)}
- *Total:* ${formatBytes(totalMem)}

💾 *DISK (Gudang Data)*
- *Keterpakai:* ${formatBytes(diskInfo.total - diskInfo.available)}
- *Sisa:* ${formatBytes(diskInfo.available)}
- *Total:* ${formatBytes(diskInfo.total)}

🚀 *Sistem & Waktu Hidup*
- *OS:* ${platform} (${arch})
- *Server Nyala:* ${formatUptime(systemUptime)}
- *Bot Aktif:* ${formatUptime(botUptime)}

Mantap kan? Server ini yang bikin aku bisa bales chat kamu secepat kilat! ⚡️
        `.trim();
        
        // --- FITUR EDIT MESSAGE SELESAI ---
        // Edit pesan "loading" tadi dengan hasil akhirnya, biar keliatan pro!
        await sock.sendMessage(sender, { text: specText, edit: initialKey });

    } catch (error) {
        console.error("[spesifikasi.js] Error:", error);
         // Kalau ada error, edit pesan "loading" jadi pesan error
        await sock.sendMessage(sender, { text: "😥 Aduh, ada kesalahan pas coba ngecek jeroan server. Coba lagi nanti ya.", edit: initialKey });
    }
}

//-------- END OF FILE modules/info/spesifikasi.js ---