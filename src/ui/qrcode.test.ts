import { describe, expect, it } from "vitest";
import { QRCode } from "./qrcode";

function canvas2dWorks(): boolean {
    if (typeof CanvasRenderingContext2D === "undefined") {
        return false;
    }
    const probe = document.createElement("canvas");
    return probe.getContext("2d") != null;
}

describe("QRCode smoke test", () => {
    it("instantiates without throwing and appends a rendered child", () => {
        const div = document.createElement("div");
        document.body.appendChild(div);

        const options: Record<string, unknown> = {
            text: "0xabc",
            width: 260,
            height: 260,
            correctLevel: QRCode.CorrectLevel.H,
        };
        if (!canvas2dWorks()) {
            options.useSVG = true;
        }

        expect(() => {
            new (QRCode as any)(div, options);
        }).not.toThrow();

        expect(div.childNodes.length).toBeGreaterThan(0);
        const child = div.firstChild as Element;
        const tag = child.tagName.toLowerCase();
        expect(["canvas", "table", "svg", "img"].includes(tag)).toBe(true);

        document.body.removeChild(div);
    });
});
