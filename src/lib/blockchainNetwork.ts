// Blockchain network config CRUD. 1:1 port of the old src/js/blockchain-network.js.
// Key names (MaxBlockchainNetworkIndex4, DefaultBlockchainNetworkIndex4,
// BLOCKCHAIN_NETWORK_3_{n}) and the stored JSON field order are a storage
// compatibility contract.
import { ReadFile } from "./bridge";
import { isNumber } from "./wallet";
import { storageGetItem, storageSetItem } from "./storage";

const MAX_BLOCKCHAIN_NETWORK_INDEX_KEY = "MaxBlockchainNetworkIndex4";
const DEFAULT_BLOCKCHAIN_NETWORK_INDEX_KEY = "DefaultBlockchainNetworkIndex4";
const BLOCKCHAIN_NETWORK_KEY_PREFIX = "BLOCKCHAIN_NETWORK_3_";
const MAX_BLOCKCHAIN_NETWORKS = 100;

let blockchainIndexToNetworkMap = new Map<number, BlockchainNetwork>(); //key is index, value is BlockchainNetwork

/** Windows JSON-RPC over named pipe (Geth): //./pipe/geth.ipc or \\.\pipe\geth.ipc */
export function isWindowsNamedPipeRpcPath(s: unknown): boolean {
    const t = String(s).trim();
    if (/^\/\/\.\/pipe\/.+/i.test(t)) {
        return true;
    }
    return /^\\\\\.\\pipe\\/i.test(t);
}

/** Unix domain socket path, .../geth.ipc, ~/.../geth.ipc, or Windows-style ~\...\geth.ipc */
export function isUnixIpcSocketRpcPath(s: unknown): boolean {
    const t = String(s).trim();
    if (t.length < 2 || t.length > 512) {
        return false;
    }
    if (!/\.ipc$/i.test(t)) {
        return false;
    }
    if (t.startsWith("/") && !t.startsWith("//")) {
        return true;
    }
    if (t.startsWith("~/") || t.startsWith("~\\")) {
        return true;
    }
    if (/^~[^/\\]+[/\\]/.test(t)) {
        return true;
    }
    return false;
}

export function normalizeIpcRpcPath(s: unknown): string {
    const t = String(s).trim();
    if (/^\\\\\.\\pipe\\/i.test(t)) {
        return "//./pipe/" + t.replace(/^\\\\\.\\pipe\\/i, "").replace(/\\/g, "/");
    }
    if (/\.ipc$/i.test(t) && t.startsWith("~")) {
        return t.replace(/\\/g, "/");
    }
    return t;
}

/** Strip ws(s)://, https://, paths, and userinfo; return host[:port] for use with buildSwapRpcUrl. */
export function normalizeRpcEndpoint(rpcEndpoint: unknown): any {
    if (rpcEndpoint == null || typeof rpcEndpoint !== "string") {
        return rpcEndpoint;
    }
    const s = rpcEndpoint.trim();
    if (s === "") {
        return s;
    }
    if (isWindowsNamedPipeRpcPath(s) || isUnixIpcSocketRpcPath(s)) {
        return normalizeIpcRpcPath(s);
    }
    if (/^(\d{1,3}\.){3}\d{1,3}(:[0-9]{1,5})?$/.test(s)) {
        return s;
    }
    if (/^localhost(:[0-9]{1,5})?$/i.test(s)) {
        return s;
    }
    try {
        const withScheme = /^(https?|wss?):\/\//i.test(s) ? s : "https://" + s;
        const u = new URL(withScheme);
        if (!u.hostname) {
            return s;
        }
        return u.port ? u.hostname + ":" + u.port : u.hostname;
    } catch {
        return s;
    }
}

export function isValidRpcEndpointHost(s: unknown): boolean {
    if (s == null) {
        return false;
    }
    const trimmed = String(s).trim();
    if (trimmed === "") {
        return false;
    }
    if (isWindowsNamedPipeRpcPath(trimmed) || isUnixIpcSocketRpcPath(trimmed)) {
        return true;
    }
    const normalizedIpc = normalizeIpcRpcPath(trimmed);
    if (isWindowsNamedPipeRpcPath(normalizedIpc) || isUnixIpcSocketRpcPath(normalizedIpc)) {
        return true;
    }
    try {
        const withScheme = /^(https?|wss?):\/\//i.test(trimmed) ? trimmed : "https://" + trimmed;
        const u = new URL(withScheme);
        if (!u.hostname || u.hostname.length < 1 || u.hostname.length > 253) {
            return false;
        }
        if (u.port !== "" && (parseInt(u.port, 10) < 1 || parseInt(u.port, 10) > 65535)) {
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

export const isValidDomainName = (supposedDomainName: string): boolean => {
    if (/localhost:[0-9]{1,5}/.test(supposedDomainName) === true) {
        return true;
    }
    // Allow any IPv4 address with optional port for HTTP (e.g. 192.168.1.1:8545 or 127.0.0.1)
    if (/^(\d{1,3}\.){3}\d{1,3}(:[0-9]{1,5})?$/.test(supposedDomainName) === true) {
        return true;
    }

    // eslint-disable-next-line no-useless-escape
    return /^(?!-)[A-Za-z0-9-]+([\-\.]{1}[a-z0-9]+)*\.[A-Za-z]{2,6}$/i.test(
        supposedDomainName
    );
};

export class BlockchainNetwork {
    scanApiDomain: string;
    blockExplorerDomain: string;
    networkId: number;
    blockchainName: string;
    rpcEndpoint: string;
    index: number;

    constructor(scanApiDomain: string, blockExplorerDomain: string, networkId: number, blockchainName: string, rpcEndpoint: string | undefined, index: number) {
        if (scanApiDomain == null || blockExplorerDomain == null || networkId == null || blockchainName == null) {
            throw new Error("BlockchainNetwork null values");
        }

        if (isValidDomainName(scanApiDomain) == false) {
            throw new Error("BlockchainNetwork invalid URL");
        }

        const id = parseInt(String(networkId));

        if (isNumber(id) == false) {
            throw new Error("BlockchainNetwork invalid networkId.");
        }

        if (blockchainName == null || blockchainName.length < 5 || blockchainName.length > 30 || blockchainName.trim().length != blockchainName.length) {
            throw new Error("BlockchainNetwork invalid blockchainName.");
        }

        let rpc: string;
        if (rpcEndpoint == null || rpcEndpoint === "") {
            rpc = "public.rpc.quantumcoinapi.com";
        } else if (typeof rpcEndpoint !== "string") {
            rpc = String(rpcEndpoint);
        } else {
            rpc = rpcEndpoint;
        }
        if (rpc.trim() === "") {
            rpc = "public.rpc.quantumcoinapi.com";
        } else {
            rpc = normalizeRpcEndpoint(rpc.trim());
        }
        if (isValidRpcEndpointHost(rpc) == false) {
            throw new Error("BlockchainNetwork invalid rpcEndpoint URL");
        }

        this.scanApiDomain = scanApiDomain;
        this.blockExplorerDomain = blockExplorerDomain;
        this.networkId = networkId;
        this.blockchainName = blockchainName;
        this.rpcEndpoint = rpc;
        this.index = index;
    }
}

export async function blockchainNetworkGetMaxIndex(): Promise<number> {
    const result = await storageGetItem(MAX_BLOCKCHAIN_NETWORK_INDEX_KEY);
    if (result == null) {
        return -1;
    }

    const maxIndex = parseInt(result);

    if (isNumber(maxIndex) == false) {
        throw new Error("blockchainNetworkGetMaxIndex maxIndex is not a number.");
    }

    if (maxIndex < 0 || maxIndex > MAX_BLOCKCHAIN_NETWORKS) {
        throw new Error("blockchainNetworkGetMaxIndex maxIndex out of range.");
    }

    return maxIndex;
}

export async function blockchainNetworksInit(): Promise<void> {
    const result = await blockchainNetworkGetMaxIndex();
    if (result == -1) {
        await blockchainNetworkSaveDefaults();
    }
}

export async function blockchainNetworkSaveDefaults(): Promise<void> {
    const networksString = await ReadFile("./json/blockchain-networks.json");
    if (networksString == null) {
        throw new Error("loadDefaultBlockchainNetworks load error");
    }

    const networkList = JSON.parse(networksString);
    if (networkList == null || networkList.networks == null || networkList.networks.length < 1) {
        throw new Error("loadDefaultBlockchainNetworks json error");
    }

    for (let i = 0; i < networkList.networks.length; i++) {
        const networkItem = JSON.stringify(networkList.networks[i]);
        const key = BLOCKCHAIN_NETWORK_KEY_PREFIX + i.toString();

        const itemStoreResult = await storageSetItem(key, networkItem);
        if (itemStoreResult != true) {
            throw new Error("saveDefaultBlockchainNetworks item store failed");
        }
    }

    const indexStoreResult = await storageSetItem(MAX_BLOCKCHAIN_NETWORK_INDEX_KEY, (networkList.networks.length - 1).toString());
    if (indexStoreResult != true) {
        throw new Error("saveDefaultBlockchainNetworks index store failed failed");
    }
}

/**
 * Re-encode the rpcEndpoint string literal so Windows IPC paths (e.g. \\.\pipe\geth.ipc) work when pasted
 * without JSON-escaping each backslash. Only the quoted value after "rpcEndpoint" is rewritten.
 */
export function repairRpcEndpointQuotedValue(jsonString: string): string {
    return jsonString.replace(
        /"rpcEndpoint"\s*:\s*"([^"]*)"/,
        function (_m, inner) {
            return '"rpcEndpoint": ' + JSON.stringify(inner);
        }
    );
}

/** Parse Add Network JSON; on failure, retry after fixing common rpcEndpoint backslash mistakes. */
export function parseNetworkJsonForAdd(jsonRaw: unknown): any {
    const s = typeof jsonRaw === "string" ? jsonRaw.replace(/^\uFEFF/, "").trim() : String(jsonRaw);
    try {
        return JSON.parse(s);
    } catch {
        const repaired = repairRpcEndpointQuotedValue(s);
        return JSON.parse(repaired);
    }
}

export async function blockchainNetworkAddNew(networkJson: unknown): Promise<void> {
    const jsonRaw = typeof networkJson === "string" ? networkJson.replace(/^\uFEFF/, "").trim() : String(networkJson);
    const networkItem = parseNetworkJsonForAdd(jsonRaw);
    let maxIndex = await blockchainNetworkGetMaxIndex();
    maxIndex = maxIndex + 1;
    const blockchainNetwork = new BlockchainNetwork(networkItem.scanApiDomain, networkItem.blockExplorerDomain, networkItem.networkId, networkItem.blockchainName, networkItem.rpcEndpoint, maxIndex);
    const key = BLOCKCHAIN_NETWORK_KEY_PREFIX + maxIndex.toString();

    const stored = {
        scanApiDomain: networkItem.scanApiDomain,
        blockExplorerDomain: networkItem.blockExplorerDomain,
        networkId: networkItem.networkId,
        blockchainName: String(networkItem.blockchainName),
        rpcEndpoint: blockchainNetwork.rpcEndpoint,
    };
    let itemStoreResult = await storageSetItem(key, JSON.stringify(stored));
    if (itemStoreResult != true) {
        throw new Error("blockchainNetworkAddNew item store failed");
    }

    itemStoreResult = await storageSetItem(MAX_BLOCKCHAIN_NETWORK_INDEX_KEY, maxIndex.toString());
    if (itemStoreResult != true) {
        throw new Error("blockchainNetworkAddNew item store index failed");
    }

    blockchainIndexToNetworkMap.set(maxIndex, blockchainNetwork);
}

export async function blockchainNetworksList(): Promise<Map<number, BlockchainNetwork>> {
    blockchainIndexToNetworkMap = new Map();
    const maxIndex = await blockchainNetworkGetMaxIndex();
    for (let i = 0; i <= maxIndex; i++) {
        const key = BLOCKCHAIN_NETWORK_KEY_PREFIX + i.toString();
        const networkJson = await storageGetItem(key);
        if (networkJson == null || networkJson === "") {
            console.warn("quantumswapwallet: missing network storage entry " + key);
            continue;
        }
        const networkItem = JSON.parse(networkJson);
        if (networkItem.rpcEndpoint === undefined || networkItem.rpcEndpoint === null || networkItem.rpcEndpoint === "") {
            delete networkItem.rpcEndpoint;
        }
        const blockchainNetwork = new BlockchainNetwork(networkItem.scanApiDomain, networkItem.blockExplorerDomain, networkItem.networkId, networkItem.blockchainName, networkItem.rpcEndpoint, i);
        blockchainIndexToNetworkMap.set(i, blockchainNetwork);
    }

    return blockchainIndexToNetworkMap;
}

export async function blockchainNetworkSetDefaultIndex(index: number): Promise<boolean> {
    const result = await blockchainNetworkGetMaxIndex();
    if (result == null || index < 0 || index > result) {
        index = 0;
    }

    // The old app passed the number through; localStorage coerces it to a string.
    const itemStoreResult = await storageSetItem(DEFAULT_BLOCKCHAIN_NETWORK_INDEX_KEY, String(index));
    if (itemStoreResult != true) {
        throw new Error("blockchainNetworkSetDefaultIndex item store failed");
    }

    return true;
}

export async function blockchainNetworkGetDefaultIndex(): Promise<number> {
    const result = await storageGetItem(DEFAULT_BLOCKCHAIN_NETWORK_INDEX_KEY);
    if (result == null) {
        return 0;
    }

    const defaultIndex = parseInt(result);

    if (isNumber(defaultIndex) == false) {
        throw new Error("blockchainNetworkGetDefaultIndex maxIndex is not a number.");
    }

    if (defaultIndex < 0 || defaultIndex > MAX_BLOCKCHAIN_NETWORKS) {
        throw new Error("blockchainNetworkGetDefaultIndex defaultIndex out of range.");
    }

    return defaultIndex;
}
