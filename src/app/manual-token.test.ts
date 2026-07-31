import { describe, expect, it, vi } from "vitest";

const metadataResponses = new Map<string, Record<string, unknown>>();
const send = vi.fn(async (channel: string, payload: { contractAddress: string }) => {
    if (channel !== "TokenGetMetadata") throw new Error("Unexpected channel");
    const response = metadataResponses.get(payload.contractAddress.toLowerCase());
    return response || { success: false, error: "Unknown contract" };
});
vi.stubGlobal("SwapQuoteApi", { send });

const {
    getCachedManualToken,
    manualTokenCacheKey,
    resolveManualTokenMetadata,
} = await import("./manual-token");

describe("manual token metadata", () => {
    it("normalizes cache keys and reuses resolved metadata", async () => {
        metadataResponses.set("0xabcdef", {
            success: true,
            contractAddress: "0xAbCdEf",
            name: "Example Token",
            symbol: "EXM",
            decimals: 8,
            balance: "12.5",
        });

        const first = await resolveManualTokenMetadata({
            rpcEndpoint: "https://rpc.example",
            chainId: 123,
            ownerAddress: "0xowner",
            contractAddress: "0xABCDEF",
        });
        const callsAfterFirst = send.mock.calls.length;
        const second = await resolveManualTokenMetadata({
            rpcEndpoint: "https://rpc.example",
            chainId: 123,
            ownerAddress: "0xowner",
            contractAddress: "0xabcdef",
        });

        expect(first).toEqual({
            contractAddress: "0xAbCdEf",
            name: "Example Token",
            symbol: "EXM",
            decimals: 8,
            balance: "12.5",
        });
        expect(second).toBe(first);
        expect(send).toHaveBeenCalledTimes(callsAfterFirst);
        expect(getCachedManualToken(123, "0xABCDEF")).toBe(first);
        expect(manualTokenCacheKey(123, " 0xABCDEF ")).toBe("123|0xabcdef");
    });

    it("rejects unknown stablecoin impersonators", async () => {
        metadataResponses.set("0xbad", {
            success: true,
            contractAddress: "0xBAD",
            name: "Fake Dollar",
            symbol: "USDQ",
            decimals: 18,
            balance: "0",
        });

        await expect(resolveManualTokenMetadata({
            rpcEndpoint: "https://rpc.example",
            chainId: 456,
            ownerAddress: "0xowner",
            contractAddress: "0xBAD",
        })).rejects.toThrow("not allowed");
    });
});
