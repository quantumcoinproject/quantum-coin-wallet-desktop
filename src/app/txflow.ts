// Shared numbered-steps -> per-step transaction-review handoff. Every step
// estimates gas first, then collects a fresh wallet password immediately
// before that transaction is submitted.
import { langJson } from "../lib/i18n";
import { walletGetByAddress } from "../lib/wallet";
import { ERROR_TEMPLATE, STORAGE_PATH_TEMPLATE, walletStore } from "./state";
import {
    TransactionReview,
    TransactionReviewSubmission,
    hideWaitingBox,
    showTransactionReviewDialog,
    showWaitingBox,
    showWarnAlert,
    txReviewNetworkText,
} from "./dialog";
import { advancedSigningGetDefaultValue } from "./settings";
import { TxStepDefinition, showTxStepsDialog } from "./txsteps";
import { buildStepReview } from "./txflow-core";

export interface TxStepCredentials {
    privateKey: string;
    publicKey: string;
    advancedSigningEnabled: boolean;
}

export interface ReviewedTxStepDefinition extends TxStepDefinition {
    review?: TransactionReview;
    run: (gasLimit: number, credentials: TxStepCredentials) => Promise<string>;
}

export interface ReviewedStepsFlow {
    review: TransactionReview;
    stepsTitle: string;
    progressText?: string;
    buildSteps: () => ReviewedTxStepDefinition[];
    onAllDone?: () => HTMLElement | null | void;
    onClose?: () => unknown;
}

function requestStepCredentials(review: TransactionReview): Promise<TxStepCredentials | null> {
    return new Promise((resolve) => {
        let settled = false;
        const settle = (credentials: TxStepCredentials | null): void => {
            if (settled) return;
            settled = true;
            resolve(credentials);
        };
        review.requirePassword = true;
        review.submitLabelKey = "ok";
        review.nonce = null;
        review.networkText = txReviewNetworkText();
        review.fromAddress = walletStore.currentWalletAddress;
        review.showGas = true;
        review.onCancel = () => settle(null);
        review.onSubmit = async function (submission: TransactionReviewSubmission): Promise<boolean> {
            showWaitingBox(langJson.langValues.waitWalletOpen);
            try {
                const quantumWallet = await walletGetByAddress(submission.password, walletStore.currentWalletAddress);
                if (quantumWallet == null) {
                    showWarnAlert(
                        langJson.errors.error
                            .replace(STORAGE_PATH_TEMPLATE, walletStore.STORAGE_PATH)
                            .replace(ERROR_TEMPLATE, ""),
                    );
                    return false;
                }
                const privateKey = await quantumWallet.getPrivateKey();
                const publicKey = await quantumWallet.getPublicKey();
                const advancedSigningEnabled = await advancedSigningGetDefaultValue();
                settle({
                    privateKey,
                    publicKey,
                    advancedSigningEnabled: advancedSigningEnabled === true,
                });
                return true;
            } catch (err: any) {
                showWarnAlert((err && err.message) ? String(err.message) : String(err));
                return false;
            } finally {
                hideWaitingBox();
            }
        };
        showTransactionReviewDialog(review);
    });
}

export function showReviewThenSteps(flow: ReviewedStepsFlow): void {
    const steps = flow.buildSteps();
    const clearStepsAndClose = function (): void {
        for (const step of steps) {
            step.prepare = undefined;
            step.run = async () => { throw new Error("Workflow closed."); };
        }
        if (flow.onClose) void flow.onClose();
    };
    showTxStepsDialog({
        title: flow.stepsTitle,
        steps,
        progressText: flow.progressText,
        onSubmitStep: async (index, gasLimit, gasFee, onSubmitting) => {
            const step = steps[index];
            const review: TransactionReview = buildStepReview(flow.review, step.review, gasLimit, gasFee);
            const credentials = await requestStepCredentials(review);
            if (credentials == null) return null;
            onSubmitting();
            return step.run(gasLimit, credentials);
        },
        onAllDone: flow.onAllDone,
        onClose: clearStepsAndClose,
    });
}

export function requireTxHash(result: any): string {
    if (!result || !result.success || !result.txHash) {
        throw new Error((result && result.error)
            ? String(result.error)
            : (langJson.errors.transactionSubmissionFailed || "Transaction submission failed."));
    }
    return String(result.txHash);
}
