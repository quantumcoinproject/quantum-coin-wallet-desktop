import { ipcMain } from "electron";
import { loadQuantumCoin, loadQuantumCoinConfig, loadQuantumSwap } from "../sdk";
import {
    createQuantumRpcProvider,
    initRpcUrlForConfig,
    normalizeAmountString,
} from "../rpc";
import { STAKING_CONTRACT_ADDRESS, STAKING_ABI_JSON, STAKING_ALLOWED_METHODS, prepareStakingMethodArgs } from "../stakingAbi";

const GAS_ESTIMATE_BUFFER_PERCENT = 10;
const WEI_PER_ETH = 1000000000000000000n;
const GAS_FEE_FALLBACK_RATE_NUM = 1000 / 21000; // last-resort only when SDK pricing is unavailable
const DEFAULT_WALLET_KEY_TYPE = 3; // keyType 3 (HYBRIDEDMLDSASLHDSA); 5 = HYBRIDEDMLDSASLHDSA5
// Mirror of quantum-coin-js-sdk getGasPrice constants (used when provider is unavailable).
const SDK_DYNAMIC_BASE_GAS_PRICE_WEI = 47619047619047600n / 10n;
const SDK_SIGNING_CONTEXT_LEVEL1_MULTIPLIER = 20n;
const SDK_SIGNING_CONTEXT_LEVEL2_MULTIPLIER = 30n;

function toBigInt(value: unknown): bigint | null {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return BigInt(Math.trunc(value));
    const s = String(value);
    if (s.startsWith("0x") || s.startsWith("0X")) {
        try { return BigInt(s); } catch { return null; }
    }
    try { return BigInt(s); } catch { return null; }
}

function sdkGasPriceWei(keyType: number, fullSign: boolean): bigint | null {
    if (keyType === 3) {
        return SDK_DYNAMIC_BASE_GAS_PRICE_WEI * (fullSign ? SDK_SIGNING_CONTEXT_LEVEL2_MULTIPLIER : 1n);
    }
    if (keyType === 5) {
        return SDK_DYNAMIC_BASE_GAS_PRICE_WEI * SDK_SIGNING_CONTEXT_LEVEL1_MULTIPLIER;
    }
    return null;
}

// Resolve the current gas price (wei). QuantumCoin's getFeeData is a local computation
// (provider.getFeeData(keyType, fullSign) -> qcsdk.getGasPrice). When the provider is
// missing or getFeeData fails, mirror the SDK formula before the crude 1000/21000 rate.
async function resolveGasPriceWei(provider: any, keyType: unknown, fullSign: boolean): Promise<{ gasPriceWei: bigint | null; usedFallback: boolean }> {
    const kt = Number.isInteger(keyType) ? (keyType as number) : DEFAULT_WALLET_KEY_TYPE;
    if (provider && typeof provider.getFeeData === "function") {
        try {
            const fd = await provider.getFeeData(kt, fullSign === true);
            if (fd && fd.gasPrice != null) {
                const gp = toBigInt(fd.gasPrice);
                if (gp != null) return { gasPriceWei: gp, usedFallback: false };
            }
        } catch { /* fall through to SDK mirror */ }
    }
    const mirrored = sdkGasPriceWei(kt, fullSign === true);
    if (mirrored != null) return { gasPriceWei: mirrored, usedFallback: false };
    return { gasPriceWei: null, usedFallback: true };
}

function weiToEthString(weiBigInt: bigint | null): string {
    if (weiBigInt == null) return "0";
    const scaled = (weiBigInt * 1000000n) / WEI_PER_ETH; // coins * 1e6
    const num = Number(scaled) / 1000000;
    return String(num);
}

function applyGasBuffer(gasLimitBi: unknown, percent: number | null): bigint | null {
    const base = toBigInt(gasLimitBi);
    if (base == null) return null;
    const pct = (percent == null) ? GAS_ESTIMATE_BUFFER_PERCENT : percent;
    return (base * (100n + BigInt(pct))) / 100n;
}

// Build the unsigned tx request (with `from`) for a given transaction kind, for estimateGas.
async function buildEstimateGasTx(data: any, provider: any): Promise<Record<string, unknown>> {
    const { Initialize, Config } = loadQuantumCoinConfig();
    const { parseUnits, getAddress, Contract } = loadQuantumCoin();
    const { IERC20 } = loadQuantumSwap();

    const chainId = Number(data.chainId);
    await Initialize(new Config(chainId, initRpcUrlForConfig(data.rpcEndpoint)));
    const fromAddress = data.fromAddress || data.recipientAddress || null;
    const txKind = data.txKind;

    if (txKind === "sendCoin") {
        const valueWei = parseUnits(normalizeAmountString(data.amount), 18);
        return { to: getAddress(data.toAddress), value: valueWei, from: getAddress(fromAddress) };
    }

    if (txKind === "sendToken") {
        const decimals = typeof data.fromDecimals === "number" ? data.fromDecimals : 18;
        const amountWei = parseUnits(normalizeAmountString(data.amount), decimals);
        const token = IERC20.connect(getAddress(data.contractAddress), provider);
        const tx = await token.populateTransaction.transfer(getAddress(data.toAddress), amountWei);
        return { ...tx, from: getAddress(fromAddress) };
    }

    // Staking contract methods
    if (STAKING_ALLOWED_METHODS && STAKING_ALLOWED_METHODS.includes(txKind)) {
        const contract = new Contract(STAKING_CONTRACT_ADDRESS, STAKING_ABI_JSON, provider);
        const methodArgs = prepareStakingMethodArgs(STAKING_ABI_JSON, txKind, data.methodArgs || []);
        // populateTransaction is declared as {} and filled from the ABI at runtime.
        const populate = contract.populateTransaction as Record<string, (...args: unknown[]) => Promise<object>>;
        const tx = await populate[txKind](...methodArgs);
        const out: Record<string, unknown> = { ...tx, from: getAddress(fromAddress) };
        if (data.value && data.value !== "0" && data.value !== "0.0") {
            out.value = parseUnits(normalizeAmountString(data.value), 18);
        }
        return out;
    }

    throw new Error("Unsupported txKind for estimateGas: " + txKind);
}

export function registerGasHandlers(): void {
    ipcMain.handle("estimateGas", async (_event, data) => {
        try {
            const chainId = Number(data.chainId);
            if (!Number.isInteger(chainId)) return { success: false, gasLimit: null, error: "Invalid chain ID" };
            const provider = createQuantumRpcProvider(data.rpcEndpoint, chainId);
            if (!provider) return { success: false, gasLimit: null, error: "Invalid RPC endpoint" };

            const tx = await buildEstimateGasTx(data, provider);
            const estimated = await provider.estimateGas(tx);
            const bp = Number.isInteger(data.bufferPercent) ? data.bufferPercent : GAS_ESTIMATE_BUFFER_PERCENT;
            const buffered = (bp > 0) ? applyGasBuffer(estimated, bp) : estimated;
            if (buffered == null) return { success: false, gasLimit: null, error: "estimateGas returned no value" };
            return { success: true, gasLimit: buffered.toString(), error: null };
        } catch (err: any) {
            return { success: false, gasLimit: null, error: (err && err.message) ? err.message : String(err) };
        }
    });

    ipcMain.handle("estimateGasFee", async (_event, data) => {
        try {
            const chainId = Number(data.chainId);
            const gasLimitBi = toBigInt(data.gasLimit);
            // Provider is optional: getFeeData / SDK mirror are local. Invalid RPC
            // endpoints still produce an SDK-priced fee when keyType is known.
            const provider = Number.isInteger(chainId)
                ? createQuantumRpcProvider(data.rpcEndpoint, chainId)
                : null;
            const resolved = await resolveGasPriceWei(provider, data.keyType, data.fullSign === true);
            if (resolved.usedFallback || resolved.gasPriceWei == null) {
                const fallbackFee = gasLimitBi != null ? (Number(gasLimitBi) * GAS_FEE_FALLBACK_RATE_NUM) : 0;
                return { success: true, gasFeeEth: String(fallbackFee), gasPriceWei: null, usedFallback: true, error: null };
            }
            const totalWei = (gasLimitBi != null ? gasLimitBi : 0n) * resolved.gasPriceWei;
            return { success: true, gasFeeEth: weiToEthString(totalWei), gasPriceWei: resolved.gasPriceWei.toString(), usedFallback: false, error: null };
        } catch (err: any) {
            const gasLimitBi = toBigInt(data.gasLimit);
            const mirrored = sdkGasPriceWei(
                Number.isInteger(data.keyType) ? Number(data.keyType) : DEFAULT_WALLET_KEY_TYPE,
                data.fullSign === true,
            );
            if (gasLimitBi != null && mirrored != null) {
                return {
                    success: true,
                    gasFeeEth: weiToEthString(gasLimitBi * mirrored),
                    gasPriceWei: mirrored.toString(),
                    usedFallback: false,
                    error: null,
                };
            }
            const fallbackFee = gasLimitBi != null ? (Number(gasLimitBi) * GAS_FEE_FALLBACK_RATE_NUM) : 0;
            return { success: false, gasFeeEth: String(fallbackFee), gasPriceWei: null, usedFallback: true, error: (err && err.message) ? err.message : String(err) };
        }
    });
}
