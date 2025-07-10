// /libs/apiUploader.js (VERSI PERBAIKAN)

import axios from 'axios';
import FormData from 'form-data';

/**
 * MENGGUNAKAN NAMA LAMA: uploadToSzyrine
 * FUNGSI INI TETAP DIPANGGIL OLEH SEMUA COMMAND SEPERTI BIASA.
 * 
 * Tapi secara internal, fungsi ini akan mengunggah ke CloudkuImages.
 * 
 * @param {Buffer} fileBuffer - Data file dalam bentuk Buffer.
 * @returns {Promise<string>} Sebuah Promise yang resolve dengan direct link ke file.
 * @throws {Error} Akan melempar error jika upload gagal.
 */
export async function uploadToSzyrine(fileBuffer) {
    console.log('[API UPLOADER] Memulai proses upload ke CloudkuImages (via legacy call)...');
    
    const fileName = 'upload.jpg'; // Nama file default
    const form = new FormData();
    form.append('file', fileBuffer, fileName);
    form.append('filename', fileName);

    try {
        const response = await axios.post(
            'https://cloudkuimages.guru/upload.php',
            form,
            {
                headers: { ...form.getHeaders() },
                timeout: 35000
            }
        );

        const data = response.data;

        // --- BAGIAN YANG DIPERBAIKI ---
        // Kita sekarang memeriksa di 'data.data.url' bukan 'data.result.url'
        if (data.status !== 'success' || !data.data?.url) {
            console.error('[API UPLOADER] Gagal upload, respons API tidak valid:', data);
            throw new Error(data.message || 'Gagal mengunggah file, respons API tidak sesuai.');
        }

        console.log('[API UPLOADER] Upload berhasil! Link:', data.data.url);
        
        // --- BAGIAN YANG DIPERBAIKI ---
        // Kita juga mengembalikan dari 'data.data.url'
        return data.data.url;

    } catch (error) {
        console.error('[API UPLOADER] Terjadi error saat upload:', error);
        if (error.response && error.response.data) {
             throw new Error(`Gagal menghubungi server upload: ${error.response.data.message || error.message}`);
        }
        throw new Error(`Gagal menghubungi server upload: ${error.message}`);
    }
}