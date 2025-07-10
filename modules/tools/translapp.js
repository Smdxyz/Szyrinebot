// modules/tools/translapp.js

import axios from 'axios';
import { BOT_PREFIX } from '../../config.js';

export const category = 'tools';
export const description = 'Alat serbaguna untuk teks: terjemahkan, rangkum, ubah nada, dll.';
export const usage = `${BOT_PREFIX}translapp [teks yang ingin diproses]`;
export const aliases = ['tr', 'app'];
export const requiredTier = 'Silver'; // Tier yang dibutuhkan
export const energyCost = 15;        // Biaya energi per penggunaan

const API_URL = 'https://szyrineapi.biz.id/api/ai/translapp';

async function processRequest(sock, msg, text, module, to = null) {
    const sender = msg.key.remoteJid;
    let processingMsg;
    try {
        processingMsg = await sock.sendMessage(sender, { text: `⚙️ Memproses permintaan Anda untuk modul *${module}*...` }, { quoted: msg });

        const params = new URLSearchParams({ text, module });
        if (to) {
            params.append('to', to);
        }

        const response = await axios.get(`${API_URL}?${params.toString()}`);
        const data = response.data;
        
        if (response.status === 200 && data.result?.output) {
            const result = data.result;
            const replyText = `✅ *Hasil dari Modul ${result.module}:*\n\n- *Input:*\n${result.input}\n\n- *Output:*\n${result.output}`;
            await sock.sendMessage(sender, { text: replyText }, { quoted: msg });
        } else {
            throw new Error(data.message || 'Format respons API tidak valid.');
        }
        
    } catch (error) {
        console.error('[TRANSLAPP] Gagal saat processRequest:', error);
        await sock.sendMessage(sender, { text: `❌ Gagal memproses: ${error.message}` }, { quoted: msg });
    } finally {
        if (processingMsg) {
            await sock.sendMessage(sender, { delete: processingMsg.key });
        }
    }
}

async function handleParameterSelection(sock, msg, body, waitState) {
    const { text, module } = waitState.dataTambahan;
    const selectedParameter = body;
    await processRequest(sock, msg, text, module, selectedParameter);
}

async function handleModuleSelection(sock, msg, body, waitState) {
    const sender = msg.key.remoteJid;
    const { set: setWaitingState } = waitState.extras;
    const { text } = waitState.dataTambahan;
    const selectedModule = body;
    
    let options = [];
    let title = '';
    let description = '';

    switch (selectedModule) {
        case 'TRANSLATE':
            title = 'Pilih Bahasa Tujuan';
            description = 'Pilih bahasa target untuk terjemahan.';
            options = [
                { title: "Indonesia", rowId: "Indonesian" },
                { title: "Inggris", rowId: "English" },
                { title: "Jepang", rowId: "Japanese" },
                { title: "Korea", rowId: "Korean" },
                { title: "Arab", rowId: "Arabic" }
            ];
            break;

        case 'TONE':
            title = 'Pilih Nada Bicara';
            description = 'Pilih nada atau gaya bahasa yang diinginkan.';
            options = [
                { title: "Ramah (Friendly)", rowId: "Friendly" },
                { title: "Sarkastik (Sarcastic)", rowId: "Sarcastic" },
                { title: "Humoris (Humour)", rowId: "Humour" },
                { title: "Marah (Angry)", rowId: "Angry" },
                { title: "Sedih (Sad)", rowId: "Sad" }
            ];
            break;
            
        case 'REPLY':
            title = 'Pilih Panjang Balasan';
            description = 'Pilih seberapa panjang balasan yang ingin dibuat.';
            options = [
                { title: "Pendek (Short)", rowId: "Short" },
                { title: "Sedang (Medium)", rowId: "Medium" },
                { title: "Panjang (Long)", rowId: "Long" }
            ];
            break;

        case 'SUMMARIZE':
        case 'PARAPHRASE':
        case 'EXPAND':
        case 'GRAMMAR':
            await processRequest(sock, msg, text, selectedModule);
            return;
            
        default:
            await sock.sendMessage(sender, { text: 'Pilihan modul tidak valid.' }, { quoted: msg });
            return;
    }

    const sections = [{ title: title, rows: options }];
    await sock.sendMessage(sender, {
        text: `Anda memilih modul *${selectedModule}*. Silakan pilih opsi berikutnya.`,
        footer: "Bot akan memproses setelah Anda memilih.",
        title: title,
        buttonText: "Lihat Pilihan",
        sections
    }, { quoted: msg });

    await setWaitingState(sender, 'translapp_param', handleParameterSelection, {
        dataTambahan: { text, module: selectedModule },
        extras: { set: setWaitingState },
        timeout: 60000
    });
}

export default async function execute(sock, msg, args, text, sender, extras) {
    const { set: setWaitingState } = extras;
    
    if (!text) {
        return await sock.sendMessage(sender, { text: `Anda belum memberikan teks.\n\nContoh:\n*${usage}*` }, { quoted: msg });
    }

    try {
        const listRows = [
            { title: "Terjemahkan (TRANSLATE)", description: "Menerjemahkan teks ke bahasa lain.", rowId: "TRANSLATE" },
            { title: "Rangkum (SUMMARIZE)", description: "Membuat ringkasan dari teks panjang.", rowId: "SUMMARIZE" },
            { title: "Ubah Kalimat (PARAPHRASE)", description: "Menulis ulang teks dengan kalimat berbeda.", rowId: "PARAPHRASE" },
            { title: "Perluas Teks (EXPAND)", description: "Mengembangkan teks menjadi lebih panjang.", rowId: "EXPAND" },
            { title: "Ubah Nada (TONE)", description: "Mengubah gaya atau nada bicara teks.", rowId: "TONE" },
            { title: "Buat Balasan (REPLY)", description: "Membuat draf balasan dari teks.", rowId: "REPLY" },
            { title: "Perbaiki Tata Bahasa (GRAMMAR)", description: "Memeriksa dan memperbaiki grammar.", rowId: "GRAMMAR" },
        ];
        const sections = [{ title: "Pilih Modul", rows: listRows }];

        await sock.sendMessage(sender, {
            text: `Teks Anda: *"${text}"*\n\nSilakan pilih operasi yang ingin Anda lakukan pada teks tersebut.`,
            footer: "Pilihan Anda akan diproses oleh AI.",
            title: "📖 TransLApp - Alat Teks AI 📖",
            buttonText: "Pilih Operasi",
            sections
        }, { quoted: msg });

        await setWaitingState(sender, 'translapp_module', handleModuleSelection, {
            dataTambahan: { text: text },
            extras: { set: setWaitingState },
            timeout: 60000
        });

    } catch (error) {
        console.error('[TRANSLAPP] Gagal pada tahap awal:', error);
        await sock.sendMessage(sender, { text: `❌ Gagal menyiapkan perintah: ${error.message}` }, { quoted: msg });
    }
}