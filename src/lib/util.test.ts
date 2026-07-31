import { describe, expect, it } from "vitest";
import { htmlEncode, isHex, isLargeNumber, isNetworkError, isValidDate } from "./util";

describe("isNetworkError", () => {
    it("returns true for failed to fetch", () => {
        expect(isNetworkError({ message: "Failed to fetch resource" })).toBe(true);
    });

    it("returns true for timeout", () => {
        expect(isNetworkError({ message: "Request TIMEOUT exceeded" })).toBe(true);
    });

    it("returns true for network request failed", () => {
        expect(isNetworkError({ message: "Network request failed" })).toBe(true);
    });

    it("returns false for unrelated errors", () => {
        expect(isNetworkError({ message: "Invalid argument" })).toBe(false);
    });
});

describe("isLargeNumber", () => {
    it("accepts valid numeric strings", () => {
        expect(isLargeNumber("1")).toBe(true);
        expect(isLargeNumber("1.5")).toBe(true);
        expect(isLargeNumber(".5")).toBe(true);
        expect(isLargeNumber("1.")).toBe(true);
    });

    it("rejects invalid numeric strings", () => {
        expect(isLargeNumber("")).toBe(false);
        expect(isLargeNumber("a")).toBe(false);
        expect(isLargeNumber("1,5")).toBe(false);
        expect(isLargeNumber("-1")).toBe(false);
    });
});

describe("isValidDate", () => {
    it("returns true for parseable dates", () => {
        expect(isValidDate("2020-01-01")).toBe(true);
    });

    it("returns false for unparseable dates", () => {
        expect(isValidDate("not-a-date")).toBe(false);
    });
});

describe("isHex", () => {
    it("accepts 0x-prefixed hex", () => {
        expect(isHex("0xabc")).toBe(true);
    });

    it("rejects hex without 0x prefix", () => {
        expect(isHex("abc")).toBe(false);
    });

    it("rejects bare 0x prefix", () => {
        expect(isHex("0x")).toBe(false);
    });
});

describe("htmlEncode", () => {
    it("encodes special HTML characters", () => {
        expect(htmlEncode("<>&")).toContain("&#60;");
        expect(htmlEncode("<>&")).toContain("&#62;");
        expect(htmlEncode("<>&")).toContain("&#38;");
    });

    it("encodes non-ASCII characters", () => {
        expect(htmlEncode("café")).toContain("&#");
    });

    it("leaves alphanumerics unchanged", () => {
        expect(htmlEncode("abc123XYZ")).toBe("abc123XYZ");
    });
});
