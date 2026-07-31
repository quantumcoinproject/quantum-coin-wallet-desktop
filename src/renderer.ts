// Renderer entry point. Mounts the hand-written screen modules (header
// chrome, screen containers, screens and dialogs), performs the
// script-eval-time element bindings of dialog.ts/send.ts, and then runs the
// same startup sequence the old inline <script> did.
import { mountScreenModules } from "./ui/screens";
import { containerModules, headerModules } from "./screens/header";
import { dialogModules } from "./dialogs/modals";
import { onboardingScreenModules } from "./screens/onboarding";
import { homeScreenModule } from "./screens/home";
import { sendScreenModules } from "./screens/send";
import { validatorScreenModule } from "./screens/validator";
import { receiveScreenModule } from "./screens/receive";
import { transactionsScreenModule } from "./screens/transactions";
import { settingsScreenModules } from "./screens/settings";
import { walletsScreenModules } from "./screens/wallets";
import { initDialogs, showErrorAndLockup } from "./app/dialog";
import { initSend } from "./app/send";
import { initApp, showRestoreWalletLabel } from "./app/app";
import { applyConfiguredTheme } from "./app/theme";

async function bootstrap(): Promise<void> {
    // Theme is decided by package.json "name" (quantum for the first-party
    // package, legacy grey otherwise); applied while the body is still empty
    // so there is no unthemed flash.
    await applyConfiguredTheme();

    // Mount order mirrors the legacy body: header chrome first, then the
    // screen containers, then the screens inside them, dialogs last. All of
    // it must be in the DOM before initDialogs()/initApp() run their element
    // bindings, template captures and localization passes.
    mountScreenModules(headerModules);
    mountScreenModules(containerModules);
    mountScreenModules(onboardingScreenModules);
    mountScreenModules([homeScreenModule, ...sendScreenModules, validatorScreenModule]);
    mountScreenModules([receiveScreenModule, transactionsScreenModule]);
    mountScreenModules(settingsScreenModules);
    mountScreenModules(walletsScreenModules);
    mountScreenModules(dialogModules);

    // The legacy scripts ran after the static body existed and did their
    // element lookups/bindings at eval time; same order here.
    initDialogs();
    initSend();

    // window.onload in the legacy page; the DOM is fully built at this point.
    document.getElementById("filRestoreWallet")!.addEventListener("change", showRestoreWalletLabel);

    // Enter-key activation for the legacy div[role="button"] controls (kept
    // as divs for pixel fidelity with the old markup).
    document.querySelectorAll<HTMLElement>('[role="button"]').forEach(function (el) {
        el.addEventListener("keypress", function (e: KeyboardEvent) {
            if (e.key === "Enter") {
                el.click();
            }
        });
    });

    // Close the burger dropdown when clicking anywhere outside of it.
    document.addEventListener("click", function (event) {
        const menu = document.getElementById("burgerMenu");
        const dropdown = document.getElementById("burgerDropdown");
        if (!menu || !dropdown || dropdown.style.display !== "block") return;
        if (!menu.contains(event.target as Node)) {
            dropdown.style.display = "none";
        }
    });

    initApp();
}

window.onerror = (message) => {
    showErrorAndLockup(message);
};

window.addEventListener("unhandledrejection", (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    const detail = (reason && reason.message) ? String(reason.message) : String(reason);
    showErrorAndLockup(detail);
});

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { void bootstrap(); });
} else {
    void bootstrap();
}
