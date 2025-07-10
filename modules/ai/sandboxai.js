// modules/ai/chatsandbox.js (Versi Interaktif dengan List Message)

import axios from 'axios';
import { BOT_PREFIX } from '../../config.js';

export const category = 'ai';
export const description = 'Mengobrol dengan berbagai model AI dari ChatSandbox via menu interaktif.';
export const usage = `${BOT_PREFIX}chatsandbox [pertanyaan Anda]`;
export const aliases = ['cs', 'sandbox'];
export const requiredTier = 'Silver'; // Tier yang dibutuhkan
export const energyCost = 15;        // Biaya energi per penggunaan

const API_URL = 'https://szyrineapi.biz.id/api/ai/chatsandbox/chat';
const AVAILABLE_MODELS = ['openai', 'llama', 'mistral', 'mistral-large'];

async function processRequest(sock, msg, prompt, model) {
    const sender = msg.key.remoteJid;
    let processingMsg;
    try {
        processingMsg = await sock.sendMessage(sender, { text: `🧠 Meminta jawaban dari model *${model}*... Mohon tunggu sebentar.` }, { quoted: msg });

        const params = new URLSearchParams({ q: prompt, model });
        const apiUrl = `${API_URL}?${params.toString()}`;
        console.log(`[CHATSANDBOX] Mengirim permintaan ke model '${model}' dengan prompt: "${prompt}"`);

        const response = await axios.get(apiUrl);
        const apiData = response.data;
        
        let aiResponse = '';
        if (response.status === 200 && apiData.result) {
            aiResponse = (typeof apiData.result === 'object' && apiData.result.response) ? apiData.result.response : apiData.result;
        } else {
            throw new Error(apiData.message || "Respons dari API tidak valid.");
        }
        
        const footer = `\n\n*— Ditenagai oleh model ${model} —*`;
        await sock.sendMessage(sender, { text: aiResponse.trim() + footer }, { quoted: msg });

    } catch (error) {
        console.error('[CHATSANDBOX] Gagal saat processRequest:', error);
        await sock.sendMessage(sender, { text: `❌ Gagal mendapatkan jawaban: ${error.message}` }, { quoted: msg });
    } finally {
        if (processingMsg) {
            await sock.sendMessage(sender, { delete: processingMsg.key });
        }
    }
}

async function handleModelSelection(sock, msg, body, waitState) {
    const { prompt } = waitState.dataTambahan;
    const selectedModel = body;
    await processRequest(sock, msg, prompt, selectedModel);
}

export default async function execute(sock, msg, args, text, sender, extras) {
    const { set: setWaitingState } = extras;
    const prompt = text;
    if (!prompt) {
        return await sock.sendMessage(sender, { text: `Tulis dulu pertanyaanmu setelah perintah.\n\nContoh:\n*${usage}*` }, { quoted: msg });
    }

    try {
        const listRows = AVAILABLE_MODELS.map(model => ({
            title: `Model: ${model.charAt(0).toUpperCase() + model.slice(1)}`,
            description: `Menggunakan model AI ${model}.`,
            rowId: model
        }));
        
        const sections = [{ title: "Pilih Model AI", rows: listRows }];

        await sock.sendMessage(sender, {
            text: `Anda bertanya: *"${prompt}"*\n\nSilakan pilih model AI yang ingin digunakan untuk menjawab.`,
            footer: "Bot akan memproses setelah Anda memilih salah satu model.",
            title: "🤖 Pilih Model ChatSandbox 🤖",
            buttonText: "Lihat Pilihan Model",
            sections
        }, { quoted: msg });

        await setWaitingState(sender, 'chatsandbox_model', handleModelSelection, {
            dataTambahan: { prompt: prompt },
            extras: { set: setWaitingState },
            timeout: 60000
        });

    } catch (error) {
        console.error('[CHATSANDBOX] Gagal pada tahap awal:', error);
        await sock.sendMessage(sender, { text: `❌ Gagal menyiapkan perintah: ${error.message}` }, { quoted: msg });
    }
}