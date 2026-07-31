// Behavioral safety net for the UI: drives the real app through the full
// create-wallet onboarding, the navigation matrix, and lock/unlock, and pins
// visual baselines with screenshots.
//
// npm run build must have run before this spec (it launches the packaged-less
// app via `electron .`).
import { test, expect, _electron as electron, ElectronApplication, Page } from "@playwright/test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Matches SEED_FRIENDLY_INDEX_ARRAY in src/lib/seedwords.ts (A1..L4).
const SEED_BOX_IDS = "abcdefghijkl".split("").flatMap((row) => [1, 2, 3, 4].map((n) => "txtSeed" + row.toUpperCase() + n));

const WALLET_PASSWORD = "E2eTestPassword123";

const langJson = JSON.parse(readFileSync(join(__dirname, "..", "public", "json", "en-us.json"), "utf8"));

let app: ElectronApplication;
let page: Page;
let userDataDir: string;

async function launchApp(): Promise<void> {
    app = await electron.launch({
        // Screenshot baselines depend on the viewport size, which follows the
        // host display's DPI scale; pin it so baselines are portable across
        // monitors/machines.
        args: [".", "--force-device-scale-factor=1"],
        env: { ...process.env, E2E_USER_DATA_DIR: userDataDir },
    });
    page = await app.firstWindow();
}

// The balance/token refresh surfaces RPC failures (offline CI, unknown
// address) as the OK alert; close it whenever one is open so it never blocks
// the next click.
async function dismissAlertIfOpen(): Promise<void> {
    const dialog = page.locator("#modalOkDialog[open]");
    if (await dialog.count()) {
        await page.locator("#divModalOk").click();
        await expect(dialog).toHaveCount(0);
    }
}

test.beforeAll(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), "qswallet-e2e-flows-"));
    await launchApp();
});

test.afterAll(async () => {
    await app.close();
});

test.describe.configure({ mode: "serial" });

test("create wallet: EULA, info, quiz, password, seed, verify, home", async () => {
    test.setTimeout(240000);

    // EULA.
    await expect(page.locator("#modalEulaDialog")).toHaveAttribute("open", "", { timeout: 15000 });
    await page.locator("#divIAgree").click();

    // Info carousel: langJson.info.length steps behind one Next button.
    await expect(page.locator("#welcomeScreen")).toBeVisible();
    for (let i = 0; i < langJson.info.length; i++) {
        await page.locator("#nextButtonWelcomeScreen").click();
    }

    // Safety quiz: pick the correct radio each round; every correct answer
    // pops the success alert whose OK advances to the next round.
    await expect(page.locator("#quizScreen")).toBeVisible();
    for (const quiz of langJson.quiz) {
        await page.locator(`input[name="quiz_option"][value="${quiz.correctChoice}"]`).check();
        await page.locator("#quizScreen .large_button_container").click();
        await expect(page.locator("#modalOkDialog")).toHaveAttribute("open", "");
        await page.locator("#divModalOk").click();
    }

    // Wallet password.
    await expect(page.locator("#createWalletPasswordScreen")).toBeVisible();
    await page.locator("#pwdPassword").fill(WALLET_PASSWORD);
    await page.locator("#pwdRetypePassword").fill(WALLET_PASSWORD);
    await page.locator("#createWalletPasswordScreen .large_button_container").click();

    // Create-new-wallet option, default wallet type.
    await expect(page.locator("#createWalletPromptScreen")).toBeVisible();
    await page.locator("#optNewWallet").check();
    await page.locator("#createWalletPromptScreen .large_button_container").click();
    await expect(page.locator("#walletTypeScreen")).toBeVisible();
    await page.locator("#optWalletTypeDefault").check();
    await page.locator("#walletTypeScreen .large_button_container").click();

    // Seed words: reveal, collect the 32 generated words, continue.
    await expect(page.locator("#newSeedScreen")).toBeVisible();
    await page.locator("#aRevealSeed").click();
    await expect(page.locator("#divSeedPanel")).toBeVisible();
    const words: string[] = [];
    for (let i = 0; i < 32; i++) {
        words.push((await page.locator("#divNewSeed" + i).textContent()) ?? "");
    }
    expect(words.every((w) => w.length >= 2)).toBe(true);
    await page.locator("#divNextSeed").click();

    // Verify screen: re-type every word through the autocomplete boxes
    // (contenteditable divs); Tab commits the matching choice and moves on.
    await expect(page.locator("#seedVerifyScreen")).toBeVisible();
    for (let i = 0; i < 32; i++) {
        await page.locator("#" + SEED_BOX_IDS[i]).click();
        await page.keyboard.type(words[i]);
        await page.keyboard.press("Tab");
        await expect(page.locator("#" + SEED_BOX_IDS[i])).toHaveText(words[i]);
    }
    await page.locator("#divVerifySeedButton").click();

    // Confirm the password; wallet save runs the slow KDF, then the
    // "wallet saved" alert leads to the backup screen, which we skip.
    await expect(page.locator("#verifyWalletPasswordScreen")).toBeVisible();
    await page.locator("#pwdVerifyWalletPassword").fill(WALLET_PASSWORD);
    await page.locator("#verifyWalletPasswordScreen .large_button_container").click();
    await expect(page.locator("#modalOkDialog")).toHaveAttribute("open", "", { timeout: 180000 });
    await page.locator("#divModalOk").click();
    await expect(page.locator("#backupWalletScreen")).toBeVisible();
    await page.locator('#backupWalletScreen a[data-lang-key="backup-wallet-skip"]').click();

    // Home screen: address shown, burger available.
    await expect(page.locator("#HomeScreen")).toBeVisible({ timeout: 30000 });
    await expect(page.locator("#walletAddress")).toHaveText(/0x[0-9a-fA-F]+/, { timeout: 30000 });
    await expect(page.locator("#burgerMenu")).toBeVisible();
});

test("navigation matrix: home to every wallet screen and back", async () => {
    test.setTimeout(120000);
    await dismissAlertIfOpen();

    const homeButton = (label: string) => page.locator("#HomeScreen .buttonBox", { hasText: label });

    // Send and back.
    await homeButton("Send").click();
    await expect(page.locator("#SendScreen")).toBeVisible();
    await expect(page.locator("#HomeScreen")).toBeHidden();
    await page.locator("#SendScreen .back-container").click();
    await expect(page.locator("#HomeScreen")).toBeVisible();

    // Receive and back.
    await homeButton("Receive").click();
    await expect(page.locator("#ReceiveScreen")).toBeVisible();
    await expect(page.locator("#receiveWalletAddress")).toHaveText(/0x[0-9a-fA-F]+/);
    await expect(page.locator("#qrcode canvas, #qrcode img, #qrcode table")).not.toHaveCount(0);
    await page.locator("#divBackReceiveScreen").click();
    await expect(page.locator("#HomeScreen")).toBeVisible();

    // Transactions and back (the txn fetch may fail offline; dismiss).
    await homeButton("Transactions").click();
    await expect(page.locator("#TransactionsScreen")).toBeVisible();
    await dismissAlertIfOpen();
    await page.locator("#TransactionsScreen .back-container").first().click();
    await expect(page.locator("#HomeScreen")).toBeVisible();

    // Burger: wallets list and back.
    await page.locator("#burgerButton").click();
    await expect(page.locator("#burgerDropdown")).toBeVisible();
    await page.locator("#tab1").click();
    await expect(page.locator("#WalletsScreen")).toBeVisible();
    await expect(page.locator("#divWallets tr.wallet-row")).not.toHaveCount(0);
    await page.locator("#backButtonWalletListScreen").click();
    await expect(page.locator("#HomeScreen")).toBeVisible();

    // Burger: settings and back.
    await page.locator("#burgerButton").click();
    await page.locator("#tab4").click();
    await expect(page.locator("#settingsScreen")).toBeVisible();
    await page.locator("#settingsScreen .back-container").click();
    await expect(page.locator("#HomeScreen")).toBeVisible();
});

test("visual baselines: home and send screens", async () => {
    test.setTimeout(120000);
    await dismissAlertIfOpen();

    // Wait for the balance refresh to settle (spinner replaced by refresh).
    await expect(page.locator("#HomeScreen")).toBeVisible();
    await expect(page.locator("#divRefreshBalance")).toBeVisible({ timeout: 60000 });
    await dismissAlertIfOpen();
    await expect(page).toHaveScreenshot("home-legacy.png", {
        maxDiffPixelRatio: 0.02,
        // Address, balance and token rows differ per generated wallet/run.
        mask: [page.locator("#walletAddress"), page.locator("#spnAccountBalance"), page.locator("#divAccountTokens")],
    });

    await page.locator("#HomeScreen .buttonBox", { hasText: "Send" }).click();
    await expect(page.locator("#SendScreen")).toBeVisible();
    await expect(page).toHaveScreenshot("send-legacy.png", {
        maxDiffPixelRatio: 0.02,
        mask: [page.locator("#divBalanceSendScreen"), page.locator("#spanSendGasFee")],
    });
    await page.locator("#SendScreen .back-container").click();
    await expect(page.locator("#HomeScreen")).toBeVisible();
});

test("relaunch: unlock with wrong then right password", async () => {
    test.setTimeout(240000);

    await app.close();
    await launchApp();

    // Existing profile goes straight to the unlock screen (no EULA).
    await expect(page.locator("#unlockScreen")).toBeVisible({ timeout: 30000 });
    await expect(page).toHaveScreenshot("unlock-legacy.png", { maxDiffPixelRatio: 0.02 });

    // Wrong password: decrypt fails with the wallet-open warning.
    await page.locator("#pwdUnlock").fill("definitely-wrong-password");
    await page.locator("#unlockScreen .large_button_container").click();
    await expect(page.locator("#modalOkDialog")).toHaveAttribute("open", "", { timeout: 180000 });
    await page.locator("#divModalOk").click();
    await expect(page.locator("#HomeScreen")).toBeHidden();

    // Right password unlocks to the home screen.
    await page.locator("#pwdUnlock").fill(WALLET_PASSWORD);
    await page.locator("#unlockScreen .large_button_container").click();
    await expect(page.locator("#HomeScreen")).toBeVisible({ timeout: 180000 });
    await expect(page.locator("#walletAddress")).toHaveText(/0x[0-9a-fA-F]+/);
    await expect(page.locator("#burgerMenu")).toBeVisible();
});
