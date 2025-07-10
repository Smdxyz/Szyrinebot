// core/firebase.js (Sedikit Penyesuaian untuk Kejelasan)

import { initializeApp } from "@firebase/app";
import { getDatabase, ref, get, set } from "@firebase/database";
import { v4 as uuidv4 } from 'uuid';

// Konfigurasi Firebase lo (tetap sama)
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DB_URL,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app); // Ekspor `db` agar bisa dipakai di handler lain
console.log('🔥 Firebase Realtime Database nyambung.');

// Fungsi ini sekarang jadi bagian dari "Dunia Privat"
// Tugasnya cuma satu: jadi jembatan antara JID dan internalId.
function getUserMappingRef(jid) {
    const userId = jid.split('@')[0];
    // Simpan di path yang lebih jelas, misal 'users_mapping'
    return ref(db, `users_mapping/${userId}`);
}

/**
 * Mendapatkan atau membuat data dasar user (mapping JID ke internalId).
 */
export async function getOrCreateUserBasicData(jid, pushName) {
    const userRef = getUserMappingRef(jid);
    const snapshot = await get(userRef);

    if (snapshot.exists()) {
        const data = snapshot.val();
        // Cek jika user lama tapi belum punya internalId (migrasi)
        if (!data.internalId) {
            const newInternalId = uuidv4();
            await set(userRef, { internalId: newInternalId, username: data.username || pushName });
            console.log(`[FIREBASE] Menambahkan internalId baru untuk user lama ${jid}: ${newInternalId}`);
            return { internalId: newInternalId };
        }
        return { internalId: data.internalId };
    } else {
        // User baru
        const newInternalId = uuidv4();
        const newUserData = {
            internalId: newInternalId,
            username: pushName || jid.split('@')[0]
        };
        await set(userRef, newUserData);
        console.log(`[FIREBASE] User baru dicatat: ${jid} dengan internalId: ${newInternalId}`);
        return { internalId: newInternalId };
    }
}