// core/callHandler.js (Final Version)
import { ANTI_CALL } from '../config.js';
import { getOrCreateUserBasicData } from './firebase.js';
import { incrementRejectedCallsLocal } from './localDataHandler.js';

export async function handleIncomingCall(sock, callEvents) {
    if (!ANTI_CALL || !callEvents || callEvents.length === 0) {
        return;
    }

    for (const call of callEvents) {
        if (call.id && call.from && call.status === 'offer') {
            const callId = call.id;
            const callFrom = call.from;

            console.log(`📞 Menerima panggilan masuk dari ${callFrom} [ID: ${callId}]`);

            try {
                await sock.rejectCall(callId, callFrom);
                console.log(`🚫 Panggilan dari ${callFrom} [ID: ${callId}] berhasil ditolak.`);

                const { internalId } = await getOrCreateUserBasicData(callFrom, '');
                if (internalId) {
                    await incrementRejectedCallsLocal(internalId);
                } else {
                    console.warn(`[ANTI-CALL] Tidak bisa mendapatkan internalId untuk ${callFrom}, pencatatan panggilan dilewati.`);
                }
                
                await sock.sendMessage(callFrom, {
                    text: `Aduh, maaf banget! 📞\n\nAku cuma bot chat dan gabisa ngangkat telepon. Panggilan kamu udah aku tolak otomatis ya. Kalo ada perlu, langsung ketik aja di chat! 😉`
                });

            } catch (error) {
                console.error(`❌ Gagal menolak atau mencatat panggilan dari ${callFrom} [ID: ${callId}]:`, error);
            }
        }
    }
}