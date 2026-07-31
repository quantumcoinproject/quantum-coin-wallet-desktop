// Controller for the numbered multi-step transaction dialog (modalTxSteps).
// Every step estimates gas and waits for its own transaction confirmation
// before submission. Submitted hashes are polled through the same scan API
// used by showSendCompletedDialog.
import { langJson } from "../lib/i18n";
import { getTransactionStatusByHash } from "../lib/api";
import { WriteTextToClipboard } from "../lib/bridge";
import { byId, networkStore, walletStore } from "./state";
import { OpenScanTxn } from "./app";
import { formatGasFeeQ } from "./gas";
import { hideWaitingBox, showGasConfigDialog, showWaitingBox } from "./dialog";
import { appendTxStepGasSelection, TxStepGasSelection } from "./txsteps-core";

export type TxStepStatus = "pending" | "active" | "ready" | "confirming" | "done" | "failed";

export interface TxStepDefinition {
    label: string;
    // Prepare only the current transaction, after any preceding receipt has
    // succeeded.
    prepare?: () => Promise<TxStepGasEstimate>;
}

export interface TxStepGasEstimate {
    gasLimit: string;
    gasFee: string;
    feePerGas: number;
}

const TX_STEPS_POLL_INTERVAL_MS = 5000;
const TX_STEPS_MAX_POLLS = 120; // ~10 minutes per step

let txStepsRunId = 0; // invalidates the running chain when the dialog closes
let txStepsCurrentTxHash: string | null = null;
let txStepsOnClose: (() => unknown) | null = null;
let txStepsBound = false;
let txStepsProgressText = "";
let txStepsAction: (() => void) | null = null;
let txStepsGasLimit = 0;
let txStepsGasFee = "";

function t(key: string, fallback: string): string {
    return (langJson && langJson.langValues && langJson.langValues[key]) || fallback;
}

function stepRow(num: number, label: string, state: TxStepStatus): HTMLElement {
    const li = document.createElement("li");
    li.className = "tx-step s-" + state;
    const badge = document.createElement("span");
    badge.className = "tx-badge";
    if (state === "done") {
        badge.textContent = "\u2713";
    } else if (state === "failed") {
        badge.textContent = "\u2715";
    } else if (state === "active" || state === "confirming") {
        const spinner = document.createElement("span");
        spinner.className = "tx-spinner";
        badge.appendChild(spinner);
    } else {
        badge.textContent = String(num);
    }
    const labelSpan = document.createElement("span");
    labelSpan.className = "tx-label";
    // label may embed a token symbol (untrusted); textContent keeps it inert.
    labelSpan.textContent = label;
    if (state === "confirming") {
        const confirming = document.createElement("span");
        confirming.className = "tx-substatus";
        confirming.textContent = " " + (txStepsProgressText || t("tx-step-confirming", "Confirming..."));
        labelSpan.appendChild(confirming);
    }
    li.appendChild(badge);
    li.appendChild(labelSpan);
    return li;
}

function renderSteps(steps: TxStepDefinition[], statuses: TxStepStatus[]): void {
    const list = byId("olTxStepsList");
    list.textContent = "";
    for (let i = 0; i < steps.length; i++) {
        list.appendChild(stepRow(i + 1, steps[i].label, statuses[i]));
    }
}

function setTxStepsHash(txHash: string | null): void {
    txStepsCurrentTxHash = txHash;
    const row = byId("divTxStepsHashRow");
    if (txHash == null) {
        row.style.display = "none";
        byId("pTxStepsTxHash").textContent = "";
        return;
    }
    byId("pTxStepsTxHash").textContent = txHash;
    row.style.display = "block";
}

function setTxStepsError(message: string | null): void {
    const p = byId("pTxStepsError");
    if (message == null || message === "") {
        p.style.display = "none";
        p.textContent = "";
        return;
    }
    p.textContent = message;
    p.style.display = "block";
}

// Result note shown when the whole chain finished (e.g. the deployed token's
// contract address). Built by the caller with createElement/textContent only.
function setTxStepsResult(resultNode: HTMLElement | null): void {
    const div = byId("divTxStepsResult");
    div.textContent = "";
    if (resultNode == null) {
        div.style.display = "none";
        return;
    }
    div.appendChild(resultNode);
    div.style.display = "block";
}

function setTxStepsButton(labelKey: string, fallback: string, enabled: boolean, spinning = false): void {
    const btn = byId<HTMLButtonElement>("btnTxStepsClose");
    btn.textContent = "";
    if (spinning) {
        const spinner = document.createElement("span");
        spinner.className = "tx-spinner";
        spinner.style.marginRight = "6px";
        btn.appendChild(spinner);
    }
    btn.appendChild(document.createTextNode(t(labelKey, fallback)));
    btn.disabled = !enabled;
}

function setTxStepsWaiting(visible: boolean): void {
    byId("divTxStepsWait").style.display = visible ? "block" : "none";
}

function hideTxStepsGas(): void {
    byId("divTxStepsGas").style.display = "none";
    byId("spanTxStepsGasFee").textContent = "";
    byId("divTxStepsGasIcon").classList.remove("gas-pulse");
    txStepsGasLimit = 0;
    txStepsGasFee = "";
}

function closeTxStepsDialog(): void {
    txStepsRunId++; // abandon any in-flight polling loop
    const dlg = byId<HTMLDialogElement>("modalTxSteps");
    dlg.style.display = "none";
    dlg.close();
    txStepsAction = null;
    hideTxStepsGas();
    setTxStepsWaiting(false);
    const cb = txStepsOnClose;
    txStepsOnClose = null;
    if (cb != null) void cb();
}

function bindTxStepsDialog(): void {
    if (txStepsBound) return;
    txStepsBound = true;
    byId("btnTxStepsClose").addEventListener("click", function () {
        if (txStepsAction) txStepsAction();
    });
    byId("btnTxStepsDismiss").addEventListener("click", function () {
        closeTxStepsDialog();
    });
    byId("divTxStepsGasIcon").addEventListener("click", function () {
        if (txStepsGasLimit <= 0 || txStepsGasFee === "") return;
        showGasConfigDialog({
            gasLimit: String(txStepsGasLimit),
            gasFee: txStepsGasFee,
            onOk: (result) => {
                txStepsGasLimit = Number(result.gasLimit);
                txStepsGasFee = result.gasFee;
                byId("spanTxStepsGasFee").textContent = formatGasFeeQ(result.gasFee);
            },
        });
    });
    byId<HTMLDialogElement>("modalTxSteps").addEventListener("cancel", function (event) {
        event.preventDefault();
        closeTxStepsDialog();
    });
    byId("divTxStepsCopy").addEventListener("click", function (event) {
        const el = event.currentTarget as HTMLElement;
        if (txStepsCurrentTxHash) void WriteTextToClipboard(txStepsCurrentTxHash).then(() => el.blur());
    });
    byId("divTxStepsExplorer").addEventListener("click", function (event) {
        const el = event.currentTarget as HTMLElement;
        if (txStepsCurrentTxHash) void OpenScanTxn(txStepsCurrentTxHash).then(() => el.blur());
    });
}

// Poll the scan API until the tx reaches a terminal state. Throws on failure
// or timeout; returns normally on success. Abandoned silently (throws a
// cancellation) when the dialog was closed (runId changed).
async function waitForTxSuccess(txHash: string, runId: number): Promise<void> {
    for (let i = 0; i < TX_STEPS_MAX_POLLS; i++) {
        await new Promise((resolve) => setTimeout(resolve, TX_STEPS_POLL_INTERVAL_MS));
        if (runId !== txStepsRunId) throw new Error("__txsteps_cancelled__");
        if (!networkStore.currentBlockchainNetwork) continue;
        // getTransactionStatusByHash never throws; scan-API errors come back as
        // { status: "unknown" } and simply keep the polling loop going.
        const res = await getTransactionStatusByHash(
            (networkStore.currentBlockchainNetwork as { scanApiDomain: string }).scanApiDomain,
            walletStore.currentWalletAddress,
            txHash
        );
        if (runId !== txStepsRunId) throw new Error("__txsteps_cancelled__");
        if (res.status === "succeeded") return;
        if (res.status === "failed") {
            throw new Error(res.error ? String(res.error) : t("tx-step-failed-onchain", "The transaction failed on-chain."));
        }
    }
    throw new Error(t("tx-step-timeout", "Timed out waiting for the transaction to confirm. Check the block explorer before retrying."));
}

export interface TxStepsOptions {
    title: string;
    steps: TxStepDefinition[];
    progressText?: string;
    configurationOnly?: boolean;
    onConfigured?: (selections: TxStepGasSelection[]) => unknown;
    // Configuration-only flows may handle each selected gas value before the
    // step advances (for example, review and sign one offline transaction).
    // False keeps the current step ready for retry.
    onConfigureStep?: (index: number, selection: TxStepGasSelection) => Promise<boolean>;
    // Opens the per-step review and submits after the user confirms. Returning
    // null means the review was cancelled and the current step remains ready.
    onSubmitStep?: (
        index: number,
        gasLimit: number,
        gasFee: string,
        onSubmitting: () => void,
    ) => Promise<string | null>;
    // Called once every step succeeded; may return a node to display (e.g.
    // the new token's address) - built with createElement/textContent only.
    onAllDone?: () => HTMLElement | null | void;
    // Called when the dialog closes (any outcome).
    onClose?: () => unknown;
}

function afterTwoPaints(): Promise<void> {
    return new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
        });
    });
}

// Open the numbered status dialog. Every step prepares and submits only when
// the user clicks its action and completes that step's transaction review.
export function showTxStepsDialog(options: TxStepsOptions): void {
    bindTxStepsDialog();
    txStepsRunId++;
    const runId = txStepsRunId;
    const steps = options.steps;
    // Render the first spinner before opening the dialog. RPC submission is
    // deferred until after this initial UI has painted.
    const statuses: TxStepStatus[] = steps.map((_, index) => index === 0 ? "active" : "pending");
    txStepsOnClose = options.onClose || null;
    txStepsProgressText = options.progressText || t("tx-step-confirming", "Confirming...");

    byId("h3TxStepsTitle").textContent = options.title;
    renderSteps(steps, statuses);
    setTxStepsHash(null);
    setTxStepsError(null);
    setTxStepsResult(null);
    setTxStepsButton("close", "Close", true);
    txStepsAction = closeTxStepsDialog;
    hideTxStepsGas();
    setTxStepsWaiting(false);

    const dlg = byId<HTMLDialogElement>("modalTxSteps");
    dlg.style.display = "block";
    dlg.showModal();

    let currentIndex = 0;
    let running = false;
    let configuredSelections: TxStepGasSelection[] = [];
    // In-flight prepare() (gas estimation) for the current step. The step
    // button is enabled while it runs; an early click waits on this promise
    // behind the shared wait dialog (see runCurrent).
    let prepareInFlight: Promise<void> | null = null;

    const failCurrent = (err: unknown): void => {
        if (runId !== txStepsRunId) return;
        const msg = String((err as { message?: unknown })?.message ?? err ?? "");
        if (msg === "__txsteps_cancelled__") return;
        setTxStepsWaiting(false);
        statuses[currentIndex] = "failed";
        renderSteps(steps, statuses);
        setTxStepsError(t("tx-step-failed", "Step failed.") + " " + msg);
        setTxStepsButton("close", "Close", true);
        txStepsAction = closeTxStepsDialog;
    };

    const finishAll = (): void => {
        hideTxStepsGas();
        setTxStepsWaiting(false);
        if (options.configurationOnly === true) {
            const onConfigured = options.onConfigured;
            txStepsOnClose = null;
            closeTxStepsDialog();
            if (onConfigured) void onConfigured(configuredSelections.slice());
            return;
        }
        if (options.onAllDone) {
            const node = options.onAllDone();
            if (node instanceof HTMLElement) setTxStepsResult(node);
        }
        setTxStepsButton("ok", "Ok", true);
        txStepsAction = closeTxStepsDialog;
    };

    const prepareCurrent = async (): Promise<void> => {
        if (runId !== txStepsRunId) return;
        if (currentIndex >= steps.length) {
            finishAll();
            return;
        }
        const step = steps[currentIndex];
        statuses[currentIndex] = "active";
        renderSteps(steps, statuses);
        setTxStepsHash(null);
        setTxStepsError(null);
        setTxStepsWaiting(false);
        byId("divTxStepsGas").style.display = "flex";
        byId("spanTxStepsGasFee").textContent = "";
        byId("divTxStepsGasIcon").classList.add("gas-pulse");
        txStepsGasLimit = 0;
        txStepsGasFee = "";
        // The step button is enabled right away; if clicked before the gas
        // estimate finishes, runCurrent waits on prepareInFlight behind the
        // shared wait dialog.
        setTxStepsButton("", step.label, true);
        txStepsAction = () => { void runCurrent(); };
        const prepare = (async (): Promise<void> => {
            await afterTwoPaints();
            if (!step.prepare) throw new Error("Gas preparation is unavailable for this step.");
            const estimate = await step.prepare();
            if (runId !== txStepsRunId) return;
            txStepsGasLimit = Number(estimate.gasLimit);
            txStepsGasFee = estimate.gasFee;
            byId("spanTxStepsGasFee").textContent = formatGasFeeQ(estimate.gasFee);
            byId("divTxStepsGasIcon").classList.remove("gas-pulse");
            statuses[currentIndex] = "ready";
            renderSteps(steps, statuses);
        })();
        prepareInFlight = prepare;
        try {
            await prepare;
        } catch (err) {
            byId("divTxStepsGasIcon").classList.remove("gas-pulse");
            failCurrent(err);
        } finally {
            if (prepareInFlight === prepare) prepareInFlight = null;
        }
    };

    const runCurrent = async (): Promise<void> => {
        if (running || currentIndex >= steps.length || runId !== txStepsRunId) return;
        if (prepareInFlight != null) {
            // Clicked before the gas estimate landed: wait for it here instead
            // of the button having been disabled.
            running = true;
            showWaitingBox(t("pleaseWaitEstimatingGas", "Please wait, estimating gas..."));
            try {
                await prepareInFlight;
            } catch {
                // failCurrent already rendered the failed step.
                hideWaitingBox();
                running = false;
                return;
            }
            hideWaitingBox();
            running = false;
            if (runId !== txStepsRunId) return;
        }
        if (!Number.isInteger(txStepsGasLimit) || txStepsGasLimit <= 0 || txStepsGasFee === "") {
            failCurrent(t("tx-step-invalid-gas", "Enter a valid positive gas limit."));
            return;
        }
        running = true;
        setTxStepsButton("", steps[currentIndex].label, false);
        txStepsAction = null;
        if (options.configurationOnly === true) {
            try {
                const selection = { gasLimit: txStepsGasLimit, gasFee: txStepsGasFee };
                if (options.onConfigureStep) {
                    const completed = await options.onConfigureStep(currentIndex, selection);
                    if (!completed) {
                        running = false;
                        statuses[currentIndex] = "ready";
                        renderSteps(steps, statuses);
                        setTxStepsButton("", steps[currentIndex].label, true);
                        txStepsAction = () => { void runCurrent(); };
                        return;
                    }
                }
                configuredSelections = appendTxStepGasSelection(
                    configuredSelections,
                    selection.gasLimit,
                    selection.gasFee,
                );
                statuses[currentIndex] = "done";
                renderSteps(steps, statuses);
                currentIndex++;
                running = false;
                await prepareCurrent();
            } catch (err) {
                running = false;
                failCurrent(err);
            }
            return;
        }
        let submissionStarted = false;
        const onSubmitting = (): void => {
            if (runId !== txStepsRunId) return;
            submissionStarted = true;
            statuses[currentIndex] = "active";
            renderSteps(steps, statuses);
            hideTxStepsGas();
            setTxStepsWaiting(true);
            setTxStepsButton("tx-step-submitting", "Submitting...", false, true);
        };
        try {
            if (!options.onSubmitStep) throw new Error("Step submission is unavailable.");
            const txHash = await options.onSubmitStep(
                currentIndex,
                txStepsGasLimit,
                formatGasFeeQ(txStepsGasFee),
                onSubmitting,
            );
            if (runId !== txStepsRunId) return;
            if (txHash == null) {
                running = false;
                statuses[currentIndex] = "ready";
                renderSteps(steps, statuses);
                setTxStepsButton("", steps[currentIndex].label, true);
                txStepsAction = () => { void runCurrent(); };
                return;
            }
            if (!submissionStarted) onSubmitting();
            statuses[currentIndex] = "confirming";
            renderSteps(steps, statuses);
            setTxStepsHash(txHash);
            setTxStepsButton("tx-step-confirming", "Confirming...", false, true);
            await waitForTxSuccess(txHash, runId);
            if (runId !== txStepsRunId) return;
            setTxStepsWaiting(false);
            statuses[currentIndex] = "done";
            renderSteps(steps, statuses);
            currentIndex++;
            running = false;
            await prepareCurrent();
        } catch (err) {
            running = false;
            failCurrent(err);
        }
    };

    void prepareCurrent();
}
