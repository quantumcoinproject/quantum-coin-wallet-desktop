// Offline-signing support. Only the nonce / chain-timestamp prefill lives
// here; the actual signing goes through OfflineSignCoinTransaction and
// OfflineSignTokenTransaction (ipc/send.ts) and StakingContractOfflineSign
// (ipc/staking.ts).
//
// The quantumswapwallet fork also served OfflineSignTransactionBundle here, a
// multi-step signer for the swap and liquidity flows (approve -> swap ->
// addLiquidity under sequential nonces). Those flows are gone with swap.
import { ipcMain } from "electron";
import { createQuantumRpcProvider } from "../rpc";

export function registerOfflineSigningHandlers(): void {
    ipcMain.handle("OfflinePrepareSigning", async (_event, payload) => {
        try {
            const chainId = Number(payload.chainId);
            const provider = createQuantumRpcProvider(payload.rpcEndpoint, chainId);
            if (!provider) throw new Error("RPC unavailable");
            const nonce = await provider.getTransactionCount(payload.ownerAddress, "pending");
            const block = await provider.getBlock("latest");
            return {
                success: true,
                nonce: Number(nonce),
                chainTimestamp: block && block.timestamp != null ? Number(block.timestamp) : null,
                error: null,
            };
        } catch (err: any) {
            return { success: false, nonce: null, chainTimestamp: null, error: err?.message || String(err) };
        }
    });
}
