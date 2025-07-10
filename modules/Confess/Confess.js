import { createConfession } from '../../core/confessDataHandler.js';

// Fungsi helper kecil buat nge-parse nomor WA dari mention
function parseMention(msg) {
    if (!msg) return null;
    const mentionedJid = msg.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    if (mentionedJid) return mentionedJid;
    return null;
}

// Langkah ke-2 dalam alur confess
async function handleTargetMention(sock, msg, text, waitingState) {
    const targetJid = parseMention(msg.message);
    const { originalMessage } = waitingState.dataTambahan;

    if (!targetJid) {
        return await sock.sendMessage(msg.key.remoteJid, { text: "Waduh, kamu belum mention siapa-siapa. Reply lagi pesanku tadi dan mention targetnya ya." });
    }

    if (targetJid === msg.key.remoteJid) {
        return await sock.sendMessage(msg.key.remoteJid, { text: "Gabisa confess ke diri sendiri, bro. Cari yang lain." });
    }

    try {
        await sock.sendMessage(msg.key.remoteJid, { text: "✅ Oke, target ditemukan! Mengirim surat rahasiamu..." });
        
        const result = await createConfession(msg.key.remoteJid, originalMessage);
        if (!result.success) throw new Error(result.error);
        
        const { confessId, anonymousId } = result;

        // --- Perubahan #3: TAMPILAN TEKS BARU YANG LEBIH BAGUS ---
        const messageToTarget = `
╭─── 💌 Pesan Untukmu ───╮
│
│  Seseorang mengirimimu pesan rahasia...
│
│  > "${originalMessage}"
│
│  Pengirim: \`\`\`${anonymousId}\`\`\`
│
╰───────────────╯
        
*Balas pesan ini (quote/reply) untuk merespon.*
*Gunakan command .balas [pesan]*
        
ID Pesan: #${confessId}`.trim();

        const [exists] = await sock.onWhatsApp(targetJid);
        if (exists) {
            await sock.sendMessage(targetJid, { text: messageToTarget });
            await sock.sendMessage(msg.key.remoteJid, { text: `✅ Berhasil! Pesan rahasiamu telah terkirim.` });
        } else {
            await sock.sendMessage(msg.key.remoteJid, { text: `😥 Gagal, nomor target tidak terdaftar di WhatsApp.` });
        }

    } catch (error) {
        console.error("[CONFESS NEXT_STEP] Error:", error);
        await sock.sendMessage(msg.key.remoteJid, { text: "Waduh, ada kesalahan teknis. Coba lagi nanti." });
    }
}

// Langkah Pertama (perintah .confess awal)
export default async function confess(sock, msg, args, text, sender, extras) {
    if (!text) {
        return await sock.sendMessage(sender, { text: "Cara pakenya: `.confess [pesan rahasiamu]`" }, { quoted: msg });
    }

    // Simpan pesan ke 'dataTambahan' dan set waiting state
    await extras.set(sender, 'confess', handleTargetMention, {
        dataTambahan: {
            originalMessage: text
        }
    });

    return await sock.sendMessage(sender, { 
        text: "🤫 Oke, pesanmu udah kusimpan.\n\nSekarang, siapa targetnya? *Reply pesan ini* dan *mention (tag)* orangnya." 
    });
}

export const category = 'main';
export const description = 'Mengirim pesan rahasia secara anonim ke pengguna lain.';
export const usage = '.confess [pesan]';