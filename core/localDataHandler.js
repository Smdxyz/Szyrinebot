// core/localDataHandler.js (REVISI TOTAL DENGAN CACHE)
// Ini versi performa tinggi, anti lemot!

import fs from 'fs';
import path from 'path';
import {
    LOCAL_DATA_DIR,
    TIERS,
    INITIAL_ENERGY,
    ENERGY_RECHARGE_RATE_PER_HOUR,
    MAX_ENERGY_BY_TIER,
    BOT_OWNER
} from '../config.js';

const dataDirPath = path.resolve(LOCAL_DATA_DIR);
if (!fs.existsSync(dataDirPath)) { fs.mkdirSync(dataDirPath, { recursive: true }); }
const toxicWordsFilePath = path.resolve('./toxicWords.json');
let cachedToxicWords = null;

// ========================================================================
// INI DIA UPGRADE UTAMANYA: IN-MEMORY CACHE
// ========================================================================
const localUserDataCache = new Map(); // Cache untuk data user
const dirtyUsers = new Set(); // Set untuk menandai user mana yang datanya perlu disimpan
const SAVE_INTERVAL_MS = 5 * 60 * 1000; // Simpan data ke file setiap 5 menit
// ========================================================================

function loadToxicWords() { if (cachedToxicWords) return cachedToxicWords; try { if (fs.existsSync(toxicWordsFilePath)) { const rawData = fs.readFileSync(toxicWordsFilePath, 'utf-8'); cachedToxicWords = JSON.parse(rawData); return cachedToxicWords; } else { return []; } } catch (error) { return []; } }
function getLocalDataFilePath(internalId) { return path.join(dataDirPath, `${internalId}.json`); }

const defaultLocalUserData = {
    messageCount: 0,
    lastMessageTimestamp: 0,
    spamTracker: { timestamps: [] },
    weeklyStats: { wordFrequency: {}, lastAnalysisTimestamp: 0, rudeWordsFound: [] },
    toxicStrikes: 0,
    isMuted: false,
    muteExpiresAt: 0,
    tier: 'Basic',
    energy: INITIAL_ENERGY,
    lastEnergyRechargeTimestamp: Date.now(),
    rejectedCalls: 0,
    trial: {
        tier: null,
        expiresAt: 0
    },
    redeemedCodes: []
};

// Fungsi untuk membaca data dari file ke cache jika belum ada
function loadUserToCache(internalId, jid = '') {
    const filePath = getLocalDataFilePath(internalId);
    let userData;
    try {
        if (fs.existsSync(filePath)) {
            const rawData = fs.readFileSync(filePath, 'utf-8');
            const dataFromFile = JSON.parse(rawData);
            // Gabungkan dengan default untuk memastikan semua properti ada
            userData = { ...defaultLocalUserData, ...dataFromFile, trial: { ...defaultLocalUserData.trial, ...dataFromFile.trial } };
        } else {
            // Jika file tidak ada, buat data awal
            userData = { ...defaultLocalUserData };
            if (jid && BOT_OWNER.includes(jid.split('@')[0])) {
                userData.tier = 'Admin';
                userData.energy = MAX_ENERGY_BY_TIER['Admin'];
            }
            // Langsung tandai sebagai 'dirty' agar file baru dibuat saat penyimpanan berikutnya
            dirtyUsers.add(internalId); 
        }
    } catch (error) {
        console.error(`[LOCAL DATA] Gagal membaca/parse file untuk ${internalId}, menggunakan data default. Error:`, error);
        userData = { ...defaultLocalUserData };
        dirtyUsers.add(internalId);
    }
    
    // Simpan ke cache
    localUserDataCache.set(internalId, userData);
    return userData;
}


export function getUserLocalData(internalId, jid = '') {
    // 1. Cek di cache dulu (super cepat!)
    if (localUserDataCache.has(internalId)) {
        return localUserDataCache.get(internalId);
    }
    // 2. Jika tidak ada di cache, baca dari file, simpan ke cache, lalu kembalikan.
    return loadUserToCache(internalId, jid);
}

export function updateUserLocalData(internalId, data) {
    // HANYA UPDATE DI CACHE, JANGAN TULIS KE FILE LANGSUNG!
    localUserDataCache.set(internalId, data);
    // Tandai bahwa data user ini sudah berubah dan perlu disimpan nanti
    dirtyUsers.add(internalId);
}

/**
 * Menyimpan data dari user yang 'dirty' (berubah) dari cache ke file JSON.
 * Fungsi ini akan dipanggil secara berkala.
 */
async function saveDirtyDataToFile() {
    if (dirtyUsers.size === 0) {
        return; // Tidak ada yang perlu disimpan
    }

    console.log(`[LOCAL DATA] Menyimpan perubahan untuk ${dirtyUsers.size} user...`);
    const usersToSave = Array.from(dirtyUsers); // Salin set agar tidak terganggu proses lain
    dirtyUsers.clear(); // Langsung bersihkan set

    for (const internalId of usersToSave) {
        if (localUserDataCache.has(internalId)) {
            const userData = localUserDataCache.get(internalId);
            const filePath = getLocalDataFilePath(internalId);
            try {
                fs.writeFileSync(filePath, JSON.stringify(userData, null, 2), 'utf-8');
            } catch (error) {
                console.error(`❌ Gagal menulis data lokal untuk ${internalId}:`, error);
                // Jika gagal, kembalikan ke dirty set agar dicoba lagi nanti
                dirtyUsers.add(internalId);
            }
        }
    }
}

// Jadwalkan penyimpanan otomatis
setInterval(saveDirtyDataToFile, SAVE_INTERVAL_MS);

// Fungsi untuk menyimpan semua data saat bot mau mati (graceful shutdown)
export function saveAllDataOnExit() {
    console.log("[LOCAL DATA] Menerima sinyal shutdown, menyimpan semua data cache...");
    saveDirtyDataToFile();
    console.log("[LOCAL DATA] Penyimpanan selesai.");
}

// ========================================================================
// SISA FUNGSI-FUNGSI DI BAWAH INI TIDAK BERUBAH SECARA LOGIKA,
// MEREKA OTOMATIS AKAN MENGGUNAKAN SISTEM CACHE YANG BARU.
// ========================================================================

// (Semua fungsi lain seperti rechargeUserEnergy, deductUserEnergy, updateUserMessageStatsLocal, dll, tetap sama persis seperti di file asli lo. Tidak perlu diubah karena mereka semua sudah memanggil getUserLocalData dan updateUserLocalData yang baru)

export function rechargeUserEnergy(internalId) { const userData = getUserLocalData(internalId); const now = Date.now(); const lastRecharge = userData.lastEnergyRechargeTimestamp || now; const hoursPassed = (now - lastRecharge) / (1000 * 60 * 60); if (hoursPassed > 0) { const maxEnergy = MAX_ENERGY_BY_TIER[userData.tier] || MAX_ENERGY_BY_TIER['Basic']; if (userData.energy < maxEnergy) { const energyToAdd = Math.floor(hoursPassed * ENERGY_RECHARGE_RATE_PER_HOUR); if (energyToAdd > 0) { userData.energy = Math.min(maxEnergy, userData.energy + energyToAdd); userData.lastEnergyRechargeTimestamp = now; updateUserLocalData(internalId, userData); } } } return getUserLocalData(internalId); }
export function deductUserEnergy(internalId, amount) { const userData = getUserLocalData(internalId); if (userData.tier === 'Admin') return true; if (userData.energy >= amount) { userData.energy -= amount; updateUserLocalData(internalId, userData); return true; } return false; }
export function updateUserMessageStatsLocal(internalId, messageTimestamp) { const userData = getUserLocalData(internalId); userData.messageCount = (userData.messageCount || 0) + 1; userData.lastMessageTimestamp = messageTimestamp; const spamWindowMs = 35 * 1000; userData.spamTracker.timestamps = (userData.spamTracker?.timestamps || []).filter(ts => messageTimestamp - ts > -(spamWindowMs)); userData.spamTracker.timestamps.push(messageTimestamp); updateUserLocalData(internalId, userData); return userData; }
export function incrementToxicStrikeLocal(internalId) { const userData = getUserLocalData(internalId); userData.toxicStrikes = (userData.toxicStrikes || 0) + 1; const newStrikeCount = userData.toxicStrikes; updateUserLocalData(internalId, userData); return newStrikeCount; }
export function setUserMuteLocal(internalId, durationSeconds) { const userData = getUserLocalData(internalId); userData.isMuted = true; userData.muteExpiresAt = Date.now() + (durationSeconds * 1000); updateUserLocalData(internalId, userData); }
export function clearUserMuteLocal(internalId) { const userData = getUserLocalData(internalId); userData.isMuted = false; userData.muteExpiresAt = 0; updateUserLocalData(internalId, userData); }
export function logMessageWordsLocal(internalId, text) { if (!text || typeof text !== 'string') return; const userData = getUserLocalData(internalId); const words = text.toLowerCase().match(/\b(\w+)\b/g) || []; const stopWords = new Set(['di', 'ke', 'dari', 'dan', 'yg', 'ini', 'itu', 'sih', 'dong', 'kah', 'lah', 'aja', 'juga', 'kok', 'kan', 'deh', 'ya', 'ga', 'gak', 'nya', 'aku', 'kamu', 'bot', 'pepo']); const wordFrequency = userData.weeklyStats?.wordFrequency || {}; for (const word of words) { if (word.length > 2 && !stopWords.has(word) && isNaN(word)) { const sanitizedWord = word.replace(/[.#$[\]]/g, '_'); wordFrequency[sanitizedWord] = (wordFrequency[sanitizedWord] || 0) + 1; } } userData.weeklyStats.wordFrequency = wordFrequency; updateUserLocalData(internalId, userData); }
export function getWeeklyStatsLocal(internalId) { const userData = getUserLocalData(internalId); const weeklyStats = userData.weeklyStats || defaultLocalUserData.weeklyStats; return JSON.parse(JSON.stringify(weeklyStats)); }
export function updateAfterAnalysisLocal(internalId, rudeWordsArray) { const userData = getUserLocalData(internalId); if (!userData.weeklyStats) userData.weeklyStats = defaultLocalUserData.weeklyStats; userData.weeklyStats.wordFrequency = {}; userData.weeklyStats.lastAnalysisTimestamp = Date.now(); userData.weeklyStats.rudeWordsFound = rudeWordsArray || []; updateUserLocalData(internalId, userData); }
export function checkMessageForToxicWords(internalId, text) { if (!text || typeof text !== 'string' || text.trim().length === 0) { return { strikeAdded: false, newStrikeCount: getUserLocalData(internalId).toxicStrikes, foundWords: [] }; } const toxicWordsList = loadToxicWords(); if (toxicWordsList.length === 0) { return { strikeAdded: false, newStrikeCount: getUserLocalData(internalId).toxicStrikes, foundWords: [] }; } const wordsInMessage = text.toLowerCase().match(/\b(\w+)\b/g) || []; const foundToxicWords = wordsInMessage.filter(word => toxicWordsList.includes(word)); if (foundToxicWords.length > 0) { const newStrikeCount = incrementToxicStrikeLocal(internalId); return { strikeAdded: true, newStrikeCount: newStrikeCount, foundWords: foundToxicWords }; } return { strikeAdded: false, newStrikeCount: getUserLocalData(internalId).toxicStrikes, foundWords: [] }; }
export function incrementRejectedCallsLocal(internalId) { const userData = getUserLocalData(internalId); userData.rejectedCalls = (userData.rejectedCalls || 0) + 1; updateUserLocalData(internalId, userData); }
export async function checkTrialExpiration(sock, internalId, jid) { const userData = getUserLocalData(internalId, jid); if (userData.trial && userData.trial.expiresAt > 0) { if (Date.now() > userData.trial.expiresAt) { const expiredTier = userData.trial.tier; console.log(`[TRIAL] Trial ${expiredTier} untuk user ${internalId} telah berakhir.`); userData.tier = 'Basic'; userData.trial.tier = null; userData.trial.expiresAt = 0; updateUserLocalData(internalId, userData); try { await sock.sendMessage(jid, { text: `Waktu habis! ⏰\n\nMasa trial untuk tier *${expiredTier}* Anda telah berakhir. Tier Anda telah kembali ke *Basic*.` }); } catch (e) { console.error(`[TRIAL] Gagal mengirim notifikasi trial berakhir ke ${jid}:`, e); } return true; } } return false; }