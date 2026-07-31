"use strict";

// Mirrors the Android wallet's token recognition (RecognizedTokens) and
// stablecoin-impersonator suppression (StablecoinImpersonatorFilter).
// Recognition is by contract address only (not chainId-keyed). Symbol/name
// are only used to detect stablecoin impersonators.

export const RECOGNIZED_TOKEN_ADDRESSES = new Set([
    "0xe8ea8beb86e714ef2bde0afac17d6e45d1c35e48f312d6dc12c4fdb90d9e8a3d", // Heisen (HSN)
    "0xa8036870874fbed790ed4d3bbd41b2f390b9858ff021f2993e90c6d1cbb167c7", // Year2Quantum (Y2Q)
    "0x4015b40b181f2415003f24118b215ce04f276509176eccb10e0c4a9ccbd458d2", // Lion (Lio)
    "0x6ff70c260458c9f448ec7aab008f1611456d58edb12e7795bf88735e1986a6ad", // Tiger (tig)
    "0x592a8abb1de07bc3797bc3c592fc74c099c5a311ba856fc66fb6d4cfc18c728d", // Cat (cat)
    "0x05fe2265b69d0c70a24075180242736c7389876b8917f38400e6540519e663df", // panther (pant)
    "0x45bd01be5ef8509d9da183689ea7faf647331c54c7c9801de54c9ede9ac44d92"  // Wrapped Q (WQ, Beta2 release)
]);

export const STABLECOIN_IMPERSONATOR_PATTERNS = [
    "usd", "dai", "tether", "stable", "stablecoin",
    "frax", "fdusd", "lusd", "tusd", "gusd", "pyusd",
    "eurt", "eurc", "eurs",
    "dollar", "euro", "yen", "gbpt", "cny",
    "inr", "rupee", "rupiah"
];

export function isRecognizedToken(contract: string | null | undefined) {
    if (contract == null || contract.length === 0) {
        return false;
    }
    return RECOGNIZED_TOKEN_ADDRESSES.has(contract.toLowerCase());
}

export function impersonatesStablecoin(symbol: string | null | undefined, name: string | null | undefined) {
    const s = (symbol == null) ? "" : symbol.toLowerCase();
    const n = (name == null) ? "" : name.toLowerCase();
    if (s.length === 0 && n.length === 0) {
        return false;
    }
    for (let i = 0; i < STABLECOIN_IMPERSONATOR_PATTERNS.length; i++) {
        const p = STABLECOIN_IMPERSONATOR_PATTERNS[i];
        if (s.length !== 0 && s.includes(p)) {
            return true;
        }
        if (n.length !== 0 && n.includes(p)) {
            return true;
        }
    }
    return false;
}

export function filterStablecoinImpersonators(tokenList: Array<{ contractAddress?: string | null; symbol?: string | null; name?: string | null } | null> | null) {
    const out: Array<{ contractAddress?: string | null; symbol?: string | null; name?: string | null }> = [];
    if (tokenList == null) {
        return out;
    }
    for (let i = 0; i < tokenList.length; i++) {
        const token = tokenList[i];
        if (token == null) {
            continue;
        }
        if (isRecognizedToken(token.contractAddress)) {
            out.push(token);
            continue;
        }
        if (impersonatesStablecoin(token.symbol, token.name) === false) {
            out.push(token);
        }
    }
    return out;
}
