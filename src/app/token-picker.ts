import { langJson } from "../lib/i18n";
import { isRecognizedToken } from "../lib/tokenfilter";
import { byId, inputById, networkStore, tokenStore, walletStore } from "./state";
import {
    ManualTokenMetadata,
    getCachedManualToken,
    getCachedManualTokens,
    resolveManualTokenMetadata,
} from "./manual-token";
import { TOKEN_LIST_STATE_EVENT } from "./token-list-state";
import {
    TokenPickerItem,
    TokenLookupGuard,
    createOfflineTokenFallback,
    filterTokenPickerItems,
    looksLikeTokenAddress,
    shortTokenAddress,
    tokenPickerDisplay,
} from "./token-picker-core";

export interface TokenPickerOptions {
    allowNativeQ: boolean;
    allowUnrecognized: boolean;
    excludeValue?: string | null;
    allowOfflineFallback?: boolean;
    /** Token currently held by the caller's hidden <select>, marked as selected in the list. */
    selectedValue?: string | null;
    onSelect: (item: TokenPickerItem) => void;
}

let currentOptions: TokenPickerOptions | null = null;
const lookupGuard = new TokenLookupGuard();
let bound = false;
let showUnrecognized = false;
let previousHtmlOverflow: string | null = null;
let previousBodyOverflow: string | null = null;

function t(key: string, fallback: string): string {
    return (langJson && langJson.langValues && langJson.langValues[key]) || fallback;
}

function currentChainId(): number {
    return networkStore.currentBlockchainNetwork
        ? parseInt(String(networkStore.currentBlockchainNetwork.networkId), 10)
        : 0;
}

function fromManualToken(token: ManualTokenMetadata): TokenPickerItem {
    return {
        value: token.contractAddress,
        contractAddress: token.contractAddress,
        symbol: token.symbol,
        name: token.name || "Unknown Token",
        decimals: token.decimals,
        balance: token.balance,
        recognized: isRecognizedToken(token.contractAddress),
        imported: true,
    };
}

export function getTokenPickerItems(options: { allowNativeQ: boolean; includeUnrecognized: boolean }): TokenPickerItem[] {
    const items: TokenPickerItem[] = [];
    const seen = new Set<string>();
    if (options.allowNativeQ) {
        items.push({
            value: "Q",
            contractAddress: null,
            symbol: "Q",
            name: "QuantumCoin",
            decimals: 18,
            balance: walletStore.currentBalance || "0",
            recognized: true,
        });
        seen.add("q");
    }
    const source = options.includeUnrecognized
        ? tokenStore.currentWalletRecognizedTokens.concat(tokenStore.currentWalletUnrecognizedTokens)
        : tokenStore.currentWalletRecognizedTokens;
    for (const token of source) {
        const key = String(token.contractAddress || "").toLowerCase();
        if (!key || seen.has(key)) continue;
        const cached = getCachedManualToken(currentChainId(), token.contractAddress);
        items.push({
            value: token.contractAddress,
            contractAddress: token.contractAddress,
            symbol: token.symbol || cached?.symbol || "Token",
            name: token.name || cached?.name || "Unknown Token",
            decimals: cached?.decimals ?? 18,
            balance: token.tokenBalance || cached?.balance || "0",
            recognized: isRecognizedToken(token.contractAddress),
        });
        seen.add(key);
    }
    for (const token of getCachedManualTokens(currentChainId())) {
        const key = token.contractAddress.toLowerCase();
        if (seen.has(key)) continue;
        items.push(fromManualToken(token));
        seen.add(key);
    }
    return items;
}

function setBusy(busy: boolean): void {
    byId("spanTokenPickerSpinner").style.display = busy ? "block" : "none";
}

function setStatus(message: string): void {
    byId("divTokenPickerStatus").textContent = message;
}

function updateUnrecognizedToggle(): void {
    const label = byId("labelTokenPickerUnrecognized");
    const canShow = currentOptions?.allowUnrecognized === true &&
        tokenStore.currentWalletUnrecognizedTokens.length > 0;
    label.style.display = canShow ? "flex" : "none";
}

function closeTokenPicker(): void {
    lookupGuard.invalidate();
    currentOptions = null;
    const dialog = byId<HTMLDialogElement>("modalTokenPicker");
    dialog.style.display = "none";
    if (dialog.open) dialog.close();
    setBusy(false);
    if (previousHtmlOverflow != null) {
        document.documentElement.style.overflow = previousHtmlOverflow;
        previousHtmlOverflow = null;
    }
    if (previousBodyOverflow != null) {
        document.body.style.overflow = previousBodyOverflow;
        previousBodyOverflow = null;
    }
}

function choose(item: TokenPickerItem): void {
    const options = currentOptions;
    closeTokenPicker();
    if (options) options.onSelect(item);
}

function tokenRow(item: TokenPickerItem): HTMLElement {
    const row = document.createElement("button");
    row.type = "button";
    const selected = currentOptions?.selectedValue != null
        && currentOptions.selectedValue.toLowerCase() === item.value.toLowerCase();
    row.className = selected ? "token-picker-row selected" : "token-picker-row";
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", selected ? "true" : "false");
    const left = document.createElement("span");
    const symbolLine = document.createElement("span");
    symbolLine.className = "token-picker-symbol";
    const marker = document.createElement("span");
    marker.className = "token-picker-marker";
    marker.textContent = "\u25cf";
    symbolLine.appendChild(marker);
    symbolLine.appendChild(document.createTextNode(item.symbol));
    if (item.recognized) {
        const badge = document.createElement("span");
        badge.className = "token-picker-badge default";
        badge.textContent = t("token-picker-default", "default");
        symbolLine.appendChild(badge);
    } else if (item.imported) {
        const badge = document.createElement("span");
        badge.className = "token-picker-badge imported";
        badge.textContent = t("token-picker-imported", "imported");
        symbolLine.appendChild(badge);
    } else {
        const badge = document.createElement("span");
        badge.className = "token-picker-badge unrecognized";
        badge.textContent = t("token-picker-unrecognized", "unrecognized");
        symbolLine.appendChild(badge);
    }
    const name = document.createElement("span");
    name.className = "token-picker-name";
    name.textContent = item.name;
    left.appendChild(symbolLine);
    left.appendChild(name);
    if (item.contractAddress) {
        const address = document.createElement("span");
        address.className = "token-picker-address";
        address.textContent = shortTokenAddress(item.contractAddress);
        left.appendChild(address);
    }
    const balance = document.createElement("span");
    balance.className = "token-picker-balance";
    balance.textContent = item.balance == null ? "\u2014" : item.balance;
    row.appendChild(left);
    row.appendChild(balance);
    row.addEventListener("click", () => choose(item));
    return row;
}

async function renderTokenPicker(): Promise<void> {
    const options = currentOptions;
    if (!options) return;
    const seq = lookupGuard.begin();
    const query = (inputById("txtTokenPickerSearch").value || "").trim();
    const list = byId("divTokenPickerList");
    list.textContent = "";
    setBusy(false);
    const filtered = filterTokenPickerItems(getTokenPickerItems({
        allowNativeQ: options.allowNativeQ,
        includeUnrecognized: showUnrecognized,
    }), query, options.excludeValue);
    for (const item of filtered) list.appendChild(tokenRow(item));
    if (filtered.length > 0) {
        if (tokenStore.isTokenListLoading) {
            setStatus(t("token-picker-loading-list", "Loading token list..."));
            setBusy(true);
        } else {
            setStatus("");
        }
        return;
    }
    if (tokenStore.isTokenListLoading && query === "") {
        setStatus(t("token-picker-loading-list", "Loading token list..."));
        setBusy(true);
        return;
    }
    if (!looksLikeTokenAddress(query)) {
        setStatus(t("token-picker-no-results", "No tokens match your search."));
        return;
    }
    if (String(options.excludeValue || "").toLowerCase() === query.toLowerCase()) {
        setStatus(t("token-picker-no-results", "No tokens match your search."));
        return;
    }
    // With offline signing enabled the pasted contract is selectable right
    // away (the on-chain lookup may hang or fail entirely while offline); the
    // fallback row is replaced by resolved metadata if the lookup succeeds.
    let fallbackRow: HTMLElement | null = null;
    if (options.allowOfflineFallback) {
        fallbackRow = tokenRow(createOfflineTokenFallback(
            query,
            t("token-picker-unresolved-token", "Unresolved token contract"),
        ));
        list.appendChild(fallbackRow);
    }
    if (!networkStore.currentBlockchainNetwork) {
        setStatus(options.allowOfflineFallback
            ? t("token-picker-offline-fallback", "Token details unavailable. You can still select this contract for offline signing.")
            : t("token-picker-no-network", "Token lookup is unavailable."));
        return;
    }
    setStatus(t("token-picker-looking-up", "Looking up token on-chain..."));
    setBusy(true);
    try {
        const token = await resolveManualTokenMetadata({
            rpcEndpoint: networkStore.currentBlockchainNetwork.rpcEndpoint,
            chainId: currentChainId(),
            ownerAddress: walletStore.currentWalletAddress,
            contractAddress: query,
        });
        if (!lookupGuard.isCurrent(seq) || currentOptions !== options) return;
        setBusy(false);
        setStatus("");
        if (fallbackRow) fallbackRow.remove();
        list.appendChild(tokenRow(fromManualToken(token)));
    } catch (err: any) {
        if (!lookupGuard.isCurrent(seq) || currentOptions !== options) return;
        setBusy(false);
        if (options.allowOfflineFallback) {
            setStatus(t("token-picker-offline-fallback", "Token details unavailable. You can still select this contract for offline signing."));
        } else {
            setStatus((err && err.message) ? String(err.message) : String(err));
        }
    }
}

function bindTokenPicker(): void {
    if (bound) return;
    bound = true;
    byId("btnTokenPickerClose").addEventListener("click", closeTokenPicker);
    inputById("txtTokenPickerSearch").addEventListener("input", () => { void renderTokenPicker(); });
    inputById("chkTokenPickerUnrecognized").addEventListener("change", () => {
        showUnrecognized = inputById("chkTokenPickerUnrecognized").checked;
        void renderTokenPicker();
    });
    byId<HTMLDialogElement>("modalTokenPicker").addEventListener("cancel", (event) => {
        event.preventDefault();
        closeTokenPicker();
    });
    window.addEventListener(TOKEN_LIST_STATE_EVENT, () => {
        if (currentOptions) {
            updateUnrecognizedToggle();
            void renderTokenPicker();
        }
    });
}

export function openTokenPicker(options: TokenPickerOptions): void {
    bindTokenPicker();
    currentOptions = options;
    showUnrecognized = false;
    inputById("chkTokenPickerUnrecognized").checked = false;
    updateUnrecognizedToggle();
    inputById("txtTokenPickerSearch").value = "";
    setStatus("");
    setBusy(false);
    const dialog = byId<HTMLDialogElement>("modalTokenPicker");
    previousHtmlOverflow = document.documentElement.style.overflow;
    previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    dialog.style.display = "flex";
    dialog.showModal();
    void renderTokenPicker();
    setTimeout(() => inputById("txtTokenPickerSearch").focus(), 0);
}

export function applyTokenPickerSelection(
    selectId: string,
    triggerId: string,
    item: TokenPickerItem,
): void {
    const select = document.getElementById(selectId) as HTMLSelectElement;
    let matching: HTMLOptionElement | null = null;
    for (const option of Array.from(select.options)) {
        if (option.value.toLowerCase() === item.value.toLowerCase()) {
            matching = option;
            break;
        }
    }
    if (!matching) {
        matching = document.createElement("option");
        matching.value = item.value;
        select.add(matching);
    }
    matching.text = tokenPickerDisplay(item);
    select.value = matching.value;
    byId(triggerId).textContent = tokenPickerDisplay(item);
}

export function setTokenPickerTriggerText(
    selectId: string,
    triggerId: string,
    placeholder = "Select token",
): void {
    const select = document.getElementById(selectId) as HTMLSelectElement | null;
    const trigger = document.getElementById(triggerId);
    if (!select || !trigger) return;
    const value = select.value;
    if (!value) {
        trigger.textContent = placeholder;
        return;
    }
    const item = getTokenPickerItems({ allowNativeQ: true, includeUnrecognized: true })
        .find((token) => token.value.toLowerCase() === value.toLowerCase());
    trigger.textContent = item ? tokenPickerDisplay(item) : select.options[select.selectedIndex]?.text || placeholder;
}
