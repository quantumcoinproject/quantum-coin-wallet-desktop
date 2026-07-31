import { describe, expect, it } from "vitest";
import { buildStepReview } from "./txflow-core";

describe("buildStepReview", () => {
    it("uses step-specific details and the current gas selection", () => {
        const base = {
            asset: "TOKEN-A / TOKEN-B",
            toAddress: "router",
            quantityValue: "10 TOKEN-A + 20 TOKEN-B",
            gasLimit: "old-limit",
            gasFee: "old-fee",
        };

        const review = buildStepReview(
            base,
            {
                asset: "Approve TOKEN-A",
                toAddress: "token-a",
                quantityValue: "10 TOKEN-A",
            },
            84000,
            "4 Q",
        );

        expect(review).toEqual({
            asset: "Approve TOKEN-A",
            toAddress: "token-a",
            quantityValue: "10 TOKEN-A",
            gasLimit: "84000",
            gasFee: "4 Q",
        });
        expect(base).toEqual({
            asset: "TOKEN-A / TOKEN-B",
            toAddress: "router",
            quantityValue: "10 TOKEN-A + 20 TOKEN-B",
            gasLimit: "old-limit",
            gasFee: "old-fee",
        });
    });

    it("keeps workflow details when a step has no overrides", () => {
        expect(buildStepReview({ asset: "Deploy PINK" }, undefined, 6000000, "285.7143 Q")).toEqual({
            asset: "Deploy PINK",
            gasLimit: "6000000",
            gasFee: "285.7143 Q",
        });
    });
});
