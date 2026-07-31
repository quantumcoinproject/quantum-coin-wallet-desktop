import { networkStore, tokenStore } from "./state";
import { getCachedManualToken } from "./manual-token";

export const TOKEN_LIST_STATE_EVENT = "wallet-token-list-state";

export function setTokenListLoading(loading: boolean): void {
    tokenStore.isTokenListLoading = loading;
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(TOKEN_LIST_STATE_EVENT, { detail: { loading } }));
    }
}

/**
 * Decimals for a token picker value: "Q" (or empty) is the native coin at 18.
 * Checks manually-added tokens first, then the scan-API token list, and falls
 * back to 18 when the token is unknown.
 */
export function getTokenDecimals(value: string | null): number {
    if (!value || value === "Q") return 18;
    if (networkStore.currentBlockchainNetwork) {
        const manual = getCachedManualToken(
            parseInt(String(networkStore.currentBlockchainNetwork.networkId), 10),
            value,
        );
        if (manual != null) return manual.decimals;
    }
    const lower = value.toLowerCase();
    if (tokenStore.currentWalletTokenList != null) {
        for (let i = 0; i < tokenStore.currentWalletTokenList.length; i++) {
            const token = tokenStore.currentWalletTokenList[i] as { contractAddress: string; decimals?: number };
            if (token.contractAddress.toLowerCase() === lower && token.decimals != null) {
                return token.decimals;
            }
        }
    }
    return 18;
}
