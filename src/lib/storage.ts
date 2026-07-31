// Persistent storage layer. 1:1 port of the old src/js/storage.js.
//
// BYTE COMPATIBILITY CONTRACT (do not change):
// - Every key's localStorage value is JSON.stringify({value, hash}) where
//   hash = SHA-256 hex of (key + value).
// - Encryption hierarchy:
//     passphrase+salt -> (scrypt) -> derivedKey -> (encrypts) -> mainKey -> (encrypts) -> (other data)
// - The old app wrote through a preload StorageApi shim that ran in the same
//   window context; writing window.localStorage directly here produces the
//   exact same stored bytes at the same origin.
import {
    base64ToBytes,
    bytesToBase64,
    cryptoApiDecrypt,
    cryptoApiEncrypt,
    cryptoApiScrypt,
    cryptoApiScryptAutoSalt,
    cryptoHash,
    cryptoNewAesKey,
} from "./crypto";
import { getLocalStoragePath } from "./bridge";

const DERIVED_KEY_SALT = "derivedkeysalt"; //key for key-value of storage
const ENCRYPTED_MAIN_KEY = "encryptedmainkey"; //key for key-value of storage
const IS_EULA_ACCEPTED = "eulaaccepted"; //key for key-value of storage

// Same read/write semantics as the old preload StorageApi shim.
const StorageApi = {
    SetItem(key: string, value: unknown): void {
        window.localStorage.setItem(key, JSON.stringify(value));
    },
    GetItem(key: string): string | null {
        return window.localStorage.getItem(key);
    },
};

export async function storageGetPath(): Promise<string> {
    return await getLocalStoragePath();
}

export async function isEulaAccepted(): Promise<boolean> {
    const eula = await storageGetItem(IS_EULA_ACCEPTED);
    if (eula == null) {
        return false;
    }
    return eula == "ok";
}

export async function storeEulaAccepted(): Promise<void> {
    const result = await storageSetItem(IS_EULA_ACCEPTED, "ok");
    if (result != true) {
        throw new Error("storeEulaAccepted storageSetItem IS_EULA_ACCEPTED failed.");
    }
}

export async function isMainKeyCreated(): Promise<boolean> {
    const salt = await storageGetItem(DERIVED_KEY_SALT);
    if (salt == null) {
        return false;
    }

    const encryptedMainKeyJson = await storageGetItem(ENCRYPTED_MAIN_KEY);
    if (encryptedMainKeyJson == null) {
        return false;
    }

    return true;
}

export async function storageDecryptMainKey(passphrase: string): Promise<Uint8Array> {
    const salt = await storageGetItem(DERIVED_KEY_SALT);
    if (salt == null) {
        throw new Error("storageDecryptMainKey DERIVED_KEY_SALT does not exist.");
    }
    const saltArray = base64ToBytes(salt);

    const encryptedMainKeyJson = await storageGetItem(ENCRYPTED_MAIN_KEY);
    if (encryptedMainKeyJson == null) {
        throw new Error("storageDecryptMainKey DERIVED_KEY_SALT exists but ENCRYPTED_MAIN_KEY does ont exist.");
    }

    const encryptedMainKey = JSON.parse(encryptedMainKeyJson);

    const derivedKey = await cryptoApiScrypt(passphrase, saltArray);
    if (derivedKey == null) {
        throw new Error("storageDecryptMainKey cryptoApiScrypt failed.");
    }

    const derivedKeyArray = base64ToBytes(derivedKey.key);
    const mainKeyBase64 = await cryptoApiDecrypt(derivedKeyArray, encryptedMainKey);
    if (mainKeyBase64 == null) {
        throw new Error("storageDecryptMainKey cryptoApiDecrypt failed.");
    }

    return base64ToBytes(mainKeyBase64);
}

export async function storageDecryptData(passphrase: string, encryptedDataString: string): Promise<string | null> {
    if (typeof encryptedDataString === "string" || (encryptedDataString as unknown) instanceof String) {
        // ok
    } else {
        throw new Error("storageEncryptData encryptedDataString should be of type string.");
    }

    const mainKeyArray = await storageDecryptMainKey(passphrase);
    if (mainKeyArray == null) {
        throw new Error("storageEncryptData storageDecryptMainKey returned null.");
    }

    const encryptedData = JSON.parse(encryptedDataString);

    return await cryptoApiDecrypt(mainKeyArray, encryptedData);
}

/*
    Encryption hierarchy:
        passphrase+salt -> (scrypt) -> derivedKey -> (encrypts) -> mainKey -> (encrypts) -> (other data)

    derivedKey : A key that is derived using scrypt from the passphrase. It is not saved to storage.
    salt : The salt used for creating the derivedKey from the passphrase. The salt is created the first time. It is saved to storage.
    mainKey : An aes key that is created in random. It is created only the first time. This key is used to encrypt all other data. This key is encrypted with the derivedKey and the encrypted key is saved to storage.
*/
export async function storageCreateMainKey(passphrase: string): Promise<Uint8Array> {
    const salt = StorageApi.GetItem(DERIVED_KEY_SALT);
    if (salt != null) {
        throw new Error("storageCreateMainKey DERIVED_KEY_SALT already exists.");
    }

    const encryptedMainKeyCheck = StorageApi.GetItem(ENCRYPTED_MAIN_KEY);
    if (encryptedMainKeyCheck != null) {
        throw new Error("storageCreateMainKey MAIN_KEY already exists.");
    }

    const derivedKey = await cryptoApiScryptAutoSalt(passphrase);
    if (derivedKey == null) {
        throw new Error("storageCreateMainKey cryptoApiScryptAutoSalt failed.");
    }

    const storeSaltResult = await storageSetItem(DERIVED_KEY_SALT, derivedKey.salt);
    if (storeSaltResult != true) {
        throw new Error("storageCreateMainKey storageSetItem DERIVED_KEY_SALT failed.");
    }

    const mainKeyArray = await cryptoNewAesKey();
    const mainKeyBase64 = bytesToBase64(mainKeyArray);
    const derivedKeyArray = base64ToBytes(derivedKey.key);

    const encryptedMainKey = await cryptoApiEncrypt(derivedKeyArray, mainKeyBase64);
    const encryptedMainKeyJson = JSON.stringify(encryptedMainKey);

    const encryptedKeyStoreResult = await storageSetItem(ENCRYPTED_MAIN_KEY, encryptedMainKeyJson);
    if (encryptedKeyStoreResult != true) {
        throw new Error("storageCreateMainKey storageSetItem ENCRYPTED_MAIN_KEY failed.");
    }

    return mainKeyArray;
}

export async function storageDoesItemExist(key: string): Promise<boolean> {
    if (typeof key === "string" || (key as unknown) instanceof String) {
        // ok
    } else {
        throw new Error("storageDoesItemExist key should be of type string.");
    }

    const result = StorageApi.GetItem(key);
    return result != null;
}

export async function storageGetItem(key: string): Promise<string | null> {
    if (typeof key === "string" || (key as unknown) instanceof String) {
        // ok
    } else {
        throw new Error("storageGetItem key should be of type string.");
    }

    const result = StorageApi.GetItem(key);
    if (result == null) {
        return null;
    }
    const item = JSON.parse(result);

    const hash = await cryptoHash(key + item.value);
    if (hash != item.hash) {
        throw new Error("storageGetItem mismatched hash.");
    }

    return item.value;
}

export async function storageSetItem(key: string, value: string): Promise<boolean> {
    if (typeof key === "string" || (key as unknown) instanceof String) {
        // ok
    } else {
        throw new Error("storageSetItem key should be of type string.");
    }

    if (typeof value === "string" || (value as unknown) instanceof String) {
        // ok
    } else {
        throw new Error("storageSetItem value should be of type string.");
    }

    const hash = await cryptoHash(key + value);
    const item = {
        value: value,
        hash: hash,
    };
    StorageApi.SetItem(key, item);

    const result = await storageGetItem(key);
    if (result == null) {
        throw new Error("storageSetItem null value after save.");
    } else {
        if (value == result) {
            return true;
        } else {
            throw new Error("storageSetItem mismatched value after save.");
        }
    }
}

export async function storageGetSecureItem(passphrase: string, key: string): Promise<string | null> {
    const encryptedValue = await storageGetItem(key);
    if (encryptedValue == null) {
        return null;
    }

    return await storageDecryptData(passphrase, encryptedValue);
}

export async function storageMultiGetSecureItems(passphrase: string, keyArray: string[]): Promise<(string | null)[]> {
    //Decrypt main aes key
    const mainKeyArray = await storageDecryptMainKey(passphrase);
    if (mainKeyArray == null) {
        throw new Error("storageEncryptData storageDecryptMainKey returned null.");
    }

    const dataArray: (string | null)[] = [];

    //Loop through key list
    for (let i = 0; i < keyArray.length; i++) {
        //Retrieve stored data
        const encryptedDataString = await storageGetItem(keyArray[i]);
        if (encryptedDataString == null) {
            dataArray.push(null);
            continue;
        }

        //Decrypt retrieved data
        const encryptedData = JSON.parse(encryptedDataString);
        const data = await cryptoApiDecrypt(mainKeyArray, encryptedData);
        dataArray.push(data);
    }

    return dataArray;
}

export async function storageSetSecureItem(passphrase: string, key: string, value: string): Promise<boolean> {
    if (typeof key === "string" || (key as unknown) instanceof String) {
        // ok
    } else {
        throw new Error("storageSetSecureItem key should be of type string.");
    }

    //Decrypt main aes key
    const mainKeyArray = await storageDecryptMainKey(passphrase);
    if (mainKeyArray == null) {
        throw new Error("storageSetSecureItem storageDecryptMainKey returned null.");
    }

    //Encrypt the data
    const encryptedData = await cryptoApiEncrypt(mainKeyArray, value);
    const encryptedDataJson = JSON.stringify(encryptedData);

    //Store encrypted data
    const ret = await storageSetItem(key, encryptedDataJson);
    if (ret != true) {
        return false;
    }

    //Retrieve stored data
    const encryptedDataCheckString = await storageGetItem(key);
    if (encryptedDataCheckString == null) {
        throw new Error("storageSetSecureItem storageGetItem returned null after save.");
    }

    //Decrypt retrieved data
    const encryptedDataCheck = JSON.parse(encryptedDataCheckString);
    const dataCheck = await cryptoApiDecrypt(mainKeyArray, encryptedDataCheck);

    if (dataCheck === value) {
        return true;
    } else {
        throw new Error("storageSetSecureItem data mismatch after save.");
    }
}
