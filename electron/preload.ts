import { contextBridge, ipcRenderer } from "electron";

// Channel-whitelisted IPC bridge. Each renderer-visible API namespace can only
// invoke the channels listed for it (the old app allowed any channel string).
function makeApi(allowedChannels: readonly string[]) {
    const allowed = new Set(allowedChannels);
    return {
        send: (channel: string, data: unknown): Promise<any> => {
            if (!allowed.has(channel)) {
                return Promise.reject(new Error("IPC channel not allowed: " + channel));
            }
            return ipcRenderer.invoke(channel, data);
        },
    };
}

contextBridge.exposeInMainWorld("ClipboardApi", makeApi(["ClipboardWriteText"]));

contextBridge.exposeInMainWorld("ShellApi", makeApi(["OpenUrlInShell"]));

contextBridge.exposeInMainWorld("FileApi", makeApi(["FileApiReadFile"]));

contextBridge.exposeInMainWorld("LocalStorageApi", makeApi(["StorageApiGetPath"]));

contextBridge.exposeInMainWorld("AppApi", makeApi(["AppApiGetVersion", "AppApiGetPackageName"]));

contextBridge.exposeInMainWorld("CryptoApi", makeApi([
    "CryptoApiEncrypt",
    "CryptoApiDecrypt",
    "CryptoApiScrypt",
    "CryptoRandomBytes",
    "WalletFromSeed",
    "WalletEncryptJson",
    "WalletDecryptJson",
    "ComputeAddress",
    "IsValidAddress",
    "ScryptDerive",
]));

contextBridge.exposeInMainWorld("FormatApi", makeApi([
    "FormatApiEtherToWei",
    "FormatApiWeiToEther",
    "FormatApiWeiToEtherCommified",
    "FormatApiIsValidEther",
    "FormatApiCompareEther",
]));

contextBridge.exposeInMainWorld("SeedWordsApi", makeApi([
    "SeedWordsInitialize",
    "SeedWordsGetAllWords",
    "SeedWordsGetWordList",
    "SeedWordsGetSeedArray",
    "SeedWordsDoesWordExist",
]));

// General wallet RPC channel. "SwapQuoteApi" is a legacy name kept from the
// quantumswapwallet fork: it is an internal contextBridge key, invisible to
// users, and renaming it would churn every call site in src/lib/bridge.ts for
// no behavioural gain. Nothing swap-related is reachable through it.
contextBridge.exposeInMainWorld("SwapQuoteApi", makeApi([
    "TokenGetMetadata",
    "SendCoinsSubmit",
    "SendTokensSubmit",
    "OfflineSignCoinTransaction",
    "OfflineSignTokenTransaction",
    "StakingContractSubmit",
    "StakingContractOfflineSign",
    "OfflinePrepareSigning",
    "estimateGas",
    "estimateGasFee",
]));
