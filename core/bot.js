// core/bot.js

// Waktu ketika modul ini (dan diasumsikan bot) mulai dimuat.
// Ini akan memberikan timestamp saat file ini pertama kali di-resolve oleh Node.js,
// yang biasanya terjadi saat bot memulai dan memuat command.
export const BOT_START_TIME = Date.now();

// Variabel untuk menyimpan instance socket Baileys global.
// Diinisialisasi sebagai null. Modul lain bisa mengimpor dan menggunakan setSockInstance
// jika ada bagian dari sistem yang bisa menyediakannya.
// Untuk kasus menu.js, kita akan mengandalkan instance 'sock' yang diterima sebagai parameter.
export let sockInstance = null;

/**
 * Fungsi untuk mengatur instance socket Baileys global.
 * @param {any} instance Instance socket Baileys.
 */
export function setSockInstance(instance) {
    sockInstance = instance;
    // console.log("[core/bot.js] sockInstance global telah diatur.");
}

// console.log("[core/bot.js] Modul dimuat, BOT_START_TIME:", new Date(BOT_START_TIME).toISOString());