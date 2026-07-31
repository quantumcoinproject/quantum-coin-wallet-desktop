import { ipcMain } from "electron";
import { loadQuantumCoin, loadQuantumCoinConfig, loadQuantumSwap } from "../sdk";
import {
    createQuantumRpcProvider,
    initRpcUrlForConfig,
    formatLocalRpcConnectionError,
    normalizeAmountString,
    signingOverrides,
} from "../rpc";

export function registerSendHandlers(): void {
    ipcMain.handle("SendCoinsSubmit", async (_event, data) => {
        try {
            const { Initialize, Config } = loadQuantumCoinConfig();
            const { Wallet, parseUnits, getAddress } = loadQuantumCoin();

            const chainId = Number(data.chainId);
            if (!Number.isInteger(chainId)) return { success: false, txHash: null, error: "Invalid chain ID" };

            const provider = createQuantumRpcProvider(data.rpcEndpoint, chainId);
            if (!provider) return { success: false, txHash: null, error: "Invalid RPC endpoint" };
            if (!data.privateKey || !data.publicKey) return { success: false, txHash: null, error: "Wallet keys required" };
            if (!data.toAddress) return { success: false, txHash: null, error: "Recipient address required" };

            await Initialize(new Config(chainId, initRpcUrlForConfig(data.rpcEndpoint)));
            const privBytes = Buffer.from(data.privateKey, "base64");
            const pubBytes = Buffer.from(data.publicKey, "base64");
            const wallet = Wallet.fromKeys(privBytes, pubBytes, provider);

            const valueWei = parseUnits(normalizeAmountString(data.amount), 18);
            const gasLimit = Number(data.gasLimit) || 21000;

            const tx = await wallet.sendTransaction(signingOverrides(wallet, data, {
                to: getAddress(data.toAddress),
                value: valueWei,
                gasLimit: gasLimit,
            }));
            return { success: true, txHash: tx.hash, error: null };
        } catch (err) {
            return { success: false, txHash: null, error: formatLocalRpcConnectionError(data.rpcEndpoint, err) };
        }
    });

    ipcMain.handle("SendTokensSubmit", async (_event, data) => {
        try {
            const { Initialize, Config } = loadQuantumCoinConfig();
            const { Wallet, parseUnits, getAddress } = loadQuantumCoin();
            const { IERC20 } = loadQuantumSwap();

            const chainId = Number(data.chainId);
            if (!Number.isInteger(chainId)) return { success: false, txHash: null, error: "Invalid chain ID" };

            const provider = createQuantumRpcProvider(data.rpcEndpoint, chainId);
            if (!provider) return { success: false, txHash: null, error: "Invalid RPC endpoint" };
            if (!data.privateKey || !data.publicKey) return { success: false, txHash: null, error: "Wallet keys required" };
            if (!data.toAddress) return { success: false, txHash: null, error: "Recipient address required" };
            if (!data.contractAddress) return { success: false, txHash: null, error: "Token contract address required" };

            await Initialize(new Config(chainId, initRpcUrlForConfig(data.rpcEndpoint)));
            const privBytes = Buffer.from(data.privateKey, "base64");
            const pubBytes = Buffer.from(data.publicKey, "base64");
            const wallet = Wallet.fromKeys(privBytes, pubBytes, provider);

            const decimals = typeof data.fromDecimals === "number" ? data.fromDecimals : 18;
            const amountWei = parseUnits(normalizeAmountString(data.amount), decimals);
            const gasLimit = Number(data.gasLimit) || 84000;

            const token = IERC20.connect(getAddress(data.contractAddress), wallet);
            const tx = await token.transfer(getAddress(data.toAddress), amountWei, signingOverrides(wallet, data, { gasLimit }));
            return { success: true, txHash: tx.hash, error: null };
        } catch (err) {
            return { success: false, txHash: null, error: formatLocalRpcConnectionError(data.rpcEndpoint, err) };
        }
    });

    ipcMain.handle("OfflineSignCoinTransaction", async (_event, data) => {
        try {
            const { Initialize } = loadQuantumCoinConfig();
            const { Wallet, parseUnits, getAddress } = loadQuantumCoin();

            if (!data.privateKey || !data.publicKey) return { success: false, txData: null, error: "Wallet keys required" };
            if (!data.toAddress) return { success: false, txData: null, error: "Recipient address required" };
            const chainId = Number(data.chainId);
            if (!Number.isInteger(chainId)) return { success: false, txData: null, error: "Invalid chain ID" };
            const nonce = Number(data.nonce);
            if (!Number.isInteger(nonce) || nonce < 0) return { success: false, txData: null, error: "Invalid nonce" };

            await Initialize(null);
            const privBytes = Buffer.from(data.privateKey, "base64");
            const pubBytes = Buffer.from(data.publicKey, "base64");
            const wallet = Wallet.fromKeys(privBytes, pubBytes);

            const valueWei = parseUnits(normalizeAmountString(data.amount), 18);
            const gasLimit = Number(data.gasLimit) || 21000;

            const txData = await wallet.signTransaction(signingOverrides(wallet, data, {
                to: getAddress(data.toAddress),
                value: valueWei,
                nonce: nonce,
                chainId: chainId,
                gasLimit: gasLimit,
            }));
            return { success: true, txData: txData, error: null };
        } catch (err: any) {
            return { success: false, txData: null, error: (err && err.message) ? err.message : String(err) };
        }
    });

    ipcMain.handle("OfflineSignTokenTransaction", async (_event, data) => {
        try {
            const { Initialize } = loadQuantumCoinConfig();
            const { Wallet, parseUnits, getAddress } = loadQuantumCoin();
            const { IERC20 } = loadQuantumSwap();

            if (!data.privateKey || !data.publicKey) return { success: false, txData: null, error: "Wallet keys required" };
            if (!data.toAddress) return { success: false, txData: null, error: "Recipient address required" };
            if (!data.contractAddress) return { success: false, txData: null, error: "Token contract address required" };
            const chainId = Number(data.chainId);
            if (!Number.isInteger(chainId)) return { success: false, txData: null, error: "Invalid chain ID" };
            const nonce = Number(data.nonce);
            if (!Number.isInteger(nonce) || nonce < 0) return { success: false, txData: null, error: "Invalid nonce" };

            await Initialize(null);
            const privBytes = Buffer.from(data.privateKey, "base64");
            const pubBytes = Buffer.from(data.publicKey, "base64");
            const wallet = Wallet.fromKeys(privBytes, pubBytes);

            const decimals = typeof data.fromDecimals === "number" ? data.fromDecimals : 18;
            const amountWei = parseUnits(normalizeAmountString(data.amount), decimals);
            const gasLimit = Number(data.gasLimit) || 84000;

            const token = IERC20.connect(getAddress(data.contractAddress), wallet);
            const txReq = await token.populateTransaction.transfer(getAddress(data.toAddress), amountWei, signingOverrides(wallet, data, { gasLimit }));

            const txData = await wallet.signTransaction(signingOverrides(wallet, data, {
                ...txReq,
                nonce: nonce,
                chainId: chainId,
            }));
            return { success: true, txData: txData, error: null };
        } catch (err: any) {
            return { success: false, txData: null, error: (err && err.message) ? err.message : String(err) };
        }
    });
}
