// /core/handler.js (INI VERSI YANG BENAR)

import { BOT_PREFIX, BOT_OWNER, BOT_MODE, SPAM_MESSAGE_LIMIT, SPAM_WINDOW_SECONDS, SIMILARITY_THRESHOLD, WATERMARK, TIERS } from '../config.js';
import { getCommand, getCommandNames } from './commandRegistry.js';
import { checkWaitingState, setWaitingState, clearWaitingState, WAIT_TIMEOUT as DEFAULT_WAIT_TIMEOUT } from './waitStateHandler.js';
import { getOrCreateUserBasicData } from './firebase.js';
import {
    getUserLocalData,
    updateUserMessageStatsLocal,
    clearUserMuteLocal,
    logMessageWordsLocal,
    checkMessageForToxicWords,
    rechargeUserEnergy,
    deductUserEnergy,
    checkTrialExpiration
} from './localDataHandler.js';
import { runWeeklyAnalysis } from './weeklyAnalyzer.js';
import { handleToxicUser } from './antiToxicHelper.js';
import axios from 'axios';
import stringSimilarity from 'string-similarity';

export const WHATSAPP_MAX_MEDIA_SIZE_BYTES = 100 * 1024 * 1024;
export function parseSizeToBytes(sizeStr) { if (!sizeStr) return 0; const units = { 'KB': 1024, 'MB': 1024 * 1024, 'GB': 1024 * 1024 * 1024, 'TB': 1024 * 1024 * 1024 * 1024 }; const size = parseFloat(sizeStr); const unit = sizeStr.replace(/[^a-zA-Z]/g, '').toUpperCase(); if (isNaN(size)) return 0; if (units[unit]) return size * units[unit]; return size; }
export function formatBytes(bytes, decimals = 2) { if (bytes === 0) return '0 Bytes'; const k = 1024; const dm = decimals < 0 ? 0 : decimals; const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']; const i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]; }


export async function handler(sock, m) {
    if (!m || !m.messages || m.messages.length === 0) return;
    const msg = m.messages[0];

    if (msg.key && msg.key.fromMe && BOT_MODE !== 'self') return;
    if (!msg.key || typeof msg.key.remoteJid !== 'string' || !msg.key.remoteJid.includes('@')) {
        return;
    }

    const sender = msg.key.remoteJid;
    const messageTimestamp = msg.messageTimestamp ? (Number(msg.messageTimestamp) * 1000) : Date.now();
    const pushName = msg.pushName || sender.split('@')[0] || "Pengguna WhatsApp";

    const firebaseUserData = await getOrCreateUserBasicData(sender, pushName);
    const internalId = firebaseUserData.internalId;

    if (!internalId) return;
    
    await checkTrialExpiration(sock, internalId, sender);
    
    let localUserData = rechargeUserEnergy(internalId);

    if (localUserData.isMuted) {
        if (localUserData.muteExpiresAt < Date.now()) {
            await clearUserMuteLocal(internalId);
            await sock.sendMessage(sender, { text: `✅ Mode bisu kamu udah berakhir. Sekarang kamu bisa nge-bot lagi!` }).catch(e => console.error(`[HANDLER] Gagal kirim pesan unmute ke ${sender}:`, e));
            localUserData = getUserLocalData(internalId, sender);
        } else {
            return;
        }
    }

    localUserData = updateUserMessageStatsLocal(internalId, messageTimestamp);
    
    // ... (sisa logika anti-spam, dll tidak perlu diubah) ...
    const spamTimestamps = localUserData.spamTracker?.timestamps || [];
    const recentTimestamps = spamTimestamps.filter(ts => Date.now() - ts < (SPAM_WINDOW_SECONDS * 1000));
    if (recentTimestamps.length >= SPAM_MESSAGE_LIMIT) {
        return;
    }

    runWeeklyAnalysis(sock, sender, internalId);

    const messageContent = msg.message;
    if (!messageContent) return;
    // ... (sisa logika parsing body tidak perlu diubah) ...
    let body = '';
    let command = '';
    let args = [];
    let textContentForLog = '';
    const simpleInteractiveResponse = messageContent.buttonsResponseMessage?.selectedButtonId || messageContent.templateButtonReplyMessage?.selectedId;
    const listResponse = messageContent.listResponseMessage?.singleSelectReply?.selectedRowId;
    let nativeFlowResponse = null;
    if (messageContent.extendedTextMessage?.text) {
        const context = messageContent.extendedTextMessage.contextInfo;
        if (context?.quotedMessage?.message?.interactiveMessage?.nativeFlowMessage) {
            try {
                const paramsJson = JSON.parse(context.quotedMessage.message.interactiveMessage.nativeFlowMessage.paramsJson || '{}');
                 if (paramsJson.id) nativeFlowResponse = paramsJson.id;
                 else if (paramsJson.buttonId) nativeFlowResponse = paramsJson.buttonId;
            } catch (e) { console.error("[HANDLER] Error parsing Native Flow context:", e); }
        }
    }
    if (messageContent.interactiveResponseMessage) {
        try {
            const paramsJson = JSON.parse(messageContent.interactiveResponseMessage.nativeFlowResponseMessage?.paramsJson || '{}');
             if (paramsJson.id) nativeFlowResponse = paramsJson.id;
             else if (paramsJson.buttonId) nativeFlowResponse = paramsJson.buttonId;
        } catch(e) { console.error("[HANDLER] Error parsing Interactive Response:", e); }
    }
    if (nativeFlowResponse) body = nativeFlowResponse.trim();
    else if (simpleInteractiveResponse) body = simpleInteractiveResponse.trim();
    else if (listResponse) body = listResponse.trim();
    else {
        let textContent = messageContent.conversation || messageContent.extendedTextMessage?.text || messageContent.imageMessage?.caption || messageContent.videoMessage?.caption || '';
        if (messageContent.editedMessage?.message?.protocolMessage?.editedMessage) {
             const editedMsgProto = messageContent.editedMessage.message.protocolMessage.editedMessage;
             textContent = editedMsgProto.extendedTextMessage?.text || editedMsgProto.conversation || textContent;
        }
        body = textContent.trim();
    }
    textContentForLog = messageContent.conversation || messageContent.extendedTextMessage?.text || messageContent.imageMessage?.caption || messageContent.videoMessage?.caption || '';
    if (messageContent.editedMessage?.message?.protocolMessage?.editedMessage) {
        const editedMsgProto = messageContent.editedMessage.message.protocolMessage.editedMessage;
        textContentForLog = editedMsgProto.extendedTextMessage?.text || editedMsgProto.conversation || textContentForLog;
    }
    textContentForLog = textContentForLog.trim();
    
    if (textContentForLog && textContentForLog.length > 0) {
        await logMessageWordsLocal(internalId, textContentForLog);
        const toxicCheckResult = checkMessageForToxicWords(internalId, textContentForLog);
        if (toxicCheckResult.strikeAdded) {
            handleToxicUser(sock, internalId, sender, toxicCheckResult.newStrikeCount, toxicCheckResult.foundWords);
        }
    }

    // `checkWaitingState` tidak perlu diubah, karena masalahnya ada di `setWaitingState`
    if (await checkWaitingState(sock, msg, body, BOT_PREFIX)) {
         return; 
    }
    
    if (body.startsWith(BOT_PREFIX)) {
        let fullCmdString = body.slice(BOT_PREFIX.length).trim();
        if (fullCmdString.startsWith('showcategory_')) {
            command = 'showcategory';
            args = [fullCmdString.substring('showcategory_'.length)];
        } else {
            const commandParts = fullCmdString.split(/ +/);
            command = commandParts.shift().toLowerCase();
            args = commandParts;
        }
        const commandData = getCommand(command);

        if (commandData) {
            // ... (logika cek owner & mode tidak perlu diubah) ...
             const senderJidOnly = sender.split('@')[0];
            if ((BOT_MODE === 'private' && !BOT_OWNER.includes(senderJidOnly)) || (BOT_MODE === 'self' && !msg.key.fromMe)) {
                return;
            }

            // ... (logika cek tier & energi tidak perlu diubah) ...
             const { requiredTier, energyCost } = commandData;
            const userTier = localUserData.tier;
            const userEnergy = localUserData.energy;
            
            if (requiredTier) {
                const userTierLevel = TIERS[userTier]?.level ?? 0;
                const requiredTierLevel = TIERS[requiredTier]?.level ?? 99;
                if (userTierLevel < requiredTierLevel) {
                    const tierMessage = `
🚫 *Akses Terkunci!* 🚫

Waduh, fitur keren *${BOT_PREFIX}${command}* ini khusus buat anggota tier *${requiredTier}* ke atas.

✨ Tier kamu saat ini: *${userTier}*

Upgrade tier kamu buat buka semua fitur sultan!
                    `.trim();
                    await sock.sendMessage(sender, { text: tierMessage }, { quoted: msg });
                    return;
                }
            }

            if (energyCost && energyCost > 0 && userTier !== 'Admin') {
                if (userEnergy < energyCost) {
                    const energyMessage = `
⚡ *Energi Kamu Low-batt!* ⚡

Hampir aja! Buat jalanin *${BOT_PREFIX}${command}*, kamu butuh *${energyCost} energi*, tapi energi kamu sisa *${userEnergy}*.

Tenang, energi bakal keisi ulang otomatis kok. Coba lagi beberapa saat lagi ya!
                    `.trim();
                    await sock.sendMessage(sender, { text: energyMessage }, { quoted: msg });
                    return;
                }
            }


            try {
                if (energyCost > 0 && userTier !== 'Admin') {
                    deductUserEnergy(internalId, energyCost);
                }
                
                await sock.sendPresenceUpdate('composing', sender);
                
                // ===========================================
                // INI BAGIAN PALING KRUSIAL YANG DIPERBAIKI
                // ===========================================
                const extras = {
                    set: (jid, cmdName, nextStepFunc, opts = {}) => {
                        const waitStateOptions = { 
                            ...opts, 
                            extras: extras, // <-- Kirim ulang 'extras' biar bisa diakses di step selanjutnya
                            originalMsgKey: opts.originalMsgKey || msg.key // Ambil dari opts atau fallback ke msg.key
                        };
                        // Sekarang kita panggil dengan BENAR, sock sebagai argumen pertama
                        return setWaitingState(sock, jid, cmdName, nextStepFunc, waitStateOptions);
                    },
                    clear: clearWaitingState,
                    timeout: DEFAULT_WAIT_TIMEOUT,
                    internalId: internalId,
                    localUserData: localUserData,
                    // Fungsi ini kita biarkan untuk kegunaan lain
                    getImageBufferFromUrl: async (url) => {
                        if (!url) return null;
                        try {
                            const res = await axios.get(url, { responseType: 'arraybuffer' });
                            return Buffer.from(res.data, 'binary');
                        } catch (e) {
                            return null;
                        }
                     }
                };

                await commandData.execute(sock, msg, args, args.join(" "), sender, extras);

                await sock.sendPresenceUpdate('paused', sender);

            } catch (error) {
                console.error(`[HANDLER] Error saat menjalankan command '${BOT_PREFIX}${command}':`, error);
                await sock.sendMessage(sender, { text: `Aduh, error bos! 😥 Ada yang macet pas jalanin perintah *${BOT_PREFIX}${command}*. Udah aku laporin ke developer kok.` }, { quoted: msg }).catch(sendError => {
                    console.error(`[HANDLER] Gagal mengirim pesan error ke user:`, sendError);
                });
            }
        } else {
             // ... (logika similarity tidak perlu diubah) ...
            const commandNames = getCommandNames();
            if (commandNames.length > 0) {
               const { bestMatch } = stringSimilarity.findBestMatch(command.toLowerCase(), commandNames);
               if (bestMatch && bestMatch.rating >= SIMILARITY_THRESHOLD) {
                   await sock.sendMessage(sender, { text: `Hmm, command-nya kurang pas. Mungkin maksudmu: *${BOT_PREFIX}${bestMatch.target}*?` }, { quoted: msg }).catch(e => console.error("[SIMILARITY] Gagal kirim saran:", e));
               }
           }
        }
    }
}