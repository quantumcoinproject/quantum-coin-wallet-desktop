// Typed lazy loaders for the blockchain SDK packages. Handlers load the SDK
// per IPC call via require() - same as the legacy main process - so no SDK /
// WASM initialization cost is paid at app startup. The `typeof import`
// return types apply the packages' bundled .d.ts declarations, giving
// compile-time checking at every call site (a bare require() returns `any`).

export function loadQuantumCoin(): typeof import("quantumcoin") {
    return require("quantumcoin");
}

export function loadQuantumCoinConfig(): typeof import("quantumcoin/config") {
    return require("quantumcoin/config");
}

export function loadQuantumSwap(): typeof import("quantumswap") {
    return require("quantumswap");
}

export function loadSeedWords(): typeof import("seed-words") {
    return require("seed-words");
}
