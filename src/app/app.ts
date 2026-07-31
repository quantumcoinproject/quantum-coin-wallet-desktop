// Core application logic: startup, onboarding, wallets, networks, balances,
// tokens and transactions. 1:1 port of the old src/js/app.js (the gas,
// settings and send sections live in gas.ts, settings.ts and send.ts
// respectively).
//
// The old code rendered dynamic rows by string-replacing tokens inside
// captured outerHTML templates and assigning innerHTML. This port captures
// the same template nodes at startup and deep-clones them per row, setting
// text via textContent (the old htmlEncode()+innerHTML round trip produces
// the same rendered text) and attaching listeners in place of the former
// inline on* attributes.
import { GetAppVersion, OpenUrl, weiToEtherFormatted, WriteTextToClipboard } from "../lib/bridge";
import { cryptoNewSeed } from "../lib/crypto";
import { getAccountDetails, getCompletedTransactionDetails, getPendingTransactionDetails, listAccountTokens, AccountTokenDetails, TransactionDetails, TransactionListDetails } from "../lib/api";
import { isNetworkError } from "../lib/util";
import { langJson, loadLangJson } from "../lib/i18n";
import { initializeSeedWords, getAllSeedWordsAsync, getWordListFromSeedArrayAsync, getSeedArrayFromWordListAsync, doesSeedWordExistAsync, verifySeedWordAsync, SEED_FRIENDLY_INDEX_ARRAY } from "../lib/seedwords";
import { isEulaAccepted, isMainKeyCreated, storageCreateMainKey, storageGetPath } from "../lib/storage";
import {
    blockchainNetworkAddNew,
    blockchainNetworkGetDefaultIndex,
    blockchainNetworkSetDefaultIndex,
    blockchainNetworksInit,
    blockchainNetworksList,
    parseNetworkJsonForAdd,
} from "../lib/blockchainNetwork";
import {
    Wallet,
    walletCreateNewWalletFromJson,
    walletCreateNewWalletFromSeed,
    walletDoesAddressExistInCache,
    walletGetAccountJsonFromWallet,
    walletGetByAddress,
    walletGetCachedAddressToIndexMap,
    walletGetCachedIndexToAddressMap,
    walletGetMaxIndex,
    walletLoadAll,
    walletSave,
} from "../lib/wallet";
import { filterStablecoinImpersonators, isRecognizedToken } from "../lib/tokenfilter";
import { htmlEncode } from "../lib/util";
import { QRCode } from "../ui/qrcode";
import { AutoCompleteDropdownControl } from "../ui/autocomplete";
import {
    ADDRESS_TEMPLATE,
    BLOCK_EXPLORER_ACCOUNT_TEMPLATE,
    BLOCK_EXPLORER_DOMAIN_TEMPLATE,
    BLOCK_EXPLORER_TRANSACTION_TEMPLATE,
    DATA_ALT_KEY,
    DATA_LANG_KEY,
    DATA_PLACEHOLDER_KEY,
    ERROR_TEMPLATE,
    HTTPS,
    STORAGE_PATH_TEMPLATE,
    TAB_INDEX_TEMPLATE,
    TRANSACTION_HASH_TEMPLATE,
    byId,
    getShortAddress,
    inputById,
    maxTokenNameLength,
    maxTokenSymbolLength,
    networkStore,
    onboardingStore,
    removeAllChildren,
    replaceTemplateTokenOnce,
    rowTemplates,
    tokenStore,
    txnStore,
    walletStore,
} from "./state";
import {
    hideWaitingBox,
    showAlert,
    showAlertAndExecuteOnClose,
    showConfirmAndExecuteOnConfirm,
    showErrorAndLockup,
    showEula,
    showLoadingAndExecuteAsync,
    showWarnAlert,
    showWarnAlertAndExecuteOnClose,
} from "./dialog";
import { syncSendScreenTokenList } from "./send";
import { setTokenListLoading } from "./token-list-state";
import { offlineTxnSigningGetDefaultValue } from "./settings";

export function checkDuplicateIds(): void {
    const nodes = document.querySelectorAll("[id]");
    const idList = new Map<string, undefined>();
    const totalNodes = nodes.length;

    for (let i = 0; i < totalNodes; i++) {
        const currentId = nodes[i].id ? nodes[i].id : "undefined";
        if (idList.has(currentId)) {
            throw new Error("duplicate id " + currentId);
        }
        idList.set(currentId, undefined);
    }
}

export function getGenericError(error: unknown): string {
    return langJson.errors.error.replace(STORAGE_PATH_TEMPLATE, walletStore.STORAGE_PATH).replace(ERROR_TEMPLATE, String(error ?? ""));
}

export async function initApp(): Promise<void> {
    checkDuplicateIds();

    const loaded = await loadLangJson();
    if (loaded == null) {
        alert("Error ocurred reading lang json.");
        return;
    }

    const appVersion = await GetAppVersion();
    document.title = langJson.langValues.title + " " + appVersion;

    const seedInit = await initializeSeedWords();
    if (seedInit == false) {
        throw new Error(langJson.errors.seedInitError);
    }

    walletStore.STORAGE_PATH = await storageGetPath();
    // Hydrate offline-signing before any wallet/home balance refresh so
    // connectivity alerts can be suppressed in offline mode.
    await offlineTxnSigningGetDefaultValue();

    // Capture the row templates before any screen mutates them (the old app
    // captured outerHTML strings here).
    rowTemplates.walletListRow = document.getElementsByClassName("wallet-row")[0].cloneNode(true) as HTMLTableRowElement;
    rowTemplates.blockchainNetworkOptionItem = document.getElementsByClassName("network-template")[0].cloneNode(true) as HTMLElement;
    const tplNetworkRow = byId<HTMLTemplateElement>("tplBlockchainNetworkRow");
    if (tplNetworkRow != null) {
        const rowInTemplate = tplNetworkRow.content.querySelector("tr.network-row");
        rowTemplates.blockchainNetworkRow = rowInTemplate ? (rowInTemplate.cloneNode(true) as HTMLTableRowElement) : null;
    }
    if (rowTemplates.blockchainNetworkRow == null) {
        const fallbackRow = document.querySelector("#tbodyNetworkRow tr.network-row");
        rowTemplates.blockchainNetworkRow = fallbackRow ? (fallbackRow.cloneNode(true) as HTMLTableRowElement) : null;
    }
    rowTemplates.completedTxnInRow = document.getElementsByClassName("completed-txn-in-row")[0].cloneNode(true) as HTMLTableRowElement;
    rowTemplates.completedTxnOutRow = document.getElementsByClassName("completed-txn-out-row")[0].cloneNode(true) as HTMLTableRowElement;
    rowTemplates.failedTxnInRow = document.getElementsByClassName("failed-txn-in-row")[0].cloneNode(true) as HTMLTableRowElement;
    rowTemplates.failedTxnOutRow = document.getElementsByClassName("failed-txn-out-row")[0].cloneNode(true) as HTMLTableRowElement;
    rowTemplates.tokenListRow = document.getElementsByClassName("token-list-row")[0].cloneNode(true) as HTMLTableRowElement;

    byId("login-content").style.display = "none";
    byId("welcomeScreen").style.display = "none";

    byId("main-content").style.display = "none";
    byId("settings-content").style.display = "none";
    byId("wallets-content").style.display = "none";
    setWalletMenuEnabled(false);

    //Set all properties of data-lang-key
    const dataLangList = document.querySelectorAll("[" + DATA_LANG_KEY + "]");
    if (dataLangList.length) {
        for (let i = 0; i < dataLangList.length; i++) {
            const langVal = langJson.langValues[dataLangList[i].getAttribute(DATA_LANG_KEY) as string];
            if (langVal == null) {
                alert("Lang Value not set " + dataLangList[i].getAttribute(DATA_LANG_KEY));
            }
            (dataLangList[i] as HTMLElement).textContent = langVal;
        }
    }

    const dataPlaceholderList = document.querySelectorAll("[" + DATA_PLACEHOLDER_KEY + "]");
    if (dataPlaceholderList.length) {
        for (let i = 0; i < dataPlaceholderList.length; i++) {
            const langVal = langJson.langValues[dataPlaceholderList[i].getAttribute(DATA_PLACEHOLDER_KEY) as string];
            if (langVal == null) {
                alert("Placeholder Value not set " + dataPlaceholderList[i].getAttribute(DATA_PLACEHOLDER_KEY));
            }
            (dataPlaceholderList[i] as HTMLInputElement).placeholder = langVal;
        }
    }

    const dataAltList = document.querySelectorAll("[" + DATA_ALT_KEY + "]");
    if (dataAltList.length) {
        for (let i = 0; i < dataAltList.length; i++) {
            const langVal = langJson.langValues[dataAltList[i].getAttribute(DATA_ALT_KEY) as string];
            if (langVal == null) {
                alert("Alt Value not set " + dataAltList[i].getAttribute(DATA_ALT_KEY));
            }
            (dataAltList[i] as HTMLImageElement).alt = langVal;
        }
    }

    const eulaStatus = await isEulaAccepted();
    if (eulaStatus == false) {
        showEula();
        return;
    }

    resumePostEula();
    resizeBoxes();
}

export function resizeBoxes(): void {
    let maxHeight = "";
    let tokensMaxHeight = "";
    let maxHeightMiddle = "";

    if (screen.height >= 1024) {
        maxHeight = "570px";
        maxHeightMiddle = "550px";
        tokensMaxHeight = "295px";
    } else if (screen.height >= 960) {
        maxHeight = "515px";
        maxHeightMiddle = "545px";
        tokensMaxHeight = "295px";
    } else if (screen.height >= 900) {
        maxHeight = "500px";
        maxHeightMiddle = "530px";
        tokensMaxHeight = "295px";
    } else if (screen.height >= 800) {
        maxHeight = "450px";
        maxHeightMiddle = "495px";
        tokensMaxHeight = "295px";
    } else if (screen.height >= 768) {
        maxHeight = "430px";
        maxHeightMiddle = "480px";
        tokensMaxHeight = "225px";
    } else if (screen.height >= 720) {
        maxHeight = "380px";
        maxHeightMiddle = "450px";
        tokensMaxHeight = "180px";
    } else {
        maxHeight = "275px";
        maxHeightMiddle = "325px";
        tokensMaxHeight = "60px";
    }

    byId("divMainScreenTokens").style.maxHeight = tokensMaxHeight;
    let elements = document.getElementsByClassName("roundex-box");
    for (let i = 0; i < elements.length; i++) {
        (elements[i] as HTMLElement).style.maxHeight = maxHeight;
    }

    elements = document.getElementsByClassName("roundex-box-middle");
    for (let i = 0; i < elements.length; i++) {
        (elements[i] as HTMLElement).style.maxHeight = maxHeightMiddle;
    }
}

// Header band sizing. "home" keeps the tall gradient band so the wallet
// action card overlaps it by ~100px; "compact" fits just the logo row so
// content (back button first) starts right below the band.
export function setHeaderBand(mode: "home" | "compact"): void {
    const gradient = byId("gradient");
    gradient.style.height = "auto";
    gradient.style.minHeight = mode === "home" ? "168px" : "64px";
    byId("main-content").style.marginTop = mode === "home" ? "-100px" : "25px";
}

export async function resumePostEula(): Promise<void> {
    const readyStatus = await isMainKeyCreated();
    if (readyStatus == true) {
        showUnlockScreen();
    } else {
        showInfoScreen();
    }

    await blockchainNetworksInit();
    await showBlockchainNetworks();
}

export async function showBlockchainNetworks(): Promise<void> {
    const networkMap = await blockchainNetworksList();
    networkStore.currentBlockchainNetworkIndex = await blockchainNetworkGetDefaultIndex();

    const sortedKeys = [...networkMap.keys()].sort((a, b) => (a as unknown as number[])[0] - (b as unknown as number[])[0]);
    if (sortedKeys.length > 0 && !networkMap.has(networkStore.currentBlockchainNetworkIndex)) {
        networkStore.currentBlockchainNetworkIndex = sortedKeys[0];
        await blockchainNetworkSetDefaultIndex(networkStore.currentBlockchainNetworkIndex);
    }

    const rows: HTMLElement[] = [];

    let startTabIndex = 1;

    const sortedNetworkEntries = [...networkMap.entries()].sort((a, b) => a[0] - b[0]);
    for (const [index, networkItem] of sortedNetworkEntries) {
        // The legacy template replaced [BLOCKCHAIN_NETWORK_INDEX] once (input value
        // attribute only; the id attribute keeps its placeholder), then name/id in
        // the label text, then [TAB_INDEX].
        const row = (rowTemplates.blockchainNetworkOptionItem as HTMLElement).cloneNode(true) as HTMLElement;
        const input = row.querySelector("input") as HTMLInputElement;
        input.setAttribute("value", index.toString());
        input.setAttribute("tabindex", startTabIndex.toString());
        replaceTextNodeTokens(row, (text) => {
            let out = replaceTemplateTokenOnce(text, "[BLOCKCHAIN_NETWORK_NAME]", String(networkItem.blockchainName));
            out = replaceTemplateTokenOnce(out, "[BLOCKCHAIN_NETWORK_ID]", String(networkItem.networkId));
            return out;
        });
        startTabIndex = startTabIndex + 1;
        rows.push(row);
        if (index == networkStore.currentBlockchainNetworkIndex) {
            // The header network chip and the confirm dialog's network label
            // subscribe to networkStore and update themselves on this write.
            networkStore.currentBlockchainNetwork = networkItem;
        }
    }
    const divNetworkListDialog = byId("divNetworkListDialog");
    removeAllChildren(divNetworkListDialog);
    for (const row of rows) {
        divNetworkListDialog.appendChild(row);
    }
    // As in the legacy app, the row id keeps its placeholder, so this lookup only
    // matches when a template with a substituted id is present.
    const selectedNetworkEl = document.getElementById("optNetwork" + networkStore.currentBlockchainNetworkIndex.toString()) as HTMLInputElement | null;
    if (selectedNetworkEl) {
        selectedNetworkEl.checked = true;
    }

    byId("divCancelNetwork").setAttribute("tabindex", startTabIndex.toString());
    startTabIndex = startTabIndex + 1;
    byId("divOkNetwork").setAttribute("tabindex", startTabIndex.toString());
}

// Applies a string transform to every text node under `root` (used to fill the
// cloned legacy templates whose placeholders live in text content).
function replaceTextNodeTokens(root: HTMLElement, transform: (text: string) => string): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node != null) {
        const newValue = transform(node.nodeValue ?? "");
        if (newValue !== node.nodeValue) {
            node.nodeValue = newValue;
        }
        node = walker.nextNode();
    }
}

export async function showBlockchainNetworksTable(): Promise<void> {
    const networkMap = await blockchainNetworksList();
    networkStore.currentBlockchainNetworkIndex = await blockchainNetworkGetDefaultIndex();
    const tbody = byId("tbodyNetworkRow");
    removeAllChildren(tbody);
    const sortedEntries = [...networkMap.entries()].sort((a, b) => a[0] - b[0]);
    for (const [, networkItem] of sortedEntries) {
        const rowTpl = rowTemplates.blockchainNetworkRow;
        if (rowTpl == null) {
            continue;
        }
        const row = rowTpl.cloneNode(true) as HTMLTableRowElement;
        let rpcDisplay: unknown = networkItem.rpcEndpoint;
        if (rpcDisplay == null || String(rpcDisplay).trim() === "") {
            rpcDisplay = "public.rpc.quantumcoinapi.com";
        }
        replaceTextNodeTokens(row, (text) => {
            let out = replaceTemplateTokenOnce(text, "[BLOCKCHAIN_NETWORK_NAME]", String(networkItem.blockchainName));
            out = replaceTemplateTokenOnce(out, "[BLOCKCHAIN_NETWORK_ID]", String(networkItem.networkId));
            out = replaceTemplateTokenOnce(out, "[BLOCKCHAIN_SCAN_API_URL]", String(networkItem.scanApiDomain));
            out = replaceTemplateTokenOnce(out, "[BLOCKCHAIN_EXPLORER_API_URL]", String(networkItem.blockExplorerDomain));
            out = replaceTemplateTokenOnce(out, "[BLOCKCHAIN_RPC_ENDPOINT_URL]", String(rpcDisplay));
            return out;
        });
        tbody.appendChild(row);
    }
}

export async function saveSelectedBlockchainNetwork(): Promise<void> {
    const radioButtons = document.querySelectorAll<HTMLInputElement>('input[name="network_option"]');
    let selectedValue = "";
    radioButtons.forEach(function (radioButton) {
        if (radioButton.checked) {
            selectedValue = radioButton.value;
        }
    });
    const result = await blockchainNetworkSetDefaultIndex(parseInt(selectedValue, 10));
    if (result == false) {
        showWarnAlert(getGenericError(""));
    } else {
        await showBlockchainNetworks();
        byId("spnAccountBalance").textContent = "";
        walletStore.currentBalance = "";
        await refreshAccountBalance();
        if (byId("TransactionsScreen").style.display !== "none") {
            await refreshTransactionList();
        }
    }
}

export async function showInfoScreen(): Promise<void> {
    byId("login-content").style.display = "block";
    byId("welcomeScreen").style.display = "block";
    setWalletMenuEnabled(false);

    displayInfoStep(1);
}

export function displayInfoStep(step: number): void {
    if (step >= 1 && step <= langJson.info.length) {
        onboardingStore.currentInfoStep = step;
        const totalSteps = langJson.info.length;
        const jsonData = langJson.info[step - 1];

        byId("welcomeText").textContent = langJson.infoStep.replace("[STEP]", String(step)).replace("[TOTAL_STEPS]", String(totalSteps));
        byId("divInfoPanelTitle").textContent = jsonData.title;
        byId("divInfoPanelDetail").textContent = jsonData.desc.replace(STORAGE_PATH_TEMPLATE, walletStore.STORAGE_PATH);
    }
}

export function nextInfoStep(): void {
    if (onboardingStore.currentInfoStep < langJson.info.length) {
        onboardingStore.currentInfoStep++;
        displayInfoStep(onboardingStore.currentInfoStep);
    } else {
        displayQuizStep();
    }
}

export function showCreateWalletPasswordScreen(): void {
    byId("welcomeScreen").style.display = "none";
    byId("quizScreen").style.display = "none";
    byId("createWalletPasswordScreen").style.display = "block";
    byId("pwdPassword").focus();
}

export function displayQuizStep(): void {
    if (onboardingStore.currentQuizStep > langJson.quiz.length) {
        showCreateWalletPasswordScreen();
        return;
    }

    byId("welcomeScreen").style.display = "none";
    byId("quizScreen").style.display = "block";

    const totalSteps = langJson.quiz.length;
    const quizData = langJson.quiz[onboardingStore.currentQuizStep - 1];

    byId("divSafetyQuizTitle").textContent = langJson.quizStep.replace("[STEP]", String(onboardingStore.currentQuizStep)).replace("[TOTAL_STEPS]", String(totalSteps));
    byId("divSafetyQuizSubTitle").textContent = quizData.title;
    byId("divSafetyQuizQuestion").textContent = quizData.question;

    const quizForm = byId("quizForm");
    removeAllChildren(quizForm);

    const choiceNode = byId("lblSafetyQuizChoice");
    const tabIndexStart = 350;
    // The legacy code mutated the hidden template's innerHTML on the first
    // iteration only, so every rendered choice carries tabindex 350.
    const templateInput = choiceNode.querySelector("input") as HTMLInputElement;
    if (templateInput.getAttribute("tabindex") === TAB_INDEX_TEMPLATE) {
        templateInput.setAttribute("tabindex", String(0 + tabIndexStart));
    }
    for (let i = 0; i < quizData.choices.length; i++) {
        const choiceCloneNode = choiceNode.cloneNode(true) as HTMLElement;
        choiceCloneNode.id = "choice" + i;
        choiceCloneNode.appendChild(document.createTextNode(quizData.choices[i].replace(STORAGE_PATH_TEMPLATE, walletStore.STORAGE_PATH)));
        (choiceCloneNode.getElementsByClassName("safety_quiz_option")[0] as HTMLInputElement).value = String(i + 1);
        choiceCloneNode.style.display = "block";
        quizForm.appendChild(choiceCloneNode);
    }
}

export function submitQuizForm(): void {
    const radioButtons = document.querySelectorAll<HTMLInputElement>('input[name="quiz_option"]');
    let selectedValue = "";
    radioButtons.forEach(function (radioButton) {
        if (radioButton.checked) {
            selectedValue = radioButton.value;
        }
    });
    if (selectedValue !== "") {
        const quizData = langJson.quiz[onboardingStore.currentQuizStep - 1];
        if (quizData == null) {
            showWarnAlert(langJson.quizNoChoice);
            return;
        }
        if (selectedValue === quizData.correctChoice.toString()) {
            onboardingStore.currentQuizStep = onboardingStore.currentQuizStep + 1;
            showAlertAndExecuteOnClose(quizData.afterQuizInfo.replace(STORAGE_PATH_TEMPLATE, walletStore.STORAGE_PATH), displayQuizStep);
        } else {
            showWarnAlert(langJson.quizWrongAnswer);
        }
    } else {
        showWarnAlert(langJson.quizNoChoice);
    }
}

export function showWalletPath(): void {
    showAlert(walletStore.STORAGE_PATH);
}

export function checkNewPassword(): boolean | void {
    const minPasswordLength = 12;

    const password = inputById("pwdPassword").value;
    const retypePassword = inputById("pwdRetypePassword").value;

    if (password == null || password.length < minPasswordLength) {
        showWarnAlert(langJson.errors.passwordSpec);
        return false;
    }

    if (password !== password.trim()) {
        showWarnAlert(langJson.errors.passwordSpace);
        return false;
    }

    if (password !== retypePassword) {
        showWarnAlert(langJson.errors.retypePasswordMismatch);
        return false;
    }

    onboardingStore.tempPassword = password;

    showCreateWalletPromptScreen();
}

export function showCreateWalletPromptScreen(): void {
    inputById("optNewWallet").checked = false;
    inputById("optRestoreWalletFromSeed").checked = false;
    inputById("optRestoreWalletFromBackupFile").checked = false;

    byId("createWalletPasswordScreen").style.display = "none";
    byId("createWalletPromptScreen").style.display = "block";
    byId("verifyWalletPasswordScreen").style.display = "none";

    byId("optNewWallet").focus();
}

export async function walletFormSubmitted(): Promise<void> {
    const radioButtons = document.querySelectorAll<HTMLInputElement>('input[name="wallet_option"]');

    let selectedValue = "";

    radioButtons.forEach(function (radioButton) {
        if (radioButton.checked) {
            selectedValue = radioButton.value;
        }
    });

    if (selectedValue !== "") {
        if (selectedValue === "new_wallet") {
            showWalletTypeScreen();
        } else if (selectedValue === "wallet_from_seed") {
            showRestoreSeedTypeScreen();
        } else if (selectedValue === "restore_wallet_backup_file") {
            showRestoreWalletScreen();
        } else {
            showWarnAlert(langJson.errors.wrongAnswer);
        }
    } else {
        showWarnAlert(langJson.errors.selectOption);
    }
}

export function showWalletTypeScreen(): void {
    byId("createWalletPromptScreen").style.display = "none";
    byId("walletTypeScreen").style.display = "block";
    const radioButtons = document.querySelectorAll<HTMLInputElement>('input[name="wallet_type_option"]');
    radioButtons.forEach(function (radioButton) { radioButton.checked = false; });
}

export function backFromWalletTypeScreen(): void {
    byId("walletTypeScreen").style.display = "none";
    byId("createWalletPromptScreen").style.display = "block";
}

export function backFromNewSeedScreen(): void {
    byId("newSeedScreen").style.display = "none";
    showWalletTypeScreen();
}

export async function walletTypeFormSubmitted(): Promise<void> {
    const radioButtons = document.querySelectorAll<HTMLInputElement>('input[name="wallet_type_option"]');
    let selectedValue = "";
    radioButtons.forEach(function (radioButton) {
        if (radioButton.checked) {
            selectedValue = radioButton.value;
        }
    });

    if (selectedValue === "default") {
        onboardingStore.currentSeedBytes = 64;
    } else if (selectedValue === "advanced") {
        onboardingStore.currentSeedBytes = 72;
    } else {
        showWarnAlert(langJson.errors.selectOption);
        return;
    }

    byId("walletTypeScreen").style.display = "none";
    await showNewSeedScreen();
}

export function updateSeedRowVisibility(prefix: string, wordCount: number): void {
    const totalRows = wordCount / 4;
    for (let i = 1; i <= 12; i++) {
        const el = document.getElementById(prefix + i);
        if (el) el.style.display = (i <= totalRows) ? "" : "none";
    }
}

export async function showNewSeedScreen(): Promise<void> {
    onboardingStore.tempSeedArray = await cryptoNewSeed(onboardingStore.currentSeedBytes);

    byId("createWalletPromptScreen").style.display = "none";
    byId("walletTypeScreen").style.display = "none";
    byId("newSeedScreen").style.display = "block";
    byId("divSeedHelp").style.display = "block";
    byId("divSeedPanel").style.display = "none";
    byId("divNewSeedButtons").style.display = "none";

    const wordCount = onboardingStore.tempSeedArray.length / 2;
    const wordList = await getWordListFromSeedArrayAsync(onboardingStore.tempSeedArray);
    for (let i = 0; i < wordCount; i++) {
        byId("divNewSeed" + i).textContent = (wordList as string[])[i].toUpperCase();
    }
    updateSeedRowVisibility("newSeedRowHead", wordCount);

    byId("aRevealSeed").focus();
}

export function showRestoreSeedTypeScreen(): void {
    byId("createWalletPromptScreen").style.display = "none";
    byId("restoreSeedTypeScreen").style.display = "block";
    const radioButtons = document.querySelectorAll<HTMLInputElement>('input[name="seed_length_option"]');
    radioButtons.forEach(function (radioButton) { radioButton.checked = false; });
}

export function backFromRestoreSeedTypeScreen(): void {
    byId("restoreSeedTypeScreen").style.display = "none";
    byId("createWalletPromptScreen").style.display = "block";
}

export function backFromRestoreSeedScreen(): void {
    byId("restoreSeedScreen").style.display = "none";
    showRestoreSeedTypeScreen();
}

export function restoreSeedTypeFormSubmitted(): void {
    const radioButtons = document.querySelectorAll<HTMLInputElement>('input[name="seed_length_option"]');
    let selectedValue = "";
    radioButtons.forEach(function (radioButton) {
        if (radioButton.checked) {
            selectedValue = radioButton.value;
        }
    });

    if (selectedValue === "32") {
        onboardingStore.currentSeedBytes = 64;
    } else if (selectedValue === "36") {
        onboardingStore.currentSeedBytes = 72;
    } else if (selectedValue === "48") {
        onboardingStore.currentSeedBytes = 96;
    } else {
        showWarnAlert(langJson.errors.selectOption);
        return;
    }

    byId("restoreSeedTypeScreen").style.display = "none";
    showRestoreSeedScreen();
}

export function showRestoreSeedScreen(): void {
    const wordCount = onboardingStore.currentSeedBytes / 2;

    byId("createWalletPromptScreen").style.display = "none";
    byId("restoreSeedTypeScreen").style.display = "none";
    byId("newSeedScreen").style.display = "none";
    byId("divSeedHelp").style.display = "none";
    byId("divSeedPanel").style.display = "none";
    byId("divNewSeedButtons").style.display = "none";
    byId("restoreSeedScreen").style.display = "block";

    for (let i = 0; i < SEED_FRIENDLY_INDEX_ARRAY.length; i++) {
        byId("txtRestoreSeed" + SEED_FRIENDLY_INDEX_ARRAY[i].toUpperCase()).textContent = "";
    }

    populateRestoreSeedAutoComplete(wordCount);
}

export async function populateRestoreSeedAutoComplete(wordCount: number): Promise<void> {
    const seedWordList = await getAllSeedWordsAsync();
    if (onboardingStore.autoCompleteInitializedRestore == false) {
        for (let i = 0; i < SEED_FRIENDLY_INDEX_ARRAY.length; i++) {
            const box = byId("txtRestoreSeed" + SEED_FRIENDLY_INDEX_ARRAY[i].toUpperCase());
            const myAutoComplete = new AutoCompleteDropdownControl(box);
            // 101..148: keep the seed boxes clear of the header burger menu
            // (tabindex 9-13), which would otherwise interleave mid-grid.
            box.tabIndex = i + 101;
            myAutoComplete.limitToList = true;
            myAutoComplete.optionValues = seedWordList;
            myAutoComplete.initialize();
            onboardingStore.autoCompleteBoxesRestore.push(myAutoComplete);
        }
        onboardingStore.autoCompleteInitializedRestore = true;
    } else {
        for (let i = 0; i < onboardingStore.autoCompleteBoxesRestore.length; i++) {
            onboardingStore.autoCompleteBoxesRestore[i].setSelectedValue("");
            onboardingStore.autoCompleteBoxesRestore[i].reset();
        }
    }
    updateSeedRowVisibility("restoreSeedRowHead", wordCount);

    byId("txtRestoreSeedA1").focus();
}

export async function copyNewSeed(): Promise<void> {
    const tempSeedArray = onboardingStore.tempSeedArray as Uint8Array;
    const wordCount = tempSeedArray.length / 2;
    const wordList = (await getWordListFromSeedArrayAsync(tempSeedArray)) as string[];
    let copyText = SEED_FRIENDLY_INDEX_ARRAY[0].toUpperCase() + " = " + wordList[0].toUpperCase() + "\r\n";
    for (let i = 1; i < wordCount; i++) {
        copyText = copyText + SEED_FRIENDLY_INDEX_ARRAY[i].toUpperCase() + " = " + wordList[i].toUpperCase() + "\r\n";
    }
    await WriteTextToClipboard(copyText);
}

export async function copyRevealSeed(): Promise<void> {
    const revealSeedArray = onboardingStore.revealSeedArray as Uint8Array;
    const wordCount = revealSeedArray.length / 2;
    const wordList = (await getWordListFromSeedArrayAsync(revealSeedArray)) as string[];
    let copyText = SEED_FRIENDLY_INDEX_ARRAY[0].toUpperCase() + " = " + wordList[0].toUpperCase() + "\r\n";
    for (let i = 1; i < wordCount; i++) {
        copyText = copyText + SEED_FRIENDLY_INDEX_ARRAY[i].toUpperCase() + " = " + wordList[i].toUpperCase() + "\r\n";
    }
    await WriteTextToClipboard(copyText);
}

export function showSeedPanel(): boolean {
    byId("divSeedPanel").style.display = "flex";
    byId("divSeedHelp").style.display = "none";
    byId("divNewSeedButtons").style.display = "block";
    return false;
}

export function showVerifySeedPanel(): void {
    const wordCount = (onboardingStore.tempSeedArray as Uint8Array).length / 2;

    for (let i = 0; i < SEED_FRIENDLY_INDEX_ARRAY.length; i++) {
        byId("txtSeed" + SEED_FRIENDLY_INDEX_ARRAY[i].toUpperCase()).textContent = "";
    }

    byId("seedVerifyScreen").style.display = "block";
    byId("newSeedScreen").style.display = "none";

    populateVerifySeedAutoComplete(wordCount);
}

export async function populateVerifySeedAutoComplete(wordCount: number): Promise<boolean> {
    const seedWordList = await getAllSeedWordsAsync();
    if (onboardingStore.autoCompleteInitialized == false) {
        for (let i = 0; i < SEED_FRIENDLY_INDEX_ARRAY.length; i++) {
            const box = byId("txtSeed" + SEED_FRIENDLY_INDEX_ARRAY[i].toUpperCase());
            const myAutoComplete = new AutoCompleteDropdownControl(box);
            // 101..148: keep the seed boxes clear of the header burger menu
            // (tabindex 9-13), which would otherwise interleave mid-grid.
            box.tabIndex = i + 101;
            myAutoComplete.limitToList = true;
            myAutoComplete.optionValues = seedWordList;
            myAutoComplete.initialize();
            onboardingStore.autoCompleteBoxes.push(myAutoComplete);
        }
        onboardingStore.autoCompleteInitialized = true;
    } else {
        for (let i = 0; i < onboardingStore.autoCompleteBoxes.length; i++) {
            onboardingStore.autoCompleteBoxes[i].setSelectedValue("");
            onboardingStore.autoCompleteBoxes[i].reset();
        }
    }
    updateSeedRowVisibility("verifySeedRowHead", wordCount);
    byId("txtSeedA1").focus();

    return false;
}

export async function verifySeedWords(): Promise<void> {
    const tempSeedArray = onboardingStore.tempSeedArray as Uint8Array;
    const wordCount = tempSeedArray.length / 2;
    for (let i = 0; i < wordCount; i++) {
        let seedWord = byId("txtSeed" + SEED_FRIENDLY_INDEX_ARRAY[i].toUpperCase()).textContent;
        const seedIndexFriedly = SEED_FRIENDLY_INDEX_ARRAY[i].toUpperCase();

        if (seedWord === null || seedWord.length < 2) {
            return showWarnAlert(langJson.errors.seedEmpty + seedIndexFriedly);
        }

        seedWord = seedWord.toLowerCase();
        if (await doesSeedWordExistAsync(seedWord) === false) {
            return showWarnAlert(langJson.errors.seedDoesNotExist + seedIndexFriedly);
        }

        if (await verifySeedWordAsync(i, seedWord, tempSeedArray) === false) {
            return showWarnAlert(langJson.errors.seedMismatch + seedIndexFriedly + " " + seedWord.toUpperCase());
        }
    }

    showVerifyWalletPasswordScreen();
}

export function showVerifyWalletPasswordScreen(): void {
    inputById("pwdVerifyWalletPassword").value = "";
    byId("restoreSeedScreen").style.display = "none";
    byId("seedVerifyScreen").style.display = "none";
    byId("restoreWalletScreen").style.display = "none";
    byId("confirmWalletScreen").style.display = "none";
    byId("verifyWalletPasswordScreen").style.display = "block";
    byId("pwdVerifyWalletPassword").focus();
}

export function verifyWalletPassword(): boolean | void {
    const password = inputById("pwdVerifyWalletPassword").value;
    if (password == null || password.length < 1) {
        showWarnAlert(langJson.errors.enterWalletPassord);
        return false;
    }
    if (onboardingStore.additionalWalletMode == false && password !== onboardingStore.tempPassword) {
        showWarnAlert(langJson.errors.walletPasswordMismatch);
        return false;
    } else {
        onboardingStore.tempPassword = password;
    }

    showLoadingAndExecuteAsync(langJson.langValues.waitWalletSave, saveWallet);
}

export function showBackupWalletScreen(): void {
    byId("seedVerifyScreen").style.display = "none";
    byId("restoreSeedScreen").style.display = "none";
    byId("restoreWalletScreen").style.display = "none";
    byId("verifyWalletPasswordScreen").style.display = "none";
    byId("backupWalletScreen").style.display = "block";
}

export async function saveWallet(): Promise<boolean> {
    try {
        const walletIndex = await walletGetMaxIndex();
        if (walletIndex == -1) {
            if (onboardingStore.additionalWalletMode == true) {
                hideWaitingBox();
                showErrorAndLockup(getGenericError(""));
                return false;
            }
            const mainKeyStatus = await isMainKeyCreated();
            if (mainKeyStatus == true) {
                hideWaitingBox();
                showErrorAndLockup(getGenericError(""));
                return false;
            }
            await storageCreateMainKey(onboardingStore.tempPassword);
        }
        if (walletStore.currentWallet == null) {
            walletStore.currentWallet = await walletCreateNewWalletFromSeed(onboardingStore.tempSeedArray as Uint8Array);
        }

        if (walletDoesAddressExistInCache(walletStore.currentWallet.address)) {
            hideWaitingBox();
            showWarnAlertAndExecuteOnClose(langJson.errors.walletAddressExists.replace(ADDRESS_TEMPLATE, walletStore.currentWallet.address), createOrRestoreWallet);
            return false;
        }

        const ret = await walletSave(walletStore.currentWallet, onboardingStore.tempPassword);
        if (ret == false) {
            hideWaitingBox();
            showErrorAndLockup(getGenericError(""));
            return false;
        }

        walletStore.currentWalletAddress = walletStore.currentWallet.address;

        hideWaitingBox();
        showAlertAndExecuteOnClose(langJson.langValues.walletSaved, showBackupWalletScreen);
    }
    catch (error) {
        hideWaitingBox();
        showWarnAlert(langJson.errors.walletPasswordMismatch + " " + error);
    }
    return true;
}

export function saveFile(content: string, mimeType: string, filename: string): void {
    const a = document.createElement("a");
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    a.setAttribute("href", url);
    a.setAttribute("download", filename);
    a.click();
}

export async function showWalletScreen(): Promise<boolean> {
    walletStore.currentWallet = null;
    onboardingStore.tempSeedArray = null;
    walletStore.specificWalletAddress = "";
    onboardingStore.tempPassword = "";
    onboardingStore.revealSeedArray = null;
    walletStore.currentBalance = "";
    tokenStore.showingUnrecognizedTokens = false;

    byId("login-content").style.display = "none";
    byId("settings-content").style.display = "none";
    byId("wallets-content").style.display = "none";
    byId("SendScreen").style.display = "none";
    byId("OfflineSignScreen").style.display = "none";
    byId("ReceiveScreen").style.display = "none";
    byId("TransactionsScreen").style.display = "none";
    byId("backupWalletScreen").style.display = "none";
    byId("ValidatorScreen").style.display = "none";

    byId("main-content").style.display = "block";
    byId("divMainContent").style.display = "block";
    byId("HomeScreen").style.display = "block";
    byId("divNetworkDropdown").style.display = "block";
    setWalletMenuEnabled(true);

    byId("SendScreen").style.display = "none";
    byId("ReceiveScreen").style.display = "none";
    byId("TransactionsScreen").style.display = "none";

    setHeaderBand("home");
    byId("walletAddress").textContent = walletStore.currentWalletAddress;

    await offlineTxnSigningGetDefaultValue();
    initRefreshAccountBalanceBackground();

    return false;
}

export function removeOptions(selectElement: HTMLSelectElement): void {
    let i;
    const L = selectElement.options.length - 1;
    for (i = L; i >= 0; i--) {
        selectElement.remove(i);
    }
}

export function showReceiveScreen(): boolean {
    byId("HomeScreen").style.display = "none";
    byId("ReceiveScreen").style.display = "block";
    setHeaderBand("compact");
    byId("receiveWalletAddress").innerText = walletStore.currentWalletAddress;
    loadQRcode(walletStore.currentWalletAddress);
    byId("divCopyReceiveScreen").focus();

    return false;
}

export async function copyAddressReceiveScreen(): Promise<boolean> {
    await WriteTextToClipboard(walletStore.currentWalletAddress);
    return false;
}

export function backupCurrentWallet(): void {
    showLoadingAndExecuteAsync(langJson.langValues.backupWait, encryptAndBackupCurrentWallet);
}

export async function encryptAndBackupCurrentWallet(): Promise<void> {
    const walletJson = await walletGetAccountJsonFromWallet(walletStore.currentWallet as Wallet, onboardingStore.tempPassword);

    let isoStr = new Date().toISOString();
    isoStr = isoStr.replaceAll(":", "-");
    let addr = (walletStore.currentWallet as Wallet).address.toLowerCase();
    if (addr.startsWith("0x") == true) {
        addr = addr.substring(2, addr.length);
    }
    const filename = "UTC--" + isoStr + "--" + addr + ".wallet";
    const mimetype = "text/javascript";
    saveFile(walletJson, mimetype, filename);

    hideWaitingBox();
    byId("backupButton").style.display = "none";
    byId("nextButtonBackupWalletScreen").style.display = "block";
}

export async function restoreSeed(): Promise<void> {
    const wordCount = onboardingStore.currentSeedBytes / 2;
    const seedWords: string[] = new Array(wordCount);
    for (let i = 0; i < wordCount; i++) {
        let seedWord = byId("txtRestoreSeed" + SEED_FRIENDLY_INDEX_ARRAY[i].toUpperCase()).textContent;
        const seedIndexFriedly = SEED_FRIENDLY_INDEX_ARRAY[i].toUpperCase();

        if (seedWord === null || seedWord.length < 2) {
            return showWarnAlert(langJson.errors.seedEmpty + seedIndexFriedly);
        }

        seedWord = seedWord.toLowerCase();
        if (await doesSeedWordExistAsync(seedWord) === false) {
            return showWarnAlert(langJson.errors.seedDoesNotExist + seedIndexFriedly);
        }

        seedWords[i] = seedWord;
    }

    onboardingStore.tempSeedArray = await getSeedArrayFromWordListAsync(seedWords);
    if (onboardingStore.tempSeedArray == null) {
        // The legacy showToastBox was an alias of the warn alert path.
        return showWarnAlert(langJson.errors.wordToSeed);
    }

    await showConfirmWalletScreen();
}

export async function showConfirmWalletScreen(): Promise<void> {
    byId("restoreSeedScreen").style.display = "none";
    byId("restoreWalletScreen").style.display = "none";
    byId("seedVerifyScreen").style.display = "none";
    byId("verifyWalletPasswordScreen").style.display = "none";
    byId("confirmWalletScreen").style.display = "block";

    walletStore.currentWallet = await walletCreateNewWalletFromSeed(onboardingStore.tempSeedArray as Uint8Array);
    walletStore.currentWalletAddress = walletStore.currentWallet.address;
    byId("confirmWalletAddress").textContent = walletStore.currentWalletAddress;

    byId("spnConfirmWalletBalance").textContent = "-";
    await refreshConfirmWalletBalance();
}

export async function refreshConfirmWalletBalance(): Promise<void> {
    if (walletStore.isRefreshingConfirmBalance == true) {
        return;
    }
    walletStore.isRefreshingConfirmBalance = true;

    try {
        byId("divConfirmWalletLoadingBalance").style.display = "block";
        byId("spnConfirmWalletBalance").textContent = "-";

        if (networkStore.currentBlockchainNetwork != null) {
            const accountDetails = await getAccountDetails(networkStore.currentBlockchainNetwork.scanApiDomain, walletStore.currentWalletAddress);
            if (accountDetails != null) {
                const balance = await weiToEtherFormatted(accountDetails.balance);
                byId("spnConfirmWalletBalance").textContent = balance;
            }
        }
    }
    catch {
        byId("spnConfirmWalletBalance").textContent = "-";
    }
    finally {
        byId("divConfirmWalletLoadingBalance").style.display = "none";
        walletStore.isRefreshingConfirmBalance = false;
    }
}

export function backFromConfirmWalletScreen(): boolean {
    walletStore.isRefreshingConfirmBalance = false;
    byId("divConfirmWalletLoadingBalance").style.display = "none";
    byId("confirmWalletScreen").style.display = "none";
    byId("restoreSeedScreen").style.display = "block";
    return false;
}

export function nextFromConfirmWalletScreen(): boolean {
    walletStore.isRefreshingConfirmBalance = false;
    byId("divConfirmWalletLoadingBalance").style.display = "none";
    showVerifyWalletPasswordScreen();
    return false;
}

export async function copyConfirmWalletAddress(): Promise<boolean> {
    await WriteTextToClipboard(walletStore.currentWalletAddress);
    return false;
}

export function restoreWalletFromFile(): void {
    const walletFile = inputById("filRestoreWallet");
    if ((walletFile.files as FileList).length == 0) {
        return showWarnAlert(langJson.errors.selectWalletFile);
    }
    const walletPassword = inputById("pwdRestoreWallet").value;
    if (walletPassword == null || walletPassword.length < 1) {
        return showWarnAlert(langJson.errors.enterWalletFilePassword);
    }

    showLoadingAndExecuteAsync(langJson.langValues.walletFileRestoreWait, restoreWalletFileOpen);
}

export async function restoreWalletFileOpen(): Promise<void> {
    const file_to_read = (inputById("filRestoreWallet").files as FileList)[0];
    const fileread = new FileReader();
    fileread.onload = async function (e) {
        const walletJson = (e.target as FileReader).result as string;

        try {
            const walletDetails = JSON.parse(walletJson);
            if (walletDetails == null) {
                return showWarnAlert(langJson.errors.walletFileOpenError);
            }

            const walletPassword = inputById("pwdRestoreWallet").value;
            walletStore.currentWallet = await walletCreateNewWalletFromJson(walletJson, walletPassword);

            hideWaitingBox();
            showVerifyWalletPasswordScreen();
            return;
        } catch {
            hideWaitingBox();
            return showWarnAlert(langJson.errors.walletFileOpenError);
        }
    };
    fileread.readAsText(file_to_read);
}

export function showWalletListScreen(): boolean {
    setHeaderBand("compact");
    byId("login-content").style.display = "none";
    byId("main-content").style.display = "none";
    byId("wallets-content").style.display = "block";
    byId("settings-content").style.display = "none";
    byId("WalletsScreen").style.display = "block";
    byId("revealSeedScreen").style.display = "none";
    byId("backupSpecificWalletScreen").style.display = "none";
    byId("divNetworkDropdown").style.display = "none";

    const walletMap = walletGetCachedAddressToIndexMap();
    const tBody = byId("tbodyWallet");
    removeAllChildren(tBody);
    let tabIndex = 1;
    for (const [address] of walletMap.entries()) {
        const shortAddress = getShortAddress(address);
        const row = (rowTemplates.walletListRow as HTMLTableRowElement).cloneNode(true) as HTMLTableRowElement;

        // td0: short-address link (legacy onclick="setWalletAddressAndShowWalletScreen('[ADDRESS]');")
        const addrLink = row.cells[0].querySelector("a") as HTMLAnchorElement;
        addrLink.textContent = shortAddress;
        addrLink.setAttribute("tabindex", tabIndex.toString());
        tabIndex = tabIndex + 1;
        addrLink.addEventListener("click", function () { void setWalletAddressAndShowWalletScreen(address); });

        // td1: block-explorer button (legacy onclick="OpenScanAddress('[ADDRESS]');")
        const scanButton = row.cells[1].querySelector("div.button") as HTMLElement;
        scanButton.setAttribute("tabindex", tabIndex.toString());
        tabIndex = tabIndex + 1;
        scanButton.addEventListener("click", function () { void OpenScanAddress(address); });
        scanButton.addEventListener("keypress", function (event) { clickOnEnter(event, scanButton); });

        // td2: backup button (legacy onclick="showSpecificWalletBackupScreen('[ADDRESS]');")
        const backupButton = row.cells[2].querySelector("div.button") as HTMLElement;
        backupButton.setAttribute("tabindex", tabIndex.toString());
        tabIndex = tabIndex + 1;
        backupButton.addEventListener("click", function () { showSpecificWalletBackupScreen(address); });
        backupButton.addEventListener("keypress", function (event) { clickOnEnter(event, backupButton); });

        // td3: reveal-seed button (legacy onclick="showRevealSeedScreen('[ADDRESS]');")
        const seedButton = row.cells[3].querySelector("div.button") as HTMLElement;
        seedButton.setAttribute("tabindex", tabIndex.toString());
        tabIndex = tabIndex + 1;
        seedButton.addEventListener("click", function () { showRevealSeedScreen(address); });
        seedButton.addEventListener("keypress", function (event) { clickOnEnter(event, seedButton); });

        tBody.appendChild(row);
    }

    byId("aCreateNewOrRestore").setAttribute("tabindex", tabIndex.toString());
    tabIndex = tabIndex + 1;
    byId("backButtonWalletListScreen").setAttribute("tabindex", tabIndex.toString());

    return false;
}

export async function setWalletAddressAndShowWalletScreen(address: string): Promise<void> {
    walletStore.currentWalletAddress = address;
    walletStore.currentBalance = "";
    walletStore.currentAccountDetails = null;
    byId("spnAccountBalance").textContent = "";
    removeAllChildren(byId("tbodyAccountTokens"));
    byId("divAccountTokens").style.display = "none";
    byId("divTokenTabs").style.display = "none";
    byId("divRefreshBalance").style.display = "none";
    byId("divLoadingBalance").style.display = "block";
    await showWalletScreen();
    await refreshAccountBalance();
}

export function showSpecificWalletBackupScreen(addr: string): boolean {
    inputById("pwdBackupSpecificWallet").value = "";
    byId("WalletsScreen").style.display = "none";
    byId("revealSeedScreen").style.display = "none";
    byId("backupSpecificWalletScreen").style.display = "block";
    byId("divSpecificBackupAddress").textContent = addr;

    walletStore.specificWalletAddress = addr;

    byId("pwdBackupSpecificWallet").focus();

    return false;
}

export function backupSpecificWallet(): void {
    const password = inputById("pwdBackupSpecificWallet").value;
    if (password == null || password.length < 1) {
        showWarnAlert(langJson.errors.enterWalletPassord);
        return;
    }
    showLoadingAndExecuteAsync(langJson.langValues.backupWait, encryptAndBackupSpecificWallet);
}

export async function encryptAndBackupSpecificWallet(): Promise<void> {
    const password = inputById("pwdBackupSpecificWallet").value;
    let specificWallet: Wallet | null;
    try {
        specificWallet = await walletGetByAddress(password, walletStore.specificWalletAddress);
        if (specificWallet == null) {
            hideWaitingBox();
            showWarnAlert(langJson.errors.walletOpenError.replace(STORAGE_PATH_TEMPLATE, walletStore.STORAGE_PATH));
            return;
        }
    }
    catch (error) {
        hideWaitingBox();
        showWarnAlert(langJson.errors.walletOpenError.replace(STORAGE_PATH_TEMPLATE, walletStore.STORAGE_PATH) + " " + error);
        return;
    }
    const walletJson = await walletGetAccountJsonFromWallet(specificWallet, password);

    let isoStr = new Date().toISOString();
    isoStr = isoStr.replaceAll(":", "-");
    let addr = specificWallet.address.toLowerCase();
    if (addr.startsWith("0x") == true) {
        addr = addr.substring(2, addr.length);
    }
    const filename = "UTC--" + isoStr + "--" + addr + ".wallet";
    const mimetype = "text/javascript";
    saveFile(walletJson, mimetype, filename);

    hideWaitingBox();
}

export function showRevealSeedScreen(addr: string): boolean {
    for (let i = 0; i < SEED_FRIENDLY_INDEX_ARRAY.length; i++) {
        byId("divRevealSeed" + i).textContent = "";
    }
    inputById("pwdRevealSeedScreenPassword").value = "";

    walletStore.specificWalletAddress = addr;
    byId("divRevealSeedAddress").textContent = walletStore.specificWalletAddress;
    byId("WalletsScreen").style.display = "none";
    byId("revealSeedScreen").style.display = "block";
    byId("divRevealSeedHelp").style.display = "block";
    byId("divRevealSeedPanel").style.display = "none";
    byId("divCopyRevealSeed").style.display = "none";
    byId("backupSpecificWalletScreen").style.display = "none";
    byId("divRevealButton").style.display = "block";

    byId("pwdRevealSeedScreenPassword").focus();

    return false;
}

export function showRevealSeedPanel(): boolean | void {
    const password = inputById("pwdRevealSeedScreenPassword").value;
    if (password == null || password.length < 1) {
        showWarnAlert(langJson.errors.enterWalletPassord);
        return;
    }

    showLoadingAndExecuteAsync(langJson.langValues.waitRevealSeed, revealSeedWallet);

    return false;
}

export async function revealSeedWallet(): Promise<void> {
    const password = inputById("pwdRevealSeedScreenPassword").value;
    let specificWallet: Wallet | null;
    try {
        specificWallet = await walletGetByAddress(password, walletStore.specificWalletAddress);
        if (specificWallet == null) {
            hideWaitingBox();
            showWarnAlert(langJson.errors.walletOpenError.replace(STORAGE_PATH_TEMPLATE, walletStore.STORAGE_PATH));
            return;
        }
    }
    catch (error) {
        hideWaitingBox();
        showWarnAlert(langJson.errors.walletOpenError.replace(STORAGE_PATH_TEMPLATE, walletStore.STORAGE_PATH) + " " + error);
        return;
    }

    onboardingStore.revealSeedArray = specificWallet.getSeedArray();
    if (onboardingStore.revealSeedArray == null) {
        hideWaitingBox();
        showWarnAlert(langJson.errors.noSeed);
        return;
    }

    if (specificWallet.address.toLowerCase() !== walletStore.specificWalletAddress.toLowerCase()) {
        hideWaitingBox();
        showWarnAlert(getGenericError(""));
        return;
    }

    const wordList = await getWordListFromSeedArrayAsync(onboardingStore.revealSeedArray);
    if (wordList == null) {
        hideWaitingBox();
        showWarnAlert(getGenericError(""));
        return;
    }

    const wordCount = onboardingStore.revealSeedArray.length / 2;
    for (let i = 0; i < wordCount; i++) {
        byId("divRevealSeed" + i).textContent = wordList[i].toUpperCase();
    }
    updateSeedRowVisibility("revealSeedRowHead", wordCount);

    byId("divRevealSeedHelp").style.display = "none";
    byId("divRevealButton").style.display = "none";
    byId("divRevealSeedPanel").style.display = "block";
    hideWaitingBox();
    byId("divCopyRevealSeed").style.display = "block";
}

export function createOrRestoreWallet(): boolean {
    onboardingStore.additionalWalletMode = true;
    walletStore.currentWallet = null;
    onboardingStore.tempSeedArray = null;
    walletStore.specificWalletAddress = "";
    onboardingStore.tempPassword = "";
    onboardingStore.revealSeedArray = null;

    byId("login-content").style.display = "block";
    byId("wallets-content").style.display = "none";
    showCreateWalletPromptScreen();
    return false;
}

export function showUnlockScreen(): void {
    byId("unlockScreen").style.display = "block";
    byId("login-content").style.display = "block";
    byId("main-content").style.display = "none";
    byId("settings-content").style.display = "none";
    byId("wallets-content").style.display = "none";
    setWalletMenuEnabled(false);
    setTimeout(function () {
        const el = document.getElementById("pwdUnlock");
        if (el) { el.focus(); }
    }, 0);
}

export function unlockWallet(): boolean | void {
    const password = inputById("pwdUnlock").value;
    if (password == null || password.length < 1) {
        showWarnAlert(langJson.errors.enterWalletPassord);
        return;
    }

    showLoadingAndExecuteAsync(langJson.langValues.waitUnlock, decryptAndUnlockWallet);

    return false;
}

export async function decryptAndUnlockWallet(): Promise<boolean | void> {
    const password = inputById("pwdUnlock").value;

    try {
        const walletList = await walletLoadAll(password);
        if (walletList == null || walletList.length < 1) {
            hideWaitingBox();
            showWarnAlert(langJson.errors.walletOpenError.replace(STORAGE_PATH_TEMPLATE, walletStore.STORAGE_PATH));
            return;
        }
        const walletReverseMap = walletGetCachedIndexToAddressMap();
        const walletAddress = walletReverseMap.get(0) as string;
        hideWaitingBox();
        byId("unlockScreen").style.display = "none";
        onboardingStore.additionalWalletMode = true;
        setWalletAddressAndShowWalletScreen(walletAddress);
    }
    catch (error) {
        hideWaitingBox();
        showWarnAlert(langJson.errors.walletOpenError.replace(STORAGE_PATH_TEMPLATE, walletStore.STORAGE_PATH) + " " + error);
        return;
    }
    return false;
}

export const showRestoreWalletLabel = (event: Event): void => {
    const files = (event.target as HTMLInputElement).files as FileList;
    if (files.length == 0) {
        byId("divRestoreWalletFilename").textContent = "";
    } else {
        byId("divRestoreWalletFilename").textContent = files[0].name;
    }
    return;
};

export function showRestoreWalletScreen(): void {
    byId("createWalletPromptScreen").style.display = "none";
    byId("restoreWalletScreen").style.display = "block";
    byId("divRestoreWalletFilename").textContent = "";
    inputById("filRestoreWallet").value = "";
    inputById("pwdRestoreWallet").value = "";

    byId("filRestoreWallet").focus();
}

export async function copyAddress(): Promise<void> {
    await WriteTextToClipboard(walletStore.currentWalletAddress);
}

export async function openBlockExplorerAccount(): Promise<void> {
    let url = BLOCK_EXPLORER_ACCOUNT_TEMPLATE;
    url = url.replace(BLOCK_EXPLORER_DOMAIN_TEMPLATE, (networkStore.currentBlockchainNetwork as { blockExplorerDomain: string }).blockExplorerDomain);
    url = url.replace(ADDRESS_TEMPLATE, walletStore.currentWalletAddress);

    await OpenUrl(url);
}

export function showSettingsScreen(): boolean {
    byId("ahrefWalletPath").focus();
    setHeaderBand("compact");
    byId("login-content").style.display = "none";
    byId("main-content").style.display = "none";
    byId("wallets-content").style.display = "none";
    byId("WalletsScreen").style.display = "none";
    byId("revealSeedScreen").style.display = "none";
    byId("backupSpecificWalletScreen").style.display = "none";
    byId("networkListScreen").style.display = "none";
    byId("divNetworkDropdown").style.display = "none";
    byId("ValidatorScreen").style.display = "none";

    byId("settings-content").style.display = "block";
    byId("settingsScreen").style.display = "block";

    return false;
}

// Show/hide the burger menu. It stays hidden until a wallet is unlocked
// (which implies at least one wallet exists); locking or returning to
// onboarding hides it again.
export function setWalletMenuEnabled(enabled: boolean): void {
    const menu = document.getElementById("burgerMenu");
    if (!menu) return;
    menu.style.display = enabled ? "block" : "none";
    if (!enabled) {
        closeBurgerMenu();
    }
}

// Top-left burger menu (Wallets / Settings). Replaces the old bottom tab bar.
export function toggleBurgerMenu(): boolean {
    const dropdown = document.getElementById("burgerDropdown");
    if (!dropdown) return false;
    dropdown.style.display = (dropdown.style.display === "block") ? "none" : "block";
    return false;
}

export function closeBurgerMenu(): void {
    const dropdown = document.getElementById("burgerDropdown");
    if (dropdown) dropdown.style.display = "none";
}

export function togglePasswordBox(eyeImg: HTMLElement, txtBoxId: string): void {
    const txtBox = byId(txtBoxId);
    if (txtBox.getAttribute("type") == "password") {
        txtBox.setAttribute("type", "text");
        (eyeImg as HTMLImageElement).src = "assets/svg/eye-off-outline.svg";
    } else {
        txtBox.setAttribute("type", "password");
        (eyeImg as HTMLImageElement).src = "assets/svg/eye-outline.svg";
    }
}

export function backFromCreateOrRestoreWallet(): void {
    byId("createWalletPromptScreen").style.display = "none";

    if (onboardingStore.additionalWalletMode == true) {
        showWalletListScreen();
    } else {
        showCreateWalletPasswordScreen();
    }
}

export function backToCreateWalletPromptScreen(): void {
    byId("createWalletPromptScreen").style.display = "block";
    byId("walletTypeScreen").style.display = "none";
    byId("restoreSeedTypeScreen").style.display = "none";
    byId("restoreSeedScreen").style.display = "none";
    byId("newSeedScreen").style.display = "none";
    byId("restoreWalletScreen").style.display = "none";
    byId("optNewWallet").focus();
}

export function backToSeedScreen(): void {
    byId("seedVerifyScreen").style.display = "none";
    byId("newSeedScreen").style.display = "block";
    byId("divSeedPanel").style.display = "none";
    byId("divSeedHelp").style.display = "block";
    byId("divNewSeedButtons").style.display = "none";
}

export function loadQRcode(qrString: string): void {
    const qrcodeElement = byId("qrcode");
    removeAllChildren(qrcodeElement);
    new (QRCode as any)(qrcodeElement, {
        text: qrString,
        width: 260,
        height: 260,
    });
}

export async function showNetworksScreen(): Promise<void> {
    byId("settings-content").style.display = "block";
    byId("settingsScreen").style.display = "none";
    byId("networkListScreen").style.display = "block";
    byId("networkAddScreen").style.display = "none";
    await showBlockchainNetworksTable();
}

export function showAddNetworkScreen(): boolean {
    byId("networkListScreen").style.display = "none";
    byId("networkAddScreen").style.display = "block";
    byId("txtNetworkJSON").focus();
    return false;
}

export function buildAddNetworkConfirmDetails(): string {
    const jsonString = ((byId<HTMLTextAreaElement>("txtNetworkJSON")).value || "").replace(/^\uFEFF/, "").trim();
    const lv = langJson.langValues;
    if (jsonString.length < 1) {
        return "\n\n" + lv.addNetworkCheckEmpty;
    }
    try {
        const obj = parseNetworkJsonForAdd(jsonString);
        const name = obj && obj.blockchainName != null ? String(obj.blockchainName) : "";
        if (name === "") {
            return "\n\n" + lv.addNetworkCheckMissingName;
        }
        return "\n\n" + lv.addNetworkNewPrefix + name;
    } catch {
        return "\n\n" + lv.addNetworkCheckInvalidJson;
    }
}

export function addNetwork(): void {
    const msg = langJson.langValues.addNetworkWarn + buildAddNetworkConfirmDetails();
    showConfirmAndExecuteOnConfirm(msg, checkAndAddNetwork);
}

export async function checkAndAddNetwork(): Promise<void> {
    try {
        const jsonString = ((byId<HTMLTextAreaElement>("txtNetworkJSON")).value || "").replace(/^\uFEFF/, "").trim();
        if (jsonString.length < 1) {
            showWarnAlert(langJson.langValues.invalidNetworkJson);
            return;
        }
        await blockchainNetworkAddNew(jsonString);
        await showBlockchainNetworks();

        showAlertAndExecuteOnClose(langJson.langValues.networkAdded, showNetworksScreen);
    }
    catch (error) {
        showWarnAlert(langJson.errors.invalidNetworkJson + " " + error);
    }
}

// Offline mode: suppress connectivity alerts for automatic/background balance
// loads. Pass manualRefresh=true from the home refresh control so the user still
// sees "server might be busy / internet" when they explicitly ask.
async function shouldAlertConnectivityFailure(manualRefresh: boolean): Promise<boolean> {
    if (manualRefresh) {
        return true;
    }
    // Re-read storage: settingsStore may still be false if home opened before hydrate.
    const offline = await offlineTxnSigningGetDefaultValue();
    return offline !== true;
}

export async function refreshAccountBalance(manualRefresh = false): Promise<void> {
    try {
        if (walletStore.isRefreshingBalance == true) {
            return;
        }
        walletStore.isRefreshingBalance = true;
        setTokenListLoading(true);

        tokenStore.currentWalletTokenList = [];
        tokenStore.currentWalletRecognizedTokens = [];
        tokenStore.currentWalletUnrecognizedTokens = [];
        byId("divAccountTokens").style.display = "none";
        byId("divTokenTabs").style.display = "none";
        removeAllChildren(byId("tbodyAccountTokens"));
        byId("divRefreshBalance").style.display = "none";
        byId("divLoadingBalance").style.display = "block";
        byId("spnAccountBalance").textContent = "";
        walletStore.currentAccountDetails = null;
        const accountDetails = await getAccountDetails((networkStore.currentBlockchainNetwork as { scanApiDomain: string }).scanApiDomain, walletStore.currentWalletAddress);
        if (accountDetails != null) {
            walletStore.currentAccountDetails = accountDetails;
            walletStore.currentBalance = await weiToEtherFormatted(accountDetails.balance);
            byId("spnAccountBalance").textContent = walletStore.currentBalance;
            walletStore.balanceNotificationMap.set(walletStore.currentWalletAddress.toLowerCase(), walletStore.currentBalance);
        }

        await refreshTokenList();

        setTimeout(() => {
            byId("divRefreshBalance").style.display = "block";
            byId("divLoadingBalance").style.display = "none";
            walletStore.isRefreshingBalance = false;
        }, 500);
    }
    catch (error: any) {
        byId("divRefreshBalance").style.display = "block";
        byId("divLoadingBalance").style.display = "none";
        walletStore.isRefreshingBalance = false;
        setTokenListLoading(false);
        if (!(await shouldAlertConnectivityFailure(manualRefresh))) {
            return;
        }
        if (isNetworkError(error)) {
            showWarnAlert(langJson.errors.internetDisconnected);
        } else {
            showWarnAlert(langJson.errors.invalidApiResponse + " " + error);
        }
    }
}

// Fills the home-screen token tbody from the captured row template (the old
// buildTokenRowsHtml + innerHTML assignment).
function renderTokenRows(tokenList: AccountTokenDetails[]): void {
    const tbody = byId("tbodyAccountTokens");
    removeAllChildren(tbody);
    if (tokenList == null) {
        return;
    }

    for (let i = 0; i < tokenList.length; i++) {
        const token = tokenList[i];
        const row = (rowTemplates.tokenListRow as HTMLTableRowElement).cloneNode(true) as HTMLTableRowElement;
        const tokenShortContractAddress = getShortAddress(token.contractAddress); //contract address is already verified for correctness in api.js listAccountTokens function

        // Legacy truncation appended a green "..." span after the cut name/symbol.
        fillTokenTextCell(row.cells[0], token.symbol, maxTokenSymbolLength);
        row.cells[1].textContent = token.tokenBalance;
        const contractLink = row.cells[2].querySelector("a") as HTMLAnchorElement;
        contractLink.textContent = tokenShortContractAddress;
        contractLink.addEventListener("click", function () { void OpenScanAddress(token.contractAddress); });
        fillTokenTextCell(row.cells[3], token.name, maxTokenNameLength);

        tbody.appendChild(row);
    }
}

function fillTokenTextCell(cell: HTMLTableCellElement, value: string, maxLength: number): void {
    removeAllChildren(cell);
    if (value.length > maxLength) {
        cell.appendChild(document.createTextNode(value.substring(0, maxLength - 1)));
        const ellipsis = document.createElement("span");
        ellipsis.setAttribute("style", "color:green");
        ellipsis.textContent = "...";
        cell.appendChild(ellipsis);
    } else {
        cell.appendChild(document.createTextNode(value));
    }
}

export function setTokenTabActiveStyles(): void {
    const recognizedBtn = byId("btnTokensRecognized");
    const unrecognizedBtn = byId("btnTokensUnrecognized");
    if (recognizedBtn == null || unrecognizedBtn == null) {
        return;
    }
    if (tokenStore.showingUnrecognizedTokens === true) {
        recognizedBtn.style.fontWeight = "400";
        recognizedBtn.style.borderBottom = "2px solid transparent";
        unrecognizedBtn.style.fontWeight = "700";
        unrecognizedBtn.style.borderBottom = "2px solid green";
    } else {
        recognizedBtn.style.fontWeight = "700";
        recognizedBtn.style.borderBottom = "2px solid green";
        unrecognizedBtn.style.fontWeight = "400";
        unrecognizedBtn.style.borderBottom = "2px solid transparent";
    }
}

export function renderHomeTokenTab(): void {
    const unionEmpty = tokenStore.currentWalletRecognizedTokens.length === 0 && tokenStore.currentWalletUnrecognizedTokens.length === 0;

    if (unionEmpty === true) {
        removeAllChildren(byId("tbodyAccountTokens"));
        byId("divTokenTabs").style.display = "none";
        byId("divAccountTokens").style.display = "none";
        return;
    }

    //Auto-switch to the non-empty tab so the user always sees content.
    if (tokenStore.showingUnrecognizedTokens === true && tokenStore.currentWalletUnrecognizedTokens.length === 0 && tokenStore.currentWalletRecognizedTokens.length !== 0) {
        tokenStore.showingUnrecognizedTokens = false;
    } else if (tokenStore.showingUnrecognizedTokens === false && tokenStore.currentWalletRecognizedTokens.length === 0 && tokenStore.currentWalletUnrecognizedTokens.length !== 0) {
        tokenStore.showingUnrecognizedTokens = true;
    }

    const activeList = tokenStore.showingUnrecognizedTokens === true ? tokenStore.currentWalletUnrecognizedTokens : tokenStore.currentWalletRecognizedTokens;
    renderTokenRows(activeList);
    byId("divTokenTabs").style.display = "";
    byId("divAccountTokens").style.display = "";
    setTokenTabActiveStyles();
}

export function selectTokenTab(showUnrecognized: boolean): boolean {
    tokenStore.showingUnrecognizedTokens = showUnrecognized === true;
    renderHomeTokenTab();
    return false;
}

export async function refreshTokenList(): Promise<void> {
    //refresh token list/balance
    const tokenListDetails = await listAccountTokens((networkStore.currentBlockchainNetwork as { scanApiDomain: string }).scanApiDomain, walletStore.currentWalletAddress, 1); //todo: pagination
    if (tokenListDetails == null || !("tokenList" in tokenListDetails) || tokenListDetails.tokenList == null || tokenListDetails.tokenList.length === 0) {
        syncSendScreenTokenList();
        setTokenListLoading(false);
        return;
    }

    const safeTokenList: AccountTokenDetails[] = [];
    for (let i = 0; i < tokenListDetails.tokenList.length; i++) {
        const token = tokenListDetails.tokenList[i];
        if (htmlEncode(token.name) !== token.name || htmlEncode(token.symbol) !== token.symbol) {
            continue;
        }
        safeTokenList.push(token);
    }

    //Hard-suppress stablecoin impersonators (recognized contracts bypass), then partition.
    const impersonatorFilteredList = filterStablecoinImpersonators(safeTokenList) as AccountTokenDetails[];
    tokenStore.currentWalletRecognizedTokens = [];
    tokenStore.currentWalletUnrecognizedTokens = [];
    for (let j = 0; j < impersonatorFilteredList.length; j++) {
        const token = impersonatorFilteredList[j];
        if (isRecognizedToken(token.contractAddress) === true) {
            tokenStore.currentWalletRecognizedTokens.push(token);
        } else {
            tokenStore.currentWalletUnrecognizedTokens.push(token);
        }
    }

    tokenStore.currentWalletTokenList = tokenStore.currentWalletRecognizedTokens.concat(tokenStore.currentWalletUnrecognizedTokens);
    renderHomeTokenTab();
    syncSendScreenTokenList();
    setTokenListLoading(false);
}

export async function initRefreshAccountBalanceBackground(): Promise<void> {
    if (walletStore.initAccountBalanceBackgroundStarted == true) {
        return;
    }
    walletStore.initAccountBalanceBackgroundStarted = true;
    refreshAccountBalanceBackground();
}

export async function refreshAccountBalanceBackground(): Promise<void> {
    try {
        if (walletStore.isRefreshingBalance == true) {
            setTimeout(refreshAccountBalanceBackground, 10.0 * 1000);
            return;
        }
        walletStore.isRefreshingBalance = true;
        setTokenListLoading(true);
        tokenStore.currentWalletTokenList = [];
        tokenStore.currentWalletRecognizedTokens = [];
        tokenStore.currentWalletUnrecognizedTokens = [];
        byId("divRefreshBalance").style.display = "none";
        byId("divLoadingBalance").style.display = "block";
        walletStore.currentAccountDetails = null;
        const accountDetails = await getAccountDetails((networkStore.currentBlockchainNetwork as { scanApiDomain: string }).scanApiDomain, walletStore.currentWalletAddress);
        if (accountDetails != null) {
            walletStore.currentAccountDetails = accountDetails;
            const curAddrLower = walletStore.currentWalletAddress.toLowerCase();
            const newBalance = await weiToEtherFormatted(accountDetails.balance);

            if (walletStore.currentBalance !== "" && newBalance !== "0" && newBalance !== walletStore.currentBalance) {
                if (walletStore.pendingTransactionsMap.has(curAddrLower + (networkStore.currentBlockchainNetwork as { index: number }).index.toString()) || (walletStore.balanceNotificationMap.has(curAddrLower) && walletStore.balanceNotificationMap.get(curAddrLower) !== newBalance)) {
                    showBalanceChangeNotification(newBalance);
                    walletStore.balanceNotificationMap.set(walletStore.currentWalletAddress.toLowerCase(), newBalance);
                }
            }

            walletStore.currentBalance = newBalance;
            byId("spnAccountBalance").textContent = newBalance;
        }
        await refreshTokenList();
        byId("divRefreshBalance").style.display = "block";
        byId("divLoadingBalance").style.display = "none";
        walletStore.isRefreshingBalance = false;
        walletStore.isFirstTimeAccountRefresh = false;
        setTimeout(refreshAccountBalanceBackground, 10.0 * 1000);
    }
    catch (error: any) {
        byId("divRefreshBalance").style.display = "block";
        byId("divLoadingBalance").style.display = "none";

        const backoffJitterDelay = Math.random() * (60 - 20) + 20;
        setTimeout(refreshAccountBalanceBackground, backoffJitterDelay * 1000);
        walletStore.isRefreshingBalance = false;
        setTokenListLoading(false);

        if (walletStore.isFirstTimeAccountRefresh == true) { //Show error only when wallet screen displayed first time after the app is opened
            walletStore.isFirstTimeAccountRefresh = false;
            // Offline mode: first-time background refresh must stay silent.
            if (await shouldAlertConnectivityFailure(false)) {
                if (isNetworkError(error)) {
                    showWarnAlert(langJson.errors.internetDisconnected);
                } else {
                    showWarnAlert(langJson.errors.invalidApiResponse + " " + error);
                }
            }
        }
    }
}

export function toggleTransactionStatus(index: number): void {
    let add_id = "";
    let rem_id = "";
    if (index == 0) {
        rem_id = "toggle_trans_status_1";
        add_id = "toggle_trans_status_2";

        byId("divCompleted").classList.remove("disabledhide");
        byId("divPending").classList.add("disabledhide");

        byId("divPrevTxnList").style.display = "block";
        byId("divNextTxnList").style.display = "block";
    } else {
        rem_id = "toggle_trans_status_2";
        add_id = "toggle_trans_status_1";

        byId("divCompleted").classList.add("disabledhide");
        byId("divPending").classList.remove("disabledhide");

        byId("divPrevTxnList").style.display = "none";
        byId("divNextTxnList").style.display = "none";
    }
    const add_el = byId(add_id);
    const rem_el = byId(rem_id);

    add_el.classList.add("disabled");
    let children = Array.from(add_el.children);

    children.forEach((innerDiv) => {
        innerDiv.classList.add("disabled");
    });

    rem_el.classList.remove("disabled");
    children = Array.from(rem_el.children);

    children.forEach((innerDiv) => {
        innerDiv.classList.remove("disabled");
    });
}

export function showBalanceChangeNotification(value: string): boolean {
    new Notification(langJson.langValues.balanceChanged, { body: value });
    return false;
}

export function getTokenBalance(contactAddress: string): string | null {
    if (tokenStore.currentWalletTokenList == null) {
        return null;
    }
    for (let i = 0; i < tokenStore.currentWalletTokenList.length; i++) {
        if (tokenStore.currentWalletTokenList[i].contractAddress === contactAddress) {
            return tokenStore.currentWalletTokenList[i].tokenBalance;
        }
    }
    return null;
}

export async function showTransactionsScreen(manualRefresh = false): Promise<boolean> {
    byId("HomeScreen").style.display = "none";
    byId("TransactionsScreen").style.display = "block";
    setHeaderBand("compact");

    byId("divPrevTxnList").style.display = "block";
    byId("divNextTxnList").style.display = "block";

    removeAllChildren(byId("tbodyComplextedTransactions"));
    txnStore.currentTxnPageIndex = 0;
    await refreshTransactionList(manualRefresh);

    return false;
}

export async function refreshTransactionList(manualRefresh = false): Promise<void> {
    return await refreshTransactionListWithContext(false, manualRefresh);
}

export async function refreshTransactionListWithContext(isPrev: boolean, manualRefresh = false): Promise<void> {
    try {
        byId("divTxnRefreshStatus").style.display = "none";
        byId("divTxnLoadingStatus").style.display = "block";
        removeAllChildren(byId("tbodyPendingTransactions"));
        removeAllChildren(byId("tbodyComplextedTransactions"));

        await refreshTransactionListInner(false, isPrev);
        await refreshTransactionListInner(true, false);

        setTimeout(() => {
            byId("divTxnRefreshStatus").style.display = "block";
            byId("divTxnLoadingStatus").style.display = "none";
        }, 500);

        byId("divTxnRefreshStatus").focus();
    }
    catch (error: any) {
        if (await shouldAlertConnectivityFailure(manualRefresh)) {
            if (isNetworkError(error)) {
                showWarnAlert(langJson.errors.internetDisconnected);
            } else {
                showWarnAlert(langJson.errors.invalidApiResponse + " " + error);
            }
        }

        setTimeout(() => {
            byId("divTxnRefreshStatus").style.display = "block";
            byId("divTxnLoadingStatus").style.display = "none";
        }, 500);
    }
}

// Fills one transaction row clone with the txn fields (the old string
// template [FROM]/[TO]/[HASH]/... replacements).
function buildTransactionRow(template: HTMLTableRowElement, txn: { from: string; to: string | null; hash: string; createdAt: Date | ""; value: string }): HTMLTableRowElement {
    const row = template.cloneNode(true) as HTMLTableRowElement;
    const cells = row.cells;
    // Cell layout: [icon(s)], [VALUE], [DATE], [SHORT_FROM], [SHORT_TO], [SHORT_HASH]
    cells[1].textContent = txn.value.toString();
    cells[2].textContent = txn.createdAt.toLocaleString();

    const fromLink = cells[3].querySelector("a") as HTMLAnchorElement;
    fromLink.textContent = getShortAddress(txn.from);
    const fromAddr = txn.from;
    fromLink.addEventListener("click", function () { void OpenScanAddress(fromAddr); });

    const toLink = cells[4].querySelector("a") as HTMLAnchorElement;
    if (txn.to != null) { //to address can be null for smart-contract creation transactions
        toLink.textContent = getShortAddress(txn.to);
        const toAddr = txn.to;
        toLink.addEventListener("click", function () { void OpenScanAddress(toAddr); });
    } else {
        toLink.textContent = "";
        toLink.addEventListener("click", function () { void OpenScanAddress(""); });
    }

    const hashLink = cells[5].querySelector("a") as HTMLAnchorElement;
    hashLink.textContent = getShortAddress(txn.hash);
    const hash = txn.hash;
    hashLink.addEventListener("click", function () { void OpenScanTxn(hash); });

    return row;
}

export async function refreshTransactionListInner(isPending: boolean, isPrev: boolean): Promise<void> {
    const pageIndex = (isPending) ? 0 : txnStore.currentTxnPageIndex;
    const currAddressLower = walletStore.currentWalletAddress.toLowerCase();
    const network = networkStore.currentBlockchainNetwork as { scanApiDomain: string; index: number };
    const rows: HTMLTableRowElement[] = [];

    const txnListDetails: TransactionListDetails | null = isPending
        ? await getPendingTransactionDetails(network.scanApiDomain, walletStore.currentWalletAddress, pageIndex)
        : await getCompletedTransactionDetails(network.scanApiDomain, walletStore.currentWalletAddress, pageIndex);
    if (txnListDetails == null || txnListDetails.transactionList == null) {
        if (isPending) {
            const pendingRow = getPendingTxnRow(currAddressLower);
            const tbodyPending = byId("tbodyPendingTransactions");
            removeAllChildren(tbodyPending);
            if (pendingRow != null) {
                tbodyPending.appendChild(pendingRow);
            }
        } else {
            removeAllChildren(byId("tbodyComplextedTransactions"));
            txnStore.currentTxnPageIndex = 0;
        }
        return;
    }

    for (let i = 0; i < txnListDetails.transactionList.length; i++) {
        const txn = txnListDetails.transactionList[i];
        let txnTemplate: HTMLTableRowElement;
        if (isPending) {
            txnTemplate = rowTemplates.completedTxnOutRow as HTMLTableRowElement;
        } else {
            if (txn.from.toLowerCase() == walletStore.currentWalletAddress.toLowerCase()) {
                if (txn.status == true) {
                    txnTemplate = rowTemplates.completedTxnOutRow as HTMLTableRowElement;
                } else {
                    txnTemplate = rowTemplates.failedTxnOutRow as HTMLTableRowElement;
                }
            } else {
                if (txn.status == true) {
                    txnTemplate = rowTemplates.completedTxnInRow as HTMLTableRowElement;
                } else {
                    txnTemplate = rowTemplates.failedTxnInRow as HTMLTableRowElement;
                }
            }
        }
        rows.push(buildTransactionRow(txnTemplate, txn));

        if (walletStore.pendingTransactionsMap.has(currAddressLower + network.index.toString())) { //if txn appears in current transaction list, remove from pending
            const pendingTxn = walletStore.pendingTransactionsMap.get(currAddressLower + network.index.toString()) as TransactionDetails;
            if (pendingTxn.hash.toLowerCase() === txn.hash.toLowerCase()) {
                walletStore.pendingTransactionsMap.delete(currAddressLower + network.index.toString());
            }
        }
    }

    if (!isPending && !isPrev) {
        if (txnStore.currentTxnPageIndex == 0) {
            txnStore.currentTxnPageIndex = txnListDetails.pageCount;
        } else {
            txnStore.currentTxnPageIndex = txnStore.currentTxnPageIndex + 1;
        }
    }
    txnStore.currentTxnPageCount = txnListDetails.pageCount;

    if (isPending) {
        const tbodyPending = byId("tbodyPendingTransactions");
        removeAllChildren(tbodyPending);
        for (const row of rows) {
            tbodyPending.appendChild(row);
        }
        const pendingRow = getPendingTxnRow(currAddressLower);
        if (pendingRow != null) {
            tbodyPending.appendChild(pendingRow);
        }
    } else {
        const tbodyCompleted = byId("tbodyComplextedTransactions");
        removeAllChildren(tbodyCompleted);
        for (const row of rows) {
            tbodyCompleted.appendChild(row);
        }
    }
}

export function getPendingTxnRow(currAddressLower: string): HTMLTableRowElement | null {
    const network = networkStore.currentBlockchainNetwork as { index: number };
    if (walletStore.pendingTransactionsMap.has(currAddressLower + network.index.toString()) == false) {
        return null;
    }
    const pendingTxn = walletStore.pendingTransactionsMap.get(currAddressLower + network.index.toString()) as TransactionDetails;
    return buildTransactionRow(rowTemplates.completedTxnOutRow as HTMLTableRowElement, pendingTxn);
}

export async function OpenScanAddress(address: string): Promise<void> {
    let url = BLOCK_EXPLORER_ACCOUNT_TEMPLATE;
    url = url.replace(BLOCK_EXPLORER_DOMAIN_TEMPLATE, (networkStore.currentBlockchainNetwork as { blockExplorerDomain: string }).blockExplorerDomain);
    url = url.replace(ADDRESS_TEMPLATE, address);

    await OpenUrl(url);
}

export async function OpenScanTxn(hash: string): Promise<void> {
    let url = BLOCK_EXPLORER_TRANSACTION_TEMPLATE;
    url = url.replace(BLOCK_EXPLORER_DOMAIN_TEMPLATE, (networkStore.currentBlockchainNetwork as { blockExplorerDomain: string }).blockExplorerDomain);
    url = url.replace(TRANSACTION_HASH_TEMPLATE, hash);

    await OpenUrl(url);
}

export async function showPrevTxnPage(): Promise<void> {
    if (txnStore.currentTxnPageIndex > 1) {
        txnStore.currentTxnPageIndex = txnStore.currentTxnPageIndex - 1;
    } else if (txnStore.currentTxnPageIndex == 1) {
        showWarnAlert(langJson.errors.noMoreTxns);
        return;
    } else if (txnStore.currentTxnPageIndex == 0 && txnStore.currentTxnPageCount > 0) {
        txnStore.currentTxnPageIndex = txnStore.currentTxnPageCount - 1;
    }
    await refreshTransactionListWithContext(true);
}

export async function showNextTxnPage(): Promise<void> {
    if (txnStore.currentTxnPageIndex == 0 || txnStore.currentTxnPageIndex == txnStore.currentTxnPageCount) {
        showWarnAlert(langJson.errors.noMoreTxns);
        return;
    }
    txnStore.currentTxnPageIndex = txnStore.currentTxnPageIndex + 1;
    await refreshTransactionList();
}

export async function showHelp(): Promise<boolean> {
    OpenUrl("https://QuantumCoin.org");
    return false;
}

export async function openBlockExplorer(): Promise<boolean> {
    OpenUrl(HTTPS + (networkStore.currentBlockchainNetwork as { blockExplorerDomain: string }).blockExplorerDomain);
    return false;
}

export function clickOnEnter(event: Event, object: HTMLElement): void {
    if ((event as KeyboardEvent).keyCode == 13) {
        object.click();
    }
}
