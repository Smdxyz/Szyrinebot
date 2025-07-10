// modules/internal/showcategory.js (Versi dengan Interactive Message & Gaya Gaul)
import { generateWAMessageFromContent, proto } from '@itsukichan/baileys';
import { getCategorizedCommands } from '../../core/commandRegistry.js';
import { BOT_PREFIX, BOT_NAME, WATERMARK } from '../../config.js';

export const description = 'Nampilin daftar perintah per kategori, biar rapi gitu.';
export const usage = `${BOT_PREFIX}showcategory <nama_kategori>`; // Update usage text
export const category = 'internal'; // Tetap internal

export default async function showcategory(sock, msg, argsArray, argsString, sender) {
    const categoryName = argsString.trim().toLowerCase();

    if (!categoryName) {
        // Pesan jika kategori lupa dimasukkan, dibuat lebih santai
        return sock.sendMessage(sender, {
            text: `Eh, kamu lupa masukin nama kategorinya nih! 😅\nMau lihat perintah di kategori apa?\n\nContoh nih:\n*${usage}*`
        });
    }

    const categorizedCommands = getCategorizedCommands();
    const selectedCategory = categorizedCommands.find(cat => cat.category.toLowerCase() === categoryName);

    // Cek jika kategori tidak ditemukan atau kosong
    if (!selectedCategory || !selectedCategory.commands || selectedCategory.commands.length === 0) {
        return sock.sendMessage(sender, {
            text: `Hmm, kategori *"${categoryName}"* nggak ada atau belum ada isinya nih. 🤔\n\nCoba cek lagi nama kategorinya, atau ketik *${BOT_PREFIX}menu* buat lihat semua kategori yang ada.`
        });
    }

    // Filter command internal agar tidak ditampilkan ke user biasa
    const visibleCommands = selectedCategory.commands.filter(cmd => cmd.category !== 'internal');

    // Cek jika setelah difilter, tidak ada command yang bisa ditampilkan
    if (visibleCommands.length === 0) {
        return sock.sendMessage(sender, {
            text: `Yah, di kategori *"${categoryName}"* ini nggak ada command yang bisa kamu akses. 😔`
        });
    }

    // 1. Membuat `rows` untuk tombol single_select (tetap informatif)
    const menuRows = visibleCommands.map(cmd => {
        const shortDescription = cmd.description ? cmd.description.split('\n')[0] : 'Nggak ada deskripsi singkat.'; // Deskripsi lebih santai
        return {
            title: `${BOT_PREFIX}${cmd.name}`, // Nama command sebagai judul tombol
            description: shortDescription, // Deskripsi singkat
            id: `${BOT_PREFIX}${cmd.name}` // ID yang akan dikirim saat tombol dipilih (sesuai command)
        };
    });

    // 2. Membuat `sections` yang berisi rows di atas
    const menuSections = [{
        title: `📚 Command Kategori ${categoryName.toUpperCase()}`, // Judul section lebih menarik
        rows: menuRows
    }];

    // 3. Membuat pesan interactiveMessage dengan gaya yang diinginkan
    try {
        const interactiveMessagePayload = {
            body: {
                // Teks utama pesan, lebih "gaul" dan pakai emoji
                text: `Halo bro/sis! 👋\nNih daftar command *${categoryName.toUpperCase()}* yang bisa kamu pakai biar makin jago:\n\n👇 Pilih salah satu tombol di bawah ya buat liat detail atau langsung pake commandnya!`
            },
            footer: {
                // Footer untuk watermark
                text: `Powered by ${BOT_NAME} | ${WATERMARK}` // Gabungkan BOT_NAME dan WATERMARK
            },
            header: {
                // Header pesan
                title: `✨ Bot Command List ✨`, // Judul header umum
                subtitle: `Kategori: ${categoryName.toUpperCase()}`, // Subtitle menunjukkan kategori
                hasMediaAttachment: false // Tidak pakai media di header
            },
            nativeFlowMessage: {
                buttons: [
                    {
                        name: "single_select", // Tipe tombol pilih satu
                        buttonParamsJson: JSON.stringify({
                            title: "✅ Pilih Command Kerenmu!", // Teks tombol utama pilih
                            sections: menuSections // Isi tombol dari sections yang sudah dibuat
                        })
                    },
                    // Tombol untuk kembali ke menu utama (pakai emoji rumah)
                    {
                        name: "cta_reply", // Tipe tombol balasan cepat
                        buttonParamsJson: JSON.stringify({
                            display_text: "🏠 Balik ke Menu Utama", // Teks tombol kembali
                            id: `${BOT_PREFIX}menu` // ID kembali ke command !menu
                        })
                    }
                ]
            }
        };

        // 4. Menggunakan generateWAMessageFromContent untuk membangun pesan (tetap sama)
        const prepMsg = generateWAMessageFromContent(sender, {
            viewOnceMessage: { // Biasanya interactive message dibungkus viewOnceMessage
                message: {
                     // ContextInfo harus ada jika interactiveMessage ada di dalam viewOnceMessage
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.create(interactiveMessagePayload)
                }
            }
        }, { quoted: msg }); // Tetap bisa di-reply dari pesan user

        // 5. Mengirim pesan yang sudah dibangun (tetap sama)
        await sock.relayMessage(prepMsg.key.remoteJid, prepMsg.message, { messageId: prepMsg.key.id });

    } catch (error) {
        console.error(`❌ Error saat mencoba kirim menu interaktif untuk kategori ${categoryName}:`, error);
        // Fallback ke pesan teks biasa jika gagal kirim interactive message
        let fallbackText = `😥 Aduh, gagal nampilin menu interaktif nih, bro/sis. Mungkin ada masalah teknis sebentar. 🔧\n\nIni daftar command di kategori *${categoryName.toUpperCase()}* dalam bentuk teks:\n\n`;
        visibleCommands.forEach(cmd => {
            // Format fallback text lebih rapi
            const shortDescription = cmd.description ? cmd.description.split('\n')[0] : 'Nggak ada deskripsi singkat.';
            fallbackText += `• *${BOT_PREFIX}${cmd.name}* - ${shortDescription}\n`; // Tambahkan deskripsi singkat di fallback
        });

        // Tambahkan opsi kembali ke menu utama di pesan fallback
        fallbackText += `\nKetik *${BOT_PREFIX}menu* buat lihat semua kategori ya. 😉`;

        await sock.sendMessage(sender, { text: fallbackText }, { quoted: msg });
    }
}