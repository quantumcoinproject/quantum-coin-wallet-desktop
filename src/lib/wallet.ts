// Wallet object model + encrypted persistence. 1:1 port of the old src/js/wallet.js.
// The persisted wallet JSON shape {address, privateKey, publicKey, seed} and the
// WALLET_{n} / MaxWalletIndex key names are a storage compatibility contract.
import { base64ToBytes, bytesToBase64, cryptoNewSeed } from "./crypto";
import { computeAddressFromPublicKey, walletDecryptJson, walletEncryptJson, walletFromSeed } from "./bridge";
import {
    storageDoesItemExist,
    storageGetItem,
    storageGetSecureItem,
    storageMultiGetSecureItems,
    storageSetItem,
    storageSetSecureItem,
} from "./storage";

const MAX_WALLETS = 128;
const MAX_WALLET_INDEX_KEY = "MaxWalletIndex";
const WALLET_KEY_PREFIX = "WALLET_";

let WALLET_ADDRESS_TO_INDEX_MAP = new Map<string, number>(); //key is address, value is index
let WALLET_INDEX_TO_ADDRESS_MAP = new Map<number, string>(); //key is index, value is address
let WALLET_ADDRESS_TO_INDEX_MAP_LOADED = false;

export class Wallet {
    address: string;
    privateKey: string | null;
    publicKey: string | null;
    seed: string | null;

    constructor(address: string, privateKey: string | null, publicKey: string | null, seed: string | null) {
        if (address.startsWith("0x") == false) {
            address = "0x" + address;
        }
        this.address = address;
        this.privateKey = privateKey;
        this.publicKey = publicKey;
        this.seed = seed;
    }

    async getPrivateKey(): Promise<string> {
        if (this.privateKey == null) {
            const seedArray = base64ToBytes(this.seed as string);
            const keyPair = await walletKeyPairFromSeed(seedArray);
            return keyPair.privateKey;
        } else {
            return this.privateKey;
        }
    }

    async getPublicKey(): Promise<string> {
        if (this.publicKey == null) {
            const seedArray = base64ToBytes(this.seed as string);
            const keyPair = await walletKeyPairFromSeed(seedArray);
            return keyPair.publicKey;
        } else {
            return this.publicKey;
        }
    }

    getSeedArray(): Uint8Array | null {
        if (this.seed == null) {
            return null;
        }
        return base64ToBytes(this.seed);
    }
}

export function isNumber(value: unknown): value is number {
    return typeof value === "number" && isFinite(value);
}

export async function walletGetAccountAddress(publicKeyBase64: string): Promise<string> {
    return await computeAddressFromPublicKey(publicKeyBase64);
}

export async function walletGetMaxIndex(): Promise<number> {
    const result = await storageGetItem(MAX_WALLET_INDEX_KEY);
    if (result == null) {
        return -1;
    }

    const maxWalletIndex = parseInt(result);

    if (isNumber(maxWalletIndex) == false) {
        throw new Error("MaxWalletIndex is not a number.");
    }

    if (maxWalletIndex < 0 || maxWalletIndex > MAX_WALLETS) {
        throw new Error("MaxWalletIndex out of range.");
    }

    return maxWalletIndex;
}

export async function walletKeyPairFromSeed(seedArray: Uint8Array): Promise<{ privateKey: string; publicKey: string }> {
    const allowedLengths = [64, 72, 96];
    if (!allowedLengths.includes(seedArray.length)) {
        throw new Error("walletKeyPairFromSeed: unsupported seed length.");
    }

    const result = await walletFromSeed(seedArray);
    return { privateKey: result.privateKey, publicKey: result.publicKey };
}

export async function walletCreateNewWalletFromSeed(seedArray: Uint8Array): Promise<Wallet> {
    const result = await walletFromSeed(seedArray);
    const seedString = bytesToBase64(seedArray);
    return new Wallet(result.address, null, null, seedString);
}

export async function walletCreateNewWallet(): Promise<Wallet> {
    const seedArray = await cryptoNewSeed();
    return await walletCreateNewWalletFromSeed(seedArray);
}

export async function walletCreateNewWalletFromJson(walletJsonString: string, passphrase: string): Promise<Wallet> {
    const result = await walletDecryptJson(walletJsonString, passphrase);
    if (result == null) {
        throw new Error("walletCreateNewWalletFromJson walletDecryptJson failed");
    }

    return new Wallet(result.address, result.privateKey, result.publicKey, result.seed || null);
}

export async function walletSave(wallet: Wallet, passphrase: string): Promise<boolean> {
    if (WALLET_ADDRESS_TO_INDEX_MAP_LOADED == false) {
        await walletLoadAll(passphrase);
    }

    if (WALLET_ADDRESS_TO_INDEX_MAP.has(wallet.address.toString().toLowerCase()) == true) {
        return false;
    }

    let maxWalletIndex = await walletGetMaxIndex();
    maxWalletIndex = maxWalletIndex + 1;

    const key = WALLET_KEY_PREFIX + maxWalletIndex.toString();
    const keyExists = await storageDoesItemExist(key);
    if (keyExists == true) {
        return false;
    }

    const walletJson = JSON.stringify(wallet);

    const walletStoreResult = await storageSetSecureItem(passphrase, key, walletJson);
    if (walletStoreResult != true) {
        return false;
    }

    const indexStoreResult = await storageSetItem(MAX_WALLET_INDEX_KEY, maxWalletIndex.toString());
    if (indexStoreResult != true) {
        return false;
    }

    WALLET_ADDRESS_TO_INDEX_MAP.set(wallet.address.toString().toLowerCase(), maxWalletIndex);
    WALLET_INDEX_TO_ADDRESS_MAP.set(maxWalletIndex, wallet.address.toString().toLowerCase());

    return true;
}

export async function walletGetByIndex(passphrase: string, index: number): Promise<Wallet | null> {
    const key = WALLET_KEY_PREFIX + index.toString();
    const keyExists = await storageDoesItemExist(key);
    if (keyExists == false) {
        return null;
    }

    const walletJson = await storageGetSecureItem(passphrase, key);
    if (walletJson == null) {
        return null;
    }
    const tempWallet = JSON.parse(walletJson);
    return new Wallet(tempWallet.address, tempWallet.privateKey, tempWallet.publicKey, tempWallet.seed);
}

export async function walletGetByAddress(passphrase: string, address: string): Promise<Wallet | null> {
    address = address.toString().toLowerCase();
    if (WALLET_ADDRESS_TO_INDEX_MAP_LOADED == false) {
        await walletLoadAll(passphrase);
    }

    if (WALLET_ADDRESS_TO_INDEX_MAP.has(address) == false) {
        return null;
    }

    const wallet = await walletGetByIndex(passphrase, WALLET_ADDRESS_TO_INDEX_MAP.get(address) as number);
    if (wallet == null) {
        return null;
    }

    if (wallet.address.toLowerCase() !== address.toLowerCase()) {
        throw new Error("walletGetByAddress address mismatch");
    }

    return wallet;
}

export async function walletLoadAll(passphrase: string): Promise<any[]> {
    const maxWalletIndex = await walletGetMaxIndex();
    const walletKeyArray: string[] = [];
    for (let i = 0; i <= maxWalletIndex; i++) {
        walletKeyArray.push(WALLET_KEY_PREFIX + i.toString());
    }

    const walletJsonArray = await storageMultiGetSecureItems(passphrase, walletKeyArray);

    if (walletJsonArray.length != maxWalletIndex + 1) {
        throw new Error("walletLoadAll storageMultiGetSecureItems wallet count mismatch.");
    }

    const walletArray: any[] = [];
    WALLET_ADDRESS_TO_INDEX_MAP = new Map();
    WALLET_INDEX_TO_ADDRESS_MAP = new Map();
    for (let i = 0; i < walletJsonArray.length; i++) {
        const walletJson = walletJsonArray[i];
        if (walletJson == null) {
            throw new Error("walletLoadAll storageMultiGetSecureItems wallet entry is null.");
        }
        const wallet = JSON.parse(walletJson);
        if (wallet.address == null) {
            throw new Error("walletLoadAll storageMultiGetSecureItems wallet address is null.");
        }
        walletArray.push(wallet);
        WALLET_ADDRESS_TO_INDEX_MAP.set(wallet.address.toLowerCase(), i);
        WALLET_INDEX_TO_ADDRESS_MAP.set(i, wallet.address.toLowerCase());
    }

    WALLET_ADDRESS_TO_INDEX_MAP_LOADED = true;

    return walletArray;
}

export function walletGetCachedAddressToIndexMap(): Map<string, number> {
    return WALLET_ADDRESS_TO_INDEX_MAP;
}

export function walletGetCachedIndexToAddressMap(): Map<number, string> {
    return WALLET_INDEX_TO_ADDRESS_MAP;
}

export function walletDoesAddressExistInCache(address: string): boolean {
    return WALLET_ADDRESS_TO_INDEX_MAP.has(address.toLowerCase());
}

export async function walletGetAccountJsonFromWallet(wallet: Wallet, passphrase: string): Promise<string> {
    const privateKey = await wallet.getPrivateKey();
    const publicKey = await wallet.getPublicKey();
    return await walletEncryptJson(privateKey, publicKey, passphrase);
}

export async function walletGetAccountJson(privateKeyBase64: string, publicKeyBase64: string, passphrase: string): Promise<string> {
    return await walletEncryptJson(privateKeyBase64, publicKeyBase64, passphrase);
}
