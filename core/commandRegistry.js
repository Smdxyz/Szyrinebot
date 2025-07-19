// core/commandRegistry.js (FIXED with getCommandNames export)
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
    
    const tempCommandDataByCategory = {};
    for (const cmd of commandMap.values()) {
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

// --- FUNGSI GETTER ---
export function getCategorizedCommands() { return registeredCommands; }
export function getCommand(commandName) { return commandMap.get(commandName.toLowerCase()); }

/**
 * (INI FUNGSI YANG BARU DITAMBAHKAN DAN DIEKSPOR)
 * Mengambil daftar nama command yang unik (tidak termasuk alias).
 */
export function getCommandNames() {
    // Gunakan Set untuk mendapatkan objek command yang unik (menghilangkan duplikasi dari alias)
    const uniqueCommands = new Set(commandMap.values());
    // Ubah Set menjadi array dari nama command
    return Array.from(uniqueCommands, cmd => cmd.name);
}


// --- FUNGSI HOT-RELOAD & UNLOAD ---
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