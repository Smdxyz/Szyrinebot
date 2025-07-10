// /modules/downloaders/pinterest.js (Versi FINAL FIX - Anti Typo)

import { BOT_PREFIX, WATERMARK } from '../../config.js';
import { safeApiGet } from '../../libs/apiHelper.js';
import axios from 'axios';

export const category = 'downloaders';
export const description = 'Mencari gambar dari Pinterest dengan berbagai pilihan mode pencarian dan tampilan.';
export const usage = `${BOT_PREFIX}pinterest <query>`;
export const aliases = ['pin'];
export const energyCost = 2;

// ---- FUNGSI-FUNGSI HELPER (PEMBANTU) ----

async function getImageBuffer(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(response.data, 'binary');
    } catch (error) {
        console.warn(`[PINTEREST] Gagal unduh gambar: ${url}`, error.message);
        return null;
    }
}

async function fetchPinterestData(query, mode) {
    let pins = [];
    if (mode === 'simple_search') {
        const apiUrl = `https://szyrineapi.biz.id/api/downloaders/pinterest/search?q=${encodeURIComponent(query)}&count=10`;
        const result = await safeApiGet(apiUrl);
        if (!result || !Array.isArray(result)) throw new Error("API Pencarian Cepat tidak memberikan hasil yang valid.");
        pins = result.map(url => ({ imageUrl: url, title: query, author: 'Pinterest' }));
    } else {
        const count = mode.includes('10') ? 10 : 5;
        const apiUrl = `https://szyrineapi.biz.id/api/downloaders/pinterest/search-v2?q=${encodeURIComponent(query)}&count=${count}`;
        const result = await safeApiGet(apiUrl);
        const pinData = result?.result?.pins;
        if (!pinData || !Array.isArray(pinData)) throw new Error("API Pencarian Detail tidak memberikan hasil yang valid.");
        pins = pinData.map(pin => ({
            imageUrl: pin.media.images.orig.url,
            title: pin.title || pin.description || query,
            author: pin.uploader.username || 'Unknown'
        }));
    }
    if (pins.length === 0) throw new Error("Nggak nemu gambar sama sekali buat query itu.");
    return pins;
}

// ---- FUNGSI-FUNGSI UNTUK MENGIRIM PESAN (TAMPILAN) ----

async function sendAsAlbum(sock, msg, pins, query) {
    const sender = msg.key.remoteJid;
    const albumItems = [];
    for (const pin of pins) {
        const buffer = await getImageBuffer(pin.imageUrl);
        if (buffer) {
            const caption = albumItems.length === 0 ? `🖼️ Ini dia album buat: *"${query}"*` : '';
            albumItems.push({ image: buffer, caption });
        }
    }
    if (albumItems.length === 0) throw new Error("Gagal download semua gambar buat dijadiin album.");
    await sock.sendAlbumMessage(sender, albumItems, { quoted: msg });
}

async function sendAsCarousel(sock, msg, pins, query) {
    const sender = msg.key.remoteJid;
    const cards = [];
    const waChannelLink = "https://whatsapp.com/channel/0029VbBGIQE5K3zOmOXl6y0t";

    for (const pin of pins) {
        if (pin.imageUrl) {
            cards.push({
                image: { url: pin.imageUrl },
                title: pin.title || query,
                buttons: [{
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({ display_text: "Kunjungi Channel Developer", url: waChannelLink })
                }]
            });
        }
    }
    if (cards.length === 0) throw new Error("Gagal memuat gambar untuk ditampilkan di kartu geser.");
    await sock.sendMessage(sender, {
        text: `✅ *Sukses!* Ini hasil buat *"${query}"* dalam format kartu.\n\nGeser ke kanan-kiri buat liat semua gambar. 👉`,
        footer: WATERMARK,
        cards: cards
    }, { quoted: msg });
}

// ---- FUNGSI-FUNGSI HANDLER UNTUK SETIAP LANGKAH (WAIT STATE) ----

async function handleDisplayModeSelection(sock, msg, body, waitState) {
    const sender = msg.key.remoteJid;
    const { query, pins, statusMsgKey } = waitState.dataTambahan;
    const displayModeText = body === 'display_album' ? 'Album Galeri' : 'Kartu Geser';

    try {
        await sock.sendMessage(sender, { text: `🎨 Oke! Siap-siap, aku lagi nyiapin hasil dalam format *${displayModeText}*...` }, { edit: statusMsgKey });
        if (body === 'display_album') {
            await sendAsAlbum(sock, msg, pins, query);
        } else if (body === 'display_carousel') {
            await sendAsCarousel(sock, msg, pins, query);
        } else {
            return;
        }
        await sock.sendMessage(sender, { text: `✅✨ *Selesai!* Hasil pencarian kamu udah berhasil dikirim.` }, { edit: statusMsgKey });
    } catch (error) {
        await sock.sendMessage(sender, { text: `❌ Aduh, gagal pas mau nampilin hasil: ${error.message}` }, { edit: statusMsgKey });
    }
}

async function handleSearchModeSelection(sock, msg, body, waitState) {
    const sender = msg.key.remoteJid;
    const { set: setWaitingState } = waitState.extras;
    const { query, statusMsgKey } = waitState.dataTambahan;
    
    try {
        await sock.sendMessage(sender, { text: `🔎 Oke, lagi nyari *"${query}"* di Pinterest... Proses ini mungkin butuh beberapa detik!` }, { edit: statusMsgKey });
        const fetchedPins = await fetchPinterestData(query, body);
        await sock.sendMessage(sender, { text: `✅ *Berhasil!* Nemu *${fetchedPins.length}* gambar. Sekarang, mau ditampilin gimana?` }, { edit: statusMsgKey });
        
        const listRows = [
            { title: "Album Galeri", description: "Tampilan standar, semua gambar dikirim.", rowId: "display_album" },
            { title: "Kartu Geser (Keren)", description: "Tampilan interaktif, bisa digeser-geser.", rowId: "display_carousel" }
        ];
        const listMessage = {
            text: `Pilih cara nampilin hasilnya di bawah ini.`,
            footer: "Bot bakal ngirim hasilnya setelah kamu milih.",
            title: "🖼️ Pilih Format Tampilan 🖼️",
            buttonText: "Pilih Tampilan",
            sections: [{ title: "Opsi Tampilan", rows: listRows }]
        };
        const sentMsg = await sock.sendMessage(sender, listMessage, { quoted: msg });
        
        await setWaitingState(sender, 'pinterest_display', handleDisplayModeSelection, {
            dataTambahan: { query, pins: fetchedPins, statusMsgKey },
            extras: waitState.extras,
            originalMsgKey: sentMsg.key,
            timeout: 120000
        });
    } catch (error) {
        await sock.sendMessage(sender, { text: `❌ Gagal pas proses pencarian: ${error.message}` }, { edit: statusMsgKey });
    }
}

async function startSearchProcess(sock, msg, query, extras) {
    const { set: setWaitingState } = extras;
    const sender = msg.key.remoteJid;
    const statusMsg = await sock.sendMessage(sender, { text: `▶️ Oke, siap-siap nyari *"${query}"*...` }, { quoted: msg });
    
    const listRows = [
        { title: "Pencarian Cepat", description: "Hasil instan, nyari 10 gambar relevan.", rowId: "simple_search" },
        { title: "Pencarian Detail (5)", description: "Nyari 5 gambar dengan info lengkap.", rowId: "v2_search_5" },
        { title: "Pencarian Detail (10)", description: "Nyari 10 gambar dengan info lengkap.", rowId: "v2_search_10" },
    ];
    const listMessage = {
        text: `Mau pake mode pencarian yang mana nih?`,
        footer: "Bot akan mulai nyari setelah kamu milih.",
        title: "🔎 Mode Pencarian Pinterest 🔎",
        buttonText: "Pilih Mode",
        sections: [{ title: "Opsi Pencarian", rows: listRows }]
    };
    const sentMsg = await sock.sendMessage(sender, listMessage, { quoted: msg });

    await setWaitingState(sender, 'pinterest_search', handleSearchModeSelection, {
        dataTambahan: { query, statusMsgKey: statusMsg.key }, 
        extras,
        originalMsgKey: sentMsg.key,
        timeout: 120000
    });
}

async function handleQueryInput(sock, msg, body, waitState) {
    const query = body.trim();
    if (!query) {
        return sock.sendMessage(msg.key.remoteJid, { text: `😅 Yah, kamu nggak ngetik apa-apa. Mau nyari apa? Coba lagi.` }, { quoted: msg });
    }
    await startSearchProcess(sock, msg, query, waitState.extras);
}

export default async function execute(sock, msg, args, text, sender, extras) {
    const query = args.join(' ');
    if (query) {
        await startSearchProcess(sock, msg, query, extras);
    } else {
        await sock.sendMessage(sender, { text: `📌 Siap! Mau aku cariin gambar apa di Pinterest? Ketik aja di bawah ini ya.` }, { quoted: msg });
        await extras.set(sender, 'pinterest_query', handleQueryInput, { extras, timeout: 120000, originalMsgKey: msg.key });
    }
}