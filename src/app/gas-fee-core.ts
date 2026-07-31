// Pure QuantumCoin SDK gas-price mirror (quantum-coin-js-sdk getGasPrice).
// Kept free of DOM/IPC so vitest can verify advanced-signing fee multipliers.

export const SDK_DEFAULT_PRICE_WEI = 47619047619047600n;
export const SDK_DYNAMIC_BASE_GAS_PRICE_WEI = SDK_DEFAULT_PRICE_WEI / 10n;
export const SDK_SIGNING_CONTEXT_LEVEL1_MULTIPLIER = 20n;
export const SDK_SIGNING_CONTEXT_LEVEL2_MULTIPLIER = 30n;
export const SDK_KEY_TYPE_3 = 3;
export const SDK_KEY_TYPE_5 = 5;
export const WEI_PER_ETH = 1000000000000000000n;
export const CRUDE_GAS_FEE_RATE = 1000 / 21000;

/** Per-gas-unit price in wei, matching qcsdk.getGasPrice(keyType, fullSign). */
export function sdkGasPriceWei(keyType: number, fullSign: boolean): bigint | null {
    if (keyType === SDK_KEY_TYPE_3) {
        const multiplier = fullSign ? SDK_SIGNING_CONTEXT_LEVEL2_MULTIPLIER : 1n;
        return SDK_DYNAMIC_BASE_GAS_PRICE_WEI * multiplier;
    }
    if (keyType === SDK_KEY_TYPE_5) {
        return SDK_DYNAMIC_BASE_GAS_PRICE_WEI * SDK_SIGNING_CONTEXT_LEVEL1_MULTIPLIER;
    }
    return null;
}

/** Total fee in Q (ETH units) for a gas limit, using SDK pricing when possible. */
export function computeSdkGasFeeEth(gasLimit: number, keyType: number, fullSign: boolean): number {
    const limit = Math.max(0, Math.trunc(Number(gasLimit) || 0));
    const priceWei = sdkGasPriceWei(keyType, fullSign === true);
    if (priceWei == null) {
        return limit * CRUDE_GAS_FEE_RATE;
    }
    const totalWei = BigInt(limit) * priceWei;
    const scaled = (totalWei * 1000000n) / WEI_PER_ETH;
    return Number(scaled) / 1000000;
}
