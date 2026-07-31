import * as os from "os";
import { loadQuantumCoin } from "./sdk";
import * as path from "path";

export function signingOverrides(wallet: any, data: any, base: Record<string, unknown>): Record<string, unknown> {
    const fullSign = data && data.advancedSigningEnabled === true;
    return { ...base, signingContext: wallet.getSigningContext(fullSign) };
}

function expandTildeInIpcPath(p: unknown): string {
    const t = String(p).trim();
    if (t.startsWith("~/")) {
        return path.join(os.homedir(), t.slice(2));
    }
    if (t.startsWith("~\\")) {
        return path.join(os.homedir(), t.slice(2));
    }
    return t;
}

function buildSwapRpcUrl(rpcEndpoint: unknown): string | null {
    if (!rpcEndpoint || typeof rpcEndpoint !== "string") return null;
    const s = rpcEndpoint.trim();
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    if (/^\/\/\.\/pipe\//i.test(s)) return s;
    if (/^\\\\\.\\pipe\\/i.test(s)) {
        return "//./pipe/" + s.replace(/^\\\\\.\\pipe\\/i, "").replace(/\\/g, "/");
    }
    if (s.startsWith("/") && !s.startsWith("//") && /\.ipc$/i.test(s)) return s;
    if (/\.ipc$/i.test(s) && (s.startsWith("~/") || s.startsWith("~\\") || /^~[^/\\]+[/\\]/.test(s))) return expandTildeInIpcPath(s);
    const isIpAddress = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(s);
    const isLocalhost = /^localhost(:\d+)?$/i.test(s);
    return (isIpAddress || isLocalhost ? "http://" : "https://") + s;
}

function isIpcLikeRpc(rpcEndpoint: unknown): boolean {
    if (!rpcEndpoint || typeof rpcEndpoint !== "string") return false;
    const t = rpcEndpoint.trim();
    if (!t) return false;
    if (/^\/\/\.\/pipe\//i.test(t)) return true;
    if (/^\\\\\.\\pipe\\/i.test(t)) return true;
    if (!/\.ipc$/i.test(t)) return false;
    if (t.startsWith("/") && !t.startsWith("//")) return true;
    if (t.startsWith("~/") || t.startsWith("~\\")) return true;
    if (/^~[^/\\]+[/\\]/.test(t)) return true;
    return false;
}

function toNodeIpcPath(rpcEndpoint: unknown): string {
    const t = expandTildeInIpcPath(String(rpcEndpoint).trim());
    if (process.platform === "win32" && /^\/\/\.\/pipe\//i.test(t)) {
        return "\\\\.\\pipe\\" + t.replace(/^\/\/\.\/pipe\//i, "").replace(/\//g, "\\");
    }
    return t;
}

/**
 * Same endpoint string shape as createQuantumRpcProvider (IPC path vs HTTP URL).
 * Returns undefined (not null) when unavailable: Config's constructor only
 * applies its default endpoint for undefined. Callers reject invalid endpoints
 * via createQuantumRpcProvider before Initialize, so this is a safety net.
 */
export function initRpcUrlForConfig(rpcEndpoint: unknown): string | undefined {
    if (rpcEndpoint == null || typeof rpcEndpoint !== "string" || !rpcEndpoint.trim()) {
        return undefined;
    }
    if (isIpcLikeRpc(rpcEndpoint)) {
        return toNodeIpcPath(rpcEndpoint);
    }
    return buildSwapRpcUrl(rpcEndpoint) ?? undefined;
}

export function createQuantumRpcProvider(rpcEndpoint: unknown, chainId: number): any {
    if (rpcEndpoint == null || typeof rpcEndpoint !== "string" || !rpcEndpoint.trim()) return null;
    const { getProvider } = loadQuantumCoin();
    const endpoint = isIpcLikeRpc(rpcEndpoint) ? toNodeIpcPath(rpcEndpoint) : buildSwapRpcUrl(rpcEndpoint);
    if (!endpoint) return null;
    const provider = getProvider(endpoint, chainId);
    if (provider && Number.isInteger(chainId)) {
        // Not part of AbstractProvider's declared surface; handlers read it back.
        (provider as { chainId?: number }).chainId = chainId;
    }
    return provider;
}

function looksLikeLocalIpcRpc(rpcEndpoint: unknown): boolean {
    if (!rpcEndpoint || typeof rpcEndpoint !== "string") return false;
    const t = rpcEndpoint.trim();
    return /^\/\/\.\/pipe\//i.test(t) || /^\\\\\.\\pipe\\/i.test(t) || (/\.ipc$/i.test(t) && !/^https?:\/\//i.test(t));
}

/** Add short, actionable hints for common local IPC / socket failures (Windows EPERM, etc.). */
export function formatLocalRpcConnectionError(rpcEndpoint: unknown, err: any): string {
    let msg = (err && err.message) ? String(err.message) : String(err);
    if (err && err.error && err.error.message && !msg.includes(String(err.error.message))) {
        msg = msg + " " + String(err.error.message);
    }
    if (!looksLikeLocalIpcRpc(rpcEndpoint)) {
        return msg;
    }
    const lower = msg.toLowerCase();
    const code = err && (err.code || (err.error && err.error.code));
    if (lower.includes("eperm") || code === "EPERM") {
        return msg + "\n\nTip: EPERM = pipe access denied. Run Geth and the wallet as the same user and admin level, or use Geth HTTP in rpcEndpoint.";
    }
    if (lower.includes("eacces") || code === "EACCES") {
        return msg + "\n\nTip: Access denied. Same user/elevation as Geth, or HTTP rpcEndpoint.";
    }
    if (lower.includes("enoent") || lower.includes("econnrefused") || lower.includes("refused") || code === "ENOENT") {
        return msg + "\n\nTip: Pipe not available. Start Geth; check --ipcpath, or use HTTP rpcEndpoint.";
    }
    return msg;
}

/** Strip locale formatting (e.g. commas) so parseUnits gets a valid numeric string. */
export function normalizeAmountString(value: unknown): string {
    if (value == null) return "0";
    return String(value).replace(/,/g, "").trim() || "0";
}

export function base64ToBytes(base64: string): Uint8Array {
    const binString = atob(base64);
    return Uint8Array.from(binString, (m) => m.codePointAt(0) as number);
}

export function bytesToBase64(bytes: Uint8Array): string {
    const binString = Array.from(bytes, (byte) =>
        String.fromCodePoint(byte),
    ).join("");
    return btoa(binString);
}
