// /libs/apiHelper.js
// Pustaka ini berisi helper untuk melakukan panggilan API dengan aman dan tangguh.

import axios from 'axios';

// Timeout default kita perpanjang menjadi 5 MENIT (300,000 ms)
// Memberi waktu lebih banyak bagi API yang lambat untuk menyelesaikan tugasnya.
const DEFAULT_TIMEOUT = 300000; 

/**
 * Melakukan panggilan API GET dengan aman, lengkap dengan timeout yang lebih lama
 * dan penanganan error yang lebih informatif untuk pengguna.
 * @param {string} apiUrl - URL lengkap API yang akan dipanggil.
 * @returns {Promise<object>} Promise yang resolve dengan properti 'result' dari data JSON.
 * @throws {Error} Akan melempar error dengan pesan yang sudah ramah pengguna.
 */
export async function safeApiGet(apiUrl) {
    console.log(`[API HELPER] Calling: ${apiUrl.substring(0, 150)}...`);
    try {
        const response = await axios.get(apiUrl, { timeout: DEFAULT_TIMEOUT });
        const data = response.data;

        // Cek jika API-nya sendiri mengembalikan status error
        // Beberapa API Szyrine tidak punya 'status', langsung 'result'. Kita cek keberadaan 'result'.
        if (data.status && data.status !== 200 && !data.result) {
            throw new Error(data.message || `API merespons dengan status error: ${data.status}`);
        }
        
        // Hanya kembalikan bagian result yang penting
        return data.result || data; // Fallback ke data utuh jika tidak ada .result

    } catch (error) {
        console.error(`[API HELPER] Gagal melakukan GET request:`, error.message);
        
        // Terjemahkan error teknis menjadi pesan yang bisa dimengerti pengguna
        if (error.code === 'ECONNABORTED' || error.message.toLowerCase().includes('timeout')) {
            throw new Error('Server tujuan butuh waktu terlalu lama buat jawab (Timeout). Mungkin lagi sibuk berat, coba lagi nanti.');
        }
        if (error.response) { // Error yang memiliki respons dari server (spt 404, 502, 504)
            const statusCode = error.response.status;
            if (statusCode >= 500) { // 500, 502, 503, 504, etc.
                throw new Error(`Server tujuan lagi ada masalah internal (Error ${statusCode}). Coba lagi beberapa saat lagi.`);
            }
        }

        // Untuk semua error lainnya
        throw new Error(`Gagal nyambung ke server tujuan: ${error.message}`);
    }
}