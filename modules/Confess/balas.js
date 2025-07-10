import { getConfession } from '../../core/confessDataHandler.js';
import { decryptJid, createAnonymousId } from '../../core/securityHelper.js';

export default async function balas(sock, msg, args, text, sender, extras) {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedText = quotedMsg?.conversation || quotedMsg?.extendedTextMessage?.text || '';

    // 1. Cek apakah user me-reply pesan atau tidak
    if (!quotedMsg) {
        return await sock.sendMessage(sender, { 
            text: "❌ Cara balasnya salah, bro.\n\nKamu harus *me-reply (quote)* pesan confess yang mau kamu balas, baru ketik `.balas [pesan balasanmu]`." 
        }, { quoted: msg });
    }

    // 2. Ekstrak Confess ID dari pesan yang di-reply menggunakan Regex
    const confessIdMatch = quotedText.match(/#\s?(C\d+[a-zA-Z0-9]+)/);
    if (!confessIdMatch) {
        return await sock.sendMessage(sender, { 
            text: "Waduh, pesan yang kamu reply kayaknya bukan pesan confess deh. Gak nemu ID confess-nya." 
        }, { quoted: msg });
    }
    
    const confessId = confessIdMatch[1]; // Ambil ID-nya, misal "C17519..."
    const replyMessage = text; // Seluruh teks sekarang adalah pesan balasan

    if (!replyMessage) {
        return await sock.sendMessage(sender, { text: "Pesan balasannya jangan kosong dong, bro." }, { quoted: msg });
    }

    try {
        // Logika sisanya sama persis kayak sebelumnya!
        const confessionData = await getConfession(confessId);
        if (!confessionData) {
            return await sock.sendMessage(sender, { text: `Confess dengan ID #${confessId} tidak ditemukan di database.` }, { quoted: msg });
        }

        const originalAuthorJid = decryptJid(confessionData.encryptedAuthorJid);
        if (!originalAuthorJid) {
            throw new Error(`Gagal mendekripsi JID penulis asli untuk confess #${confessId}.`);
        }

        const replierAnonymousId = createAnonymousId(sender);
        
        // --- TAMPILAN BARU UNTUK BALASAN ---
        const messageToTarget = `
╭─── 💌 Balasan Untukmu ───╮
│
│  💬 Dari: *${replierAnonymousId}*
│  💬 Untuk confess ID: *#${confessId}*
│
│  _"${replyMessage}"_
│
╰───────────────╯
        
Balas pesan ini (quote/reply) lagi untuk melanjutkan percakapan.`.trim();

        if (originalAuthorJid === sender) {
             return await sock.sendMessage(sender, { text: "Kamu mencoba membalas ke dirimu sendiri dalam thread ini." }, { quoted: msg });
        }

        await sock.sendMessage(originalAuthorJid, { text: messageToTarget });

        await sock.sendMessage(sender, { text: `✅ Balasanmu untuk #${confessId} telah berhasil dikirim.` });

    } catch (error) {
        console.error(`[CMD BALAS] Error saat memproses balasan untuk #${confessId}:`, error);
        await sock.sendMessage(sender, { text: "Waduh, ada kesalahan teknis pas ngirim balasan." }, { quoted: msg });
    }
}

export const category = 'main';
export const description = 'Membalas sebuah pesan confess secara anonim dengan me-reply pesan.';
export const usage = 'Reply pesan confess, lalu ketik .balas [pesan]';