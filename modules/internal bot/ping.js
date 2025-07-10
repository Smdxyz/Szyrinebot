// modules/info/ping.js

// Tambahkan metadata agar konsisten dan mungkin dibutuhkan oleh commandRegistry
export const description = 'Merespon dengan Pong untuk mengecek kecepatan respon bot.';
export const usage = '!ping';
export const category = 'info'; // Pastikan kategori ini dikenali oleh sistem Anda

// Pastikan parameter fungsi sesuai dengan bagaimana handler.js memanggilnya:
// handler.js: execute(sock, msg, finalArgsArray, finalArgsString, sender, ...)
// Jika nama fungsi di commandRegistry adalah 'ping', argumennya akan sama.
export default async function ping(sock, msg, argsArray, argsString, sender) {
  // argsArray dan argsString tidak digunakan dalam command ping sederhana ini,
  // tetapi didefinisikan untuk konsistensi parameter.
  try {
    const startTime = Date.now();
    await sock.sendMessage(sender, { text: '🏓 Pong!' });
    const endTime = Date.now();
    console.log(`[PING] Respon ke ${sender} dalam ${endTime - startTime}ms`);
  } catch (error) {
    console.error(`[PING] Gagal mengirim balasan ke ${sender}:`, error);
    // Anda bisa mengirim pesan error jika diperlukan, tapi untuk ping, biasanya cukup log
  }
}