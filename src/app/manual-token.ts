import { getTokenMetadata } from "../lib/bridge";
import { impersonatesStablecoin, isRecognizedToken } from "../lib/tokenfilter";

export interface ManualTokenMetadata {
    contractAddress: string;
    name: string;
    symbol: string;
    decimals: number;
    balance: string;
}

const manualTokenCache = new Map<string, ManualTokenMetadata>();

export function manualTokenCacheKey(chainId: number, contractAddress: string): string {
    return String(chainId) + "|" + String(contractAddress || "").trim().toLowerCase();
}

export function getCachedManualToken(chainId: number, contractAddress: string): ManualTokenMetadata | null {
    return manualTokenCache.get(manualTokenCacheKey(chainId, contractAddress)) || null;
}

export function getCachedManualTokens(chainId: number): ManualTokenMetadata[] {
    const prefix = String(chainId) + "|";
    const unique = new Map<string, ManualTokenMetadata>();
    for (const [key, token] of manualTokenCache.entries()) {
        if (key.startsWith(prefix)) unique.set(token.contractAddress.toLowerCase(), token);
    }
    return Array.from(unique.values());
}

function sanitizeMetadataText(value: unknown, maxLength: number): string {
    return String(value == null ? "" : value)
        // eslint-disable-next-line no-control-regex -- token metadata is untrusted RPC data
        .replace(/[\u202A-\u202E\u2066-\u2069\u200B-\u200D\u2060\uFEFF\u0000-\u001F\u007F-\u009F]/g, "")
        .replace(/[<>&"'`]/g, "")
        .trim()
        .substring(0, maxLength);
}

export async function resolveManualTokenMetadata(options: {
    rpcEndpoint: string;
    chainId: number;
    ownerAddress: string;
    contractAddress: string;
}): Promise<ManualTokenMetadata> {
    const requestedAddress = String(options.contractAddress || "").trim();
    if (requestedAddress === "") throw new Error("Enter a token contract address.");

    const cached = getCachedManualToken(options.chainId, requestedAddress);
    if (cached != null) return cached;

    const result = await getTokenMetadata({
        rpcEndpoint: options.rpcEndpoint,
        chainId: options.chainId,
        ownerAddress: options.ownerAddress,
        contractAddress: requestedAddress,
    });
    if (!result || result.success !== true || !result.contractAddress) {
        throw new Error(result && result.error ? String(result.error) : "Unable to read token contract.");
    }
    const name = sanitizeMetadataText(result.name, 48);
    const symbol = sanitizeMetadataText(result.symbol, 16);
    const decimals = Number(result.decimals);
    if (symbol === "" || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
        throw new Error("The contract does not expose valid token metadata.");
    }
    if (!isRecognizedToken(result.contractAddress) && impersonatesStablecoin(symbol, name)) {
        throw new Error("This token name or symbol is not allowed.");
    }
    const metadata: ManualTokenMetadata = {
        contractAddress: String(result.contractAddress),
        name,
        symbol,
        decimals,
        balance: String(result.balance == null ? "0" : result.balance),
    };
    manualTokenCache.set(manualTokenCacheKey(options.chainId, metadata.contractAddress), metadata);
    manualTokenCache.set(manualTokenCacheKey(options.chainId, requestedAddress), metadata);
    return metadata;
}
