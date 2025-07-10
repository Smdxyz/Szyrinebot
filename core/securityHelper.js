// core/securityHelper.js (FILE BARU)
// Isinya semua alat keamanan buat Tiga Dunia kita.

import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// Ambil kunci dan garam dari environment variables. WAJIB DISET!
const CONFESS_SALT = process.env.CONFESS_SALT;
const MASTER_KEY = process.env.CONFESS_MASTER_KEY;

if (!CONFESS_SALT || !MASTER_KEY) {
    console.error("FATAL ERROR: CONFESS_SALT atau CONFESS_MASTER_KEY tidak ditemukan di file .env!");
    console.error("Bot tidak bisa berjalan dengan aman tanpa kunci ini. Harap set di file .env");
    process.exit(1); // Langsung matikan bot jika tidak aman.
}

if (MASTER_KEY.length !== 32) {
    console.error("FATAL ERROR: CONFESS_MASTER_KEY HARUS memiliki panjang 32 karakter persis!");
    process.exit(1);
}

const ALGORITHM = 'aes-256-gcm'; // Algoritma enkripsi modern yang aman
const IV_LENGTH = 16; // Panjang Initialization Vector untuk GCM

/**
 * Dunia Publik: Membuat ID Anonim yang konsisten dari JID.
 * Proses satu arah (Hashing). Tidak bisa dibalikkan.
 * @param {string} jid JID pengguna.
 * @returns {string} ID Anonim, contoh: 'anon-a3f5c1d8'.
 */
export function createAnonymousId(jid) {
    const hash = createHash('sha256').update(jid + CONFESS_SALT).digest('hex');
    return `anon-${hash.substring(0, 8)}`;
}

/**
 * Dunia Ekstra Privat: Mengenkripsi data (JID) agar aman disimpan di DB.
 * Proses dua arah, tapi hanya bisa dibuka dengan MASTER_KEY.
 * @param {string} text Data yang mau dienkripsi (JID asli).
 * @returns {string} String terenkripsi dalam format hex.
 */
export function encryptJid(text) {
    try {
        const iv = randomBytes(IV_LENGTH);
        const cipher = createCipheriv(ALGORITHM, Buffer.from(MASTER_KEY), iv);
        const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();

        // Gabungkan iv, authTag, dan data terenkripsi jadi satu string hex
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
    } catch (error) {
        console.error("[SECURITY HELPER] Gagal mengenkripsi JID:", error);
        return null;
    }
}

/**
 * Dunia Ekstra Privat: Membuka data terenkripsi (JID) dari DB.
 * Hanya bisa dilakukan oleh bot yang punya MASTER_KEY.
 * @param {string} encryptedText String terenkripsi dari fungsi encryptJid.
 * @returns {string|null} Data asli (JID) atau null jika gagal.
 */
export function decryptJid(encryptedText) {
    try {
        const parts = encryptedText.split(':');
        if (parts.length !== 3) {
            throw new Error("Format data terenkripsi tidak valid.");
        }

        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encryptedData = Buffer.from(parts[2], 'hex');

        const decipher = createDecipheriv(ALGORITHM, Buffer.from(MASTER_KEY), iv);
        decipher.setAuthTag(authTag);
        
        const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
        
        return decrypted.toString('utf8');
    } catch (error) {
        console.error("[SECURITY HELPER] Gagal mendekripsi JID:", error);
        // Gagal dekripsi bisa karena kunci salah atau data sudah diubah orang (tampered)
        return null;
    }
}