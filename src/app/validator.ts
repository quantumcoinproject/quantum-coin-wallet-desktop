// Validator (staking) screen and its six actions. 1:1 port of the old
// src/js/validator/validator.js plus newdeposit.js, increasedeposit.js,
// initiatepartialwithdrawal.js, completepartialwithdrawal.js,
// pausevalidation.js and resumevalidation.js.
import { isNetworkError } from "../lib/util";
import { langJson } from "../lib/i18n";
import { IsValidAddress } from "../lib/crypto";
import {
    OpenUrl,
    WriteTextToClipboard,
    isValidEther,
    offlineSignStakingContract,
    submitStakingContract,
} from "../lib/bridge";
import { Wallet } from "../lib/wallet";
import { TransactionDetails } from "../lib/api";
import {
    ADDRESS_LENGTH_CHECK,
    HTTPS,
    TxContext,
    byId,
    inputById,
    networkStore,
    selectById,
    settingsStore,
    walletStore,
} from "./state";
import {
    ensureGasEstimateReady,
    isGasConfigReady,
    onGasIconClick,
    resetCurrentGasConfig,
    resolveGasForTx,
    scheduleGasEstimation,
    setGasFeeLabel,
} from "./gas";
import { advancedSigningGetDefaultValue, offlineTxnSigningGetDefaultValue } from "./settings";
import {
    hideWaitingBox,
    showLoadingAndExecuteAsync,
    showOfflineSignatureDialog,
    showTransactionReviewDialog,
    showWarnAlert,
    txReviewNetworkText,
    unlockWalletForReview,
    updateWaitingBox,
    TransactionReview,
    TransactionReviewSubmission,
} from "./dialog";
import { setHeaderBand, showWalletScreen } from "./app";
import { showSendCompletedDialog } from "./send";
import { prepareOfflineDefaults } from "./offline-flow";

export const STAKING_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000000000000000000000001000";

export const NEW_DEPOSIT_GAS = 250000;
export const INCREASE_DEPOSIT_GAS = 250000;
export const INITIATE_PARTIAL_WITHDRAWAL_GAS = 100000;
export const COMPLETE_PARTIAL_WITHDRAWAL_GAS = 100000;
export const PAUSE_VALIDATION_GAS = 100000;
export const RESUME_VALIDATION_GAS = 100000;

// From the old app.js: common review-dialog wrapper for all validator actions.
let validatorSubmission: TransactionReviewSubmission | null = null;

/**
 * @param submit runs once the password has opened the wallet. Unlocking
 * happens inside onSubmit, and a failure returns false, so a wrong password
 * leaves the dialog open with what the user typed still in it rather than
 * closing it and reporting the failure afterwards.
 */
export async function showValidatorTransactionReview(
    review: TransactionReview,
    submit: (quantumWallet: Wallet) => unknown,
): Promise<void> {
    review.requirePassword = true;
    review.requireNonce = settingsStore.offlineSignEnabled === true;
    review.submitLabelKey = "submit";
    review.fromAddress = walletStore.currentWalletAddress;
    review.networkText = txReviewNetworkText();
    review.contractAddress = STAKING_CONTRACT_ADDRESS;
    if (settingsStore.offlineSignEnabled) {
        review.nonce = (await prepareOfflineDefaults()).nonce;
    }
    review.onSubmit = async (submission) => {
        validatorSubmission = submission;
        const quantumWallet = await unlockWalletForReview(submission.password);
        if (quantumWallet == null) return false;
        // Not awaited: the password has been accepted, so the review dialog
        // closes now and the action runs on behind the wait box.
        void submit(quantumWallet);
        return true;
    };
    showTransactionReviewDialog(review);
}

export function getValidatorDefaultGas(selectedValue: string): number | null {
    if (selectedValue === "newdeposit") return NEW_DEPOSIT_GAS;
    if (selectedValue === "increasedeposit") return INCREASE_DEPOSIT_GAS;
    if (selectedValue === "initiatepartialwithdrawal") return INITIATE_PARTIAL_WITHDRAWAL_GAS;
    if (selectedValue === "completepartialwithdrawal") return COMPLETE_PARTIAL_WITHDRAWAL_GAS;
    if (selectedValue === "pausevalidation") return PAUSE_VALIDATION_GAS;
    if (selectedValue === "resumevalidation") return RESUME_VALIDATION_GAS;
    return null;
}

export function getValidatorMethodName(selectedValue: string): string | null {
    if (selectedValue === "newdeposit") return "newDeposit";
    if (selectedValue === "increasedeposit") return "increaseDeposit";
    if (selectedValue === "initiatepartialwithdrawal") return "initiatePartialWithdrawal";
    if (selectedValue === "completepartialwithdrawal") return "completePartialWithdrawal";
    if (selectedValue === "pausevalidation") return "pauseValidation";
    if (selectedValue === "resumevalidation") return "resumeValidation";
    return null;
}

export function getValidatorTxContext(): TxContext | null {
    const ddl = selectById("ddlValidatorOptions");
    const selectedValue = ddl ? ddl.value : "none";
    if (selectedValue === "none") return null;
    const validatorAddress = (inputById("txtValidatorAddress").value || "").trim();
    const depositCoins = (inputById("txtValidatorDepositCoins").value || "").trim();
    const defaultGasLimit = getValidatorDefaultGas(selectedValue);
    const methodName = getValidatorMethodName(selectedValue);
    if (defaultGasLimit == null || methodName == null) return null;
    const ctx: TxContext = { txKind: methodName, defaultGasLimit: defaultGasLimit, methodArgs: [] };
    if (selectedValue === "newdeposit") {
        if (!validatorAddress || !depositCoins) return null;
        ctx.methodArgs = [validatorAddress];
        ctx.value = depositCoins;
    } else if (selectedValue === "increasedeposit") {
        if (!depositCoins) return null;
        ctx.value = depositCoins;
    } else if (selectedValue === "initiatepartialwithdrawal") {
        if (!depositCoins) return null;
        ctx.methodArgs = [depositCoins];
    }
    return ctx;
}

export function onValidatorGasIconClick(): boolean {
    return onGasIconClick("spanValidatorGasFee", null, getValidatorTxContext);
}

export function scheduleValidatorGasEstimation(): void {
    scheduleGasEstimation(getValidatorTxContext, "divValidatorGasIcon", "spanValidatorGasFee", null, null);
}

export function attachValidatorGasListeners(): void {
    const addr = inputById("txtValidatorAddress");
    const qty = inputById("txtValidatorDepositCoins");
    if (addr && !addr.dataset.gasBound) { addr.addEventListener("input", scheduleValidatorGasEstimation); addr.dataset.gasBound = "1"; }
    if (qty && !qty.dataset.gasBound) { qty.addEventListener("input", scheduleValidatorGasEstimation); qty.dataset.gasBound = "1"; }
}

export function openValidatorPage(): boolean {
    OpenUrl(HTTPS + (networkStore.currentBlockchainNetwork as { blockExplorerDomain: string }).blockExplorerDomain + "/validator/page");
    return false;
}

export async function showValidatorScreen(): Promise<boolean> {
    byId("ahrefValidatorPage").textContent = (networkStore.currentBlockchainNetwork as { blockExplorerDomain: string }).blockExplorerDomain + "/validator/page";
    byId("main-content").style.display = "block";
    byId("settings-content").style.display = "none";
    byId("settingsScreen").style.display = "none";
    byId("networkListScreen").style.display = "none";
    byId("networkAddScreen").style.display = "none";

    byId("divNetworkDropdown").style.display = "none";
    byId("HomeScreen").style.display = "none";
    byId("SendScreen").style.display = "none";
    byId("OfflineSignScreen").style.display = "none";
    byId("ValidatorScreen").style.display = "block";
    setHeaderBand("compact");

    const ddlValidatorOptions = selectById("ddlValidatorOptions");
    ddlValidatorOptions.value = "none";

    await updateValidatorScreen();

    selectById("ddlValidatorOptions").focus();

    resetCurrentGasConfig();
    attachValidatorGasListeners();
    setGasFeeLabel("spanValidatorGasFee", "");

    return false;
}

export async function updateValidatorScreen(): Promise<void> {
    inputById("txtValidatorAddress").value = "";
    inputById("txtValidatorDepositCoins").value = "";
    setGasFeeLabel("spanValidatorGasFee", "");

    byId("divValidatorAddress").style.display = "none";
    byId("divValidatorDepositCoins").style.display = "none";
    byId("divValidatorButton").style.display = "none";

    const ddlValidatorOptions = selectById("ddlValidatorOptions");
    const selectedValue = ddlValidatorOptions.value;

    if (selectedValue === "none") {
        // nothing to show
    } else {
        byId("divValidatorButton").style.display = "block";
        settingsStore.offlineSignEnabled = await offlineTxnSigningGetDefaultValue();

        if (settingsStore.offlineSignEnabled === true) {
            byId("btnValidation").style.display = "none";
            byId("btnOfflineValidation").style.display = "block";
        } else {
            byId("btnValidation").style.display = "block";
            byId("btnOfflineValidation").style.display = "none";
        }

        if (selectedValue === "newdeposit") {
            byId("divValidatorAddress").style.display = "block";
            byId("divValidatorDepositCoins").style.display = "block";
        } else if (selectedValue === "increasedeposit") {
            byId("divValidatorDepositCoins").style.display = "block";
        } else if (selectedValue === "initiatepartialwithdrawal") {
            byId("divValidatorDepositCoins").style.display = "block";
        }

        resetCurrentGasConfig();
        setGasFeeLabel("spanValidatorGasFee", "");
        scheduleValidatorGasEstimation();
    }

    // The quantity container carries its own trailing divider, so the
    // standalone line above the buttons is drawn only when that container is
    // hidden - otherwise the two stack up as a double rule.
    const quantityShown = byId("divValidatorDepositCoins").style.display !== "none";
    byId("divValidatorButtonDivider").style.display = quantityShown ? "none" : "block";
}

export function validation(): void {
    const ddlValidatorOptions = selectById("ddlValidatorOptions");
    const selectedValue = ddlValidatorOptions.value;

    // The action button stays enabled while gas is being estimated. If the
    // user clicks before the estimate has loaded (and has not set gas
    // manually), wait for it behind the shared wait dialog first. Offline
    // mode is always ready (eager SDK fallback).
    if (!isGasConfigReady()) {
        showLoadingAndExecuteAsync(langJson.langValues.pleaseWaitEstimatingGas, function () {
            void ensureGasEstimateReady().then(function () {
                hideWaitingBox();
                dispatchValidatorAction(selectedValue);
            });
        });
        return;
    }

    dispatchValidatorAction(selectedValue);
}

function dispatchValidatorAction(selectedValue: string): void {
    if (selectedValue === "newdeposit") {
        newDeposit();
    } else if (selectedValue === "increasedeposit") {
        increaseDeposit();
    } else if (selectedValue === "initiatepartialwithdrawal") {
        initiatePartialWithdrawal();
    } else if (selectedValue === "completepartialwithdrawal") {
        completePartialWithdrawal();
    } else if (selectedValue === "pausevalidation") {
        pauseValidation();
    } else if (selectedValue === "resumevalidation") {
        resumeValidation();
    }
}

export async function copyOfflineSignature(): Promise<void> {
    await WriteTextToClipboard(inputById("txtOfflineSignature").value);
}

// Shared by all validator flows: validate the (optional) offline nonce and the
// wallet password exactly the way each legacy module did inline.
function readValidatorNonce(): string | null | false {
    return settingsStore.offlineSignEnabled === true ? "" : null;
}

function validateValidatorPassword(): boolean {
    return true;
}

// Legacy no-op double validation preserved: the boolean result of isValidEther
// was passed back into isValidEther, so the check never rejects here.
async function checkDepositCoinsEntered(validatorDepositCoins: string): Promise<boolean> {
    if (validatorDepositCoins == null || validatorDepositCoins.length < 1) {
        showWarnAlert(langJson.errors.enterAmount);
        return false;
    }

    const okQuantity = await isValidEther(validatorDepositCoins);
    if ((isValidEther(okQuantity as unknown as string) as unknown as boolean) == false) {
        showWarnAlert(langJson.errors.enterAmount);
        return false;
    }
    return true;
}

// The legacy decrypt-then-run wrapper each module repeated verbatim is gone:
// unlockWalletForReview (app/dialog.ts) now opens the wallet from inside the
// review dialog, which is what lets a wrong password be retried in place.

// Common online staking submission each legacy module repeated verbatim.
async function submitValidatorTransaction(quantumWallet: Wallet, method: string, methodArgs: string[], value: string, defaultGasLimit: number): Promise<void> {
    updateWaitingBox(langJson.langValues.pleaseWaitSubmit);

    try {
        const result = await submitStakingContract({
            rpcEndpoint: (networkStore.currentBlockchainNetwork as { rpcEndpoint: string }).rpcEndpoint,
            chainId: parseInt(String((networkStore.currentBlockchainNetwork as { networkId: number }).networkId), 10),
            method: method,
            methodArgs: methodArgs,
            value: value,
            gasLimit: parseInt(resolveGasForTx(defaultGasLimit).gasLimit, 10),
            privateKey: await quantumWallet.getPrivateKey(),
            publicKey: await quantumWallet.getPublicKey(),
            advancedSigningEnabled: await advancedSigningGetDefaultValue(),
        });

        if (result && result.success && result.txHash) {
            const currentDate = new Date();
            const pendingTxn = new TransactionDetails(result.txHash, currentDate, quantumWallet.address, STAKING_CONTRACT_ADDRESS, value, true);
            walletStore.pendingTransactionsMap.set(quantumWallet.address.toLowerCase() + (networkStore.currentBlockchainNetwork as { index: number }).index.toString(), pendingTxn);

            setTimeout(() => {
                hideWaitingBox();
                showSendCompletedDialog(result.txHash, showWalletScreen);
            }, 1000);
        } else {
            hideWaitingBox();
            showWarnAlert((result && result.error) ? result.error : langJson.errors.invalidApiResponse);
        }
    } catch (error) {
        hideWaitingBox();

        if (isNetworkError(error as { message: string })) {
            showWarnAlert(langJson.errors.internetDisconnected);
        } else {
            showWarnAlert(langJson.errors.invalidApiResponse + " " + error);
        }
    }
}

// Common offline staking signing each legacy module repeated verbatim.
async function offlineSignValidatorTransaction(quantumWallet: Wallet, method: string, methodArgs: string[], value: string, defaultGasLimit: number): Promise<void> {
    updateWaitingBox(langJson.langValues.pleaseWaitSubmit);
    const currentNonce = validatorSubmission?.startingNonce;

    try {
        const result = await offlineSignStakingContract({
            chainId: parseInt(String((networkStore.currentBlockchainNetwork as { networkId: number }).networkId), 10),
            method: method,
            methodArgs: methodArgs,
            value: value,
            gasLimit: parseInt(resolveGasForTx(defaultGasLimit).gasLimit, 10),
            nonce: currentNonce as number,
            privateKey: await quantumWallet.getPrivateKey(),
            publicKey: await quantumWallet.getPublicKey(),
            advancedSigningEnabled: await advancedSigningGetDefaultValue(),
        });

        if (result && result.success && result.txData) {
            hideWaitingBox();
            await showOfflineSignatureDialog(result.txData);
        } else {
            hideWaitingBox();
            showWarnAlert((result && result.error) ? result.error : langJson.errors.unexpectedError);
        }
    } catch (error) {
        hideWaitingBox();
        showWarnAlert(langJson.errors.genericError + " " + error);
    }
}

//---- New deposit ----

export async function newDeposit(): Promise<boolean> {
    const validatorAddress = inputById("txtValidatorAddress").value;
    const validatorDepositCoins = inputById("txtValidatorDepositCoins").value;

    if (validatorAddress == null || validatorAddress.length < ADDRESS_LENGTH_CHECK || await IsValidAddress(validatorAddress) == false) {
        showWarnAlert(langJson.errors.quantumAddr);
        return false;
    }

    if (walletStore.currentWalletAddress.toLowerCase().trim() === validatorAddress.toLowerCase().trim()) {
        showWarnAlert(langJson.errors.validatorDepositorAddress);
        return false;
    }

    if (await checkDepositCoinsEntered(validatorDepositCoins) == false) {
        return false;
    }

    settingsStore.offlineSignEnabled = await offlineTxnSigningGetDefaultValue();
    const nonceValue = readValidatorNonce();
    if (nonceValue === false) {
        return false;
    }

    if (validateValidatorPassword() == false) {
        return false;
    }

    const resolved = resolveGasForTx(NEW_DEPOSIT_GAS);
    const review: TransactionReview = {
        asset: langJson.langValues["validator-new-deposit"],
        toAddress: validatorAddress,
        quantityLabelKey: "coins-to-deposit",
        quantityValue: validatorDepositCoins,
        gasLimit: resolved.gasLimit,
        gasFee: resolved.gasFee,
        nonce: nonceValue,
    };
    showValidatorTransactionReview(review, newDepositSubmit);
    return false;
}



export async function newDepositSubmit(quantumWallet: Wallet): Promise<void> {
    settingsStore.offlineSignEnabled = await offlineTxnSigningGetDefaultValue();
    const validatorAddress = inputById("txtValidatorAddress").value;
    const validatorDepositCoins = inputById("txtValidatorDepositCoins").value;
    if (settingsStore.offlineSignEnabled === true) {
        await offlineSignValidatorTransaction(quantumWallet, "newDeposit", [validatorAddress], validatorDepositCoins, NEW_DEPOSIT_GAS);
        return;
    }

    await submitValidatorTransaction(quantumWallet, "newDeposit", [validatorAddress], validatorDepositCoins, NEW_DEPOSIT_GAS);
}

//---- Increase deposit ----

export async function increaseDeposit(): Promise<boolean> {
    const validatorDepositCoins = inputById("txtValidatorDepositCoins").value;

    if (await checkDepositCoinsEntered(validatorDepositCoins) == false) {
        return false;
    }

    settingsStore.offlineSignEnabled = await offlineTxnSigningGetDefaultValue();
    const nonceValue = readValidatorNonce();
    if (nonceValue === false) {
        return false;
    }

    if (validateValidatorPassword() == false) {
        return false;
    }

    const resolved = resolveGasForTx(INCREASE_DEPOSIT_GAS);
    const review: TransactionReview = {
        asset: langJson.langValues["validator-increase-deposit"],
        toAddress: STAKING_CONTRACT_ADDRESS,
        quantityLabelKey: "coins-to-deposit",
        quantityValue: validatorDepositCoins,
        gasLimit: resolved.gasLimit,
        gasFee: resolved.gasFee,
        nonce: nonceValue,
    };
    showValidatorTransactionReview(review, increaseDepositSubmit);
    return false;
}



export async function increaseDepositSubmit(quantumWallet: Wallet): Promise<void> {
    settingsStore.offlineSignEnabled = await offlineTxnSigningGetDefaultValue();
    const validatorDepositCoins = inputById("txtValidatorDepositCoins").value;
    if (settingsStore.offlineSignEnabled === true) {
        await offlineSignValidatorTransaction(quantumWallet, "increaseDeposit", [], validatorDepositCoins, INCREASE_DEPOSIT_GAS);
        return;
    }

    await submitValidatorTransaction(quantumWallet, "increaseDeposit", [], validatorDepositCoins, INCREASE_DEPOSIT_GAS);
}

//---- Initiate partial withdrawal ----

export async function initiatePartialWithdrawal(): Promise<boolean> {
    const validatorDepositCoins = inputById("txtValidatorDepositCoins").value;

    if (await checkDepositCoinsEntered(validatorDepositCoins) == false) {
        return false;
    }

    settingsStore.offlineSignEnabled = await offlineTxnSigningGetDefaultValue();
    const nonceValue = readValidatorNonce();
    if (nonceValue === false) {
        return false;
    }

    if (validateValidatorPassword() == false) {
        return false;
    }

    const resolved = resolveGasForTx(INITIATE_PARTIAL_WITHDRAWAL_GAS);
    const review: TransactionReview = {
        asset: langJson.langValues["validator-initiate-partial-withdrawal"],
        toAddress: STAKING_CONTRACT_ADDRESS,
        quantityLabelKey: "initiate-withdrawal-quantity",
        quantityValue: validatorDepositCoins,
        gasLimit: resolved.gasLimit,
        gasFee: resolved.gasFee,
        nonce: nonceValue,
    };
    showValidatorTransactionReview(review, initiatePartialWithdrawalConfirmSubmit);
    return false;
}



export async function initiatePartialWithdrawalConfirmSubmit(quantumWallet: Wallet): Promise<void> {
    settingsStore.offlineSignEnabled = await offlineTxnSigningGetDefaultValue();
    const validatorDepositCoins = inputById("txtValidatorDepositCoins").value;
    if (settingsStore.offlineSignEnabled === true) {
        await offlineSignValidatorTransaction(quantumWallet, "initiatePartialWithdrawal", [validatorDepositCoins], "0", INITIATE_PARTIAL_WITHDRAWAL_GAS);
        return;
    }

    await submitValidatorTransaction(quantumWallet, "initiatePartialWithdrawal", [validatorDepositCoins], "0", INITIATE_PARTIAL_WITHDRAWAL_GAS);
}

//---- Complete partial withdrawal ----

export async function completePartialWithdrawal(): Promise<boolean> {
    settingsStore.offlineSignEnabled = await offlineTxnSigningGetDefaultValue();
    const nonceValue = readValidatorNonce();
    if (nonceValue === false) {
        return false;
    }

    if (validateValidatorPassword() == false) {
        return false;
    }

    const resolved = resolveGasForTx(COMPLETE_PARTIAL_WITHDRAWAL_GAS);
    const review: TransactionReview = {
        asset: langJson.langValues["validator-complete-partial-withdrawal"],
        toAddress: STAKING_CONTRACT_ADDRESS,
        quantityLabelKey: "send-quantity",
        quantityValue: "-",
        gasLimit: resolved.gasLimit,
        gasFee: resolved.gasFee,
        nonce: nonceValue,
    };
    showValidatorTransactionReview(review, completePartialWithdrawalSubmit);
    return false;
}



export async function completePartialWithdrawalSubmit(quantumWallet: Wallet): Promise<void> {
    settingsStore.offlineSignEnabled = await offlineTxnSigningGetDefaultValue();
    if (settingsStore.offlineSignEnabled === true) {
        await offlineSignValidatorTransaction(quantumWallet, "completePartialWithdrawal", [], "0", COMPLETE_PARTIAL_WITHDRAWAL_GAS);
        return;
    }

    await submitValidatorTransaction(quantumWallet, "completePartialWithdrawal", [], "0", COMPLETE_PARTIAL_WITHDRAWAL_GAS);
}

//---- Pause validation ----

export async function pauseValidation(): Promise<boolean> {
    settingsStore.offlineSignEnabled = await offlineTxnSigningGetDefaultValue();
    const nonceValue = readValidatorNonce();
    if (nonceValue === false) {
        return false;
    }

    if (validateValidatorPassword() == false) {
        return false;
    }

    const resolved = resolveGasForTx(PAUSE_VALIDATION_GAS);
    const review: TransactionReview = {
        asset: langJson.langValues["validator-pause-validation"],
        toAddress: STAKING_CONTRACT_ADDRESS,
        quantityLabelKey: "send-quantity",
        quantityValue: "-",
        gasLimit: resolved.gasLimit,
        gasFee: resolved.gasFee,
        nonce: nonceValue,
    };
    showValidatorTransactionReview(review, pauseValidationSubmit);
    return false;
}



export async function pauseValidationSubmit(quantumWallet: Wallet): Promise<void> {
    settingsStore.offlineSignEnabled = await offlineTxnSigningGetDefaultValue();
    if (settingsStore.offlineSignEnabled === true) {
        await offlineSignValidatorTransaction(quantumWallet, "pauseValidation", [], "0", PAUSE_VALIDATION_GAS);
        return;
    }

    await submitValidatorTransaction(quantumWallet, "pauseValidation", [], "0", PAUSE_VALIDATION_GAS);
}

//---- Resume validation ----

export async function resumeValidation(): Promise<boolean> {
    settingsStore.offlineSignEnabled = await offlineTxnSigningGetDefaultValue();
    const nonceValue = readValidatorNonce();
    if (nonceValue === false) {
        return false;
    }

    if (validateValidatorPassword() == false) {
        return false;
    }

    const resolved = resolveGasForTx(RESUME_VALIDATION_GAS);
    const review: TransactionReview = {
        asset: langJson.langValues["validator-resume-validation"],
        toAddress: STAKING_CONTRACT_ADDRESS,
        quantityLabelKey: "send-quantity",
        quantityValue: "-",
        gasLimit: resolved.gasLimit,
        gasFee: resolved.gasFee,
        nonce: nonceValue,
    };
    showValidatorTransactionReview(review, resumeValidationSubmit);
    return false;
}



export async function resumeValidationSubmit(quantumWallet: Wallet): Promise<void> {
    settingsStore.offlineSignEnabled = await offlineTxnSigningGetDefaultValue();
    if (settingsStore.offlineSignEnabled === true) {
        await offlineSignValidatorTransaction(quantumWallet, "resumeValidation", [], "0", RESUME_VALIDATION_GAS);
        return;
    }

    await submitValidatorTransaction(quantumWallet, "resumeValidation", [], "0", RESUME_VALIDATION_GAS);
}
