import { describe, expect, it } from "vitest";
import {
    filterStablecoinImpersonators,
    impersonatesStablecoin,
    isRecognizedToken,
    RECOGNIZED_TOKEN_ADDRESSES,
} from "./tokenfilter";

describe("isRecognizedToken", () => {
    const heisen = [...RECOGNIZED_TOKEN_ADDRESSES][0];

    it("returns true for a known address (case-insensitive)", () => {
        expect(isRecognizedToken(heisen)).toBe(true);
        expect(isRecognizedToken(heisen.toUpperCase())).toBe(true);
    });

    it("returns false for an unknown address", () => {
        expect(isRecognizedToken("0x0000000000000000000000000000000000000000000000000000000000000001")).toBe(false);
    });

    it("returns false for null/empty", () => {
        expect(isRecognizedToken(null)).toBe(false);
        expect(isRecognizedToken("")).toBe(false);
    });
});

describe("impersonatesStablecoin", () => {
    it("returns true when symbol matches a stablecoin pattern", () => {
        expect(impersonatesStablecoin("fUSDT", null)).toBe(true);
    });

    it("returns true when name matches a stablecoin pattern", () => {
        expect(impersonatesStablecoin(null, "Fake Tether Token")).toBe(true);
    });

    it("returns false for unrelated tokens", () => {
        expect(impersonatesStablecoin("HEISEN", "Heisen Token")).toBe(false);
    });

    it("returns false when both symbol and name are empty", () => {
        expect(impersonatesStablecoin(null, null)).toBe(false);
        expect(impersonatesStablecoin("", "")).toBe(false);
    });
});

describe("filterStablecoinImpersonators", () => {
    const heisen = [...RECOGNIZED_TOKEN_ADDRESSES][0];

    it("keeps recognized tokens even if they look like stablecoin impersonators", () => {
        const recognized = { contractAddress: heisen, symbol: "USDT", name: "Tether USD" };
        expect(filterStablecoinImpersonators([recognized])).toEqual([recognized]);
    });

    it("drops stablecoin impersonators that are not recognized", () => {
        const impersonator = { contractAddress: "0xdead", symbol: "USDT", name: "Tether USD" };
        expect(filterStablecoinImpersonators([impersonator])).toEqual([]);
    });

    it("keeps non-impersonator tokens", () => {
        const legit = { contractAddress: "0xdead", symbol: "HEISEN", name: "Heisen Token" };
        expect(filterStablecoinImpersonators([legit])).toEqual([legit]);
    });

    it("returns empty array for null input", () => {
        expect(filterStablecoinImpersonators(null)).toEqual([]);
    });
});
