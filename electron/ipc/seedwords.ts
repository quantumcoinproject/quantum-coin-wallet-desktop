import { ipcMain } from "electron";
import { loadSeedWords } from "../sdk";

export function registerSeedWordsHandlers(): void {
    ipcMain.handle("SeedWordsInitialize", async () => {
        const seedwords = loadSeedWords();
        return await seedwords.initialize();
    });

    ipcMain.handle("SeedWordsGetAllWords", async () => {
        const seedwords = loadSeedWords();
        return seedwords.getAllSeedWords();
    });

    ipcMain.handle("SeedWordsGetWordList", async (_event, data) => {
        const seedwords = loadSeedWords();
        return seedwords.getWordListFromSeedArray(data);
    });

    ipcMain.handle("SeedWordsGetSeedArray", async (_event, data) => {
        const seedwords = loadSeedWords();
        return seedwords.getSeedArrayFromWordList(data);
    });

    ipcMain.handle("SeedWordsDoesWordExist", async (_event, data) => {
        const seedwords = loadSeedWords();
        return seedwords.doesSeedWordExist(data);
    });
}
