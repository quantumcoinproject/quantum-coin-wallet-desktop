import { app, clipboard, ipcMain, shell } from "electron";
import * as fs from "fs";
import * as path from "path";

// Only these renderer-visible JSON files may be read via FileApiReadFile.
// (The old app resolved arbitrary relative paths against src/; the rewrite
// keeps the channel but whitelists it, since only these files are ever read.)
const READABLE_FILES = new Map<string, string>([
    ["./json/en-us.json", "json/en-us.json"],
    ["./json/blockchain-networks.json", "json/blockchain-networks.json"],
]);

export function registerSystemHandlers(rendererRoot: string): void {
    ipcMain.handle("AppApiGetVersion", async () => {
        return app.getVersion();
    });

    // Returns package.json "name" (app.getName() is unsuitable: it prefers
    // productName). Used by the renderer to pick the theme.
    ipcMain.handle("AppApiGetPackageName", async () => {
        const pkgPath = path.join(app.getAppPath(), "package.json");
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        return String(pkg.name);
    });

    ipcMain.handle("ClipboardWriteText", async (_event, data) => {
        clipboard.writeText(String(data));
    });

    ipcMain.handle("OpenUrlInShell", async (_event, data) => {
        const url = String(data);
        if (!/^https:\/\//i.test(url)) {
            throw new Error("OpenUrlInShell: only https URLs are allowed");
        }
        await shell.openExternal(url);
    });

    ipcMain.handle("FileApiReadFile", async (_event, data) => {
        const relative = READABLE_FILES.get(String(data));
        if (relative == null) {
            throw new Error("FileApiReadFile: file not allowed");
        }
        const filename = path.join(rendererRoot, relative);
        return fs.readFileSync(filename).toString();
    });

    ipcMain.handle("StorageApiGetPath", async () => {
        return app.getPath("userData");
    });
}
