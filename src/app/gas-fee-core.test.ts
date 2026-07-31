import { describe, expect, it } from "vitest";
import {
    computeSdkGasFeeEth,
    CRUDE_GAS_FEE_RATE,
    SDK_DYNAMIC_BASE_GAS_PRICE_WEI,
    SDK_KEY_TYPE_3,
    SDK_KEY_TYPE_5,
    SDK_SIGNING_CONTEXT_LEVEL2_MULTIPLIER,
    sdkGasPriceWei,
    WEI_PER_ETH,
} from "./gas-fee-core";

describe("sdkGasPriceWei", () => {
    it("uses compact pricing for keyType 3 without fullSign", () => {
        expect(sdkGasPriceWei(SDK_KEY_TYPE_3, false)).toBe(SDK_DYNAMIC_BASE_GAS_PRICE_WEI);
    });

    it("applies the full-sign multiplier for keyType 3 when advanced signing is on", () => {
        expect(sdkGasPriceWei(SDK_KEY_TYPE_3, true)).toBe(
            SDK_DYNAMIC_BASE_GAS_PRICE_WEI * SDK_SIGNING_CONTEXT_LEVEL2_MULTIPLIER,
        );
    });

    it("uses level-1 pricing for keyType 5 regardless of fullSign", () => {
        expect(sdkGasPriceWei(SDK_KEY_TYPE_5, false)).toEqual(sdkGasPriceWei(SDK_KEY_TYPE_5, true));
        expect(sdkGasPriceWei(SDK_KEY_TYPE_5, true)).not.toBeNull();
    });
});

describe("computeSdkGasFeeEth", () => {
    it("produces a higher Q fee for keyType 3 with fullSign than without", () => {
        const compact = computeSdkGasFeeEth(21000, SDK_KEY_TYPE_3, false);
        const full = computeSdkGasFeeEth(21000, SDK_KEY_TYPE_3, true);
        expect(full).toBeGreaterThan(compact);
        expect(full / compact).toBeCloseTo(30, 5);
    });

    it("matches wei math for a known gas limit", () => {
        const gasLimit = 84000;
        const price = sdkGasPriceWei(SDK_KEY_TYPE_3, true)!;
        const expected = Number((BigInt(gasLimit) * price * 1000000n) / WEI_PER_ETH) / 1000000;
        expect(computeSdkGasFeeEth(gasLimit, SDK_KEY_TYPE_3, true)).toBe(expected);
    });

    it("falls back to the crude rate for unknown key types", () => {
        expect(computeSdkGasFeeEth(21000, 99, false)).toBe(21000 * CRUDE_GAS_FEE_RATE);
    });
});
