// /libs/apiUploader.js (VERSI BARU - MENGGUNAKAN API DARI SCREENSHOT)

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
    // Sesuai dokumentasi, parameter file harus ada.
    form.append('file', fileBuffer, 'upload.jpg'); 
    // Sesuai dokumentasi, ada parameter opsional 'expiry'. Kita set default ke 1 jam.
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

        // Berdasarkan dokumentasi, hasil link ada di dalam `result.directLink`
        if (data.status !== 'success' || !data.result?.directLink) {
            console.error('[API UPLOADER] Gagal upload, respons API tidak valid:', data);
            throw new Error(data.message || 'Gagal mengunggah file, respons API tidak sesuai.');
        }

        const directLink = data.result.directLink;
        console.log('[API UPLOADER] Upload berhasil! Link:', directLink);
        
        // Mengembalikan directLink sesuai yang diharapkan command lain.
        return directLink;

    } catch (error) {
        console.error('[API UPLOADER] Terjadi error saat upload:', error);
        if (error.response && error.response.data) {
             throw new Error(`Gagal menghubungi server upload: ${error.response.data.message || error.message}`);
        }
        throw new Error(`Gagal menghubungi server upload: ${error.message}`);
    }
}