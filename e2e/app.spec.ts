// Electron smoke test: launches the built app (npm run build must have run)
// with a clean user-data directory and verifies the first-run experience.
import { test, expect, _electron as electron, ElectronApplication, Page } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
    const userDataDir = mkdtempSync(join(tmpdir(), "qswallet-e2e-"));
    app = await electron.launch({
        args: ["."],
        env: { ...process.env, E2E_USER_DATA_DIR: userDataDir },
    });
    page = await app.firstWindow();
});

test.afterAll(async () => {
    await app.close();
});

test("first run shows the EULA dialog", async () => {
    // initApp() loads en-us.json, then shows the EULA for a fresh profile.
    const eulaDialog = page.locator("#modalEulaDialog");
    await expect(eulaDialog).toHaveAttribute("open", "", { timeout: 15000 });
    await expect(page.locator("#divIAgree")).toBeVisible();
    // Localized EULA text replaced the placeholder markup (showEula sets it
    // from en-us.json as a single text node).
    await expect(page.locator("#divEula")).not.toContainText("hello world");
    await expect(page.locator("#divEula")).not.toHaveText("");
});

test("window title comes from en-us.json plus the app version", async () => {
    await expect(page).toHaveTitle(/Quantum.* \d+\.\d+\.\d+/);
});

test("legacy theme is used: the quantum theme is not injected", async () => {
    // selectTheme() keys off package.json "name". This package is
    // "quantumwallet", not "quantumswapwallet", so the violet quantum theme
    // must stay off and its stylesheets must never be injected.
    await expect(page.locator('link[href="theme-quantum.css"]')).toHaveCount(0);
    await expect(page.locator('link[href="theme-quantum-chrome.css"]')).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveClass(/theme-quantum/);
});

test("accepting the EULA advances to onboarding", async () => {
    await page.locator("#divIAgree").click();
    await expect(page.locator("#modalEulaDialog")).not.toHaveAttribute("open", "");
    // Fresh profile has no main key, so the app proceeds toward onboarding
    // (network selection dialog or welcome/info screen).
    await expect(page.locator("#modalNetworkDialog[open], #welcomeScreen, #infoScreen")).not.toHaveCount(0);
});

test("burger menu replaces the bottom tab bar and stays hidden pre-unlock", async () => {
    // The old bottom tab bar is gone in both themes.
    await expect(page.locator("#tab-bar")).toHaveCount(0);
    // The burger exists but stays hidden until a wallet is unlocked (this
    // fresh profile is still in onboarding, so no wallet exists yet).
    await expect(page.locator("#burgerMenu")).toHaveCount(1);
    await expect(page.locator("#burgerMenu")).toBeHidden();
});
