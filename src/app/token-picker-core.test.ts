import { describe, expect, it } from "vitest";
import {
    TokenLookupGuard,
    TokenPickerItem,
    createOfflineTokenFallback,
    filterTokenPickerItems,
    looksLikeTokenAddress,
    tokenPickerDisplay,
} from "./token-picker-core";

const addressA = "0x" + "a".repeat(64);
const addressB = "0x" + "b".repeat(64);
const items: TokenPickerItem[] = [
    {
        value: addressA,
        contractAddress: addressA,
        symbol: "ALP",
        name: "Alpha Token",
        decimals: 8,
        balance: "12.5",
        recognized: true,
    },
    {
        value: addressB,
        contractAddress: addressB,
        symbol: "BET",
        name: "Beta Token",
        decimals: 18,
        balance: "3",
        recognized: false,
    },
];

describe("token picker core", () => {
    it("searches by name, symbol, and contract case-insensitively", () => {
        expect(filterTokenPickerItems(items, "alpha")).toEqual([items[0]]);
        expect(filterTokenPickerItems(items, "bEt")).toEqual([items[1]]);
        expect(filterTokenPickerItems(items, addressA.toUpperCase())).toEqual([items[0]]);
        expect(filterTokenPickerItems(items, "")[0].balance).toBe("12.5");
    });

    it("excludes the token selected on the opposite side", () => {
        expect(filterTokenPickerItems(items, "", addressA)).toEqual([items[1]]);
    });

    it("formats resolved and offline-fallback selections", () => {
        expect(tokenPickerDisplay(items[0])).toBe("ALP (0xaaaa...aaaa)");
        const fallback = createOfflineTokenFallback(addressB, "Unresolved token contract");
        expect(fallback.balance).toBeNull();
        expect(fallback.unresolved).toBe(true);
        expect(tokenPickerDisplay(fallback)).toBe("Token (0xbbbb...bbbb)");
        expect(looksLikeTokenAddress(addressB)).toBe(true);
    });

    it("suppresses stale asynchronous lookup results", () => {
        const guard = new TokenLookupGuard();
        const first = guard.begin();
        const second = guard.begin();
        expect(guard.isCurrent(first)).toBe(false);
        expect(guard.isCurrent(second)).toBe(true);
        guard.invalidate();
        expect(guard.isCurrent(second)).toBe(false);
    });
});
