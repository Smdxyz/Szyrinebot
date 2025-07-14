// core/handler.js (Final Version with All Fixes)
import { BOT_PREFIX, BOT_OWNER, BOT_MODE, SPAM_MESSAGE_LIMIT, SPAM_WINDOW_SECONDS, SIMILARITY_THRESHOLD, TIERS } from '../config.js';
import { getCommand, getCommandNames } from './commandRegistry.js';
import { checkWaitingState, setWaitingState, clearWaitingState, WAIT_TIMEOUT as DEFAULT_WAIT_TIMEOUT } from './waitStateHandler.js';
import { getOrCreateUserBasicData } from './firebase.js';
import { rechargeUserEnergy, deductUserEnergy, updateUserMessageStatsLocal, getUserLocalData, clearUserMuteLocal, logMessageWordsLocal, checkMessageForToxicWords, checkTrialExpiration } from './localDataHandler.js';
import { runWeeklyAnalysis } from './weeklyAnalyzer.js';
import { handleToxicUser } from './antiToxicHelper.js';
import axios from 'axios';
import stringSimilarity from 'string-similarity';

export async function handler(sock, m) {
    if (!m || !m.messages || m.messages.length === 0) return;
    const msg = m.messages[0];

    if (msg.key && msg.key.fromMe && BOT_MODE !== 'self') return;
    if (!msg.key || typeof msg.key.remoteJid !== 'string') return;

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
            await sock.sendMessage(sender, { text: `✅ Mode bisu kamu sudah berakhir. Sekarang kamu bisa nge-bot lagi!` }).catch(e => console.error(`[HANDLER] Gagal kirim pesan unmute ke ${sender}:`, e));
            localUserData = getUserLocalData(internalId, sender);
        } else {
            return;
        }
    }

    localUserData = updateUserMessageStatsLocal(internalId, messageTimestamp);
    
    const spamTimestamps = localUserData.spamTracker?.timestamps || [];
    if (spamTimestamps.filter(ts => Date.now() - ts < (SPAM_WINDOW_SECONDS * 1000)).length >= SPAM_MESSAGE_LIMIT) {
        return;
    }

    runWeeklyAnalysis(sock, sender, internalId);

    const messageContent = msg.message;
    if (!messageContent) return;
    
    let body = '';
    const simpleInteractiveResponse = messageContent.buttonsResponseMessage?.selectedButtonId || messageContent.templateButtonReplyMessage?.selectedId;
    const listResponse = messageContent.listResponseMessage?.singleSelectReply?.selectedRowId;
    
    if (simpleInteractiveResponse) body = simpleInteractiveResponse.trim();
    else if (listResponse) body = listResponse.trim();
    else {
        let textContent = messageContent.conversation || messageContent.extendedTextMessage?.text || messageContent.imageMessage?.caption || messageContent.videoMessage?.caption || '';
        if (messageContent.editedMessage?.message?.protocolMessage?.editedMessage) {
             const editedMsgProto = messageContent.editedMessage.message.protocolMessage.editedMessage;
             textContent = editedMsgProto.extendedTextMessage?.text || editedMsgProto.conversation || textContent;
        }
        body = textContent.trim();
    }
    
    if (await checkWaitingState(sock, msg, body, BOT_PREFIX)) {
         return; 
    }
    
    if (body.startsWith(BOT_PREFIX)) {
        let fullCmdString = body.slice(BOT_PREFIX.length).trim();
        const commandParts = fullCmdString.split(/ +/);
        const command = commandParts.shift().toLowerCase();
        const args = commandParts;
        
        const commandData = getCommand(command);

        if (commandData) {
            const senderJidOnly = sender.split('@')[0];
            if ((BOT_MODE === 'private' && !BOT_OWNER.includes(senderJidOnly)) || (BOT_MODE === 'self' && !msg.key.fromMe)) {
                return;
            }

            const { requiredTier, energyCost } = commandData;
            const userTier = localUserData.tier;
            const userEnergy = localUserData.energy;
            
            if (requiredTier) {
                const userTierLevel = TIERS[userTier]?.level ?? 0;
                const requiredTierLevel = TIERS[requiredTier]?.level ?? 99;
                if (userTierLevel < requiredTierLevel) {
                    await sock.sendMessage(sender, { text: `🚫 *Akses Terkunci!*\n\nFitur *${BOT_PREFIX}${command}* ini khusus untuk anggota tier *${requiredTier}* ke atas.\n\n✨ Tier kamu: *${userTier}*` }, { quoted: msg });
                    return;
                }
            }

            if (energyCost && energyCost > 0 && userTier !== 'Admin') {
                if (userEnergy < energyCost) {
                    await sock.sendMessage(sender, { text: `⚡ *Energi Kamu Habis!*\n\nButuh *${energyCost} energi*, tapi sisa *${userEnergy}*.\n\nEnergi akan terisi ulang otomatis. Coba lagi nanti!` }, { quoted: msg });
                    return;
                }
            }

            try {
                if (energyCost > 0 && userTier !== 'Admin') {
                    deductUserEnergy(internalId, energyCost);
                }
                
                await sock.sendPresenceUpdate('composing', sender);
                
                // --- THIS IS THE CRUCIAL FIX ---
                const extras = {
                    set: (jid, cmdName, nextStepFunc, opts = {}) => {
                        const waitStateOptions = { 
                            ...opts, 
                            extras: extras, // Pass 'extras' to the next step
                            originalMsgKey: opts.originalMsgKey || msg.key 
                        };
                        return setWaitingState(sock, jid, cmdName, nextStepFunc, waitStateOptions);
                    },
                    clear: clearWaitingState,
                    timeout: DEFAULT_WAIT_TIMEOUT,
                    internalId: internalId,
                    localUserData: localUserData,
                    getImageBufferFromUrl: async (url) => {
                        try { return (await axios.get(url, { responseType: 'arraybuffer' })).data; } catch { return null; }
                    }
                };

                await commandData.execute(sock, msg, args, args.join(" "), sender, extras);

                await sock.sendPresenceUpdate('paused', sender);

            } catch (error) {
                console.error(`[HANDLER] Error executing command '${BOT_PREFIX}${command}':`, error);
                await sock.sendMessage(sender, { text: `😥 Aduh, ada yang macet pas jalanin *${BOT_PREFIX}${command}*. Laporan sudah dikirim ke developer.` }, { quoted: msg });
            }
        } else {
            const commandNames = getCommandNames();
            if (commandNames.length > 0) {
               const { bestMatch } = stringSimilarity.findBestMatch(command, commandNames);
               if (bestMatch && bestMatch.rating >= SIMILARITY_THRESHOLD) {
                   await sock.sendMessage(sender, { text: `Command tidak ditemukan. Mungkin maksudmu: *${BOT_PREFIX}${bestMatch.target}*?` }, { quoted: msg });
               }
           }
        }
    }
}