// Renderer shim over the seed-words SDK (reached via the SeedWordsApi IPC bridge).
// Keeps the app-specific friendly-index UI constant in-process and delegates the
// word<->byte mapping operations to the SDK in the main process.
//
// getFriendlySeedIndex and SEED_LENGTH are intentionally NOT defined here:
// getFriendlySeedIndex exists inside the SDK but is not exported, and the app
// already indexes SEED_FRIENDLY_INDEX_ARRAY directly at every call site.
// SEED_LENGTH/2 (48) equals SEED_FRIENDLY_INDEX_ARRAY.length, which the app uses instead.

export const SEED_FRIENDLY_INDEX_ARRAY = ["a1", "a2", "a3", "a4", "b1", "b2", "b3", "b4", "c1", "c2", "c3", "c4", "d1", "d2", "d3", "d4", "e1", "e2", "e3", "e4", "f1", "f2", "f3", "f4", "g1", "g2", "g3", "g4", "h1", "h2", "h3", "h4", "i1", "i2", "i3", "i4", "j1", "j2", "j3", "j4", "k1", "k2", "k3", "k4", "l1", "l2", "l3", "l4"];

export async function initializeSeedWords(): Promise<boolean> {
    return await SeedWordsApi.send("SeedWordsInitialize", null);
}

export async function getAllSeedWordsAsync(): Promise<string[]> {
    return await SeedWordsApi.send("SeedWordsGetAllWords", null);
}

export async function getWordListFromSeedArrayAsync(seedArray: Uint8Array | number[]): Promise<string[] | null> {
    return await SeedWordsApi.send("SeedWordsGetWordList", seedArray);
}

export async function getSeedArrayFromWordListAsync(wordList: string[]): Promise<number[] | null> {
    return await SeedWordsApi.send("SeedWordsGetSeedArray", wordList);
}

export async function doesSeedWordExistAsync(word: string): Promise<boolean> {
    return await SeedWordsApi.send("SeedWordsDoesWordExist", word);
}

// Callers lowercase seedWord before invoking this; the SDK's word list is lowercased,
// so no lowercasing is performed here. Friendly index i maps to word position i because
// getWordListFromSeedArray pairs seedArray[2i] and seedArray[2i+1].
export async function verifySeedWordAsync(friendlySeedIndex: number, seedWord: string, seedArray: Uint8Array | number[]): Promise<boolean> {
    const expected = await getWordListFromSeedArrayAsync(seedArray);
    if (expected == null) {
        return false;
    }
    if (friendlySeedIndex < 0 || friendlySeedIndex > expected.length - 1) {
        return false;
    }
    return expected[friendlySeedIndex] === seedWord;
}
