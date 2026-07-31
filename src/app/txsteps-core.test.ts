import { describe, expect, it } from "vitest";
import { appendTxStepGasSelection } from "./txsteps-core";

describe("step gas configuration", () => {
    it("records configured gas in step order without mutating prior selections", () => {
        const first = appendTxStepGasSelection([], 84000, "4");
        const complete = appendTxStepGasSelection(first, 200000, "10");

        expect(first).toEqual([{ gasLimit: 84000, gasFee: "4" }]);
        expect(complete).toEqual([
            { gasLimit: 84000, gasFee: "4" },
            { gasLimit: 200000, gasFee: "10" },
        ]);
    });

    it("rejects invalid gas selections", () => {
        expect(() => appendTxStepGasSelection([], 0, "1")).toThrow("Invalid step gas selection");
        expect(() => appendTxStepGasSelection([], 1.5, "1")).toThrow("Invalid step gas selection");
        expect(() => appendTxStepGasSelection([], 84000, "")).toThrow("Invalid step gas selection");
    });
});
