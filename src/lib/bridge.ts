// Typed async wrappers over the IPC APIs exposed by the preload script.
// 1:1 port of the old src/js/bridge.js.

export async function WriteTextToClipboard(text: string): Promise<void> {
    await ClipboardApi.send("ClipboardWriteText", text);
}

export async function OpenUrl(url: string): Promise<boolean> {
    try {
        await ShellApi.send("OpenUrlInShell", url);
    } catch (e) {
        console.log(e);
    }
    return false;
}

export async function GetAppVersion(): Promise<string> {
    return await AppApi.send("AppApiGetVersion", null);
}

export async function GetPackageName(): Promise<string> {
    return await AppApi.send("AppApiGetPackageName", null);
}

export async function ReadFile(seedfile: string): Promise<string | null> {
    return await FileApi.send("FileApiReadFile", seedfile);
}

export async function getLocalStoragePath(): Promise<string> {
    return await LocalStorageApi.send("StorageApiGetPath", null);
}

export async function weiToEther(wei: string): Promise<string> {
    return await FormatApi.send("FormatApiWeiToEther", wei);
}

export async function etherToWei(eth: string): Promise<string> {
    return await FormatApi.send("FormatApiEtherToWei", eth);
}

export function commify(value: string): string {
    const match = value.match(/^(-?)([0-9]*)(\.?)([0-9]*)$/);
    if (!match || (!match[2] && !match[4])) {
        throw new Error(`bad formatted number: ${JSON.stringify(value)}`);
    }

    const neg = match[1];
    const whole = BigInt(match[2] || 0).toLocaleString("en-us");
    const frac = match[4] ? (match[4].match(/^(.*?)0*$/) as RegExpMatchArray)[1] : "0";

    return `${neg}${whole}.${frac}`;
}

export async function weiToEtherFormatted(wei: string): Promise<string> {
    let eth: string = await FormatApi.send("FormatApiWeiToEther", wei);
    eth = commify(eth);

    if (eth.endsWith(".")) {
        eth = eth.substring(0, eth.length - 1);
    }

    return eth;
}

export async function hexWeiToEthFormatted(hex: string): Promise<string> {
    const wei = BigInt(hex).toString();
    return await weiToEtherFormatted(wei);
}

export async function isValidEther(quantity: string): Promise<boolean> {
    return await FormatApi.send("FormatApiIsValidEther", quantity);
}

export async function compareEther(val1: string, val2: string): Promise<number> {
    return await FormatApi.send("FormatApiCompareEther", { num1: val1, num2: val2 });
}

export interface TokenMetadataResult {
    success: boolean;
    contractAddress?: string;
    name?: string;
    symbol?: string;
    decimals?: number;
    balance?: string;
    error?: string | null;
}

/** ERC20 name/symbol/decimals/balance for a user-entered contract address. */
export async function getTokenMetadata(payload: unknown): Promise<TokenMetadataResult> {
    return await SwapQuoteApi.send("TokenGetMetadata", payload);
}

export interface OfflinePreparationResult {
    success: boolean;
    nonce: number | null;
    chainTimestamp: number | null;
    error: string | null;
}

export async function prepareOfflineSigning(payload: unknown): Promise<OfflinePreparationResult> {
    return await SwapQuoteApi.send("OfflinePrepareSigning", payload);
}

export async function estimateGas(payload: unknown): Promise<any> {
    return await SwapQuoteApi.send("estimateGas", payload);
}

export async function estimateGasFee(payload: unknown): Promise<any> {
    return await SwapQuoteApi.send("estimateGasFee", payload);
}

export async function submitSendCoins(payload: unknown): Promise<any> {
    return await SwapQuoteApi.send("SendCoinsSubmit", payload);
}

export async function submitSendTokens(payload: unknown): Promise<any> {
    return await SwapQuoteApi.send("SendTokensSubmit", payload);
}

export async function offlineSignCoinTransaction(payload: unknown): Promise<any> {
    return await SwapQuoteApi.send("OfflineSignCoinTransaction", payload);
}

export async function offlineSignTokenTransaction(payload: unknown): Promise<any> {
    return await SwapQuoteApi.send("OfflineSignTokenTransaction", payload);
}

export async function submitStakingContract(payload: unknown): Promise<any> {
    return await SwapQuoteApi.send("StakingContractSubmit", payload);
}

export async function offlineSignStakingContract(payload: unknown): Promise<any> {
    return await SwapQuoteApi.send("StakingContractOfflineSign", payload);
}

export async function cryptoRandomBytes(size: number): Promise<string> {
    return await CryptoApi.send("CryptoRandomBytes", size);
}

export async function walletFromSeed(seedArray: Uint8Array | number[]): Promise<{ address: string; privateKey: string; publicKey: string }> {
    return await CryptoApi.send("WalletFromSeed", { seed: Array.from(seedArray) });
}

export async function walletEncryptJson(privateKeyBase64: string, publicKeyBase64: string, passphrase: string): Promise<string> {
    return await CryptoApi.send("WalletEncryptJson", {
        privateKey: privateKeyBase64,
        publicKey: publicKeyBase64,
        passphrase: passphrase,
    });
}

export async function walletDecryptJson(json: string, passphrase: string): Promise<{ address: string; privateKey: string; publicKey: string; seed: string | null }> {
    return await CryptoApi.send("WalletDecryptJson", { json: json, passphrase: passphrase });
}

export async function computeAddressFromPublicKey(publicKeyBase64: string): Promise<string> {
    return await CryptoApi.send("ComputeAddress", publicKeyBase64);
}

export async function scryptDerive(secret: string, saltBase64: string): Promise<string> {
    return await CryptoApi.send("ScryptDerive", { secret: secret, salt: saltBase64 });
}
