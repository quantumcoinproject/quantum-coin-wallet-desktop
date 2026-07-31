// Send screen, offline signing and the send-completed dialog.
// 1:1 port of the old src/js/send.js. The old file bound the send-completed
// dialog buttons at script-eval time; initSend() performs the same bindings
// and is called from the renderer entry right after the DOM is built.
import { isNetworkError, htmlEncode } from "../lib/util";
import { langJson } from "../lib/i18n";
import { IsValidAddress } from "../lib/crypto";
import {
    OpenUrl,
    WriteTextToClipboard,
    compareEther,
    isValidEther,
    offlineSignCoinTransaction,
    offlineSignTokenTransaction,
    submitSendCoins,
    submitSendTokens,
    weiToEtherFormatted,
} from "../lib/bridge";
import { Wallet } from "../lib/wallet";
import { getTransactionStatusByHash, TransactionDetails, AccountTokenDetails } from "../lib/api";
import {
    ADDRESS_LENGTH_CHECK,
    QuantumCoin,
    STORAGE_PATH_TEMPLATE,
    TxContext,
    byId,
    inputById,
    maxTokenNameLength,
    networkStore,
    selectById,
    settingsStore,
    tokenStore,
    walletStore,
} from "./state";
import {
    GAS_ESTIMATE_BUFFER_PERCENT,
    GAS_NO_BUFFER_PERCENT,
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
    showTransactionReviewDialog,
    unlockWalletForReview,
    showTransientToast,
    showWarnAlert,
    txReviewNetworkText,
    updateWaitingBox,
    TransactionReview,
    TransactionReviewSubmission,
} from "./dialog";
import { getTokenBalance, refreshAccountBalance, removeOptions, setHeaderBand, showWalletScreen, OpenScanTxn } from "./app";
import { getTokenDecimals, TOKEN_LIST_STATE_EVENT } from "./token-list-state";
import { getCachedManualToken } from "./manual-token";
import {
    applyTokenPickerSelection,
    openTokenPicker,
    setTokenPickerTriggerText,
} from "./token-picker";
import { prepareOfflineDefaults } from "./offline-flow";

function updateSendTokenListLoading(): void {
    const loading = document.getElementById("divSendTokenListLoading");
    if (loading) loading.style.display = tokenStore.isTokenListLoading ? "block" : "none";
}

window.addEventListener(TOKEN_LIST_STATE_EVENT, updateSendTokenListLoading);

export const COIN_SEND_GAS = 21000;
export const TOKEN_SEND_GAS = 84000;

function selectedSendContractAddress(): string | null {
    const selectedValue = selectById("ddlCoinTokenToSend").value;
    if (selectedValue === "Q") return null;
    return selectedValue.trim();
}

export function getSendTxContext(): TxContext {
    const ddlCoinTokenToSend = selectById("ddlCoinTokenToSend");
    const selectedValue = ddlCoinTokenToSend ? ddlCoinTokenToSend.value : "Q";
    const toAddress = (inputById("txtSendAddress").value || "").trim();
    const amount = (inputById("txtSendQuantity").value || "").trim();
    const isCoin = (selectedValue === "Q");
    // Token option values are contract addresses; native Q is the only sentinel.
    const contractAddress = selectedSendContractAddress();
    const ctx: TxContext = {
        txKind: isCoin ? "sendCoin" : "sendToken",
        toAddress: toAddress || walletStore.currentWalletAddress,
        amount: amount || "0",
        defaultGasLimit: isCoin ? COIN_SEND_GAS : TOKEN_SEND_GAS,
        bufferPercent: isCoin ? GAS_NO_BUFFER_PERCENT : GAS_ESTIMATE_BUFFER_PERCENT,
    };
    if (!isCoin) {
        ctx.contractAddress = contractAddress;
        ctx.fromDecimals = getTokenDecimals(contractAddress);
    }
    return ctx;
}

export function onSendGasIconClick(): boolean {
    return onGasIconClick("spanSendGasFee", null, getSendTxContext);
}

export function scheduleSendGasEstimation(): void {
    scheduleGasEstimation(getSendTxContext, "divSendGasIcon", "spanSendGasFee", null, function (errorDetail) {
        // Offline mode: never toast gas-estimation failures (silent SDK fallback).
        if (settingsStore.offlineSignEnabled === true) return;
        const base = (langJson && langJson.errors && langJson.errors.gasEstimateError)
            ? langJson.errors.gasEstimateError
            : "Could not fetch the gas fee from the network. Using the default estimate.";
        // errorDetail is the raw RPC return value / transport error; showTransientToast
        // renders via textContent so any HTML in it is sanitized (not parsed).
        const message = errorDetail ? (base + " (" + errorDetail + ")") : base;
        showTransientToast(message, 4000);
    });
}

export function resetTokenList(): void {
    const ddlCoinTokenToSend = selectById("ddlCoinTokenToSend");
    removeOptions(ddlCoinTokenToSend);
    const option = document.createElement("option");
    option.text = "Q";
    option.value = "Q";
    ddlCoinTokenToSend.add(option);
}

export function addTokenOptionToSendDropdown(ddlCoinTokenToSend: HTMLSelectElement, token: AccountTokenDetails): void {
    let tokenName = token.name;

    if (tokenName.length > maxTokenNameLength) {
        tokenName = tokenName.substring(0, maxTokenNameLength - 1) + "...";
    }
    tokenName = htmlEncode(tokenName);

    const tokenOption = document.createElement("option");
    tokenOption.text = tokenName;
    tokenOption.value = token.contractAddress;
    ddlCoinTokenToSend.add(tokenOption);
}

export function getSendAssetSymbol(contractAddress: string | null, isCoin: boolean): string {
    if (isCoin) return "Q";
    if (tokenStore.currentWalletTokenList != null) {
        for (let i = 0; i < tokenStore.currentWalletTokenList.length; i++) {
            if (tokenStore.currentWalletTokenList[i].contractAddress === contractAddress) {
                const sym = tokenStore.currentWalletTokenList[i].symbol;
                if (sym) return sym;
                return tokenStore.currentWalletTokenList[i].name || langJson.langValues.tokens;
            }
        }
    }
    if (contractAddress && networkStore.currentBlockchainNetwork) {
        const cached = getCachedManualToken(
            parseInt(String(networkStore.currentBlockchainNetwork.networkId), 10),
            contractAddress,
        );
        if (cached) return cached.symbol;
    }
    return langJson.langValues.tokens;
}

function getSendAssetDisplayName(contractAddress: string | null, isCoin: boolean): string {
    if (isCoin) return "Q";
    const symbol = getSendAssetSymbol(contractAddress, false);
    const lower = String(contractAddress || "").toLowerCase();
    const walletToken = tokenStore.currentWalletTokenList.find(
        (token) => token.contractAddress.toLowerCase() === lower,
    );
    let name = walletToken?.name || "";
    if (!name && contractAddress && networkStore.currentBlockchainNetwork) {
        name = getCachedManualToken(
            parseInt(String(networkStore.currentBlockchainNetwork.networkId), 10),
            contractAddress,
        )?.name || "";
    }
    return name ? name + " (" + symbol + ")" : symbol;
}

export function openSendTokenPicker(): void {
    openTokenPicker({
        allowNativeQ: true,
        allowUnrecognized: true,
        allowOfflineFallback: settingsStore.offlineSignEnabled === true,
        onSelect: (item) => {
            applyTokenPickerSelection("ddlCoinTokenToSend", "btnSendTokenPicker", item);
            void updateInfoSendScreen();
        },
        excludeValue: null,
        selectedValue: selectById("ddlCoinTokenToSend").value || null,
    });
}

export function populateSendScreen(): void {
    resetTokenList();

    const ddlCoinTokenToSend = selectById("ddlCoinTokenToSend");

    //Recognized tokens are always listed; unrecognized only when the toggle is on.
    //Stablecoin impersonators are already removed upstream so they never appear here.
    if (tokenStore.currentWalletRecognizedTokens != null) {
        for (let i = 0; i < tokenStore.currentWalletRecognizedTokens.length; i++) {
            addTokenOptionToSendDropdown(ddlCoinTokenToSend, tokenStore.currentWalletRecognizedTokens[i]);
        }
    }

    setTokenPickerTriggerText("ddlCoinTokenToSend", "btnSendTokenPicker");
}

// Re-sync the send dropdown/toggle when the token list loads (or refreshes)
// while the send screen is already open, so the unrecognized-tokens checkbox
// appears as soon as the data arrives. The current selection is preserved.
export function syncSendScreenTokenList(): void {
    const sendScreen = byId("SendScreen");
    if (sendScreen == null || sendScreen.style.display === "none") {
        return;
    }

    const ddlCoinTokenToSend = selectById("ddlCoinTokenToSend");
    const previousValue = ddlCoinTokenToSend.value;
    const previousText = ddlCoinTokenToSend.options[ddlCoinTokenToSend.selectedIndex]?.text || previousValue;

    populateSendScreen();

    let restored = false;
    for (let i = 0; i < ddlCoinTokenToSend.options.length; i++) {
        if (ddlCoinTokenToSend.options[i].value.toLowerCase() === previousValue.toLowerCase()) {
            ddlCoinTokenToSend.value = ddlCoinTokenToSend.options[i].value;
            restored = true;
            break;
        }
    }
    if (!restored && previousValue && previousValue !== "Q") {
        const option = document.createElement("option");
        option.value = previousValue;
        option.text = previousText;
        ddlCoinTokenToSend.add(option);
        ddlCoinTokenToSend.value = previousValue;
    }

    updateInfoSendScreen(true);
    setTokenPickerTriggerText("ddlCoinTokenToSend", "btnSendTokenPicker");
}

export async function updateInfoSendScreen(preserveGas = false): Promise<boolean> {
    const ddlCoinTokenToSend = selectById("ddlCoinTokenToSend");
    const selectedValue = ddlCoinTokenToSend.value;
    if (!preserveGas && byId("SendScreen").style.display === "block") {
        resetCurrentGasConfig();
        setGasFeeLabel("spanSendGasFee", "");
    }
    byId("divCoinTokenToSend").textContent = "";
    byId("divCoinTokenToSend").style.display = "";
    byId("divBalanceSendScreen").textContent = "";
    if (settingsStore.offlineSignEnabled == true) {
        byId("divSendScreenBalanceBox").style.display = "none";
    } else {
        // Preserved legacy behavior: "false" is not a valid display value, so the
        // browser ignores it and the box keeps its stylesheet display.
        byId("divSendScreenBalanceBox").style.display = "false";
    }

    if (selectedValue === "Q") {
        byId("divCoinTokenToSend").textContent = QuantumCoin;
        if (settingsStore.offlineSignEnabled === false) {
            if (walletStore.currentAccountDetails !== null) {
                const newBalance = await weiToEtherFormatted(walletStore.currentAccountDetails.balance);
                byId("divBalanceSendScreen").textContent = newBalance;
            }
        }
    } else {
        byId("divCoinTokenToSend").textContent = selectedValue;
        const selectedLower = selectedValue.toLowerCase();
        for (let i = 0; i < tokenStore.currentWalletTokenList.length; i++) {
            if (tokenStore.currentWalletTokenList[i].contractAddress.toLowerCase() === selectedLower) {
                byId("divBalanceSendScreen").textContent = tokenStore.currentWalletTokenList[i].tokenBalance;
                break;
            }
        }
        if (byId("divBalanceSendScreen").textContent === "" && networkStore.currentBlockchainNetwork) {
            const cached = getCachedManualToken(
                parseInt(String(networkStore.currentBlockchainNetwork.networkId), 10),
                selectedValue,
            );
            if (cached) byId("divBalanceSendScreen").textContent = cached.balance;
        }
    }

    if (!preserveGas && byId("SendScreen").style.display === "block") {
        scheduleSendGasEstimation();
    }
    return false;
}

export async function showSendScreen(): Promise<boolean> {
    updateSendTokenListLoading();
    settingsStore.offlineSignEnabled = await offlineTxnSigningGetDefaultValue();
    const ddlCoinTokenToSend = selectById("ddlCoinTokenToSend");
    ddlCoinTokenToSend.disabled = true;
    populateSendScreen();
    await updateInfoSendScreen();
    ddlCoinTokenToSend.disabled = false;

    if (settingsStore.offlineSignEnabled === true) {
        byId("btnOfflineSign").style.display = "block";
        byId("btnSendCoins").style.display = "none";
    } else {
        byId("btnOfflineSign").style.display = "none";
        byId("btnSendCoins").style.display = "block";
    }

    byId("divNetworkDropdown").style.display = "none";
    byId("HomeScreen").style.display = "none";
    byId("SendScreen").style.display = "block";
    byId("OfflineSignScreen").style.display = "none";
    setHeaderBand("compact");
    inputById("txtSendAddress").value = "";
    inputById("txtSendQuantity").value = "";
    inputById("txtSendAddress").focus();

    resetCurrentGasConfig();
    attachSendGasListeners();
    setGasFeeLabel("spanSendGasFee", "");
    scheduleSendGasEstimation();

    return false;
}

// #txtSendAddress is a two-row <textarea> (a wrapped address is readable in
// full; an <input> scrolls its tail out of view), so unlike an <input> it can
// hold newlines and spaces from a paste. Strip them as they arrive, keeping
// .value a bare address for every caller and for IsValidAddress().
export function onSendAddressInput(): void {
    const field = inputById("txtSendAddress");
    const cleaned = field.value.replace(/\s+/g, "");
    if (cleaned !== field.value) field.value = cleaned;
}

export function attachSendGasListeners(): void {
    const addr = inputById("txtSendAddress");
    const qty = inputById("txtSendQuantity");
    if (addr && !addr.dataset.gasBound) { addr.addEventListener("input", scheduleSendGasEstimation); addr.dataset.gasBound = "1"; }
    if (qty && !qty.dataset.gasBound) { qty.addEventListener("input", scheduleSendGasEstimation); qty.dataset.gasBound = "1"; }
}

export async function signOfflineSend(): Promise<boolean> {
    const sendAddress = inputById("txtSendAddress").value;
    const sendQuantity = inputById("txtSendQuantity").value;
    const ddlCoinTokenToSend = selectById("ddlCoinTokenToSend");
    const selectedValue = ddlCoinTokenToSend.value;
    if (selectedValue === "Q") {
        // coins
    } else {
        const contractAddress = selectedValue;
        if (contractAddress == null || contractAddress.length < ADDRESS_LENGTH_CHECK || await IsValidAddress(contractAddress) == false) {
            showWarnAlert(langJson.errors.quantumAddr);
            return false;
        }
    }

    if (sendAddress == null || sendAddress.length < ADDRESS_LENGTH_CHECK || await IsValidAddress(sendAddress) == false) {
        showWarnAlert(langJson.errors.quantumAddr);
        return false;
    }

    if (sendQuantity == null || sendQuantity.length < 1) {
        showWarnAlert(langJson.errors.enterAmount);
        return false;
    }

    // Preserved legacy behavior: the boolean result was passed back into
    // isValidEther, so this check never rejects; validation happens downstream.
    const okQuantity = await isValidEther(sendQuantity);
    if ((isValidEther(okQuantity as unknown as string) as unknown as boolean) == false) {
        showWarnAlert(langJson.errors.enterAmount);
        return false;
    }

    const isCoin = (selectedValue === "Q");
    const offlineContractAddress = isCoin ? null : selectedValue;
    const resolved = resolveGasForTx(isCoin ? COIN_SEND_GAS : TOKEN_SEND_GAS);
    const gasLimit = parseInt(resolved.gasLimit, 10);
    const gasFee = resolved.gasFee;

    const prepared = await prepareOfflineDefaults();
    const review: TransactionReview = {
        asset: (langJson.langValues.send || "Send") + " " + getSendAssetDisplayName(offlineContractAddress, isCoin),
        contractAddress: offlineContractAddress,
        fromAddress: walletStore.currentWalletAddress,
        toAddress: sendAddress,
        quantityLabelKey: "send-quantity",
        quantityValue: isCoin ? sendQuantity : "0",
        tokenQuantityValue: isCoin ? null : sendQuantity + " " + getSendAssetSymbol(offlineContractAddress, false),
        gasLimit: String(gasLimit),
        gasFee: gasFee,
        nonce: prepared.nonce,
        networkText: txReviewNetworkText(),
        requirePassword: true,
        requireNonce: true,
        submitLabelKey: "ok",
        onSubmit: onSignOfflineSendCoinsConfirm,
    };
    showTransactionReviewDialog(review);
    return false;
}

export async function onSignOfflineSendCoinsConfirm(submission: TransactionReviewSubmission): Promise<boolean> {
    const quantumWallet = await unlockWalletForReview(submission.password);
    if (quantumWallet == null) return false;
    // Not awaited: the password has been accepted, so the review dialog closes
    // now and the signing runs on behind the wait box.
    void signOfflineTxnSend(quantumWallet, submission.startingNonce as number);
    return true;
}

export async function signOfflineTxnSendToken(quantumWallet: Wallet, nonce: number): Promise<void> {
    const sendAddress = inputById("txtSendAddress").value;
    const sendQuantity = inputById("txtSendQuantity").value;
    const contractAddress = selectedSendContractAddress() || "";

    try {
        const result = await offlineSignTokenTransaction({
            chainId: parseInt(String((networkStore.currentBlockchainNetwork as { networkId: number }).networkId), 10),
            toAddress: sendAddress,
            amount: sendQuantity,
            contractAddress: contractAddress,
            fromDecimals: getTokenDecimals(contractAddress),
            nonce,
            gasLimit: parseInt(resolveGasForTx(TOKEN_SEND_GAS).gasLimit, 10),
            privateKey: await quantumWallet.getPrivateKey(),
            publicKey: await quantumWallet.getPublicKey(),
            advancedSigningEnabled: await advancedSigningGetDefaultValue(),
        });

        if (!result || !result.success || !result.txData) {
            hideWaitingBox();
            showWarnAlert((result && result.error) ? String(result.error) : (langJson.errors.unexpectedError));
            return;
        }

        hideWaitingBox();
        inputById("txtSignedSendTransaction").value = result.txData;
        byId("SendScreen").style.display = "none";
        byId("OfflineSignScreen").style.display = "block";
    } catch (error) {
        hideWaitingBox();
        showWarnAlert(langJson.errors.walletOpenError.replace(STORAGE_PATH_TEMPLATE, walletStore.STORAGE_PATH) + " " + error);
    }
}

export async function signOfflineTxnSend(quantumWallet: Wallet, nonce: number): Promise<void> {
    const ddlCoinTokenToSend = selectById("ddlCoinTokenToSend");
    const selectedValue = ddlCoinTokenToSend.value;
    if (selectedValue === "Q") {
        // fall through to coin signing below
    } else {
        await signOfflineTxnSendToken(quantumWallet, nonce);
        return;
    }
    const sendAddress = inputById("txtSendAddress").value;
    const sendQuantity = inputById("txtSendQuantity").value;

    try {
        const result = await offlineSignCoinTransaction({
            chainId: parseInt(String((networkStore.currentBlockchainNetwork as { networkId: number }).networkId), 10),
            toAddress: sendAddress,
            amount: sendQuantity,
            nonce,
            gasLimit: parseInt(resolveGasForTx(COIN_SEND_GAS).gasLimit, 10),
            privateKey: await quantumWallet.getPrivateKey(),
            publicKey: await quantumWallet.getPublicKey(),
            advancedSigningEnabled: await advancedSigningGetDefaultValue(),
        });

        if (!result || !result.success || !result.txData) {
            hideWaitingBox();
            showWarnAlert((result && result.error) ? String(result.error) : (langJson.errors.unexpectedError));
            return;
        }

        hideWaitingBox();
        inputById("txtSignedSendTransaction").value = result.txData;
        byId("SendScreen").style.display = "none";
        byId("OfflineSignScreen").style.display = "block";
    } catch (error) {
        hideWaitingBox();
        showWarnAlert(langJson.errors.walletOpenError.replace(STORAGE_PATH_TEMPLATE, walletStore.STORAGE_PATH) + " " + error);
    }
}

export async function copySignedSendTransaction(): Promise<void> {
    await WriteTextToClipboard(inputById("txtSignedSendTransaction").value);
}

export async function openOfflineTxnSigningUrl(): Promise<boolean> {
    await OpenUrl("https://QuantumCoin.org/offline-transaction-signing.html");
    return false;
}

export async function sendCoins(): Promise<boolean> {
    const sendAddress = inputById("txtSendAddress").value;
    const sendQuantity = inputById("txtSendQuantity").value;
    const ddlCoinTokenToSend = selectById("ddlCoinTokenToSend");
    let CoinTokenToSendName = ddlCoinTokenToSend.options[ddlCoinTokenToSend.selectedIndex].text;
    const selectedValue = ddlCoinTokenToSend.value;
    const isCoin = selectedValue === "Q";
    const isManualToken = !isCoin && !tokenStore.currentWalletTokenList.some(
        (token) => token.contractAddress.toLowerCase() === selectedValue.toLowerCase(),
    );
    const contractAddress = isCoin ? QuantumCoin : (selectedSendContractAddress() || "");
    let quantityToSend: string | null = "";

    if (sendAddress == null || sendAddress.length < ADDRESS_LENGTH_CHECK || await IsValidAddress(sendAddress) == false) {
        showWarnAlert(langJson.errors.quantumAddr);
        return false;
    }

    if (!isCoin && (contractAddress.length < ADDRESS_LENGTH_CHECK || await IsValidAddress(contractAddress) == false)) {
        showWarnAlert(langJson.errors.quantumAddr);
        return false;
    }

    if (sendQuantity == null || sendQuantity.length < 1) {
        showWarnAlert(langJson.errors.enterAmount);
        return false;
    }

    // Preserved legacy behavior: see signOfflineSend for the same double-call pattern.
    const okQuantity = await isValidEther(sendQuantity);
    if ((isValidEther(okQuantity as unknown as string) as unknown as boolean) == false) {
        showWarnAlert(langJson.errors.enterAmount);
        return false;
    }

    if (isCoin) {
        quantityToSend = walletStore.currentBalance;
        CoinTokenToSendName = langJson.langValues.coins;
    } else {
        quantityToSend = getTokenBalance(contractAddress);
        CoinTokenToSendName = langJson.langValues.tokens;
    }
    void CoinTokenToSendName;

    if (!isManualToken && (quantityToSend == null || quantityToSend === "")) {
        await refreshAccountBalance();
        if (isCoin) {
            quantityToSend = walletStore.currentBalance;
        } else {
            quantityToSend = getTokenBalance(contractAddress);
        }
    }

    // A manually entered token may not be present in the account token-list
    // response. Let the token contract enforce its balance during submission.
    if (!isManualToken && (quantityToSend == null || quantityToSend === "")) {
        showWarnAlert(langJson.errors.amountLarge);
        return false;
    }

    if (!isManualToken) {
        const compareResult = await compareEther(sendQuantity, quantityToSend!);
        if (compareResult == 1) {
            showWarnAlert(langJson.errors.amountLarge);
            return false;
        }
    }

    const proceedToReview = (): void => {
        const resolved = resolveGasForTx(isCoin ? COIN_SEND_GAS : TOKEN_SEND_GAS);
        const gasLimit = parseInt(resolved.gasLimit, 10);
        const gasFee = resolved.gasFee;

        const review: TransactionReview = {
            asset: (langJson.langValues.send || "Send") + " " + getSendAssetDisplayName(contractAddress, isCoin),
            contractAddress: isCoin ? null : contractAddress,
            fromAddress: walletStore.currentWalletAddress,
            toAddress: sendAddress,
            quantityLabelKey: "send-quantity",
            quantityValue: isCoin ? sendQuantity : "0",
            tokenQuantityValue: isCoin ? null : sendQuantity + " " + getSendAssetSymbol(contractAddress, false),
            gasLimit: String(gasLimit),
            gasFee: gasFee,
            nonce: null,
            networkText: txReviewNetworkText(),
            requirePassword: true,
            submitLabelKey: "ok",
            onSubmit: onSendCoinsConfirm,
        };
        showTransactionReviewDialog(review);
    };

    // The Send button stays enabled while gas is being estimated. If the user
    // clicks before the estimate has loaded (and has not set gas manually),
    // wait for it behind the shared wait dialog, then open the review.
    // Offline mode is always ready (eager SDK fallback).
    if (!isGasConfigReady()) {
        showLoadingAndExecuteAsync(langJson.langValues.pleaseWaitEstimatingGas, function () {
            void ensureGasEstimateReady().then(function () {
                hideWaitingBox();
                proceedToReview();
            });
        });
        return false;
    }

    proceedToReview();
    return false;
}

export async function onSendCoinsConfirm(submission: TransactionReviewSubmission): Promise<boolean> {
    const quantumWallet = await unlockWalletForReview(submission.password);
    if (quantumWallet == null) return false;
    void sendCoinsSubmit(quantumWallet);
    return true;
}

export async function sendCoinsSubmit(quantumWallet: Wallet): Promise<void> {
    if (selectById("ddlCoinTokenToSend").value !== "Q") {
        await sendTokensSubmit(quantumWallet);
        return;
    }

    updateWaitingBox(langJson.langValues.pleaseWaitSubmit);
    const sendAddress = inputById("txtSendAddress").value;
    const sendQuantity = inputById("txtSendQuantity").value;
    const resolved = resolveGasForTx(COIN_SEND_GAS);
    const gasLimit = parseInt(resolved.gasLimit, 10);

    try {
        const currentDate = new Date();
        const result = await submitSendCoins({
            rpcEndpoint: (networkStore.currentBlockchainNetwork as { rpcEndpoint: string }).rpcEndpoint,
            chainId: parseInt(String((networkStore.currentBlockchainNetwork as { networkId: number }).networkId), 10),
            toAddress: sendAddress,
            amount: sendQuantity,
            privateKey: await quantumWallet.getPrivateKey(),
            publicKey: await quantumWallet.getPublicKey(),
            gasLimit: gasLimit,
            advancedSigningEnabled: await advancedSigningGetDefaultValue(),
        });

        if (!result || !result.success || !result.txHash) {
            hideWaitingBox();
            showWarnAlert((result && result.error) ? String(result.error) : (langJson.errors.invalidApiResponse));
            return;
        }

        const pendingTxn = new TransactionDetails(result.txHash, currentDate, quantumWallet.address, sendAddress, sendQuantity, true);
        walletStore.pendingTransactionsMap.set(quantumWallet.address.toLowerCase() + (networkStore.currentBlockchainNetwork as { index: number }).index.toString(), pendingTxn);

        setTimeout(() => {
            hideWaitingBox();
            showSendCompletedDialog(result.txHash, showWalletScreen);
        }, 1000);
    } catch (error) {
        hideWaitingBox();

        if (isNetworkError(error as { message: string })) {
            showWarnAlert(langJson.errors.internetDisconnected);
        } else {
            showWarnAlert(langJson.errors.invalidApiResponse + " " + error);
        }
    }
}

export async function sendTokensSubmit(quantumWallet: Wallet): Promise<void> {
    updateWaitingBox(langJson.langValues.pleaseWaitSubmit);

    try {
        const sendAddress = inputById("txtSendAddress").value;
        const sendQuantity = inputById("txtSendQuantity").value;
        const contractAddress = selectedSendContractAddress() || "";
        const resolvedTok = resolveGasForTx(TOKEN_SEND_GAS);
        const gasLimitTok = parseInt(resolvedTok.gasLimit, 10);

        const currentDate = new Date();
        const result = await submitSendTokens({
            rpcEndpoint: (networkStore.currentBlockchainNetwork as { rpcEndpoint: string }).rpcEndpoint,
            chainId: parseInt(String((networkStore.currentBlockchainNetwork as { networkId: number }).networkId), 10),
            toAddress: sendAddress,
            amount: sendQuantity,
            contractAddress: contractAddress,
            fromDecimals: getTokenDecimals(contractAddress),
            privateKey: await quantumWallet.getPrivateKey(),
            publicKey: await quantumWallet.getPublicKey(),
            gasLimit: gasLimitTok,
            advancedSigningEnabled: await advancedSigningGetDefaultValue(),
        });

        if (!result || !result.success || !result.txHash) {
            hideWaitingBox();
            showWarnAlert((result && result.error) ? String(result.error) : (langJson.errors.invalidApiResponse));
            return;
        }

        const pendingTxn = new TransactionDetails(result.txHash, currentDate, quantumWallet.address, contractAddress, "0", true);
        walletStore.pendingTransactionsMap.set(quantumWallet.address.toLowerCase() + (networkStore.currentBlockchainNetwork as { index: number }).index.toString(), pendingTxn);

        setTimeout(() => {
            hideWaitingBox();
            showSendCompletedDialog(result.txHash, showWalletScreen);
        }, 1000);
    } catch (error) {
        hideWaitingBox();

        if (isNetworkError(error as { message: string })) {
            showWarnAlert(langJson.errors.internetDisconnected);
        } else {
            showWarnAlert(langJson.errors.invalidApiResponse + " " + error);
        }
    }
}

let sendCompletedPollingId: ReturnType<typeof setInterval> | null = null;
let sendCompletedStatusRotateId: ReturnType<typeof setInterval> | null = null;
let sendCompletedStatusStartTime = 0;
let sendCompletedOnClose: (() => unknown) | null = null;
let sendCompletedLastTxHash: string | null = null;
const SEND_STATUS_MESSAGES = ["send-status-checking", "send-status-waiting", "send-status-checking-short"];
const SEND_STATUS_ROTATE_MS = 3600;

export function showSendCompletedDialog(txHash: string, onClose?: (() => unknown) | null): void {
    sendCompletedLastTxHash = txHash;
    sendCompletedOnClose = (typeof onClose === "function") ? onClose : null;

    byId("pSendCompletedMessage").textContent =
        (langJson && langJson.langValues && langJson.langValues["send-transaction-send-message-description"]) || "Your transaction has been submitted. It can take upto a minute to process the transaction. You may close this dialog now.";
    byId("pSendCompletedTxHash").textContent = txHash || "";
    const copyEl = byId("divSendCompletedCopy");
    const explEl = byId("divSendCompletedExplorer");
    if (copyEl) copyEl.title = (langJson && langJson.langValues && langJson.langValues["copy"]) || "Copy";
    if (explEl) explEl.title = (langJson && langJson.langValues && langJson.langValues["block-explorer"]) || "Block Explorer";

    setSendCompletedPending();

    const dlg = byId<HTMLDialogElement>("modalSendCompleted");
    dlg.style.display = "block";
    dlg.showModal();

    sendCompletedStatusStartTime = Date.now();
    updateSendCompletedStatusText();
    if (sendCompletedStatusRotateId) clearInterval(sendCompletedStatusRotateId);
    sendCompletedStatusRotateId = setInterval(updateSendCompletedStatusText, SEND_STATUS_ROTATE_MS);
    if (sendCompletedPollingId) clearInterval(sendCompletedPollingId);
    sendCompletedPollingId = setInterval(pollSendCompletedStatus, 9000);
    pollSendCompletedStatus();
}

export function setSendCompletedPending(): void {
    byId<HTMLImageElement>("imgSendCompletedStatus").src = "assets/icons/loading.gif";
    byId<HTMLImageElement>("imgSendCompletedStatus").alt = "Loading";
    updateSendCompletedStatusText();
}

export function setSendCompletedSucceeded(): void {
    byId<HTMLImageElement>("imgSendCompletedStatus").src = "assets/svg/checkmark-circle-outline.svg";
    byId<HTMLImageElement>("imgSendCompletedStatus").alt = "Success";
    byId("spanSendCompletedStatus").textContent =
        (langJson && langJson.langValues && langJson.langValues["send-transaction-succeeded"]) || "Transaction completed successfully.";
}

export function setSendCompletedFailed(errorText: string): void {
    byId<HTMLImageElement>("imgSendCompletedStatus").src = "assets/svg/alert-outline.svg";
    byId<HTMLImageElement>("imgSendCompletedStatus").alt = "Failed";
    const base = (langJson && langJson.langValues && langJson.langValues["send-transaction-failed"]) || "Transaction failed.";
    byId("spanSendCompletedStatus").textContent = errorText ? (base + " " + errorText) : base;
}

export function updateSendCompletedStatusText(): void {
    if (byId<HTMLImageElement>("imgSendCompletedStatus").alt !== "Loading") return;
    const idx = Math.floor((Date.now() - sendCompletedStatusStartTime) / SEND_STATUS_ROTATE_MS) % SEND_STATUS_MESSAGES.length;
    const key = SEND_STATUS_MESSAGES[idx];
    const text = (langJson && langJson.langValues && langJson.langValues[key]) || key;
    byId("spanSendCompletedStatus").textContent = text;
}

export async function pollSendCompletedStatus(): Promise<void> {
    if (!sendCompletedLastTxHash || !networkStore.currentBlockchainNetwork) return;
    try {
        const res = await getTransactionStatusByHash(networkStore.currentBlockchainNetwork.scanApiDomain, walletStore.currentWalletAddress, sendCompletedLastTxHash);
        if (res.status === "succeeded") {
            stopSendCompletedTimers();
            setSendCompletedSucceeded();
            await refreshAccountBalance();
        } else if (res.status === "failed") {
            stopSendCompletedTimers();
            setSendCompletedFailed(res.error || "");
        }
    } catch {
        /* keep polling */
    }
}

export function stopSendCompletedTimers(): void {
    if (sendCompletedPollingId) { clearInterval(sendCompletedPollingId); sendCompletedPollingId = null; }
    if (sendCompletedStatusRotateId) { clearInterval(sendCompletedStatusRotateId); sendCompletedStatusRotateId = null; }
}

export function closeSendCompletedDialog(): void {
    stopSendCompletedTimers();
    sendCompletedLastTxHash = null;
    const dlg = byId<HTMLDialogElement>("modalSendCompleted");
    dlg.style.display = "none";
    dlg.close();
    const cb = sendCompletedOnClose;
    sendCompletedOnClose = null;
    if (cb) cb();
}

export async function copySendCompletedTxHash(): Promise<void> {
    if (sendCompletedLastTxHash) await WriteTextToClipboard(sendCompletedLastTxHash);
}

export async function openSendCompletedInExplorer(): Promise<void> {
    if (sendCompletedLastTxHash) await OpenScanTxn(sendCompletedLastTxHash);
}

// The old send.js bound these at script-eval time (after the static body existed).
export function initSend(): void {
    byId("btnSendCompletedOk").addEventListener("click", function () { closeSendCompletedDialog(); });
    byId("divSendCompletedCopy").addEventListener("click", function (event) { const el = event.currentTarget as HTMLElement; copySendCompletedTxHash().then(function () { el.blur(); }); });
    byId("divSendCompletedExplorer").addEventListener("click", function (event) { const el = event.currentTarget as HTMLElement; openSendCompletedInExplorer().then(function () { el.blur(); }); });
}
