// Offline-signing helpers shared by the send and validator flows.
//
// The quantumswapwallet fork also had a multi-step "bundle" signer here
// (signOfflineBundle / signOfflineStep) for the swap and liquidity flows,
// which chained approve -> swap -> addLiquidity transactions under sequential
// nonces. Those flows are gone, and single-transaction offline signing goes
// through OfflineSignCoinTransaction / OfflineSignTokenTransaction /
// StakingContractOfflineSign instead, so only the nonce/deadline prefill
// remains.
import { prepareOfflineSigning } from "../lib/bridge";
import { networkStore, walletStore } from "./state";

export function offlineDeadline(seconds = 1200): string {
    return String(Math.floor(Date.now() / 1000) + seconds);
}

export async function prepareOfflineDefaults(): Promise<{ nonce: string; deadline: string; fromRpc: boolean }> {
    const network = networkStore.currentBlockchainNetwork;
    if (network) {
        const result = await prepareOfflineSigning({
            rpcEndpoint: network.rpcEndpoint,
            chainId: Number(network.networkId),
            ownerAddress: walletStore.currentWalletAddress,
        });
        if (result.success) {
            return {
                nonce: result.nonce == null ? "" : String(result.nonce),
                deadline: String((result.chainTimestamp || Math.floor(Date.now() / 1000)) + 1200),
                fromRpc: true,
            };
        }
    }
    return { nonce: "", deadline: offlineDeadline(), fromRpc: false };
}
