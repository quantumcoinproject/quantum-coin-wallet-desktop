import { app, BrowserWindow } from "electron";
import * as path from "path";
import { registerSystemHandlers } from "./ipc/system";
import { registerSeedWordsHandlers } from "./ipc/seedwords";
import { registerCryptoHandlers } from "./ipc/crypto";
import { registerFormatHandlers } from "./ipc/format";
import { registerTokenHandlers } from "./ipc/tokens";
import { registerGasHandlers } from "./ipc/gas";
import { registerSendHandlers } from "./ipc/send";
import { registerStakingHandlers } from "./ipc/staking";
import { registerOfflineSigningHandlers } from "./ipc/offline";

const RENDERER_ROOT = path.join(__dirname, "..", "renderer");

// E2E test hook: isolate storage (and the single-instance lock, which is
// scoped to userData) so tests never touch a real profile.
if (process.env.E2E_USER_DATA_DIR) {
    app.setPath("userData", process.env.E2E_USER_DATA_DIR);
}

const additionalData = { myKey: "myValue" };
const gotTheLock = app.requestSingleInstanceLock(additionalData);
let startFilename = "index.html";
let currentWindow: BrowserWindow | null = null;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
    app.quit();
}

/** DevTools default off (including npm start). Set OPEN_DEVTOOLS=1 or OPEN_DEVTOOLS=true to open. PowerShell: $env:OPEN_DEVTOOLS=1 */
function shouldOpenDevTools(): boolean {
    const v = process.env.OPEN_DEVTOOLS;
    return v === "1" || v === "true";
}

const createWindow = () => {
    const mainWindow = new BrowserWindow({
        width: 625,
        height: 800,
        // Title bar / taskbar / alt-tab mark. Packaged Windows builds take the
        // icon from the exe (build.win.icon), but without this the window runs
        // under the stock Electron icon in development.
        icon: path.join(RENDERER_ROOT, "assets", "icons", "app", "icon.png"),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            nodeIntegration: false,
            nodeIntegrationInWorker: false,
            nodeIntegrationInSubFrames: false,
            contextIsolation: true,
            sandbox: true,
        },
        autoHideMenuBar: true,
    });

    currentWindow = mainWindow;

    mainWindow.loadFile(path.join(RENDERER_ROOT, startFilename));

    mainWindow.webContents.once("did-finish-load", () => {
        if (shouldOpenDevTools()) {
            mainWindow.webContents.openDevTools({ mode: "detach" });
        } else {
            mainWindow.webContents.closeDevTools();
        }
    });

    if (process.platform === "win32") {
        app.setAppUserModelId("Quantum Coin Wallet");
    }
};

if (!gotTheLock) {
    startFilename = "instance.html";
} else {
    app.on("second-instance", () => {
        // Someone tried to run a second instance, we should focus our window.
        if (currentWindow) {
            if (currentWindow.isMinimized()) {
                currentWindow.restore();
            }
            currentWindow.focus();
        }
    });
}

app.whenReady().then(() => {
    registerSystemHandlers(RENDERER_ROOT);
    registerSeedWordsHandlers();
    registerCryptoHandlers();
    registerFormatHandlers();
    registerTokenHandlers();
    registerGasHandlers();
    registerSendHandlers();
    registerStakingHandlers();
    registerOfflineSigningHandlers();

    createWindow();

    app.on("activate", () => {
        // On OS X it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
