// --- START OF FILE config.js ---

// --- PENGATURAN BOT DASAR ---
export const BOT_NAME = 'SzyrineBotsID';
export const BOT_OWNER = ['6283125905220']; // GANTI DENGAN NOMOR WA OWNER ASLI KAMU
export const BOT_PREFIX = '.';
export const SESSION_NAME = 'session_szyrine';
export const ANTI_CALL = true;
export const BOT_MODE = 'private'; // 'public', 'private', 'self'

// --- KODE PAIRING ---
export const CUSTOM_PAIRING_CODE = "S4NNGNTG"; // Kamu bisa ganti jika mau

// --- ANTI-SPAM & SIMILARITY ---
export const SPAM_MESSAGE_LIMIT = 15;
export const SPAM_WINDOW_SECONDS = 35;
export const SIMILARITY_THRESHOLD = 0.65;

// --- API KEYS ---
export const API_KEY_SZYRINE = 'szyn21'; // Pastikan API key ini valid

// --- PESAN & WATERMARK ---
export const WATERMARK = '© 2025 SzyrineBotsID';
export const WAIT_MESSAGE = '⏳ Sebentar ya, lagi ngambil data...';

// --- PENGATURAN ANTI-TOXIC ---
export const TOXIC_STRIKE_LIMIT_MUTE = 5;
export const TOXIC_STRIKE_LIMIT_BLOCK = 9;
export const MUTE_DURATION_SECONDS = 3600; // 1 jam
export const ADMIN_CONTACT_FOR_UNBAN = '6281234567890'; // GANTI DENGAN NOMOR ADMIN/OWNER ASLI
export const OWNER_USERNAMES_FOR_UNBAN = ['Szyrine']; // GANTI DENGAN NAMA OWNER/ADMIN

// --- PENGATURAN WEEKLY ANALYZER ---
export const MIN_WORDS_FOR_ANALYSIS = 5;
export const ANALYSIS_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

// --- LOKASI DATA LOKAL ---
export const LOCAL_DATA_DIR = './local_user_data';

// --- SISTEM TRIAL ---
export const DEFAULT_TRIAL_CODE = 'SZYRINETRIAL';
export const DEFAULT_TRIAL_TIER = 'Silver';
export const DEFAULT_TRIAL_DURATION_DAYS = 3;
export const TRIAL_CODE_SECRET = 'KunciRahasiaSzyrineBotsIDSuperGacorGabolehBocor';

// --- SISTEM TIER & ENERGI ---
export const TIERS = {
    'Basic':    { level: 0, name: 'Basic' },
    'Silver':   { level: 1, name: 'Silver' },
    'Gold':     { level: 2, name: 'Gold' },
    'Platinum': { level: 3, name: 'Platinum' },
    'Diamond':  { level: 4, name: 'Diamond' },
    'Admin':    { level: 99, name: 'Admin' }
};
export const INITIAL_ENERGY = 25;
export const MAX_ENERGY_BY_TIER = {
    'Basic': 50,
    'Silver': 100,
    'Gold': 150,
    'Platinum': 200,
    'Diamond': 300,
    'Admin': 9999
};
export const ENERGY_RECHARGE_RATE_PER_HOUR = 10;

// =================================================================
// ========= PENGATURAN BARU: AUTO-UPDATE COMMANDS =========
// =================================================================

// Ganti dengan URL raw dari repo GitHub Anda.
// Format: https://raw.githubusercontent.com/<USERNAME>/<REPO_NAME>/<BRANCH>/
export const COMMAND_UPDATE_BASE_URL = 'https://raw.githubusercontent.com/Smdzyz/Szyrinebot/main/';
// --- END OF FILE config.js ---