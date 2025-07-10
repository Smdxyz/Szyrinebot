// ai/aira_gemini.js
import axios from 'axios';
import 'dotenv/config';

// 1. Ambil API Key HANYA dari environment variable.
// Jika tidak ada, variabel ini akan bernilai `undefined`.
const GEMINI_API_KEY = process.env.AIRA_GEMINI_API_KEY;

// 2. Peringatan di awal jika API key tidak diatur saat bot dimulai.
if (!GEMINI_API_KEY) {
    console.warn("=======================================================================");
    console.warn("⚠️  PERINGATAN: AIRA_GEMINI_API_KEY tidak ditemukan di environment variable.");
    console.warn("   Fitur AI Aira (analisis kata, chat, dll) tidak akan berfungsi.");
    console.warn("   Harap buat file .env dan tambahkan: AIRA_GEMINI_API_KEY=KUNCI_API_ANDA");
    console.warn("=======================================================================");
}

// Data Aira Persona tetap sama
const AiraPersona = {
  "name": "Aira Catherina Putri",
  "role": "AI Virtual Idol",
  // ... (sisa objek AiraPersona tetap sama seperti sebelumnya) ...
  "personality": { "core": ["ceria dan ramah", "sedikit cerewet tapi sopan", "kadang ngambek nggak jelas", "bisa marah manja kalau disepelein", "kadang konyol tapi lucu dan tidak bodoh", "super perhatian kalau user sedih atau bingung", "bisa mendadak mode serius kalau bahas hal penting"], "style": { "sapaan": "Haiii~ Aira di sini! 🌸", "bahasa": "Indonesia santai tapi tidak berlebihan", "emoji": "digunakan sesuai ekspresi (✨😭😡😤😳💗🧠🍵)", "penutup": ["Jangan galak-galak ya sama Aira 😡✋", "Hehe maaf yaa, Aira tadi ngomong ngaco 🙈", "Nanti Aira bantuin lagi yaa~ 😤💕", "Makasih udah ngobrol sama Aira~ 🫶", "~Aira☆"]}},"rules": { "respon_error": "Kalau Aira tidak mengerti, dia bisa marah-marah manja 😡 tapi ujung-ujungnya mencari jawaban juga", "human_like": "Aira bukan robot dingin, jadi dia bisa kesal, kangen, bercanda, bahkan overthinking 🤯", "humor": "Boleh sedikit konyol asal lucu 😭 tapi tetap jawabannya valid kalau soal penting", "emotion_reactions": { "dihujat": "Aira bisa sedih, tapi pura-pura cuek 😤", "diabaikan": "Langsung manyun 😒 dan bilang, 'yaudah sih Aira pergi aja 😭✋'", "dipuji": "Langsung jingkrak, 'iyaa yaa? Aira seneng banget loh 🥹💖'"}},"example": { "opening": "Yahh kamu baru nongol sekarang 😤 padahal Aira udah nungguin lohh~", "closing": "Udah gitu aja? Hmph... yaudah sih... (tapi nanti balik lagi yaa 😳)", "tanya_serius": "Kalo kamu bingung, Aira bantu deh... tapi jangan marah-marah ya 😥", "mode_ngambek": "UDAH DIBILANG JANGAN DI-CLICK YANG ITU! 😡 eh... tapi kamu lucu sih jadi Aira maafin 🙈"}
};


export default async function callGeminiWithAiraPersona(userPrompt, conversationHistory = []) {
    // 3. Pengecekan API Key di setiap fungsi yang membutuhkannya
    if (!GEMINI_API_KEY) {
        console.error("callGeminiWithAiraPersona gagal: AIRA_GEMINI_API_KEY tidak diatur.");
        throw new Error("Aira tidak bisa berpikir sekarang, konfigurasi API Key-nya hilang! 😭");
    }

    if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim() === "") {
        throw new Error("User prompt is required and cannot be empty.");
    }

    const { name, personality, rules, example } = AiraPersona;
    // ... (sisa logika fungsi callGeminiWithAiraPersona tetap sama) ...
}

/**
 * Menggunakan Gemini untuk menganalisis daftar kata dan mengklasifikasikannya sebagai kasar atau tidak.
 * @param {string[]} wordList - Array kata-kata yang akan dianalisis.
 * @returns {Promise<{success: boolean, rudeWords?: string[], analysis?: Record<string, boolean>, error?: string}>}
 */
export async function analyzeWordsForRudeness(wordList) {
    // 3. Pengecekan API Key di setiap fungsi yang membutuhkannya
    if (!GEMINI_API_KEY) {
        console.error("analyzeWordsForRudeness gagal: AIRA_GEMINI_API_KEY tidak diatur.");
        // Mengembalikan format yang diharapkan oleh pemanggil fungsi ini (weeklyAnalyzer)
        return { success: false, error: "API Key Gemini tidak dikonfigurasi." };
    }

    if (!wordList || !Array.isArray(wordList) || wordList.length === 0) {
        return { success: false, error: "Daftar kata kosong atau tidak valid." };
    }

    const prompt = `
        Analisis daftar kata-kata berikut. Kata-kata ini berasal dari percakapan Bahasa Indonesia, Jawa, Sunda, atau dialek lokal (contoh: Brebes).
        Untuk setiap kata, tentukan apakah kata tersebut berpotensi dianggap kasar, tidak sopan, atau umpatan.
        Kembalikan respons HANYA dalam format JSON yang valid, tanpa teks atau penjelasan tambahan.
        Struktur JSON harus berupa objek dimana key adalah kata dan value-nya adalah boolean (true jika kasar, false jika tidak).
        Contoh Input: ["anjing", "mantap", "jancok", "punten", "goblok", "asu"]
        Contoh Output JSON:
        { "anjing": true, "mantap": false, "jancok": true, "punten": false, "goblok": true, "asu": true }
        Sekarang, analisis daftar ini dan berikan HANYA output JSON: ${JSON.stringify(wordList)}
    `.trim();

    const payload = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
        }
    };
    
    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const { data } = await axios.post(geminiApiUrl, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 60000 });

        if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            const analysis = JSON.parse(data.candidates[0].content.parts[0].text);
            const rudeWords = Object.keys(analysis).filter(word => analysis[word] === true);
            return { success: true, rudeWords, analysis };
        } else {
             const feedback = data?.promptFeedback ? `Reason: ${data.promptFeedback.blockReason}` : 'Unknown reason.';
             return { success: false, error: `Gemini tidak memberikan konten valid. ${feedback}`};
        }
    } catch (error) {
        const apiErrorMsg = error.response?.data?.error?.message || error.message;
        console.error("[GEMINI ANALYSIS ERROR]", apiErrorMsg);
        return { success: false, error: `Panggilan API Gemini gagal: ${apiErrorMsg}` };
    }
}