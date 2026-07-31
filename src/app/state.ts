// Shared application state and constants. The mutable globals of the old
// src/js/app.js live in small per-domain stores (wallet, network, tokens,
// transactions, settings, onboarding). Each store supports subscribe() so
// screens can react to changes; the ported logic modules still mutate fields
// directly and call notify() where reactions are needed.
import type { Wallet } from "../lib/wallet";
import type { BlockchainNetwork } from "../lib/blockchainNetwork";
import type { AccountDetails, AccountTokenDetails, TransactionDetails } from "../lib/api";
import type { AutoCompleteDropdownControl } from "../ui/autocomplete";

export const DATA_LANG_KEY = "data-lang-key";
export const DATA_PLACEHOLDER_KEY = "data-placeholder-key";
export const DATA_ALT_KEY = "data-alt-key";

export const ADDRESS_TEMPLATE = "[ADDRESS]";
export const SHORT_ADDRESS_TEMPLATE = "[SHORT_ADDRESS]";
export const STORAGE_PATH_TEMPLATE = "[STORAGE_PATH]";
export const ERROR_TEMPLATE = "[ERROR]";

export const BLOCK_EXPLORER_DOMAIN_TEMPLATE = "[BLOCK_EXPLORER_DOMAIN]";
export const BLOCK_EXPLORER_ACCOUNT_TEMPLATE = "https://[BLOCK_EXPLORER_DOMAIN]/account/[ADDRESS]";
export const BLOCK_EXPLORER_TRANSACTION_TEMPLATE = "https://[BLOCK_EXPLORER_DOMAIN]/txn/[TRANSACTION_HASH]";
export const zero_address = "0x0000000000000000000000000000000000000000000000000000000000000000"; // 32 bytes hex

export const TAB_INDEX_TEMPLATE = "[TAB_INDEX]";
export const TRANSACTION_HASH_TEMPLATE = "[TRANSACTION_HASH]";

// The dropdown marker the old app appended via innerHTML as "&#x25BC;".
export const DROPDOWN_TEXT = "\u25BC";
export const DEFAULT_OFFLINE_TXN_SIGNING_SETTING_KEY = "DefaultOfflineTxnSigningSettingKey";
export const DEFAULT_ADVANCED_SIGNING_SETTING_KEY = "DefaultAdvancedSigningSettingKey";
export const maxTokenNameLength = 25;
export const maxTokenSymbolLength = 6;
export const QuantumCoin = "QuantumCoin";
export const HTTPS = "https://";

export const ADDRESS_LENGTH_CHECK = 64;

/** String.replaceAll() treats $ in replacements specially; split/join is always literal. */
export function replaceTemplateToken(html: string, token: string, value: string): string {
    if (!token) {
        return html;
    }
    return html.split(token).join(value);
}

/** Replace only the first occurrence so user-supplied scan/txn/explorer text cannot match a later placeholder. */
export function replaceTemplateTokenOnce(html: string, token: string, value: string): string {
    if (!token) {
        return html;
    }
    const idx = html.indexOf(token);
    if (idx === -1) {
        return html;
    }
    return html.slice(0, idx) + value + html.slice(idx + token.length);
}

export function getShortAddress(address: string): string {
    let shortAddress = "";
    if (address.startsWith("0x") == true) {
        shortAddress = address.substring(2, 7);
    } else {
        shortAddress = address.substring(0, 5);
    }

    shortAddress = shortAddress + "..." + address.substring(address.length - 6, address.length);

    return shortAddress;
}

// Per-screen current gas state. Reset on screen open. `overridden` is true once the
// user edits values via the Gas dialog; the label is then not refetched until the
// transaction context changes again.
export interface GasState {
    gasLimit: string | null;
    gasFee: string | null;
    overridden: boolean;
    _token?: number;
}

export interface TxContext {
    txKind: string;
    defaultGasLimit?: number;
    toAddress?: string;
    amount?: string;
    contractAddress?: string | null;
    fromDecimals?: number;
    methodArgs?: string[];
    value?: string;
    bufferPercent?: number;
    ownerAddress?: string;
}

// Static row templates captured once at startup (the old app captured outerHTML
// strings; here the live template nodes are deep-cloned instead).
export interface RowTemplates {
    walletListRow: HTMLTableRowElement | null;
    blockchainNetworkOptionItem: HTMLElement | null;
    blockchainNetworkRow: HTMLTableRowElement | null;
    completedTxnInRow: HTMLTableRowElement | null;
    completedTxnOutRow: HTMLTableRowElement | null;
    failedTxnInRow: HTMLTableRowElement | null;
    failedTxnOutRow: HTMLTableRowElement | null;
    tokenListRow: HTMLTableRowElement | null;
}

export type Unsubscribe = () => void;

export interface Store {
    subscribe(listener: () => void): Unsubscribe;
}

// Small reactive store: direct field assignment (store.foo = x) notifies
// subscribers. Mutating a field in place (map.set, array.push) does not; call
// sites that need a reaction after in-place mutation reassign the field.
function createStore<T extends object>(fields: T): T & Store {
    const listeners = new Set<() => void>();
    const base = fields as T & Store;
    Object.defineProperty(base, "subscribe", {
        value: (listener: () => void): Unsubscribe => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        enumerable: false,
    });
    return new Proxy(base, {
        set(target, prop, value) {
            Reflect.set(target, prop, value);
            for (const listener of listeners) {
                listener();
            }
            return true;
        },
    });
}

// Onboarding / unlock flow state (info carousel, quiz, seed entry).
export const onboardingStore = createStore({
    currentInfoStep: 1,
    currentQuizStep: 1,
    tempPassword: "",
    tempSeedArray: null as Uint8Array | number[] | null,
    additionalWalletMode: false, //this means first wallet has already been created and user is trying to create additional wallet
    revealSeedArray: null as Uint8Array | null,
    currentSeedBytes: 96,
    autoCompleteInitialized: false,
    autoCompleteInitializedRestore: false,
    autoCompleteBoxes: [] as AutoCompleteDropdownControl[],
    autoCompleteBoxesRestore: [] as AutoCompleteDropdownControl[],
});

// Current wallet, balances and pending transaction notifications.
export const walletStore = createStore({
    STORAGE_PATH: "",
    currentWallet: null as Wallet | null,
    currentWalletAddress: "",
    specificWalletAddress: "",
    currentBalance: "",
    currentAccountDetails: null as AccountDetails | null,
    isRefreshingBalance: false,
    isRefreshingConfirmBalance: false,
    initAccountBalanceBackgroundStarted: false,
    isFirstTimeAccountRefresh: true,
    balanceNotificationMap: new Map<string, string>(), //address => balance
    pendingTransactionsMap: new Map<string, TransactionDetails>(), //address => last made txn
});

// Selected blockchain network.
export const networkStore = createStore({
    currentBlockchainNetworkIndex: -1,
    currentBlockchainNetwork: null as BlockchainNetwork | null,
});

// Token lists for the current wallet (home-screen token table, send dropdown).
export const tokenStore = createStore({
    currentWalletTokenList: [] as AccountTokenDetails[],
    currentWalletRecognizedTokens: [] as AccountTokenDetails[],
    currentWalletUnrecognizedTokens: [] as AccountTokenDetails[],
    showingUnrecognizedTokens: false,
    isTokenListLoading: false,
});

// Transactions screen paging.
export const txnStore = createStore({
    currentTxnPageIndex: 0,
    currentTxnPageCount: 0,
});

// User settings toggles.
export const settingsStore = createStore({
    offlineSignEnabled: false,
});

// Row templates captured once at startup; not reactive.
export const rowTemplates: RowTemplates = {
    walletListRow: null,
    blockchainNetworkOptionItem: null,
    blockchainNetworkRow: null,
    completedTxnInRow: null,
    completedTxnOutRow: null,
    failedTxnInRow: null,
    failedTxnOutRow: null,
    tokenListRow: null,
};

// Convenience typed lookups used across the ported modules. The old code used
// bare document.getElementById everywhere; these keep the ports close to it.
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

export function inputById(id: string): HTMLInputElement {
    return document.getElementById(id) as HTMLInputElement;
}

export function selectById(id: string): HTMLSelectElement {
    return document.getElementById(id) as HTMLSelectElement;
}

export function removeAllChildren(node: HTMLElement): void {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
}
