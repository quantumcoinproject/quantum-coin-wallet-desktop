// Byte-compatibility tests for the storage layer.
// The stored formats asserted here are a compatibility contract with wallets
// created by the old vanilla-JS app - do not update expected values.
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as nodeCrypto from "node:crypto";

// Emulates the main-process IPC handlers (electron/ipc/crypto.ts) that the old
// app also used, so the full encryption chain runs in-process for tests.
const FIXED_RANDOM: { queue: Uint8Array[] } = { queue: [] };

function nodeB64ToBytes(b64: string): Uint8Array {
    return new Uint8Array(Buffer.from(b64, "base64"));
}

function stubCryptoApiSend(channel: string, data: any): Promise<any> {
    switch (channel) {
        case "CryptoRandomBytes": {
            const next = FIXED_RANDOM.queue.shift();
            const bytes = next ?? new Uint8Array(nodeCrypto.randomBytes(Number(data)));
            return Promise.resolve(Buffer.from(bytes).toString("base64"));
        }
        case "CryptoApiEncrypt": {
            const cipher = nodeCrypto.createCipheriv("aes-256-cbc", nodeB64ToBytes(data.key), nodeB64ToBytes(data.iv));
            let cipherText = cipher.update(data.plainText, "utf8", "base64");
            cipherText += cipher.final("base64");
            return Promise.resolve(cipherText);
        }
        case "CryptoApiDecrypt": {
            const decipher = nodeCrypto.createDecipheriv("aes-256-cbc", nodeB64ToBytes(data.key), nodeB64ToBytes(data.iv));
            let plainText = decipher.update(data.cipherText, "base64", "utf8");
            plainText += decipher.final();
            return Promise.resolve(plainText);
        }
        case "ScryptDerive": {
            // Same parameters as quantumcoin.scryptSync in the main process: N=262144, r=8, p=1, 32 bytes.
            const key = nodeCrypto.scryptSync(Buffer.from(data.secret, "utf8"), nodeB64ToBytes(data.salt), 32, {
                N: 262144, r: 8, p: 1, maxmem: 512 * 1024 * 1024,
            });
            return Promise.resolve(Buffer.from(key).toString("base64"));
        }
        default:
            return Promise.reject(new Error("unexpected channel " + channel));
    }
}

vi.stubGlobal("CryptoApi", { send: stubCryptoApiSend });
vi.stubGlobal("LocalStorageApi", { send: () => Promise.resolve("C:\\fake\\userData") });

const { storageSetItem, storageGetItem, storageCreateMainKey, storageSetSecureItem, storageGetSecureItem, isMainKeyCreated, isEulaAccepted, storeEulaAccepted } = await import("./storage");
const { cryptoHash, base64ToBytes, bytesToBase64 } = await import("./crypto");

beforeEach(() => {
    localStorage.clear();
    FIXED_RANDOM.queue = [];
});

describe("storage wrapper byte format", () => {
    it("writes JSON.stringify({value, hash}) with SHA-256(key+value) hex (golden vectors)", async () => {
        await storageSetItem("eulaaccepted", "ok");
        expect(localStorage.getItem("eulaaccepted")).toBe(
            JSON.stringify({ value: "ok", hash: "397a2e2b780b38eaf310d4ef6de46fd136ba26ebddd7b431664e7c191f714cce" })
        );

        await storageSetItem("MaxWalletIndex", "0");
        expect(localStorage.getItem("MaxWalletIndex")).toBe(
            JSON.stringify({ value: "0", hash: "7738b3e33e362aad08bc7a7d23144d1fb9d8510c72889c374bde84560b28ea07" })
        );
    });

    it("reads values written by the old app unchanged", async () => {
        // Simulates a pre-existing entry created by the old vanilla-JS app.
        localStorage.setItem(
            "BLOCKCHAIN_NETWORK_3_0",
            JSON.stringify({ value: '{"a":1}', hash: "7848f47004126c8248aced3a2efddba943fdf72a869db3fc4ae9f896528dfd25" })
        );
        expect(await storageGetItem("BLOCKCHAIN_NETWORK_3_0")).toBe('{"a":1}');
    });

    it("rejects tampered values", async () => {
        await storageSetItem("k", "v");
        const raw = JSON.parse(localStorage.getItem("k") as string);
        raw.value = "tampered";
        localStorage.setItem("k", JSON.stringify(raw));
        await expect(storageGetItem("k")).rejects.toThrow("storageGetItem mismatched hash.");
    });

    it("eula flag round-trip", async () => {
        expect(await isEulaAccepted()).toBe(false);
        await storeEulaAccepted();
        expect(await isEulaAccepted()).toBe(true);
    });
});

describe("main key + secure item encryption chain", () => {
    it("creates main key with old formats and round-trips secure items", async () => {
        expect(await isMainKeyCreated()).toBe(false);
        await storageCreateMainKey("correct horse battery staple");
        expect(await isMainKeyCreated()).toBe(true);

        // derivedkeysalt is base64 of 32 bytes inside the {value, hash} wrapper
        const saltItem = JSON.parse(localStorage.getItem("derivedkeysalt") as string);
        expect(base64ToBytes(saltItem.value).length).toBe(32);
        expect(saltItem.hash).toBe(await cryptoHash("derivedkeysalt" + saltItem.value));

        // encryptedmainkey payload is {"cipherText":...,"iv":...} with exactly those keys in that order
        const mainKeyItem = JSON.parse(localStorage.getItem("encryptedmainkey") as string);
        const payload = JSON.parse(mainKeyItem.value);
        expect(Object.keys(payload)).toEqual(["cipherText", "iv"]);
        expect(base64ToBytes(payload.iv).length).toBe(16);

        const walletJson = JSON.stringify({ address: "0xabc", privateKey: null, publicKey: null, seed: "c2VlZA==" });
        expect(await storageSetSecureItem("correct horse battery staple", "WALLET_0", walletJson)).toBe(true);
        expect(await storageGetSecureItem("correct horse battery staple", "WALLET_0")).toBe(walletJson);

        // Wrong passphrase must not decrypt. The old app's storageDecryptMainKey
        // throws in this case (cryptoApiDecrypt returns null); callers catch it.
        await expect(storageGetSecureItem("wrong passphrase", "WALLET_0")).rejects.toThrow("storageDecryptMainKey cryptoApiDecrypt failed.");
    }, 60000);

    it("decrypts a deterministic golden snapshot (old-app equivalent bytes)", async () => {
        // Fix all randomness: scrypt salt, main key IV; main key bytes; wallet item IV.
        const salt = new Uint8Array(32).fill(1);
        const mainKey = new Uint8Array(32).fill(2);
        const ivMainKey = new Uint8Array(16).fill(3);
        const ivWallet = new Uint8Array(16).fill(4);
        FIXED_RANDOM.queue = [salt, mainKey, ivMainKey, ivWallet];

        await storageCreateMainKey("pw");
        const secret = "golden-secret";
        await storageSetSecureItem("pw", "WALLET_0", secret);

        // The snapshot below is exactly what the old app would have produced for
        // the same randomness (same scrypt, AES-256-CBC, and JSON shapes).
        const expectedDerivedKey = nodeCrypto.scryptSync(Buffer.from("pw", "utf8"), salt, 32, { N: 262144, r: 8, p: 1, maxmem: 512 * 1024 * 1024 });
        const c1 = nodeCrypto.createCipheriv("aes-256-cbc", expectedDerivedKey, ivMainKey);
        const expectedMainKeyCipher = c1.update(bytesToBase64(mainKey), "utf8", "base64") + c1.final("base64");
        const mainKeyItem = JSON.parse(localStorage.getItem("encryptedmainkey") as string);
        expect(mainKeyItem.value).toBe(JSON.stringify({ cipherText: expectedMainKeyCipher, iv: bytesToBase64(ivMainKey) }));

        const c2 = nodeCrypto.createCipheriv("aes-256-cbc", mainKey, ivWallet);
        const expectedWalletCipher = c2.update(secret, "utf8", "base64") + c2.final("base64");
        const walletItem = JSON.parse(localStorage.getItem("WALLET_0") as string);
        expect(walletItem.value).toBe(JSON.stringify({ cipherText: expectedWalletCipher, iv: bytesToBase64(ivWallet) }));

        expect(await storageGetSecureItem("pw", "WALLET_0")).toBe(secret);
    }, 60000);
});
