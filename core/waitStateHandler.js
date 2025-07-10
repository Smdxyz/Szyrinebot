// /core/waitStateHandler.js (FINAL - Dengan Log Bersih & Tombol Batal)

import { BOT_PREFIX } from '../config.js';

const waitingUsers = new Map();
export const WAIT_TIMEOUT = 60000; // 60 detik

// ID ini dapat digunakan dalam tombol interaktif untuk memberi pengguna opsi pembatalan.
export const CANCEL_BUTTON_ID = `action_cancel_wait_state`; 

/**
 * Memeriksa dan menangani pesan dari pengguna yang berada dalam state menunggu.
 * Fungsi ini adalah jantung dari alur interaktif.
 * @returns {boolean} - Mengembalikan `true` jika pesan berhasil ditangani oleh state tunggu,
 *                      dan `false` jika pesan harus diproses sebagai perintah baru.
 */
export async function checkWaitingState(sock, msg, currentInput, originalPrefix) {
    const sender = msg.key.remoteJid;
    if (!waitingUsers.has(sender)) {
        return false; // Pengguna tidak dalam state menunggu, lanjutkan alur normal.
    }

    const waitingState = waitingUsers.get(sender);

    // --- 1. Logika Pembatalan Eksplisit ---
    if (currentInput === CANCEL_BUTTON_ID) {
        console.log(`[WAIT STATE] Pengguna ${sender} membatalkan state untuk command '${waitingState.commandName}'.`);
        clearTimeout(waitingState.timeoutId); // Hentikan timer timeout.
        waitingUsers.delete(sender); // Hapus state pengguna.
        try {
            await sock.sendMessage(sender, { text: `✅ Oke, sip! Perintah *${originalPrefix}${waitingState.commandName}* telah dibatalkan.`, edit: waitingState.originalMsgKey });
        } catch (e) {
            console.error(`[WAIT STATE] Gagal edit pesan batal, mengirim pesan baru...`, e);
            await sock.sendMessage(sender, { text: `✅ Oke, sip! Perintah *${originalPrefix}${waitingState.commandName}* telah dibatalkan.` }, { quoted: msg });
        }
        return true; 
    }

    // --- 2. Logika Pembatalan Otomatis ---
    if (currentInput.trim().startsWith(originalPrefix)) {
        console.log(`[WAIT STATE] ${sender} mengirim command baru, membatalkan state '${waitingState.commandName}'.`);
        const previousCommand = waitingState.commandName;
        clearTimeout(waitingState.timeoutId);
        waitingUsers.delete(sender);
        try {
             await sock.sendMessage(sender, { text: `☑️ Perintah *${originalPrefix}${previousCommand}* tadi otomatis aku batalin ya, karena kamu ngasih perintah baru.` });
        } catch (e) {
            console.error(`[WAIT STATE] Gagal kirim pesan pembatalan otomatis ke ${sender}:`, e);
        }
        return false;
    }

    // --- 3. Logika Input Lanjutan ---
    console.log(`[WAIT STATE] ${sender} melengkapi '${waitingState.commandName}' dengan input: "${currentInput.substring(0, 50)}..."`);
    const { nextStep, timeoutId } = waitingState;
    
    clearTimeout(timeoutId); 
    waitingUsers.delete(sender); 

    try {
        await nextStep(sock, msg, currentInput.trim(), waitingState);
    } catch (error) {
        console.error(`[WAIT STATE] Error pada nextStep untuk '${waitingState.commandName}' (${sender}):`, error);
        try {
            await sock.sendMessage(sender, { text: `😥 Waduuh, ada error nih pas lanjutin perintah *${originalPrefix}${waitingState.commandName}*. Maaf ya, coba lagi nanti.` });
        } catch (e) {
            console.error(`[WAIT STATE] Gagal kirim pesan error nextStep ke ${sender}:`, e);
        }
    }
    return true; 
}

/**
 * Mengatur pengguna ke dalam state menunggu untuk input selanjutnya.
 */
export async function setWaitingState(sock, senderJid, commandName, nextStep, options = {}) {
    if (!sock) { console.error(`[WAIT STATE] Gagal set: 'sock' tidak disediakan.`); return; }
    if (typeof nextStep !== 'function') { console.error(`[WAIT STATE] Gagal set: nextStep bukan fungsi.`); return; }

    if (waitingUsers.has(senderJid)) {
        clearTimeout(waitingUsers.get(senderJid).timeoutId);
    }
    
    const timeout = options.timeout || WAIT_TIMEOUT;
    
    const timeoutId = setTimeout(async () => {
        if (waitingUsers.has(senderJid) && waitingUsers.get(senderJid).timeoutId === timeoutId) {
            console.log(`[WAIT STATE] Waktu tunggu untuk ${senderJid} (cmd: ${commandName}) telah habis.`);
            waitingUsers.delete(senderJid);
            try {
                await sock.sendMessage(senderJid, { text: `⏰ Yah, waktunya abis... Perintah *${BOT_PREFIX}${commandName}* aku batalin otomatis ya. Kalo mau lanjut, ketik ulang aja perintahnya.` });
            } catch (e) {
                console.error(`[WAIT STATE] Gagal mengirim pesan notifikasi timeout ke ${senderJid}:`, e);
            }
        }
    }, timeout);
    
    waitingUsers.set(senderJid, {
        commandName,
        nextStep,
        timeoutId, 
        dataTambahan: options.dataTambahan || {},
        originalMsgKey: options.originalMsgKey,
        extras: options.extras || {}
    });

    // =========================================================================
    // INI DIA BAGIAN YANG DIBENERIN BIAR LOG-NYA GAK NGAWUR
    // =========================================================================
    const nextStepName = nextStep.name || 'anonymous_function';
    console.log(`[WAIT STATE] Aktif untuk ${senderJid} (cmd: ${commandName} | next_step: ${nextStepName}, timeout: ${timeout / 1000}s).`);
}

/**
 * Menghapus state tunggu seorang pengguna secara manual jika diperlukan.
 */
export function clearWaitingState(senderJid) {
    if (waitingUsers.has(senderJid)) {
        const state = waitingUsers.get(senderJid);
        clearTimeout(state.timeoutId);
        waitingUsers.delete(senderJid);
        console.log(`[WAIT STATE] State tunggu untuk ${senderJid} (cmd: ${state.commandName}) dihapus secara manual.`);
    }
}