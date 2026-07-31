// Offline-signing and advanced-signing settings. 1:1 port of the
// corresponding functions from the old src/js/app.js.
import { storageGetItem, storageSetItem } from "../lib/storage";
import { DEFAULT_ADVANCED_SIGNING_SETTING_KEY, DEFAULT_OFFLINE_TXN_SIGNING_SETTING_KEY, settingsStore } from "./state";
import { getGenericError } from "./app";
import { showWarnAlert } from "./dialog";

export async function offlineTxnSigningSetDefaultValue(value: string): Promise<boolean> {
    const itemStoreResult = await storageSetItem(DEFAULT_OFFLINE_TXN_SIGNING_SETTING_KEY, value);
    if (itemStoreResult != true) {
        throw new Error("offlineTxnSigningSetDefaultValue item store failed");
    }
    settingsStore.offlineSignEnabled = value === "enabled";

    return true;
}

export async function offlineTxnSigningGetDefaultValue(): Promise<boolean> {
    const value = await storageGetItem(DEFAULT_OFFLINE_TXN_SIGNING_SETTING_KEY);
    if (value == null) {
        settingsStore.offlineSignEnabled = false;
        return false;
    }

    const enabled = value === "enabled";
    settingsStore.offlineSignEnabled = enabled;
    return enabled;
}

export async function saveSelectedOfflineTxnSigningSetting(): Promise<void> {
    const radioButtons = document.querySelectorAll<HTMLInputElement>('input[name="optOfflineTxnSigning"]');
    let selectedValue = "";
    radioButtons.forEach(function (radioButton) {
        if (radioButton.checked) {
            selectedValue = radioButton.value;
        }
    });
    const result = await offlineTxnSigningSetDefaultValue(selectedValue);
    if ((result as boolean) == false) {
        showWarnAlert(getGenericError(""));
    } else {
        return;
    }
}

export async function advancedSigningSetDefaultValue(value: string): Promise<boolean> {
    const itemStoreResult = await storageSetItem(DEFAULT_ADVANCED_SIGNING_SETTING_KEY, value);
    if (itemStoreResult != true) {
        throw new Error("advancedSigningSetDefaultValue item store failed");
    }
    return true;
}

export async function advancedSigningGetDefaultValue(): Promise<boolean> {
    const value = await storageGetItem(DEFAULT_ADVANCED_SIGNING_SETTING_KEY);
    if (value == null) {
        return false;
    }
    if (value === "enabled") {
        return true;
    }
    return false;
}

export async function saveSelectedAdvancedSigningSetting(): Promise<void> {
    const radioButtons = document.querySelectorAll<HTMLInputElement>('input[name="optAdvancedSigning"]');
    let selectedValue = "";
    radioButtons.forEach(function (radioButton) {
        if (radioButton.checked) {
            selectedValue = radioButton.value;
        }
    });
    const result = await advancedSigningSetDefaultValue(selectedValue);
    if ((result as boolean) == false) {
        showWarnAlert(getGenericError(""));
    }
}
