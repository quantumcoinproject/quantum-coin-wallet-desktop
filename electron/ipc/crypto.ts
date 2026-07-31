import { ipcMain } from "electron";
import { loadQuantumCoin, loadQuantumCoinConfig } from "../sdk";
import * as crypto from "crypto";
import { base64ToBytes, bytesToBase64 } from "../rpc";

const AES_ALGORITHM = "aes-256-cbc";

export function registerCryptoHandlers(): void {
    ipcMain.handle("CryptoApiEncrypt", async (_event, data) => {
        const aesKey = base64ToBytes(data.key);
        const aesIV = base64ToBytes(data.iv);

        const cipher = crypto.createCipheriv(AES_ALGORITHM, aesKey, aesIV);
        let cipherText = cipher.update(data.plainText, "utf8", "base64");
        cipherText += cipher.final("base64");

        return cipherText;
    });

    ipcMain.handle("CryptoApiDecrypt", async (_event, data) => {
        const aesKey = base64ToBytes(data.key);
        const aesIV = base64ToBytes(data.iv);

        const decipher = crypto.createDecipheriv(AES_ALGORITHM, aesKey, aesIV);
        let plainText = decipher.update(data.cipherText, "base64", "utf8");
        plainText += decipher.final();

        return plainText;
    });

    ipcMain.handle("CryptoApiScrypt", async (_event, data) => {
        const salt = base64ToBytes(data.salt);

        return crypto.scryptSync(data.secret, salt, 32, { N: 16384, p: 1, r: 8 });
    });

    ipcMain.handle("CryptoRandomBytes", async (_event, data) => {
        const size = Number(data);
        if (!Number.isInteger(size) || size < 1 || size > 1024) {
            throw new Error("CryptoRandomBytes: invalid size");
        }
        const buf = crypto.randomBytes(size);
        return bytesToBase64(new Uint8Array(buf));
    });

    ipcMain.handle("WalletFromSeed", async (_event, data) => {
        const { Initialize } = loadQuantumCoinConfig();
        const { Wallet } = loadQuantumCoin();

        await Initialize(null);
        const seedNumbers = Array.from(data.seed) as number[];
        const wallet = Wallet.fromSeed(seedNumbers);
        const privBytes = wallet.signingKey.privateKeyBytes;
        const pubBytes = wallet.signingKey.publicKeyBytes;
        return {
            address: wallet.address,
            privateKey: bytesToBase64(privBytes),
            publicKey: bytesToBase64(pubBytes),
        };
    });

    ipcMain.handle("WalletEncryptJson", async (_event, data) => {
        const { Initialize } = loadQuantumCoinConfig();
        const { Wallet } = loadQuantumCoin();

        await Initialize(null);
        const privBytes = Buffer.from(data.privateKey, "base64");
        const pubBytes = Buffer.from(data.publicKey, "base64");
        const wallet = Wallet.fromKeys(privBytes, pubBytes);
        return wallet.encryptSync(data.passphrase);
    });

    ipcMain.handle("WalletDecryptJson", async (_event, data) => {
        const { Initialize } = loadQuantumCoinConfig();
        const { Wallet } = loadQuantumCoin();

        await Initialize(null);
        const wallet = Wallet.fromEncryptedJsonSync(data.json, data.passphrase);
        const privBytes = wallet.signingKey.privateKeyBytes;
        const pubBytes = wallet.signingKey.publicKeyBytes;

        // The SDK exposes the original seed (hex) when the wallet file contains one.
        // Store it as base64-of-raw-bytes to match the desktop's seed format (getSeedArray uses base64ToBytes).
        let seedBase64: string | null = null;
        if (typeof wallet.seed === "string" && wallet.seed.length > 0) {
            const seedHex = wallet.seed.startsWith("0x") ? wallet.seed.slice(2) : wallet.seed;
            seedBase64 = bytesToBase64(new Uint8Array(Buffer.from(seedHex, "hex")));
        }

        return {
            address: wallet.address,
            privateKey: bytesToBase64(privBytes),
            publicKey: bytesToBase64(pubBytes),
            seed: seedBase64,
        };
    });

    ipcMain.handle("ComputeAddress", async (_event, data) => {
        const { Initialize } = loadQuantumCoinConfig();
        const { computeAddress } = loadQuantumCoin();

        await Initialize(null);
        const pubBytes = Buffer.from(data, "base64");
        return computeAddress(pubBytes);
    });

    ipcMain.handle("IsValidAddress", async (_event, data) => {
        const { Initialize } = loadQuantumCoinConfig();
        const { isAddress } = loadQuantumCoin();

        await Initialize(null);
        return isAddress(data);
    });

    ipcMain.handle("ScryptDerive", async (_event, data) => {
        const { Initialize } = loadQuantumCoinConfig();
        const { scryptSync } = loadQuantumCoin();

        // scryptSync requires the SDK to be initialized. The legacy handler
        // relied on another quantumcoin IPC call having initialized the
        // process first; on the unlock path ScryptDerive is the first SDK
        // call, so initialize here explicitly.
        await Initialize(null);
        const passwordBytes = new Uint8Array(Buffer.from(data.secret, "utf8"));
        const saltBytes = base64ToBytes(data.salt);
        const hexKey = scryptSync(passwordBytes, saltBytes, 262144, 8, 1, 32);
        const keyBytes = Buffer.from(hexKey.startsWith("0x") ? hexKey.slice(2) : hexKey, "hex");
        return bytesToBase64(new Uint8Array(keyBytes));
    });
}
