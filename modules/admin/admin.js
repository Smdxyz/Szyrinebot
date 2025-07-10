// --- START OF FILE modules/admin/admin.js ---
import { TIERS, TRIAL_CODE_SECRET } from '../../config.js';
import { getOrCreateUserBasicData } from '../../core/firebase.js';
import { getUserLocalData, updateUserLocalData } from '../../core/localDataHandler.js';
import crypto from 'crypto';

export default async function admin(sock, msg, args, text, sender, extras) {
    if (extras.localUserData.tier !== 'Admin') {
        return sock.sendMessage(sender, { text: '🚫 Perintah ini hanya untuk Admin Bot.' }, { quoted: msg });
    }

    const subCommand = args[0]?.toLowerCase();
    const reply = (text) => sock.sendMessage(sender, { text }, { quoted: msg });

    if (!subCommand || subCommand === 'help') {
        return reply(
`👑 *Menu Super Admin* 👑

Perintah yang tersedia:

1.  *!admin settier @user <tier>*
    ↳ _Mengatur tier premium permanen._
    _Contoh: \`!admin settier @user Gold\`_

2.  *!admin addenergy @user <jumlah>*
    ↳ _Menambahkan energi ke pengguna._

3.  *!admin generate <tier> <hari>*
    ↳ _Membuat kode trial unik._
    _Contoh: \`!admin generate Gold 7\`_
`
        );
    }
    
    const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const value = args[2];

    switch (subCommand) {
        case 'settier': {
            if (!mentionedJid || !value) return reply('Penggunaan: `!admin settier @user <tier>`');
            const tierName = Object.keys(TIERS).find(t => t.toLowerCase() === value.toLowerCase());
            if (!tierName) return reply(`Tier tidak valid. Pilihan: ${Object.keys(TIERS).join(', ')}`);
            const targetUser = await getOrCreateUserBasicData(mentionedJid, '');
            const targetData = getUserLocalData(targetUser.internalId, mentionedJid);
            targetData.tier = tierName;
            targetData.trial.tier = null; 
            targetData.trial.expiresAt = 0;
            updateUserLocalData(targetUser.internalId, targetData);
            await reply(`✅ Berhasil! Tier untuk @${mentionedJid.split('@')[0]} telah diatur permanen ke *${tierName}*.`);
            await sock.sendMessage(mentionedJid, { text: `🎉 Selamat! Tier Anda telah diupgrade oleh Admin menjadi *${tierName}*!` });
            break;
        }

        case 'addenergy': {
            if (!mentionedJid || !value) return reply('Penggunaan: `!admin addenergy @user <jumlah>`');
            const amount = parseInt(value, 10);
            if (isNaN(amount) || amount <= 0) return reply('Jumlah energi harus berupa angka positif.');
            const targetUser = await getOrCreateUserBasicData(mentionedJid, '');
            const targetData = getUserLocalData(targetUser.internalId, mentionedJid);
            targetData.energy += amount;
            updateUserLocalData(targetUser.internalId, targetData);
            await reply(`✅ Berhasil! *${amount} energi* telah ditambahkan untuk @${mentionedJid.split('@')[0]}. Total energi sekarang: ${targetData.energy}`);
            await sock.sendMessage(mentionedJid, { text: `⚡ Anda menerima *${amount} energi* dari Admin!` });
            break;
        }

        case 'generate': {
            const tier = args[1];
            const days = parseInt(args[2], 10);
            if (!tier || !days) return reply('Penggunaan: `!admin generate <tier> <hari>`');
            const tierKey = Object.keys(TIERS).find(t => t.toLowerCase() === tier.toLowerCase());
            if (!tierKey || tierKey === 'Admin' || tierKey === 'Basic') return reply(`Tier tidak valid. Pilihan: ${Object.keys(TIERS).filter(t => t !== 'Admin' && t !== 'Basic').join(', ')}`);
            if (isNaN(days) || days <= 0) return reply('Jumlah hari harus berupa angka positif.');
            
            const payload = { tier: tierKey, duration: days * 24 * 60 * 60 * 1000, iat: Date.now() };
            const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
            const signature = crypto.createHmac('sha256', TRIAL_CODE_SECRET).update(encodedPayload).digest('base64url');
            const generatedCode = `${encodedPayload}.${signature}`;

            await reply(`✅ Kode trial berhasil dibuat!\n\nTier: *${tierKey}*\nDurasi: *${days} hari*\n\nKode:\n\`${generatedCode}\`\n\nBerikan kode ini ke pengguna. Kode ini hanya bisa dipakai 1x oleh setiap pengguna.`);
            break;
        }

        default:
            return reply(`Sub-perintah tidak dikenali. Gunakan *!admin help* untuk melihat daftar perintah.`);
    }
}

export const category = 'admin';
export const description = 'Perintah khusus Admin untuk mengelola bot.';
export const usage = '!admin <sub-command>';
export const requiredTier = 'Admin';
// --- END OF FILE modules/admin/admin.js ---