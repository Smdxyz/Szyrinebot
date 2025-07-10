// --- START OF FILE: modules/tools/pln.js ---

// /modules/tools/pln.js (Cek Tagihan PLN Pascabayar)

import { BOT_PREFIX } from '../../config.js';
import { safeApiGet } from '../../libs/apiHelper.js';

export const category = 'tools';
export const description = 'Mengecek tagihan listrik PLN Pascabayar berdasarkan ID Pelanggan.';
export const usage = `${BOT_PREFIX}pln <id_pelanggan>`;
export const aliases = ['tagihanpln'];
export const requiredTier = 'Basic'; // Tier yang dibutuhkan
export const energyCost = 5;         // Biaya energi per penggunaan

const API_URL = 'https://szyrineapi.biz.id/api/tools/pln';

const ADMIN_FEES_INFO = {
  "pembayaran_listrik_pascabayar": [
    { "layanan": "DANA", "biaya_admin": 1500 }, { "layanan": "OVO", "biaya_admin": 1500 },
    { "layanan": "Jenius (BTPN)", "biaya_admin": 2000 }, { "layanan": "GoPay", "biaya_admin": 2000 },
    { "layanan": "Blibli", "biaya_admin": 3500 }, { "layanan": "LinkAja", "biaya_admin": 5000 },
  ],
  "update": "2025-07-25"
};

function formatAdminFees() {
    let feeText = '*- Informasi Biaya Admin (Estimasi) -*\n_Biaya dapat berubah sewaktu-waktu_\n\n';
    ADMIN_FEES_INFO.pembayaran_listrik_pascabayar
        .sort((a, b) => a.biaya_admin - b.biaya_admin)
        .forEach(item => {
            feeText += `• *${item.layanan}:* Rp ${item.biaya_admin.toLocaleString('id-ID')}\n`;
        });
    feeText += `\n_Data diperbarui: ${ADMIN_FEES_INFO.update}_`;
    return feeText.trim();
}

async function checkPlnBill(sock, msg, customerId) {
    const sender = msg.key.remoteJid;
    let processingMsg;
    try {
        processingMsg = await sock.sendMessage(sender, { text: `⏳ Sedang mengecek tagihan untuk ID *${customerId}*...` }, { quoted: msg });

        const normalizedId = customerId.replace(/\D/g, '');
        if (!/^\d{12}$/.test(normalizedId)) {
            throw new Error("Format ID Pelanggan tidak valid. Harap masukkan 12 digit angka.");
        }
        
        const result = await safeApiGet(`${API_URL}?id=${normalizedId}`);
        if (!result || !result.customer_id) {
            throw new Error(result.message || "Gagal mendapatkan data tagihan. Pastikan ID Pelanggan benar.");
        }

        if (result.total_bills === 0 || result.outstanding_balance.includes("0,00")) {
             const noBillText = `✅ *Tidak Ada Tagihan*\n\n*ID Pelanggan:* ${result.customer_id}\n*Nama:* ${result.customer_name}\n*Daya:* ${result.power_category}\n\nSaat ini tidak ada tagihan yang perlu dibayar untuk periode ini.`;
            await sock.sendMessage(sender, { text: noBillText.trim() }, { quoted: msg });
        } else {
            const billInfo = `💡 *Tagihan Ditemukan*\n\n*Nama Pelanggan:*\n${result.customer_name}\n\n*ID Pelanggan:*\n${result.customer_id}\n\n*Periode Tagihan:*\n${result.billing_period}\n\n*Total Tagihan:*\n*${result.outstanding_balance}*\n\n*Detail Tambahan:*\n- *Daya:* ${result.power_category}\n- *Total Tagihan Terhitung:* ${result.total_bills}\n- *Pembacaan Meter:* ${result.meter_reading}`;
            const adminFeeInfo = formatAdminFees();
            const fullMessage = `${billInfo.trim()}\n\n---------------------------------\n\n${adminFeeInfo}`;
            await sock.sendMessage(sender, { text: fullMessage }, { quoted: msg });
        }
    } catch (error) {
        console.error('[PLN] Gagal mengecek tagihan:', error);
        await sock.sendMessage(sender, { text: `❌ Gagal: ${error.message}` }, { quoted: msg });
    } finally {
        if (processingMsg) {
            await sock.sendMessage(sender, { delete: processingMsg.key });
        }
    }
}

async function handleIdInput(sock, msg, body) {
    const customerId = body.trim();
    if (!customerId) {
        return sock.sendMessage(msg.key.remoteJid, { text: "Anda tidak memasukkan ID Pelanggan. Coba kirim lagi." }, { quoted: msg });
    }
    await checkPlnBill(sock, msg, customerId);
}

export default async function execute(sock, msg, args, text, sender, extras) {
    const customerId = text.trim();
    if (customerId) {
        await checkPlnBill(sock, msg, customerId);
    } else {
        await sock.sendMessage(sender, { text: `Masukkan 12 digit ID Pelanggan PLN Anda untuk mengecek tagihan.` }, { quoted: msg });
        await extras.set(sender, 'pln_id', handleIdInput, {
            timeout: 60000
        });
    }
}
// --- END OF FILE: modules/tools/pln.js ---