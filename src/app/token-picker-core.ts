export interface TokenPickerItem {
    value: string;
    contractAddress: string | null;
    symbol: string;
    name: string;
    decimals: number;
    balance: string | null;
    recognized: boolean;
    imported?: boolean;
    unresolved?: boolean;
}

export function shortTokenAddress(address: string): string {
    const value = String(address || "");
    return value.length > 12 ? value.slice(0, 6) + "..." + value.slice(-4) : value;
}

export function tokenPickerDisplay(item: TokenPickerItem): string {
    if (item.value === "Q" || !item.contractAddress) return item.symbol;
    return item.symbol + " (" + shortTokenAddress(item.contractAddress) + ")";
}

export function looksLikeTokenAddress(value: string): boolean {
    return /^0x[0-9a-fA-F]{64}$/.test(String(value || "").trim());
}

export class TokenLookupGuard {
    private generation = 0;

    begin(): number {
        return ++this.generation;
    }

    isCurrent(request: number): boolean {
        return request === this.generation;
    }

    invalidate(): void {
        this.generation++;
    }
}

export function createOfflineTokenFallback(address: string, name: string): TokenPickerItem {
    return {
        value: address,
        contractAddress: address,
        symbol: "Token",
        name,
        decimals: 18,
        balance: null,
        recognized: false,
        unresolved: true,
    };
}

export function filterTokenPickerItems(
    items: TokenPickerItem[],
    query: string,
    excludeValue?: string | null,
): TokenPickerItem[] {
    const q = String(query || "").trim().toLowerCase();
    const excluded = String(excludeValue || "").toLowerCase();
    return items.filter((item) => {
        if (excluded !== "" && item.value.toLowerCase() === excluded) return false;
        if (q === "") return true;
        return item.symbol.toLowerCase().includes(q) ||
            item.name.toLowerCase().includes(q) ||
            String(item.contractAddress || "").toLowerCase().includes(q);
    });
}
