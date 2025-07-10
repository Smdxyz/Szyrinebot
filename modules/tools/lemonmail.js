// --- START OF FILE: modules/tools/lemonmail.js ---

// /modules/tools/sendemail.js (Interactive Email Sender)

import axios from 'axios';
import { BOT_PREFIX } from '../../config.js';

export const category = 'tools';
export const description = 'Mengirim email ke alamat tujuan melalui bot.';
export const usage = `${BOT_PREFIX}sendemail`;
export const aliases = ['email'];
export const requiredTier = 'Silver'; // Tier yang dibutuhkan
export const energyCost = 15;        // Biaya energi per penggunaan

const API_URL = 'https://szyrineapi.biz.id/api/tools/email';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Fungsi untuk mengirim email setelah semua data terkumpul.
 */
async function sendFinalEmail(sock, msg, emailData) {
    const sender = msg.key.remoteJid;
    const { to, subject, message } = emailData;
    let processingMsg;
    try {
        processingMsg = await sock.sendMessage(sender, { text: `✈️ Mengirim email ke *${to}*...` }, { quoted: msg });

        const response = await axios.post(API_URL, { to, subject, message }, {
            headers: { 'Content-Type': 'application/json' }
        });
        const result = response.data;

        if (result.status === 200 && result.result?.sent) {
            await sock.sendMessage(sender, { text: `✅ Email berhasil terkirim!\n\n*Penerima:* ${result.result.to}\n*Subjek:* ${result.result.subject}` }, { quoted: msg });
        } else {
            throw new Error(result.message || "Gagal mengirim email dari API.");
        }
    } catch (error) {
        console.error('[SENDEMAIL] Gagal mengirim email:', error);
        const errorMessage = error.response?.data?.message || error.message || "Terjadi kesalahan.";
        await sock.sendMessage(sender, { text: `❌ Gagal mengirim email: ${errorMessage}` }, { quoted: msg });
    } finally {
        if (processingMsg) {
            await sock.sendMessage(sender, { delete: processingMsg.key });
        }
    }
}

/**
 * Langkah 4: Menangani konfirmasi akhir.
 */
async function handleConfirmation(sock, msg, body, waitState) {
    const userResponse = body.trim().toLowerCase();
    const { emailData } = waitState.dataTambahan;

    if (userResponse === 'kirim') {
        await sendFinalEmail(sock, msg, emailData);
    } else {
        await sock.sendMessage(msg.key.remoteJid, { text: '✅ Pengiriman email dibatalkan.' }, { quoted: msg });
    }
}

/**
 * Langkah 3: Meminta isi pesan.
 */
async function handleMessageInput(sock, msg, body, waitState) {
    const sender = msg.key.remoteJid;
    const { set } = waitState.extras;
    let { emailData } = waitState.dataTambahan;

    const message = body.trim();
    if (message.toLowerCase() === 'batal') {
        return sock.sendMessage(sender, { text: '✅ Pembuatan email dibatalkan.' }, { quoted: msg });
    }
    emailData.message = message;

    const summary = `*KONFIRMASI PENGIRIMAN EMAIL*\n\n*Penerima:*\n${emailData.to}\n\n*Subjek:*\n${emailData.subject}\n\n*Isi Pesan:*\n${emailData.message}\n\n---------------------------------\nKetik *kirim* untuk mengirim, atau *batal* untuk membatalkan.`;
    await sock.sendMessage(sender, { text: summary }, { quoted: msg });
    await set(sender, 'sendemail_confirm', handleConfirmation, {
        dataTambahan: { emailData },
        timeout: 120000
    });
}

/**
 * Langkah 2: Meminta subjek.
 */
async function handleSubjectInput(sock, msg, body, waitState) {
    const sender = msg.key.remoteJid;
    const { set } = waitState.extras;
    const { emailData } = waitState.dataTambahan;

    const subject = body.trim();
    if (subject.toLowerCase() === 'batal') {
        return sock.sendMessage(sender, { text: '✅ Pembuatan email dibatalkan.' }, { quoted: msg });
    }
    if (!subject) {
        return sock.sendMessage(sender, { text: 'Subjek tidak boleh kosong. Coba lagi atau ketik *batal*.' }, { quoted: msg });
    }
    emailData.subject = subject;

    await sock.sendMessage(sender, { text: `👍 Subjek diterima. Sekarang, ketikkan isi pesan email Anda.\n\nAnda bisa menggunakan tag HTML sederhana. Ketik *batal* untuk membatalkan.` }, { quoted: msg });
    await set(sender, 'sendemail_message', handleMessageInput, {
        dataTambahan: { emailData },
        extras: { set },
        timeout: 300000
    });
}

/**
 * Langkah 1: Meminta alamat email.
 */
async function handleEmailInput(sock, msg, body, waitState) {
    const sender = msg.key.remoteJid;
    const { set } = waitState.extras;
    const emailData = {};

    const toEmail = body.trim();
    if (toEmail.toLowerCase() === 'batal') {
        return sock.sendMessage(sender, { text: '✅ Pembuatan email dibatalkan.' }, { quoted: msg });
    }
    if (!EMAIL_REGEX.test(toEmail)) {
        return sock.sendMessage(sender, { text: 'Format email tidak valid. Masukkan alamat email yang benar (contoh: user@gmail.com). Ketik *batal*.' }, { quoted: msg });
    }
    emailData.to = toEmail;

    await sock.sendMessage(sender, { text: `✅ Email tujuan diatur ke *${toEmail}*. Selanjutnya, masukkan *subjek* email. Ketik *batal* untuk membatalkan.` }, { quoted: msg });
    await set(sender, 'sendemail_subject', handleSubjectInput, {
        dataTambahan: { emailData },
        extras: { set },
        timeout: 120000
    });
}

/**
 * Fungsi utama command.
 */
export default async function execute(sock, msg, args, text, sender, extras) {
    const { set } = extras;
    const argEmail = args[0];

    if (argEmail) {
        if (!EMAIL_REGEX.test(argEmail)) {
             return sock.sendMessage(sender, { text: 'Format email yang Anda masukkan tidak valid.' }, { quoted: msg });
        }
        const emailData = { to: argEmail };
        await sock.sendMessage(sender, { text: `✅ Siap mengirim ke *${argEmail}*. Sekarang, masukkan *subjek* email.` }, { quoted: msg });
        await set(sender, 'sendemail_subject', handleSubjectInput, {
            dataTambahan: { emailData },
            extras: { set },
            timeout: 120000
        });
    } else {
        await sock.sendMessage(sender, { text: `📧 Siap mengirim email. Pertama, masukkan alamat *email tujuan*. Ketik *batal* kapan saja untuk membatalkan.` }, { quoted: msg });
        await set(sender, 'sendemail_to', handleEmailInput, {
            extras: { set },
            timeout: 120000
        });
    }
}
// --- END OF FILE: modules/tools/lemonmail.js ---