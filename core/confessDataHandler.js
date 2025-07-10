// core/confessDataHandler.js (FILE BARU)
// Handler khusus untuk semua urusan data confess di Firebase.

import { getDatabase, ref, set, get, serverTimestamp } from "@firebase/database";
import { encryptJid, createAnonymousId } from './securityHelper.js';

// Impor instance `db` dari file firebase utama lo
// Pastikan path-nya bener ya.
import { db } from './firebase.js'; 

const confessRef = ref(db, 'confessions');

/**
 * Membuat entri confess baru di Firebase.
 * @param {string} authorJid JID asli pengirim.
 * @param {string} message Isi pesan confess.
 * @returns {Promise<{success: boolean, confessId?: string, anonymousId?: string, error?: string}>}
 */
export async function createConfession(authorJid, message) {
    try {
        // Dunia Ekstra Privat: Enkripsi JID asli
        const encryptedAuthorJid = encryptJid(authorJid);
        if (!encryptedAuthorJid) {
            throw new Error("Gagal mengenkripsi JID penulis.");
        }

        // Dunia Publik: Buat ID Anonim
        const anonymousId = createAnonymousId(authorJid);
        
        // Buat ID unik untuk confess ini
        const confessId = `C${Date.now()}${Math.random().toString(36).substring(2, 6)}`;
        
        const newConfessRef = ref(db, `confessions/${confessId}`);
        
        await set(newConfessRef, {
            authorAnonymousId: anonymousId,
            encryptedAuthorJid: encryptedAuthorJid,
            message: message,
            createdAt: serverTimestamp(), // Gunakan timestamp server Firebase
            participants: { // Catat siapa saja yang terlibat dalam thread ini
                [anonymousId]: true // Penulis asli otomatis jadi partisipan
            }
        });

        return { success: true, confessId, anonymousId };

    } catch (error) {
        console.error("[CONFESS HANDLER] Gagal membuat confess:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Mengambil data sebuah confess dari Firebase berdasarkan ID-nya.
 * @param {string} confessId ID confess yang mau diambil.
 * @returns {Promise<object|null>} Data confess atau null jika tidak ditemukan.
 */
export async function getConfession(confessId) {
    try {
        const snapshot = await get(ref(db, `confessions/${confessId}`));
        if (snapshot.exists()) {
            return snapshot.val();
        }
        return null;
    } catch (error) {
        console.error(`[CONFESS HANDLER] Gagal mengambil data confess ${confessId}:`, error);
        return null;
    }
}