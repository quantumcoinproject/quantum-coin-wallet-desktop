// Theme selection. The "Quantum Violet" theme (ported from the browser
// extension) applies only to the first-party package; renamed/white-label
// builds keep the legacy grey theme.
import { GetPackageName } from "../lib/bridge";

export const QUANTUM_THEME_PACKAGE_NAME = "quantumswapwallet";

// Injected before overrides.css so the seed-word monospace overrides keep
// highest precedence in both themes. Relative hrefs: these links are created
// at runtime (Vite does not rewrite them), and the packaged app is served
// from file://, where absolute paths would resolve to the filesystem root.
export const QUANTUM_THEME_STYLESHEETS = ["theme-quantum.css", "theme-quantum-chrome.css"] as const;

export type ThemeName = "quantum" | "legacy";

export function selectTheme(packageName: string): ThemeName {
    return packageName === QUANTUM_THEME_PACKAGE_NAME ? "quantum" : "legacy";
}

// Reads package.json "name" from the main process and, for the first-party
// package, injects the quantum theme stylesheets. Called before the body DOM
// is built, so there is no unthemed flash.
export async function applyConfiguredTheme(): Promise<ThemeName> {
    const theme = selectTheme(await GetPackageName());
    if (theme !== "quantum") {
        return theme;
    }

    // href is "/overrides.css" under the dev server and "./overrides.css" in
    // the built HTML (base: "./"), so match on the suffix.
    const anchor = document.querySelector('link[href$="overrides.css"]');
    for (const href of QUANTUM_THEME_STYLESHEETS) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(link, anchor);
        } else {
            document.head.appendChild(link);
        }
    }
    document.body.classList.add("theme-quantum");
    return theme;
}
