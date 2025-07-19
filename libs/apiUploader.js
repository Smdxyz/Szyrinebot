// /libs/apiUploader.js (VERSI DIPERBAIKI)

import axios from 'axios';
import FormData from 'form-data';

/**
 * MENGGUNAKAN NAMA LAMA: uploadToSzyrine
 * FUNGSI INI TETAP DIPANGGIL OLEH SEMUA COMMAND SEPERTI BIASA.
 * 
 * Secara internal, fungsi ini akan mengunggah file ke endpoint /api/fileHost/upload
 * sesuai dengan dokumentasi yang diberikan.
 * 
 * @param {Buffer} fileBuffer - Data file dalam bentuk Buffer.
 * @returns {Promise<string>} Sebuah Promise yang resolve dengan direct link ke file.
 * @throws {Error} Akan melempar error jika upload gagal.
 */
export async function uploadToSzyrine(fileBuffer) {
    console.log('[API UPLOADER] Memulai proses upload ke Szyrine File Host...');
    
    const form = new FormData();
    form.append('file', fileBuffer, 'upload.jpg'); 
    form.append('expiry', '1h');

    try {
        const response = await axios.post(
            'https://szyrineapi.biz.id/api/fileHost/upload',
            form,
            {
                headers: {
                    ...form.getHeaders(),
                },
                timeout: 35000 // Timeout 35 detik
            }
        );

        const data = response.data;

        // --- PERBAIKAN VALIDASI ---
        // Pengecekan disesuaikan dengan format respons baru.
        // Kita cek status code 200, lalu success: true di dalam result, dan pastikan directLink ada.
        if (data.status !== 200 || data.result?.success !== true || !data.result?.directLink) {
            console.error('[API UPLOADER] Gagal upload, respons API tidak valid:', data);
            // Gunakan message dari API jika ada, jika tidak, gunakan pesan default.
            throw new Error(data.result?.message || data.message || 'Gagal mengunggah file, respons API tidak sesuai.');
        }

        const directLink = data.result.directLink;
        console.log('[API UPLOADER] Upload berhasil! Link:', directLink);
        
        // Mengembalikan directLink sesuai yang diharapkan command lain.
        return directLink;

    } catch (error) {
        console.error('[API UPLOADER] Terjadi error saat upload:', error);
        if (error.response && error.response.data) {
             // Coba cari pesan error yang lebih spesifik di dalam respons
             const errorMessage = error.response.data.result?.message || error.response.data.message || error.message;
             throw new Error(`Gagal menghubungi server upload: ${errorMessage}`);
        }
        throw new Error(`Gagal menghubungi server upload: ${error.message}`);
    }
}