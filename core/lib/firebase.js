// core/firebase.js

import { initializeApp } from "@firebase/app";
import { getDatabase, ref, get, set } from "@firebase/database";
import { v4 as uuidv4 } from 'uuid'; // Wajib ada buat ID unik

// Konfigurasi Firebase tetap sama
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyDpZ6-ywDBaOdtDE1N26ssA_XXPavd40Os",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "newproject28-7a278.firebaseapp.com",
  databaseURL: process.env.FIREBASE_DB_URL || "https://newproject28-7a278-default-rtdb.firebaseio.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "newproject28-7a278",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "newproject28-7a278.appspot.com",
  messagingSenderId: process.env.FIREBASE_SENDER_ID || "132651018149",
  appId: process.env.FIREBASE_APP_ID || "1:132651018149:web:df3f07f6e1f402b5336a4c"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
console.log('🔥 Firebase Realtime Database nyambung (buat ID doang).');

function getUserFirebaseRef(jid) {
    const userId = jid.split('@')[0];
    return ref(db, `users/${userId}`);
}

/**
 * Fungsi ini jadi jembatan antara JID WhatsApp dan internalId unik.
 * Kalo user baru, dia bakal dibikinin entri di Firebase dengan internalId baru.
 * Kalo user lama tapi belum punya internalId, bakal ditambahin.
 * Semua data lain disimpen di file JSON lokal.
 */
export async function getOrCreateUserBasicData(jid, pushName) {
    const userRef = getUserFirebaseRef(jid);
    const snapshot = await get(userRef);

    if (snapshot.exists()) {
        const data = snapshot.val();
        if (!data.internalId) {
            const newInternalId = uuidv4();
            data.internalId = newInternalId;
            // Cuma update username dan internalId, data lain gak diurus di sini
            const minimalData = { username: data.username, internalId: newInternalId };
            await set(userRef, minimalData);
            console.log(`[FIREBASE] Nambahin internalId baru buat user ${jid}: ${newInternalId}`);
            return { username: data.username, internalId: newInternalId };
        }
        return { username: data.username, internalId: data.internalId };
    } else {
        const newInternalId = uuidv4();
        const newUserData = {
            username: pushName || jid.split('@')[0],
            internalId: newInternalId
        };
        await set(userRef, newUserData);
        console.log(`[FIREBASE] User baru dicatet: ${jid} dengan internalId: ${newInternalId}`);
        return newUserData;
    }
}

// Fungsi lain (incrementRejectedCalls, dll) DIHAPUS dari sini karena pindah ke lokal.