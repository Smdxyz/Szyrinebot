// core/antiToxicHelper.js
import { setUserMuteLocal, getUserLocalData } from './localDataHandler.js';
import { TOXIC_STRIKE_LIMIT_MUTE, TOXIC_STRIKE_LIMIT_BLOCK, MUTE_DURATION_SECONDS, ADMIN_CONTACT_FOR_UNBAN, OWNER_USERNAMES_FOR_UNBAN, BOT_NAME } from '../config.js';

// Fungsi untuk menangani user toxic (mengirim pesan, mute, blokir)
// Dipanggil dari handler (deteksi real-time) atau weeklyAnalyzer (deteksi mingguan)
// Menerima internalId untuk interaksi data lokal, dan jid untuk interaksi via sock,
// jumlah strike, dan daftar kata toxic yang ditemukan (jika ada di pesan terakhir)
export async function handleToxicUser(sock, internalId, jid, strikes, detectedToxicWords = []) {
    const adminContactText = OWNER_USERNAMES_FOR_UNBAN.join(' atau ') + ` di nomor ${ADMIN_CONTACT_FOR_UNBAN}`;
    let messageSent = false;
    const wordsList = detectedToxicWords.length > 0 ? ` Kata terdeteksi: *${detectedToxicWords.join(', ')}*.` : '';


    try {
        if (strikes <= 3) {
            console.log(`[ANTI-TOXIC] User ${jid} (internalId: ${internalId}) mendapat strike ke-${strikes}. Peringatan ringan.`);
            if (sock) await sock.sendMessage(jid, { text: `⚠️ *PERINGATAN* ⚠️\nMohon jaga ucapan Anda. Jangan toxic, Bro/Sis! (Pelanggaran ke-${strikes}).${wordsList}` });
            messageSent = true;
        } else if (strikes <= TOXIC_STRIKE_LIMIT_MUTE) {
            console.log(`[ANTI-TOXIC] User ${jid} (internalId: ${internalId}) mendapat strike ke-${strikes}. Peringatan keras.`);
            if (sock) await sock.sendMessage(jid, { text: `‼️ *PERINGATAN KERAS* ‼️\nBahasa Anda terdeteksi tidak pantas. Ini adalah pelanggaran ke-${strikes}. Jika berlanjut, Anda akan dikenakan sanksi.${wordsList}` });
            messageSent = true;
        } else if (strikes < TOXIC_STRIKE_LIMIT_BLOCK) {
            // Mute user menggunakan fungsi lokal
            await setUserMuteLocal(internalId, MUTE_DURATION_SECONDS);
            const muteUntil = new Date(Date.now() + MUTE_DURATION_SECONDS * 1000).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
            console.log(`[ANTI-TOXIC] User ${jid} (internalId: ${internalId}) mendapat strike ke-${strikes} dan di-MUTE hingga ${muteUntil}.`);
            if (sock) await sock.sendMessage(jid, { text: `🔇 *ANDA DI-MUTE* 🔇\nKarena pelanggaran berulang (ke-${strikes}), Anda tidak dapat menggunakan perintah bot selama ${MUTE_DURATION_SECONDS / 60} menit (hingga ${muteUntil} WIB).\n\nJaga perilaku Anda.` }); // Pesan mute tidak perlu menampilkan kata toxic
            messageSent = true;
        } else { // Termasuk strike ke-10 dan seterusnya
            console.log(`[ANTI-TOXIC] User ${jid} (internalId: ${internalId}) mendapat strike ke-${strikes} dan akan di-BLOKIR.`);
            if (sock) {
                await sock.sendMessage(jid, {
                    text: `🚫 *ANDA TELAH DIBLOKIR* 🚫\nAnda telah mencapai batas maksimal pelanggaran (${strikes}x). Akun Anda telah diblokir secara permanen dari penggunaan ${BOT_NAME}.\n\nUntuk permintaan unban, silakan hubungi ${adminContactText}.`
                });
                // await sock.updateBlocklist(jid, "add"); // Aksi blokir via sock (perlu dicoba, kadang API WA tidak mengizinkan bot memblokir)
                console.log(`[ANTI-TOXIC] User ${jid} berhasil diblokir (simulasi).`); // Ganti dengan sock.updateBlocklist jika berfungsi
                messageSent = true;
            }
        }
    } catch (error) {
        console.error(`[ANTI-TOXIC] Gagal mengirim pesan/aksi untuk ${jid} (internalId: ${internalId}) pada strike ${strikes}:`, error);
    }
    return messageSent;
}