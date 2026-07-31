// API surface exposed by electron/preload.ts via contextBridge.
interface IpcApi {
    send(channel: string, data?: unknown): Promise<any>;
}

interface Window {
    ClipboardApi: IpcApi;
    ShellApi: IpcApi;
    FileApi: IpcApi;
    LocalStorageApi: IpcApi;
    AppApi: IpcApi;
    CryptoApi: IpcApi;
    FormatApi: IpcApi;
    SeedWordsApi: IpcApi;
    SwapQuoteApi: IpcApi;
}

declare const ClipboardApi: IpcApi;
declare const ShellApi: IpcApi;
declare const FileApi: IpcApi;
declare const LocalStorageApi: IpcApi;
declare const AppApi: IpcApi;
declare const CryptoApi: IpcApi;
declare const FormatApi: IpcApi;
declare const SeedWordsApi: IpcApi;
declare const SwapQuoteApi: IpcApi;
