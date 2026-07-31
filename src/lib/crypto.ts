// Renderer-side crypto helpers. 1:1 port of the old src/js/crypto.js:
// byte formats (base64 codecs, SHA-256 hex hashing, EncryptedPayload/DerivedKey
// JSON shapes) must remain identical for storage compatibility.
import { cryptoRandomBytes, scryptDerive } from "./bridge";

export const CRYPTO_AES_KEY_SIZE = 32;
export const CRYPTO_AES_IV_SIZE = 16;
export const SCRYPT_SALT_SIZE = 32;
export const CRYPTO_SEED_BYTES = 96;

export async function IsValidAddress(address: string): Promise<boolean> {
    return await CryptoApi.send("IsValidAddress", address);
}

// Field order matters: JSON.stringify(new EncryptedPayload(...)) must produce
// {"cipherText":"...","iv":"..."} exactly as the old app stored it.
export class EncryptedPayload {
    cipherText: string;
    iv: string;

    constructor(cipherText: string, iv: string) {
        this.cipherText = cipherText;
        this.iv = iv;
    }
}

export class DerivedKey {
    key: string;
    salt: string;

    constructor(key: string, salt: string) {
        this.key = key;
        this.salt = salt;
    }
}

export async function cryptoHash(data: string): Promise<string> {
    const msgUint8 = new TextEncoder().encode(data); // encode as (utf-8) Uint8Array
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8); // hash the message
    const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
    const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""); // convert bytes to hex string
    return hashHex;
}

export function base64ToBytes(base64: string): Uint8Array {
    const binString = atob(base64);
    return Uint8Array.from(binString, (m) => m.codePointAt(0) as number);
}

export function bytesToBase64(bytes: Uint8Array | number[]): string {
    const binString = Array.from(bytes, (byte) =>
        String.fromCodePoint(byte),
    ).join("");
    return btoa(binString);
}

export async function cryptoRandom(size: number): Promise<Uint8Array> {
    const base64 = await cryptoRandomBytes(size);
    return base64ToBytes(base64);
}

export async function cryptoNewSeed(seedBytes?: number): Promise<Uint8Array> {
    return cryptoRandom(seedBytes || CRYPTO_SEED_BYTES);
}

export function cryptoNewAesKey(): Promise<Uint8Array> {
    return cryptoRandom(CRYPTO_AES_KEY_SIZE);
}

export async function cryptoApiEncrypt(aesKeyArray: Uint8Array, plainText: string): Promise<EncryptedPayload> {
    const iv = await cryptoRandom(CRYPTO_AES_IV_SIZE);
    const ivBase64 = bytesToBase64(iv);

    const encryptRequest = {
        key: bytesToBase64(aesKeyArray),
        iv: ivBase64,
        plainText: plainText,
    };
    const cipherText: string = await CryptoApi.send("CryptoApiEncrypt", encryptRequest);

    return new EncryptedPayload(cipherText, ivBase64);
}

export async function cryptoApiDecrypt(aesKeyArray: Uint8Array, encryptedPayload: { cipherText: string; iv: string }): Promise<string | null> {
    try {
        const decryptRequest = {
            key: bytesToBase64(aesKeyArray),
            iv: encryptedPayload.iv,
            cipherText: encryptedPayload.cipherText,
        };

        const plainText: string = await CryptoApi.send("CryptoApiDecrypt", decryptRequest);
        return plainText;
    } catch {
        return null;
    }
}

export async function cryptoApiScryptAutoSalt(secretString: string): Promise<DerivedKey> {
    const saltBytes = await cryptoRandom(SCRYPT_SALT_SIZE);
    return cryptoApiScrypt(secretString, saltBytes);
}

export async function cryptoApiScrypt(secretString: string, saltBytes: Uint8Array): Promise<DerivedKey> {
    const derivedKey = await scryptDerive(secretString, bytesToBase64(saltBytes));

    return new DerivedKey(derivedKey, bytesToBase64(saltBytes));
}
