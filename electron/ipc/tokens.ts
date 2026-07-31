// ERC20 token metadata lookup. Backs the token picker's "enter a contract
// address" path (src/app/manual-token.ts): given a contract, read its
// name/symbol/decimals and the caller's balance.
//
// This handler came from the quantumswapwallet fork's ipc/swap.ts, where it
// was named SwapTokenGetMetadata purely because that file grouped by module.
// Nothing about it is swap-related - it is a plain IERC20 read, with no
// router, factory or pair involved - so it survives the swap removal under a
// name that says what it does.
import { ipcMain } from "electron";
import { loadQuantumCoin, loadQuantumCoinConfig, loadQuantumSwap } from "../sdk";
import { createQuantumRpcProvider, initRpcUrlForConfig } from "../rpc";

function tokenError(err: unknown): string {
    return (err && (err as { message?: string }).message) ? String((err as { message?: string }).message) : String(err);
}

export function registerTokenHandlers(): void {
    ipcMain.handle("TokenGetMetadata", async (_event, data) => {
        try {
            const { Initialize, Config } = loadQuantumCoinConfig();
            const { getAddress, formatUnits } = loadQuantumCoin();
            const { IERC20 } = loadQuantumSwap();

            const chainId = Number(data.chainId);
            if (!Number.isInteger(chainId)) return { success: false, error: "Invalid chain ID" };
            const provider = createQuantumRpcProvider(data.rpcEndpoint, chainId);
            if (!provider) return { success: false, error: "Invalid RPC endpoint" };

            await Initialize(new Config(chainId, initRpcUrlForConfig(data.rpcEndpoint)));
            const contractAddress = getAddress(String(data.contractAddress || ""));
            const ownerAddress = data.ownerAddress ? getAddress(String(data.ownerAddress)) : null;
            const token = IERC20.connect(contractAddress, provider);
            let nameValue = "";
            try {
                if (typeof token.name === "function") nameValue = String(await token.name());
            } catch {
                // name() is optional metadata; symbol/decimals identify the token.
            }
            const [symbolValue, decimalsValue, balanceValue] = await Promise.all([
                token.symbol(),
                token.decimals(),
                ownerAddress == null ? Promise.resolve(0n) : token.balanceOf(ownerAddress),
            ]);
            const decimals = Number(decimalsValue);
            if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
                return { success: false, error: "Invalid token decimals" };
            }
            return {
                success: true,
                contractAddress,
                name: String(nameValue || ""),
                symbol: String(symbolValue || ""),
                decimals,
                balance: formatUnits(balanceValue, decimals),
                error: null,
            };
        } catch (err) {
            return { success: false, error: tokenError(err) };
        }
    });
}
