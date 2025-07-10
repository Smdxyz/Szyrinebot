// --- START OF FILE modules/main/redeem.js ---
import { DEFAULT_TRIAL_CODE, DEFAULT_TRIAL_TIER, DEFAULT_TRIAL_DURATION_DAYS, TRIAL_CODE_SECRET, TIERS } from '../../config.js';
import { getUserLocalData, updateUserLocalData } from '../../core/localDataHandler.js';
import crypto from 'crypto';

export default async function redeem(sock, msg, args, text, sender, extras) {
    const code = args[0];
    const { internalId } = extras;
    const reply = (text) => sock.sendMessage(sender, { text }, { quoted: msg });

    if (!code) {
        return reply(`Masukkan kode redeem.\n\nContoh:\n\`!redeem ${DEFAULT_TRIAL_CODE}\`\n\nAtau gunakan kode unik yang Anda dapat dari Admin.`);
    }
    
    let userData = getUserLocalData(internalId, sender);

    if (userData.trial.expiresAt > Date.now()) {
        const remainingTime = new Date(userData.trial.expiresAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        return reply(`Anda masih dalam masa trial *${userData.trial.tier}* hingga ${remainingTime}. Tunggu hingga trial berakhir untuk redeem kode lain.`);
    }

    if (code.toUpperCase() === DEFAULT_TRIAL_CODE) {
        if (userData.redeemedCodes.includes(DEFAULT_TRIAL_CODE)) {
            return reply('Anda sudah pernah menggunakan kode trial default ini.');
        }
        
        userData.tier = DEFAULT_TRIAL_TIER;
        userData.trial.tier = DEFAULT_TRIAL_TIER;
        userData.trial.expiresAt = Date.now() + (DEFAULT_TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
        userData.redeemedCodes.push(DEFAULT_TRIAL_CODE);

        updateUserLocalData(internalId, userData);
        const expireDate = new Date(userData.trial.expiresAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        return reply(`🎉 Selamat! Anda berhasil redeem trial *${DEFAULT_TRIAL_TIER}* selama *${DEFAULT_TRIAL_DURATION_DAYS} hari*.\n\nTrial akan berakhir pada: *${expireDate}*`);
    }

    try {
        const [encodedPayload, signature] = code.split('.');
        if (!encodedPayload || !signature) throw new Error();

        const expectedSignature = crypto.createHmac('sha256', TRIAL_CODE_SECRET).update(encodedPayload).digest('base64url');
        if (signature !== expectedSignature) throw new Error();

        const codeHash = crypto.createHash('sha256').update(code).digest('hex');
        if (userData.redeemedCodes.includes(codeHash)) {
            return reply('Anda sudah pernah menggunakan kode spesifik ini.');
        }

        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8'));
        const { tier, duration } = payload;
        if (!TIERS[tier]) throw new Error();

        const days = Math.round(duration / (24 * 60 * 60 * 1000));

        userData.tier = tier;
        userData.trial.tier = tier;
        userData.trial.expiresAt = Date.now() + duration;
        userData.redeemedCodes.push(codeHash);

        updateUserLocalData(internalId, userData);
        const expireDate = new Date(userData.trial.expiresAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        return reply(`🎉 Selamat! Anda berhasil redeem trial *${tier}* selama *${days} hari*.\n\nTrial akan berakhir pada: *${expireDate}*`);

    } catch (error) {
        return reply('Kode yang Anda masukkan tidak valid, rusak, atau sudah kedaluwarsa.');
    }
}

export const category = 'main';
export const description = 'Menebus kode untuk mendapatkan akses premium sementara.';
export const usage = '!redeem <code>';
// --- END OF FILE modules/main/redeem.js ---