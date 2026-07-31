import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/bridge", () => ({
    estimateGas: vi.fn(),
    estimateGasFee: vi.fn(),
}));

vi.mock("./settings", () => ({
    advancedSigningGetDefaultValue: vi.fn(async () => false),
}));

vi.mock("./dialog", () => ({
    showGasConfigDialog: vi.fn(),
}));

vi.mock("./release", () => ({
    applySwapReleaseToPayload: (payload: Record<string, unknown>) => payload,
}));

import { estimateGas, estimateGasFee } from "../lib/bridge";
import { networkStore, settingsStore, walletStore } from "./state";
import { estimateGasLimitOfflineSafe, runGasEstimation } from "./gas";

describe("estimateGasLimitOfflineSafe", () => {
    beforeEach(() => {
        vi.mocked(estimateGas).mockReset();
        vi.mocked(estimateGasFee).mockReset();
        networkStore.currentBlockchainNetwork = {
            rpcEndpoint: "https://example.invalid",
            networkId: 123123,
            blockchainName: "TEST",
            scanApiDomain: "",
            blockExplorerDomain: "",
        } as any;
        walletStore.currentWalletAddress = "0xabc";
        walletStore.currentWallet = null;
    });

    it("returns the RPC gas limit when estimation succeeds", async () => {
        vi.mocked(estimateGas).mockResolvedValue({ success: true, gasLimit: "123456", error: null });
        vi.mocked(estimateGasFee).mockResolvedValue({ success: true, gasFeeEth: "1", usedFallback: false });
        const limit = await estimateGasLimitOfflineSafe({
            txKind: "sendCoin",
            defaultGasLimit: 21000,
            toAddress: "0xdef",
            amount: "1",
        });
        expect(limit).toBe(123456);
    });

    it("keeps the default when RPC estimation fails", async () => {
        vi.mocked(estimateGas).mockRejectedValue(new Error("RPC down"));
        const limit = await estimateGasLimitOfflineSafe({
            txKind: "sendCoin",
            defaultGasLimit: 21000,
            toAddress: "0xdef",
            amount: "1",
        });
        expect(limit).toBe(21000);
    });
});

describe("runGasEstimation offline vs online toast", () => {
    beforeEach(() => {
        vi.mocked(estimateGas).mockReset();
        vi.mocked(estimateGasFee).mockReset();
        networkStore.currentBlockchainNetwork = {
            rpcEndpoint: "https://example.invalid",
            networkId: 123123,
            blockchainName: "TEST",
            scanApiDomain: "",
            blockExplorerDomain: "",
        } as any;
        walletStore.currentWalletAddress = "0xabc";
        walletStore.currentWallet = null;
        settingsStore.offlineSignEnabled = false;
        while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
        for (const [tag, id] of [["div", "icon"], ["span", "label"], ["div", "btn"]] as const) {
            const node = document.createElement(tag);
            node.id = id;
            document.body.appendChild(node);
        }
    });

    it("does not invoke onRpcError when offline even if estimation uses fallback", async () => {
        settingsStore.offlineSignEnabled = true;
        vi.mocked(estimateGas).mockResolvedValue({ success: false, gasLimit: null, error: "fail" });
        vi.mocked(estimateGasFee).mockResolvedValue({ success: true, gasFeeEth: "1", usedFallback: true, error: "fee fail" });
        const onRpcError = vi.fn();
        await runGasEstimation(
            { txKind: "sendCoin", defaultGasLimit: 21000, toAddress: "0xdef", amount: "1" },
            "icon",
            "label",
            null,
            onRpcError,
        );
        expect(onRpcError).not.toHaveBeenCalled();
        expect(document.getElementById("label")?.textContent).toContain("Q");
    });

    it("invokes onRpcError when online and estimation uses fallback", async () => {
        settingsStore.offlineSignEnabled = false;
        vi.mocked(estimateGas).mockResolvedValue({ success: false, gasLimit: null, error: "fail" });
        vi.mocked(estimateGasFee).mockResolvedValue({ success: true, gasFeeEth: "1", usedFallback: true, error: "fee fail" });
        const onRpcError = vi.fn();
        await runGasEstimation(
            { txKind: "sendCoin", defaultGasLimit: 21000, toAddress: "0xdef", amount: "1" },
            "icon",
            "label",
            null,
            onRpcError,
        );
        expect(onRpcError).toHaveBeenCalled();
    });
});
