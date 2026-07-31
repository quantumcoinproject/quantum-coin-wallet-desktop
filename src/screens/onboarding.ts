// The 14 onboarding screens hosted in #login-content (unlock, welcome/info,
// quiz, password, create/restore prompts, seed screens, restore-from-file,
// confirm, verify-password, first-run backup), extracted 1:1 from the legacy
// fixture. Ids/classes/inline styles are preserved so styles.css, the theme
// CSS and the flow logic in app.ts keep working unchanged.
import { el, ElAttrs } from "../ui/dom";
import type { ScreenModule } from "../ui/screens";
import {
    backFromConfirmWalletScreen,
    backFromCreateOrRestoreWallet,
    backFromNewSeedScreen,
    backFromRestoreSeedScreen,
    backFromRestoreSeedTypeScreen,
    backFromWalletTypeScreen,
    backToCreateWalletPromptScreen,
    backToSeedScreen,
    backupCurrentWallet,
    checkNewPassword,
    copyConfirmWalletAddress,
    copyNewSeed,
    nextFromConfirmWalletScreen,
    nextInfoStep,
    openBlockExplorerAccount,
    restoreSeed,
    restoreSeedTypeFormSubmitted,
    restoreWalletFromFile,
    setWalletAddressAndShowWalletScreen,
    showSeedPanel,
    showVerifySeedPanel,
    submitQuizForm,
    togglePasswordBox,
    unlockWallet,
    verifySeedWords,
    verifyWalletPassword,
    walletFormSubmitted,
    walletTypeFormSubmitted,
} from "../app/app";
import { walletStore } from "../app/state";
import { seedTable, seedWordCell, seedEntryCell } from "./seed-table";

interface PasswordRowOptions {
    id: string;
    placeholder: string;
    placeholderKey: string;
    inputTabIndex: string;
    eyeTabIndex: string;
    autofocus?: boolean;
    // The eye <img> carries data-alt-key="show-password" on most screens.
    eyeAltKey?: boolean;
}

// The flex row holding a password input and its show/hide eye icon.
function passwordRow(options: PasswordRowOptions): HTMLElement {
    const inputAttrs: ElAttrs = {
        class: "tab-name qs-input-strong",
        type: "password", autocomplete: "off", id: options.id, name: "password",
        placeholder: options.placeholder, "data-placeholder-key": options.placeholderKey,
        tabindex: options.inputTabIndex,
    };
    if (options.autofocus) inputAttrs["autofocus"] = true;
    const eyeAttrs: ElAttrs = {
        src: "assets/svg/eye-outline.svg", alt: "Show Password", class: "qs-eye",
        role: "button", tabindex: options.eyeTabIndex,
        onclick: (event: Event) => togglePasswordBox(event.currentTarget as HTMLElement, options.id),
    };
    if (options.eyeAltKey !== false) eyeAttrs["data-alt-key"] = "show-password";
    return el("div", { style: "width:100%;display:flex;align-items:center;" }, [
        el("div", { style: "width: 80%;" }, [el("input", inputAttrs)]),
        el("div", {}, [el("img", eyeAttrs)]),
    ]);
}

function radioOption(name: string, value: string, id: string, inputTabIndex: string, labelKey: string, labelText: string): HTMLElement {
    return el("div", { class: "tab-label", style: "text-align: left; cursor: pointer;", onclick: () => { (document.getElementById(id) as HTMLInputElement).checked = true; } }, [
        el("input", { type: "radio", name, value, class: "safety_quiz_option", id, tabindex: inputTabIndex }),
        el("label", { "data-lang-key": labelKey, style: "cursor: pointer;" }, [labelText]),
    ]);
}

function buildUnlockScreen(): HTMLElement {
    return el("div", { class: "content", id: "unlockScreen", style: "display: none;" }, [
        el("div", { class: "center-content" }, [
            el("div", { class: "center-content-rounded-container" }, [
                el("div", { class: "roundex-box", style: "padding-top: 15px; padding-bottom: 15px;" }, [
                    el("div", { class: "heading large", "data-lang-key": "unlock-wallet" }, ["Unlock Wallet"]),
                    el("div", { class: "divider" }),
                    el("div", { class: "input_container" }, [
                        el("div", { class: "heading medium", "data-lang-key": "enter-wallet-password" }, ["Password"]),
                        passwordRow({ id: "pwdUnlock", placeholder: "Enter a password", placeholderKey: "password", inputTabIndex: "1", eyeTabIndex: "2", autofocus: true }),
                        el("div", { class: "divider" }),
                    ]),
                    el("div", { class: "large_button_container heading large", "data-lang-key": "unlock", role: "button", tabindex: "3", onclick: () => unlockWallet() }, ["Unlock"]),
                ]),
            ]),
        ]),
    ]);
}

function buildWelcomeScreen(): HTMLElement {
    return el("div", { class: "content", id: "welcomeScreen", style: "display: none;" }, [
        el("div", { class: "center-content" }, [
            el("div", { class: "center-content-rounded-container" }, [
                el("div", { class: "roundex-box" }, [
                    el("div", { id: "welcomeText", class: "heading bold large" }),
                    el("div", { class: "divider" }),
                    el("div", { id: "infoContainer" }, [
                        el("div", { class: "heading bold medium", id: "divInfoPanelTitle" }, ["Info Title"]),
                        el("div", { class: "heading medium", id: "divInfoPanelDetail", style: "font-weight:400; white-space:normal; overflow-wrap:anywhere; word-break:break-word; min-width:0;" }, ["Info Detail"]),
                    ]),
                    el("div", { class: "divider" }),
                    el("div", { style: "display: flex; justify-content: flex-end;" }, [
                        el("div", { id: "nextButtonWelcomeScreen", class: "large_button_container heading large", "data-lang-key": "next", role: "button", tabindex: "25", onclick: () => nextInfoStep() }, ["Next"]),
                    ]),
                ]),
            ]),
        ]),
    ]);
}

function buildQuizScreen(): HTMLElement {
    return el("div", { class: "content", id: "quizScreen", style: "display: none;" }, [
        el("div", { class: "center-content" }, [
            el("div", { class: "center-content-rounded-container" }, [
                el("div", { class: "roundex-box-middle" }, [
                    el("div", { class: "safety_question_container" }),
                    el("div", { class: "heading bold large", id: "divSafetyQuizTitle" }, ["Safety Quiz"]),
                    el("div", { class: "divider" }),
                    el("div", { class: "heading bold medium", id: "divSafetyQuizSubTitle" }, ["Wallet"]),
                    el("div", { class: "tab-name", id: "divSafetyQuizQuestion" }, ["What coins or tokens can you send to this wallet ?"]),
                    // Hidden choice template cloned per quiz answer by
                    // displayQuizStep(); the clones get real values/labels.
                    el("label", { class: "tab-label safety_quiz_label", style: "text-align:left; display:none; cursor:pointer; width:100%; max-width:100%; box-sizing:border-box; white-space:normal; overflow-wrap:anywhere; word-break:break-word;", id: "lblSafetyQuizChoice" }, [
                        el("input", { type: "radio", name: "quiz_option", value: "", class: "safety_quiz_option", tabindex: "[TAB_INDEX]" }),
                    ]),
                    el("form", { id: "quizForm", style: "display: flex; flex-direction: column; gap: 10px;" }),
                    el("div", { class: "divider" }),
                    el("div", { class: "large_button_container heading large", "data-lang-key": "next", role: "button", tabindex: "399", onclick: () => submitQuizForm() }, ["Next"]),
                ]),
            ]),
        ]),
    ]);
}

function buildCreateWalletPasswordScreen(): HTMLElement {
    return el("div", { class: "content", id: "createWalletPasswordScreen", style: "display: none;" }, [
        el("div", { class: "center-content" }, [
            el("div", { class: "center-content-rounded-container" }, [
                el("div", { class: "roundex-box-middle", style: "padding-top: 15px; padding-bottom: 15px;" }, [
                    el("div", { class: "heading large", "data-lang-key": "set-wallet-password" }, ["Set Wallet Password"]),
                    el("div", { class: "divider" }),
                    el("div", { class: "tab-name", "data-lang-key": "use-strong-password" }, ["Use a strong and long password. And do not forget it!"]),
                    el("div", { class: "input_container" }, [
                        el("div", { class: "heading medium", "data-lang-key": "password" }, ["Password"]),
                        passwordRow({ id: "pwdPassword", placeholder: "Enter a password", placeholderKey: "enter-a-password", inputTabIndex: "1", eyeTabIndex: "2" }),
                        el("div", { class: "divider" }),
                    ]),
                    el("div", { class: "input_container" }, [
                        el("div", { class: "heading medium", "data-lang-key": "retype-password" }, ["Retype Password"]),
                        passwordRow({ id: "pwdRetypePassword", placeholder: "Retype the password", placeholderKey: "retype-the-password", inputTabIndex: "3", eyeTabIndex: "4" }),
                        el("div", { class: "divider" }),
                    ]),
                    el("div", { class: "large_button_container heading large", "data-lang-key": "next", role: "button", tabindex: "5", onclick: () => checkNewPassword() }, ["Next"]),
                ]),
            ]),
        ]),
    ]);
}

function buildCreateWalletPromptScreen(): HTMLElement {
    return el("div", { class: "content", id: "createWalletPromptScreen", style: "display: none;" }, [
        el("div", { class: "center-content" }, [
            el("div", { class: "center-content-rounded-container" }, [
                el("div", { class: "back-container", role: "button", tabindex: "6", onclick: () => backFromCreateOrRestoreWallet() }),
                el("div", { class: "roundex-box" }, [
                    el("div", { class: "safety_question_container" }),
                    el("div", { class: "heading bold large", "data-lang-key": "create-restore-wallet" }, ["Create or Restore Wallet"]),
                    el("div", { class: "divider" }),
                    el("div", { class: "tab-name", "data-lang-key": "select-an-option", tabindex: "1" }, ["Select an option"]),
                    el("form", { id: "walletForm", style: "display: flex; flex-direction: column; gap: 10px;" }, [
                        radioOption("wallet_option", "new_wallet", "optNewWallet", "2", "create-new-wallet", "Create New Wallet"),
                        radioOption("wallet_option", "wallet_from_seed", "optRestoreWalletFromSeed", "3", "restore-wallet-from-seed", "Restore A Wallet From Seed Phrase"),
                        radioOption("wallet_option", "restore_wallet_backup_file", "optRestoreWalletFromBackupFile", "4", "restore-wallet-from-backup-file", "Restore A Wallet From a Backup File"),
                    ]),
                    el("div", { class: "divider" }),
                    el("div", { class: "large_button_container heading large", "data-lang-key": "next", role: "button", tabindex: "5", onclick: () => { void walletFormSubmitted(); } }, ["Next"]),
                ]),
            ]),
        ]),
    ]);
}

function buildWalletTypeScreen(): HTMLElement {
    return el("div", { class: "content", id: "walletTypeScreen", style: "display: none;" }, [
        el("div", { class: "center-content" }, [
            el("div", { class: "center-content-rounded-container" }, [
                el("div", { class: "back-container", role: "button", tabindex: "6", onclick: () => backFromWalletTypeScreen() }),
                el("div", { class: "roundex-box" }, [
                    el("div", { class: "safety_question_container" }),
                    el("div", { class: "heading bold large", "data-lang-key": "select-wallet-type" }, ["Select Wallet Type"]),
                    el("div", { class: "divider" }),
                    el("div", { class: "tab-name", "data-lang-key": "select-an-option", tabindex: "1" }, ["Select an option"]),
                    el("form", { id: "walletTypeForm", style: "display: flex; flex-direction: column; gap: 10px;" }, [
                        radioOption("wallet_type_option", "default", "optWalletTypeDefault", "2", "wallet-type-default", "Default"),
                        radioOption("wallet_type_option", "advanced", "optWalletTypeAdvanced", "3", "wallet-type-advanced", "Advanced (20 times higher gas cost)"),
                    ]),
                    el("div", { class: "divider" }),
                    el("div", { class: "large_button_container heading large", "data-lang-key": "next", role: "button", tabindex: "4", onclick: () => { void walletTypeFormSubmitted(); } }, ["Next"]),
                ]),
            ]),
        ]),
    ]);
}

function buildNewSeedScreen(): HTMLElement {
    return el("div", { class: "content", id: "newSeedScreen", style: "display: none;" }, [
        el("div", { class: "center-content" }, [
            el("div", { class: "center-content-rounded-container", style: "width:95%;" }, [
                el("div", { class: "back-container", role: "button", tabindex: "5", onclick: () => backFromNewSeedScreen() }),
                el("div", { class: "roundex-box-middle", style: "padding-top: 15px; padding-bottom: 15px;" }, [
                    el("div", {}, [
                        el("div", { class: "heading large", style: "float:left;width:fit-content;", "data-lang-key": "seed-words" }, ["Seed Words"]),
                    ]),
                    el("div", { class: "divider" }),
                    el("div", { style: "width:100%;text-align:left;", id: "divSeedHelp" }, [
                        el("ol", {}, [
                            el("li", { style: "margin-bottom:5px;", "data-lang-key": "seed-words-info-1" }, ["Ensure that no one is looking at the screen other than you."]),
                            el("li", { style: "margin-bottom:5px;", "data-lang-key": "seed-words-info-2" }, ["Ensure that there is no camera pointed at this screen, including from your phone."]),
                            el("li", { style: "margin-bottom:5px;", "data-lang-key": "seed-words-info-3" }, ["You should save the seed words safely offline and keep multiple copies in a trustworthy and safe location."]),
                            el("li", { style: "margin-bottom:5px;", "data-lang-key": "seed-words-info-4" }, ["If these seed words are stolen or someone else gets access to them, your wallet is compromised."]),
                            el("li", { style: "margin-bottom:5px;" }, [
                                el("a", { href: "#", style: "color:black;text-decoration:underline;", "data-lang-key": "seed-words-show", tabindex: "1", id: "aRevealSeed", autofocus: true, onclick: (event: Event) => { event.preventDefault(); showSeedPanel(); } }, ["Click here to reveal the seed words."]),
                            ]),
                        ]),
                    ]),
                    el("div", { class: "input_container scrollbar seedwrapper", style: "overflow:auto;display:none;", id: "divSeedPanel" }, [
                        el("div", { class: "tab-content mt-2", style: "margin:auto;" }, [
                            el("div", { class: "tab-pane fade active show", id: "newSeedScreenPanel", role: "tabpanel" }, [
                                seedTable({ rowHeadPrefix: "newSeedRowHead", cell: seedWordCell("divNewSeed"), bodyTabIndex: "2" }),
                            ]),
                        ]),
                    ]),
                    el("div", { class: "divider" }),
                    el("div", { id: "divNewSeedButtons", style: "display:none;" }, [
                        el("div", { class: "copy-container", role: "button", style: "float:left;", tabindex: "3", onclick: () => { void copyNewSeed(); } }),
                        el("a", { href: "#", style: "float:left;margin-left:5px;", onclick: (event: Event) => { event.preventDefault(); void copyNewSeed(); } }, ["copy"]),
                        el("div", { class: "large_button_container heading large", style: "float:right;", id: "divNextSeed", "data-lang-key": "next", role: "button", tabindex: "4", onclick: () => showVerifySeedPanel() }, ["Next"]),
                    ]),
                ]),
            ]),
        ]),
    ]);
}

function buildSeedVerifyScreen(): HTMLElement {
    return el("div", { class: "content", id: "seedVerifyScreen", style: "display: none;" }, [
        el("div", { class: "center-content" }, [
            el("div", { class: "center-content-rounded-container", style: "width:95%;" }, [
                el("div", { class: "back-container", role: "button", tabindex: "150", onclick: () => backToSeedScreen() }),
                el("div", { class: "roundex-box-middle", style: "padding-top: 15px; padding-bottom: 15px;" }, [
                    el("div", {}, [
                        el("div", { class: "heading large", style: "float:left;width:fit-content;", "data-lang-key": "verify-seed-words" }, ["Verify Seed Words"]),
                    ]),
                    el("div", { class: "divider" }),
                    el("div", { class: "input_container scrollbar seedwrapper", style: "overflow:auto;", id: "divSeedVerifyPanel" }, [
                        el("div", { class: "tab-content mt-2", style: "margin:auto;" }, [
                            el("div", { class: "tab-pane fade active show", id: "verifySeedScreenPanel", role: "tabpanel" }, [
                                seedTable({ rowHeadPrefix: "verifySeedRowHead", cell: seedEntryCell("txtSeed") }),
                            ]),
                        ]),
                    ]),
                    el("div", { class: "divider" }),
                    el("div", { class: "large_button_container heading large", style: "float:right;", id: "divVerifySeedButton", "data-lang-key": "next", role: "button", tabindex: "149", onclick: () => { void verifySeedWords(); } }, ["Next"]),
                ]),
            ]),
        ]),
    ]);
}

function buildRestoreSeedTypeScreen(): HTMLElement {
    return el("div", { class: "content", id: "restoreSeedTypeScreen", style: "display: none;" }, [
        el("div", { class: "center-content" }, [
            el("div", { class: "center-content-rounded-container" }, [
                el("div", { class: "back-container", role: "button", tabindex: "6", onclick: () => backFromRestoreSeedTypeScreen() }),
                el("div", { class: "roundex-box" }, [
                    el("div", { class: "safety_question_container" }),
                    el("div", { class: "heading bold large", "data-lang-key": "select-seed-word-length" }, ["How many seed words do you have?"]),
                    el("div", { class: "divider" }),
                    el("div", { class: "tab-name", "data-lang-key": "select-an-option", tabindex: "1" }, ["Select an option"]),
                    el("form", { id: "restoreSeedTypeForm", style: "display: flex; flex-direction: column; gap: 10px;" }, [
                        radioOption("seed_length_option", "32", "optSeedLength32", "2", "seed-length-32", "32 words (A1 to H4)"),
                        radioOption("seed_length_option", "36", "optSeedLength36", "3", "seed-length-36", "36 words (A1 to I4)"),
                        radioOption("seed_length_option", "48", "optSeedLength48", "4", "seed-length-48", "48 words (A1 to L4)"),
                    ]),
                    el("div", { class: "divider" }),
                    el("div", { class: "large_button_container heading large", "data-lang-key": "next", role: "button", tabindex: "5", onclick: () => restoreSeedTypeFormSubmitted() }, ["Next"]),
                ]),
            ]),
        ]),
    ]);
}

function buildRestoreSeedScreen(): HTMLElement {
    return el("div", { class: "content", id: "restoreSeedScreen", style: "display: none;" }, [
        el("div", { class: "center-content" }, [
            el("div", { class: "center-content-rounded-container", style: "width:95%;" }, [
                el("div", { class: "back-container", role: "button", tabindex: "150", onclick: () => backFromRestoreSeedScreen() }),
                el("div", { class: "roundex-box-middle", style: "padding-top: 15px; padding-bottom: 15px;" }, [
                    el("div", {}, [
                        el("div", { class: "heading large", style: "float:left;width:fit-content;", "data-lang-key": "restore-wallet-from-seed" }, ["Restore Wallet From Seed Words"]),
                    ]),
                    el("div", { class: "divider" }),
                    el("div", { class: "input_container scrollbar seedwrapper", style: "overflow:auto;", id: "divSeedRestorePanel" }, [
                        el("div", { class: "tab-content mt-2", style: "margin:auto;" }, [
                            el("div", { class: "tab-pane fade active show", id: "restoreSeedScreenPanel", role: "tabpanel" }, [
                                seedTable({ rowHeadPrefix: "restoreSeedRowHead", cell: seedEntryCell("txtRestoreSeed") }),
                            ]),
                        ]),
                    ]),
                    el("div", { class: "divider" }),
                    el("div", { class: "large_button_container heading large", style: "float:right;", id: "divRestoreSeedButton", "data-lang-key": "next", role: "button", tabindex: "149", onclick: () => { void restoreSeed(); } }, ["Next"]),
                ]),
            ]),
        ]),
    ]);
}

function buildRestoreWalletScreen(): HTMLElement {
    return el("div", { class: "content", id: "restoreWalletScreen", style: "display: none;" }, [
        el("div", { class: "center-content" }, [
            el("div", { class: "center-content-rounded-container" }, [
                el("div", { class: "back-container", role: "button", tabindex: "5", onclick: () => backToCreateWalletPromptScreen() }),
                el("div", { class: "roundex-box" }, [
                    el("div", { class: "heading bold large", "data-lang-key": "restore-wallet-from-backup" }, ["Restore Wallet From Backup File"]),
                    el("div", { class: "divider" }),
                    el("div", { style: "float: left; width: fit-content;" }, [
                        el("input", { type: "file", class: "custom-file-input", id: "filRestoreWallet", tabindex: "1" }),
                    ]),
                    el("div", { style: "text-align:left;font-size:12px;color:green;", id: "divRestoreWalletFilename" }),
                    el("div", { class: "input_container" }, [
                        el("div", { class: "heading medium", "data-lang-key": "enter-above-wallet-password" }, ["Enter the above wallet's password"]),
                        passwordRow({ id: "pwdRestoreWallet", placeholder: "Enter the above wallet's password", placeholderKey: "password", inputTabIndex: "2", eyeTabIndex: "3" }),
                        el("div", { class: "divider" }),
                    ]),
                    el("div", { style: "display: flex; justify-content: flex-end;" }, [
                        el("div", { id: "nextButtonRestoreWalletScreen", class: "large_button_container heading large", "data-lang-key": "open", role: "button", tabindex: "4", onclick: () => restoreWalletFromFile() }, ["Open"]),
                    ]),
                ]),
            ]),
        ]),
    ]);
}

function buildConfirmWalletScreen(): HTMLElement {
    return el("div", { class: "content", id: "confirmWalletScreen", style: "display: none;" }, [
        el("div", { class: "center-content" }, [
            el("div", { class: "center-content-rounded-container" }, [
                el("div", { class: "roundex-box", style: "padding-top: 15px; padding-bottom: 15px;" }, [
                    el("div", { class: "back-container", role: "button", tabindex: "50", onclick: () => backFromConfirmWalletScreen() }),
                    el("div", { class: "heading large", "data-lang-key": "confirm-wallet" }, ["Confirm Wallet"]),
                    el("div", { class: "divider" }),
                    el("div", { class: "input_container" }, [
                        el("div", { class: "tab-name", style: "color:black;", "data-lang-key": "confirm-wallet-description" }, ["Check your wallet address. If this is not the correct address, you may press back to review and edit the seed words."]),
                        el("div", { class: "divider" }),
                        el("div", { style: "width:100%;" }, [
                            el("div", { class: "tab-name", style: "color:black;", "data-lang-key": "address" }, ["Address"]),
                            el("div", { id: "confirmWalletAddress", class: "tab-name text-wallet-address", style: "color: #000000; word-break: break-all;" }),
                        ]),
                        el("div", { class: "divider" }),
                    ]),
                    el("div", { style: "display: flex; flex-direction: row; height: 40px; justify-content: center;" }, [
                        el("div", { class: "copy-container", role: "button", tabindex: "1", onclick: () => { void copyConfirmWalletAddress(); } }),
                        el("div", { class: "scan-container", role: "button", style: "margin-left:15px;margin-top:-2px;", tabindex: "2", onclick: () => { void openBlockExplorerAccount(); } }),
                        el("div", { style: "float: left; width: 30px; height: 30px; margin-left:15px; display: none;", id: "divConfirmWalletLoadingBalance" }, [
                            el("img", { src: "assets/icons/loading.gif", style: "width:30px;height:30px", alt: "Loading" }),
                        ]),
                    ]),
                    el("div", { class: "balance-container", style: "display: flex;flex-direction: row;height: 40px;justify-content: center;margin-top:15px;" }, [
                        el("div", { class: "heading bold", style: "height: 30px;font-size: 20px;margin-top: -15px;color: #35980e;width:fit-content;" }, [
                            el("span", { style: "color:black;", "data-lang-key": "balance" }, ["Balance"]),
                            " : ",
                            el("span", { style: "color:green;", id: "spnConfirmWalletBalance" }, ["-"]),
                        ]),
                    ]),
                    el("div", { class: "divider", style: "margin-top: -25px;" }),
                    el("div", { style: "display: flex; justify-content: flex-end;" }, [
                        el("div", { class: "large_button_container heading large", "data-lang-key": "next", role: "button", tabindex: "3", onclick: () => nextFromConfirmWalletScreen() }, ["Next"]),
                    ]),
                ]),
            ]),
        ]),
    ]);
}

function buildVerifyWalletPasswordScreen(): HTMLElement {
    return el("div", { class: "content", id: "verifyWalletPasswordScreen", style: "display: none;" }, [
        el("div", { class: "center-content" }, [
            el("div", { class: "center-content-rounded-container" }, [
                el("div", { class: "roundex-box", style: "padding-top: 15px; padding-bottom: 15px;" }, [
                    el("div", { class: "heading large", "data-lang-key": "verify-wallet-password" }, ["Verify wallet password"]),
                    el("div", { class: "divider" }),
                    el("div", { class: "input_container" }, [
                        el("div", { class: "tab-name", style: "color:black;", "data-lang-key": "verify-wallet-password-info" }, ["Retype your wallet password, to verify that you remember it. Upon verification, your wallet will be saved."]),
                        el("div", { class: "divider" }),
                        passwordRow({ id: "pwdVerifyWalletPassword", placeholder: "Enter wallet password", placeholderKey: "password", inputTabIndex: "1", eyeTabIndex: "2", eyeAltKey: false }),
                        el("div", { class: "divider" }),
                    ]),
                    el("div", { class: "large_button_container heading large", "data-lang-key": "next", role: "button", tabindex: "3", onclick: () => verifyWalletPassword() }, ["Next"]),
                ]),
            ]),
        ]),
    ]);
}

function buildBackupWalletScreen(): HTMLElement {
    return el("div", { class: "content", id: "backupWalletScreen", style: "display: none;" }, [
        el("div", { class: "center-content" }, [
            el("div", { class: "center-content-rounded-container" }, [
                el("div", { class: "roundex-box-middle scrollbar" }, [
                    el("div", { class: "heading bold large", "data-lang-key": "backup-wallet" }, ["Backup Wallet1"]),
                    el("div", { class: "heading large" }, [
                        el("p", { "data-lang-key": "backup-wallet-info-1" }, ["For additional safety, please make sure that you keep backup copies in atleast three different devices offline."]),
                        el("p", { "data-lang-key": "backup-wallet-info-2" }, ["And remember you need your wallet password to restore the backup!"]),
                        el("p", {}, [
                            el("a", { href: "#", "data-lang-key": "backup-wallet-skip", style: "color:black;cursor:pointer;", tabindex: "3", onclick: (event: Event) => { event.preventDefault(); void setWalletAddressAndShowWalletScreen(walletStore.currentWalletAddress); } }, ["Click here to skip this step."]),
                        ]),
                    ]),
                    el("div", { class: "divider" }),
                    el("div", { style: "display: flex; justify-content: flex-end;" }, [
                        el("div", { id: "backupButton", class: "large_button_container heading large", "data-lang-key": "backup", role: "button", tabindex: "1", onclick: () => backupCurrentWallet() }, ["Backup"]),
                        el("div", { id: "nextButtonBackupWalletScreen", class: "large_button_container heading large", "data-lang-key": "next", role: "button", style: "display:none;", tabindex: "2", onclick: () => { void setWalletAddressAndShowWalletScreen(walletStore.currentWalletAddress); } }, ["Next"]),
                    ]),
                ]),
            ]),
        ]),
    ]);
}

export const onboardingScreenModules: ScreenModule[] = [
    { parentId: "login-content", build: buildUnlockScreen },
    { parentId: "login-content", build: buildWelcomeScreen },
    { parentId: "login-content", build: buildQuizScreen },
    { parentId: "login-content", build: buildCreateWalletPasswordScreen },
    { parentId: "login-content", build: buildCreateWalletPromptScreen },
    { parentId: "login-content", build: buildWalletTypeScreen },
    { parentId: "login-content", build: buildNewSeedScreen },
    { parentId: "login-content", build: buildSeedVerifyScreen },
    { parentId: "login-content", build: buildRestoreSeedTypeScreen },
    { parentId: "login-content", build: buildRestoreSeedScreen },
    { parentId: "login-content", build: buildRestoreWalletScreen },
    { parentId: "login-content", build: buildConfirmWalletScreen },
    { parentId: "login-content", build: buildVerifyWalletPasswordScreen },
    { parentId: "login-content", build: buildBackupWalletScreen },
];
