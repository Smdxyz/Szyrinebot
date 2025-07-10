//--- START OF FILE callHandler.js ---

// core/callHandler.js
import { ANTI_CALL, BOT_NAME } from '../config.js';
// Import fungsi untuk mendapatkan internalId dari JID
import { getOrCreateUserBasicData } from './firebase.js';
// Import fungsi baru untuk mencatat panggilan dari data lokal
import { incrementRejectedCallsLocal } from './localDataHandler.js';

export async function handleIncomingCall(sock, callEvents) {
    if (!ANTI_CALL || !callEvents || callEvents.length === 0) {
        return;
    }

    for (const call of callEvents) {
        // Hanya proses panggilan masuk baru (status 'offer')
        if (call.id && call.from && call.status === 'offer') {
            const callId = call.id;
            const callFrom = call.from; // JID penelepon

            console.log(`📞 Menerima panggilan masuk dari ${callFrom} [ID: ${callId}]`);

            try {
                // Tolak panggilan
                await sock.rejectCall(callId, callFrom);
                console.log(`🚫 Panggilan dari ${callFrom} [ID: ${callId}] berhasil ditolak.`);

                // 1. Dapatkan internalId dari JID penelepon
                const { internalId } = await getOrCreateUserBasicData(callFrom, '');
                if (!internalId) {
                    console.warn(`[ANTI-CALL] Tidak bisa mendapatkan internalId untuk ${callFrom}, pencatatan panggilan dilewati.`);
                    continue; // Lanjut ke panggilan berikutnya jika ada
                }
                
                // 2. Catat panggilan yang ditolak ke data LOKAL
                await incrementRejectedCallsLocal(internalId);

                // Kirim pesan peringatan ke penelepon (dibuat lebih keren)
                await sock.sendMessage(callFrom, {
                    text: `Aduh, maaf banget! 📞\n\nAku cuma bot chat dan gabisa ngangkat telepon. Panggilan kamu udah aku tolak otomatis ya. Kalo ada perlu, langsung ketik aja di chat! 😉`
                });

            } catch (error) {
                console.error(`❌ Gagal menolak atau mencatat panggilan dari ${callFrom} [ID: ${callId}]:`, error);
            }
        }
    }
}
//--- END OF FILE callHandler.js ---