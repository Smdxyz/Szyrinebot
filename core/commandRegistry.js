// core/commandRegistry.js
import { readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BOT_PREFIX } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modulesDir = path.join(__dirname, '../modules');

let registeredCommands = [];
let commandMap = new Map();

export async function loadCommands() {
    console.log('🔍 Memulai pemindaian ulang daftar command...');
    const tempCommandDataByCategory = {}; 
    const tempCommandMap = new Map();     

    try {
        if (!statSync(modulesDir).isDirectory()) {
             console.warn(`[CMD REGISTRY] Direktori modules tidak ditemukan di '${modulesDir}'. Tidak ada command yang dimuat.`);
             return;
        }

        const categories = readdirSync(modulesDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        console.log(`[CMD REGISTRY] Ditemukan kategori folder: ${categories.join(', ') || 'Tidak ada'}`);

        for (const categoryName of categories) {
            const categoryPath = path.join(modulesDir, categoryName);
            let commandFilesInCategory = [];
            try {
                commandFilesInCategory = readdirSync(categoryPath)
                    .filter(file => file.endsWith('.js') && statSync(path.join(categoryPath, file)).isFile());
            } catch (readDirError) {
                console.error(`[CMD REGISTRY] ❌ Gagal membaca direktori untuk kategori '${categoryName}':`, readDirError);
                continue; 
            }

            if (!tempCommandDataByCategory[categoryName]) {
                tempCommandDataByCategory[categoryName] = [];
            }

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
                            // --- BARIS BARU: Ambil metadata tier & energy ---
                            requiredTier: commandModule.requiredTier || null,
                            energyCost: commandModule.energyCost || 0,
                            // ------------------------------------------------
                            filePath: filePath,
                            execute: commandModule.default,
                        };

                        if (tempCommandMap.has(commandName)) {
                            console.warn(`[CMD REGISTRY] ⚠️ Peringatan: Command '${commandName}' dari '${filePath}' menimpa command dengan nama sama dari '${tempCommandMap.get(commandName).filePath}'.`);
                        }
                        tempCommandMap.set(commandName, cmdData);
                        
                        if (!tempCommandDataByCategory[cmdData.category]) {
                            tempCommandDataByCategory[cmdData.category] = [];
                        }
                        tempCommandDataByCategory[cmdData.category].push(cmdData);
                    } else {
                        console.warn(`[CMD REGISTRY] ⚠️ File command '${filePath}' TIDAK memiliki 'export default function'. Command tidak dimuat.`);
                    }
                } catch (error) {
                    console.error(`[CMD REGISTRY] ❌ Gagal memuat atau ada error sintaks di command '${commandName}' dari '${filePath}':`, error.message, error.stack);
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

    console.log(`[CMD REGISTRY] ✅ Pemuatan command selesai. Total ${commandMap.size} command dimuat.`);
    if (commandMap.size > 0) {
        console.log(`[CMD REGISTRY] Daftar command yang aktif: ${Array.from(commandMap.keys()).join(', ')}`);
    } else {
        console.log(`[CMD REGISTRY] Tidak ada command yang aktif.`);
    }
}

export function getCategorizedCommands() {
    return registeredCommands;
}

export function getCommand(commandName) {
    return commandMap.get(commandName.toLowerCase());
}

export function getCommandNames() {
    return Array.from(commandMap.keys());
}