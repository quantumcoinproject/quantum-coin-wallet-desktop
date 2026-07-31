import { describe, expect, it } from "vitest";
import { selectTheme, QUANTUM_THEME_PACKAGE_NAME } from "./theme";

describe("selectTheme", () => {
    it("selects the quantum theme for the first-party package name", () => {
        expect(selectTheme(QUANTUM_THEME_PACKAGE_NAME)).toBe("quantum");
        expect(selectTheme("quantumswapwallet")).toBe("quantum");
    });

    it("falls back to the legacy theme for any other package name", () => {
        expect(selectTheme("someotherwallet")).toBe("legacy");
        expect(selectTheme("QuantumSwapWallet")).toBe("legacy");
        expect(selectTheme("")).toBe("legacy");
    });
});
