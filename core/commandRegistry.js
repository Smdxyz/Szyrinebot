// core/commandRegistry.js (Final Version with Reload & Unload)
import { readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BOT_PREFIX } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modulesDir = path.join(__dirname, '../modules');

let registeredCommands = [];
let commandMap = new Map();

// --- FUNGSI LOAD UTAMA (TETAP SAMA) ---
export async function loadCommands() {
    console.log('🔍 Memulai pemindaian ulang daftar command...');
    const tempCommandDataByCategory = {}; 
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
                        for (const alias of cmdData.aliases) {
                             tempCommandMap.set(alias, cmdData);
                        }

                        if (!tempCommandDataByCategory[cmdData.category]) {
                            tempCommandDataByCategory[cmdData.category] = [];
                        }
                        tempCommandDataByCategory[cmdData.category].push(cmdData);
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
    registeredCommands = Object.entries(tempCommandDataByCategory)
        .map(([category, commands]) => ({ category, commands }))
        .filter(cat => cat.commands.length > 0); 

    console.log(`[CMD REGISTRY] ✅ Pemuatan selesai. Total ${commandMap.size} command (termasuk alias) dimuat.`);
}

// --- FUNGSI GETTER (TETAP SAMA) ---
export function getCategorizedCommands() { return registeredCommands; }
export function getCommand(commandName) { return commandMap.get(commandName.toLowerCase()); }
export function getCommandNames() {
    const uniqueCommands = new Map();
    for (const [key, value] of commandMap.entries()) {
        if (!uniqueCommands.has(value.name)) { uniqueCommands.set(value.name, value); }
    }
    return Array.from(uniqueCommands.keys());
}

// --- FUNGSI HOT-RELOAD (UNTUK UPDATE) ---
export async function reloadCommand(filePath) {
    console.log(`[CMD REGISTRY] 🚀 Memulai hot-reload untuk: ${filePath}`);
    try {
        const commandName = path.basename(filePath, '.js').toLowerCase();
        const oldCommandData = commandMap.get(commandName);
        if (oldCommandData) {
            commandMap.delete(commandName);
            if (oldCommandData.aliases) {
                for (const alias of oldCommandData.aliases) { commandMap.delete(alias); }
            }
        }
        const moduleURL = `file://${filePath.replace(/\\/g, '/')}?t=${Date.now()}`;
        const commandModule = await import(moduleURL);
        if (typeof commandModule.default !== 'function') throw new Error(`File tidak memiliki 'export default function'.`);
        const categoryName = path.basename(path.dirname(filePath));
        const cmdData = { name: commandName, category: commandModule.category || categoryName, description: commandModule.description || 'Tidak ada deskripsi.', usage: commandModule.usage || `${BOT_PREFIX}${commandName}`, aliases: commandModule.aliases || [], requiredTier: commandModule.requiredTier || null, energyCost: commandModule.energyCost || 0, filePath: filePath, execute: commandModule.default };
        commandMap.set(cmdData.name, cmdData);
        for (const alias of cmdData.aliases) { commandMap.set(alias, cmdData); }
        registeredCommands = registeredCommands.map(cat => {
            cat.commands = cat.commands.filter(cmd => cmd.name !== commandName);
            return cat;
        }).filter(cat => cat.commands.length > 0);
        let categoryExists = registeredCommands.find(cat => cat.category === cmdData.category);
        if (categoryExists) { categoryExists.commands.push(cmdData); } 
        else { registeredCommands.push({ category: cmdData.category, commands: [cmdData] }); }
        console.log(`[CMD REGISTRY] ✅ Hot-reload berhasil untuk '${cmdData.name}'.`);
        return { success: true, message: `Command '${cmdData.name}' berhasil di-reload.` };
    } catch (error) {
        console.error(`[CMD REGISTRY] ❌ Gagal hot-reload '${filePath}':`, error);
        await loadCommands(); 
        return { success: false, message: `Gagal reload: ${error.message}` };
    }
}

// --- FUNGSI HOT-UNLOAD (UNTUK DELETE) ---
export async function unloadCommand(filePath) {
    console.log(`[CMD REGISTRY] 🗑️ Memulai hot-unload untuk: ${filePath}`);
    try {
        const commandName = path.basename(filePath, '.js').toLowerCase();
        const commandData = commandMap.get(commandName);

        if (!commandData) {
            console.warn(`[CMD REGISTRY] Command '${commandName}' tidak ditemukan di memori. Mungkin sudah dihapus.`);
            return { success: true, message: "Command tidak ditemukan di memori." };
        }

        // Hapus nama utama dan semua aliasnya dari map
        commandMap.delete(commandName);
        for (const alias of commandData.aliases) {
            commandMap.delete(alias);
        }

        // Hapus dari daftar menu (registeredCommands)
        registeredCommands = registeredCommands.map(cat => {
            cat.commands = cat.commands.filter(cmd => cmd.name !== commandName);
            return cat;
        }).filter(cat => cat.commands.length > 0); // Hapus kategori jika kosong

        console.log(`[CMD REGISTRY] ✅ Hot-unload berhasil untuk '${commandName}'.`);
        return { success: true, message: `Command '${commandName}' berhasil dikeluarkan.` };

    } catch (error) {
        console.error(`[CMD REGISTRY] ❌ Gagal saat hot-unload '${filePath}':`, error);
        return { success: false, message: `Gagal unload: ${error.message}` };
    }
}