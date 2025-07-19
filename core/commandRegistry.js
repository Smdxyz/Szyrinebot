// core/commandRegistry.js (REVISED & SIMPLIFIED)
import { readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BOT_PREFIX } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modulesDir = path.join(__dirname, '../modules');

let registeredCommands = [];
let commandMap = new Map();

/**
 * Memuat atau memuat ulang semua command dari direktori /modules.
 * Ini adalah satu-satunya sumber kebenaran (source of truth).
 */
export async function loadCommands() {
    console.log('🔍 Memulai pemindaian ulang daftar command...');
    const tempCommandMap = new Map();     

    try {
        const categories = readdirSync(modulesDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        for (const categoryName of categories) {
            const categoryPath = path.join(modulesDir, categoryName);
            const commandFilesInCategory = readdirSync(categoryPath).filter(file => file.endsWith('.js'));

            for (const file of commandFilesInCategory) {
                const commandName = file.replace('.js', '').toLowerCase(); 
                const filePath = path.join(categoryPath, file);
                try {
                    // Cache-buster penting untuk memastikan file versi baru yang di-import
                    const moduleURL = `file://${filePath.replace(/\\/g, '/')}?t=${Date.now()}`;
                    const commandModule = await import(moduleURL);

                    if (typeof commandModule.default === 'function') {
                        const cmdData = {
                            name: commandName,
                            category: commandModule.category || categoryName, 
                            description: commandModule.description || 'Tidak ada deskripsi.',
                            usage: commandModule.usage || `${BOT_PREFIX}${commandName}`,
                            aliases: commandModule.aliases || [],
                            requiredTier: commandModule.requiredTier || null,
                            energyCost: commandModule.energyCost || 0,
                            filePath: filePath,
                            execute: commandModule.default,
                        };

                        tempCommandMap.set(commandName, cmdData);
                        cmdData.aliases.forEach(alias => tempCommandMap.set(alias, cmdData));
                    }
                } catch (error) {
                    console.error(`[CMD REGISTRY] ❌ Gagal memuat command '${filePath}':`, error);
                }
            }
        }
    } catch (error) {
        console.error("[CMD REGISTRY] ❌ Error besar saat memindai folder command:", error);
    }

    commandMap = tempCommandMap;
    
    // Membangun ulang daftar menu dari commandMap yang sudah bersih
    const tempCommandDataByCategory = {};
    for (const cmd of commandMap.values()) {
        // Hindari duplikasi karena alias
        if (cmd.name !== [...commandMap.keys()].find(key => commandMap.get(key) === cmd)) continue;

        if (!tempCommandDataByCategory[cmd.category]) {
            tempCommandDataByCategory[cmd.category] = [];
        }
        tempCommandDataByCategory[cmd.category].push(cmd);
    }
    
    registeredCommands = Object.entries(tempCommandDataByCategory)
        .map(([category, commands]) => ({ category, commands }))
        .filter(cat => cat.commands.length > 0); 

    console.log(`[CMD REGISTRY] ✅ Pemuatan selesai. Total ${[...new Set(commandMap.values())].length} command unik dimuat.`);
}

// --- FUNGSI GETTER (Tidak berubah) ---
export function getCategorizedCommands() { return registeredCommands; }
export function getCommand(commandName) { return commandMap.get(commandName.toLowerCase()); }

/**
 * (REVISED) Memuat ulang command.
 * Cara paling andal adalah dengan menjalankan ulang seluruh proses load.
 */
export async function reloadCommand(filePath) {
    console.log(`[CMD REGISTRY] 🚀 Memulai hot-reload untuk: ${path.basename(filePath)}`);
    try {
        await loadCommands();
        return { success: true, message: `Command '${path.basename(filePath, '.js')}' berhasil di-reload.` };
    } catch (error) {
        console.error(`[CMD REGISTRY] ❌ Gagal saat proses reload:`, error);
        return { success: false, message: `Gagal reload: ${error.message}` };
    }
}

/**
 * (REVISED) Mengeluarkan command.
 * File fisik sudah dihapus oleh command 'delete', kita hanya perlu memuat ulang state.
 */
export async function unloadCommand(filePath) {
    console.log(`[CMD REGISTRY] 🗑️ Memulai hot-unload untuk: ${path.basename(filePath)}`);
    try {
        await loadCommands();
        return { success: true, message: `Command '${path.basename(filePath, '.js')}' berhasil dikeluarkan.` };
    } catch (error) {
        console.error(`[CMD REGISTRY] ❌ Gagal saat proses unload:`, error);
        return { success: false, message: `Gagal unload: ${error.message}` };
    }
}