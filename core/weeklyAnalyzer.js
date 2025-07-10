// core/weeklyAnalyzer.js
// Import fungsi dari localDataHandler
import { getWeeklyStatsLocal, updateAfterAnalysisLocal, incrementToxicStrikeLocal, getUserLocalData } from './localDataHandler.js';
import { analyzeWordsForRudeness } from '../ai/aira_gemini.js'; // Pastikan path ini benar
// Import helper anti-toxic
import { handleToxicUser } from './antiToxicHelper.js';

// Ambil konstanta dari config
import { MIN_WORDS_FOR_ANALYSIS, ANALYSIS_INTERVAL_MS, TOXIC_STRIKE_LIMIT_MUTE, TOXIC_STRIKE_LIMIT_BLOCK, MUTE_DURATION_SECONDS } from '../config.js'; // Ambil dari config

// Jalankan analisis mingguan. Menerima sock, jid (untuk kirim pesan), dan internalId.
export async function runWeeklyAnalysis(sock, jid, internalId) {
    try {
        // Ambil weekly stats dari data lokal
        const weeklyStats = getWeeklyStatsLocal(internalId);

        // Pastikan weeklyStats dan wordFrequency ada dan bukan objek kosong
        if (!weeklyStats || !weeklyStats.wordFrequency || Object.keys(weeklyStats.wordFrequency).length === 0) {
             const lastAnalysis = weeklyStats?.lastAnalysisTimestamp || 0;
             if (Date.now() - lastAnalysis >= ANALYSIS_INTERVAL_MS) { // Gunakan konstanta dari config
                 console.log(`[ANALYZER] Data kata sedikit atau kosong untuk ${jid} (internalId: ${internalId}). Mereset data weekly stats.`);
                 await updateAfterAnalysisLocal(internalId, []); // Reset jika sudah waktunya
             }
            return;
        }

        const wordsToAnalyze = Object.keys(weeklyStats.wordFrequency);
        const lastAnalysis = weeklyStats.lastAnalysisTimestamp || 0;
        const uniqueWordCount = wordsToAnalyze.length;

        // Cek apakah sudah waktunya analisis ATAU jumlah kata unik sudah sangat banyak
        // Agar tidak menunggu interval penuh jika user sangat aktif
        const isAnalysisTime = Date.now() - lastAnalysis >= ANALYSIS_INTERVAL_MS; // Gunakan konstanta dari config
        const isEnoughWords = uniqueWordCount >= MIN_WORDS_FOR_ANALYSIS; // Gunakan konstanta dari config
        const isVeryActive = uniqueWordCount >= MIN_WORDS_FOR_ANALYSIS * 5; // Contoh: ambang batas kata sangat banyak

        if (!isAnalysisTime && !isVeryActive) {
             // console.log(`[ANALYZER] Belum waktunya analisis (${(ANALYSIS_INTERVAL_MS - (Date.now() - lastAnalysis))/(1000 * 60 * 60)} jam lagi) atau kata terlalu sedikit (${uniqueWordCount}) untuk ${jid} (internalId: ${internalId}).`);
             // Reset jika sudah waktunya tapi kata sedikit
             if (isAnalysisTime && uniqueWordCount < MIN_WORDS_FOR_ANALYSIS) { // Gunakan konstanta dari config
                  console.log(`[ANALYZER] Data kata terlalu sedikit untuk ${jid} (internalId: ${internalId}), mereset data weekly stats.`);
                  await updateAfterAnalysisLocal(internalId, []); // Reset jika sudah waktunya
             }
            return;
        }

        if (!isEnoughWords && !isVeryActive) {
            console.log(`[ANALYZER] Terlalu sedikit kata unik (${uniqueWordCount}) untuk dianalisis bagi ${jid} (internalId: ${internalId}). Menunggu lebih banyak kata atau interval tercapai.`);
            // Biarkan data kata terkumpul
            return;
        }


        console.log(`[ANALYZER] Memulai analisis kata mingguan untuk ${jid} (internalId: ${internalId}, Kata Unik: ${uniqueWordCount})...`);
        const analysisResult = await analyzeWordsForRudeness(wordsToAnalyze);

        // Reset data mingguan SETELAH analisis, baik ada kata kasar atau tidak
        const rudeWordsFromAnalysis = (analysisResult.success && analysisResult.rudeWords) ? analysisResult.rudeWords : [];
        await updateAfterAnalysisLocal(internalId, rudeWordsFromAnalysis); // Simpan kata kasar yang ditemukan (atau array kosong)
        console.log(`[ANALYZER] Data weekly stats untuk ${jid} (internalId: ${internalId}) telah direset untuk siklus baru.`);


        if (analysisResult.success && analysisResult.rudeWords && analysisResult.rudeWords.length > 0) {
            console.log(`[ANALYZER] ${jid} (internalId: ${internalId}): Ditemukan ${analysisResult.rudeWords.length} kata kasar dari analisis mingguan: ${analysisResult.rudeWords.join(', ')}`);
            // Tambah strike menggunakan fungsi lokal
            const newStrikeCount = incrementToxicStrikeLocal(internalId);
            // Panggil helper toxic untuk menangani user
            // Perhatikan: Disini kita tidak tahu kata toxic spesifik di PESAN TERAKHIR,
            // jadi handleToxicUser dipanggil tanpa daftar kata spesifik dari pesan, hanya jumlah strike dan hasil analisis mingguan.
            await handleToxicUser(sock, internalId, jid, newStrikeCount, rudeWordsFromAnalysis);

        } else if (analysisResult.success) {
            // console.log(`[ANALYZER] Analisis selesai untuk ${jid} (internalId: ${internalId}). Tidak ditemukan kata kasar mingguan.`);
        } else {
            console.error(`[ANALYZER] Gagal mendapatkan hasil analisis untuk ${jid} (internalId: ${internalId}):`, analysisResult.error);
        }
    } catch (error) {
        console.error(`[ANALYZER] Error kritis saat analisis mingguan untuk ${jid} (internalId: ${internalId}):`, error);
    }
}