// Hand-written builders for the app's <dialog> modals plus the gas toast,
// extracted 1:1 from the legacy fixture (same ids/classes/inline styles so
// styles.css, both theme CSS files and dialog.ts's initDialogs() bindings
// keep working unchanged). Former inline on*-handlers are direct closures.
//
// Order matters: dialog.ts binds some buttons positionally
// (getElementsByClassName("close"/"proceed"/"cancel"/"oknetwork")[0]) and
// app.ts captures the first ".network-template" as a row template, so the
// modals must be mounted in this document order and none of these class names
// may appear earlier in the DOM.
import { el } from "../ui/dom";
import type { ScreenModule } from "../ui/screens";
import { networkStore } from "../app/state";
import { togglePasswordBox } from "../app/app";
import { openOfflineTxnSigningUrl } from "../app/send";
import { copyOfflineSignature } from "../app/validator";

function check(id: string): () => void {
    return () => { (document.getElementById(id) as HTMLInputElement).checked = true; };
}

function buildEulaDialog(): HTMLElement {
    return el("dialog", { id: "modalEulaDialog", class: "modal", tabindex: "-1", role: "dialog" }, [
        el("div", { class: "modal-content" }, [
            el("div", { style: "margin-bottom:30px;" }, [
                el("div", { id: "divEula" }, [
                    el("p", {}, ["hello world"]),
                    el("p", {}, ["hello world"]),
                    el("p", {}, ["hello world"]),
                ]),
                el("div", { style: "margin-top:20px;" }, [
                    el("div", { class: "iagree", "data-lang-key": "i-agree", role: "button", tabindex: "2", id: "divIAgree" }, ["I Agree"]),
                ]),
            ]),
        ]),
    ]);
}

function buildOkDialog(): HTMLElement {
    return el("dialog", { id: "modalOkDialog", class: "modal", tabindex: "-1", role: "dialog" }, [
        el("div", { class: "modal-content" }, [
            el("div", { style: "float:left;display:none;", id: "divSuccess" }, [
                el("img", { src: "assets/svg/checkmark-circle-outline.svg", style: "width:55px;margin-top:12px;", alt: "Success" }),
            ]),
            el("div", { style: "float:left;display:none;", id: "divWarn" }, [
                el("img", { src: "assets/svg/warning-outline.svg", style: "width:55px;margin-top:12px;", alt: "Warning" }),
            ]),
            el("div", { style: "margin-bottom:10px;" }, [
                el("div", { style: "padding-bottom:20px;overflow:auto;" }, [
                    el("p", { id: "pDetails", class: "scrollbar", tabindex: "2" }, ["Some text in the Modal.."]),
                ]),
                el("div", { style: "display:flex; justify-content:flex-end;" }, [
                    el("button", { class: "close", "data-lang-key": "ok", role: "button", tabindex: "1", id: "divModalOk" }, ["Ok"]),
                ]),
            ]),
        ]),
    ]);
}

function buildConfirmDialog(): HTMLElement {
    const networkLabel = el("label", { style: "color:green", id: "lblNetworkConfirm" });
    networkStore.subscribe(() => {
        const network = networkStore.currentBlockchainNetwork;
        if (network != null) {
            networkLabel.textContent = String(network.blockchainName);
        }
    });
    return el("dialog", { id: "modalConfirmDialog", class: "modal", tabindex: "-1", role: "dialog" }, [
        el("div", { class: "modal-content" }, [
            el("div", { style: "margin-bottom:30px;" }, [
                el("div", {}, [
                    el("p", { id: "pDetailsConfirm", style: "font-weight:bold;overflow:auto", class: "scrollbar", tabindex: "4" }, ["Some text in the Modal.."]),
                ]),
                el("div", {}, [
                    el("label", { "data-lang-key": "network" }, ["Network"]),
                    " : ",
                    networkLabel,
                ]),
                el("div", {}, [
                    el("label", { "data-lang-key": "type-the-words" }, ["Type the words"]),
                    " ",
                    el("span", { style: "color:blue" }, ["i agree"]),
                    " ",
                    el("input", { type: "text", style: "width:63px;font-size:16px;border-radius:10px;border:1px solid;padding:3px;", id: "txtConfirm", tabindex: "1" }),
                ]),
                el("div", { style: "margin-top:20px;" }, [
                    el("div", { class: "proceed", "data-lang-key": "ok", role: "button", tabindex: "3" }, ["Ok"]),
                    el("button", { class: "cancel", "data-lang-key": "cancel", role: "button", tabindex: "2" }, ["Cancel"]),
                ]),
            ]),
        ]),
    ]);
}

function buildYesNoDialog(): HTMLElement {
    return el("dialog", { id: "modalYesNoDialog", class: "modal", tabindex: "-1", role: "dialog" }, [
        el("div", { class: "modal-content" }, [
            el("div", { style: "margin-bottom:20px;" }, [
                el("p", { id: "pDetailsYesNo", style: "font-weight:bold;overflow:auto", class: "scrollbar", tabindex: "4" }),
                el("div", { style: "margin-top:20px;display:flex;gap:15px;justify-content:center;" }, [
                    el("button", { class: "cancel", "data-lang-key": "no", role: "button", tabindex: "2", id: "btnYesNoNo" }, ["No"]),
                    el("button", { class: "proceed", "data-lang-key": "yes", role: "button", tabindex: "1", id: "btnYesNoYes" }, ["Yes"]),
                ]),
            ]),
        ]),
    ]);
}

function buildNetworkDialog(): HTMLElement {
    return el("dialog", { id: "modalNetworkDialog", class: "modal", tabindex: "-1", role: "dialog" }, [
        el("div", { class: "modal-content" }, [
            el("div", { style: "margin-bottom:10px;" }, [
                el("h3", { "data-lang-key": "select-network" }, ["Select Network"]),
                el("div", { id: "divNetworkListDialog" }, [
                    // Cloned by app.ts as rowTemplates.blockchainNetworkOptionItem;
                    // the placeholders are replaced per network in the clones.
                    el("div", { style: "padding-bottom:20px;", class: "network-template" }, [
                        el("label", { class: "tab-label", style: "text-align: left;" }, [
                            el("input", { type: "radio", name: "network_option", value: "[BLOCKCHAIN_NETWORK_INDEX]", class: "safety_quiz_option", id: "optNetwork[BLOCKCHAIN_NETWORK_INDEX]", tabindex: "[TAB_INDEX]" }),
                            " [BLOCKCHAIN_NETWORK_NAME] (NetworkId [BLOCKCHAIN_NETWORK_ID]) ",
                        ]),
                    ]),
                ]),
                el("button", { class: "oknetwork", "data-lang-key": "ok", role: "button", id: "divOkNetwork", tabindex: "2" }, ["Ok"]),
                el("button", { class: "cancel", "data-lang-key": "cancel", role: "button", id: "divCancelNetwork", tabindex: "1" }, ["Cancel"]),
            ]),
        ]),
    ]);
}

function buildOfflineTxnSigningDialog(): HTMLElement {
    return el("dialog", { id: "modalOfflineTxnSigning", class: "modal", tabindex: "-1", role: "dialog" }, [
        el("div", { class: "modal-content" }, [
            el("div", { style: "margin-bottom:10px;" }, [
                el("h3", { "data-lang-key": "offline-txn-signing" }, ["Offline Transaction Signing"]),
                el("div", { style: "margin-bottom:20px;" }, [
                    el("label", { "data-lang-key": "help", style: "cursor: pointer;" }, ["Help"]),
                    ": ",
                    el("a", { href: "#", onclick: (event: Event) => { event.preventDefault(); void openOfflineTxnSigningUrl(); } }, ["QuantumCoin.org/offline-transaction-signing.html"]),
                ]),
                el("div", { id: "divOfflineTxnSigning" }, [
                    el("div", { style: "padding-bottom:20px;", class: "network-template" }, [
                        el("form", { id: "offlineTxnSigningForm", style: "display: flex; flex-direction: column; gap: 10px;" }, [
                            el("div", { class: "tab-label", style: "text-align: left;cursor:pointer;", role: "button", onclick: check("optOfflineTxnSigningEnabled") }, [
                                el("input", { type: "radio", name: "optOfflineTxnSigning", value: "enabled", class: "safety_quiz_option", id: "optOfflineTxnSigningEnabled", tabindex: "2" }),
                                el("label", { "data-lang-key": "enabled", style: "cursor: pointer;" }, ["Enabled"]),
                            ]),
                            el("div", { class: "tab-label", style: "text-align: left;cursor:pointer;", role: "button", onclick: check("optOfflineTxnSigningDisabled") }, [
                                el("input", { type: "radio", name: "optOfflineTxnSigning", value: "disabled", class: "safety_quiz_option", id: "optOfflineTxnSigningDisabled", tabindex: "3" }),
                                el("label", { "data-lang-key": "disabled", style: "cursor: pointer;" }, ["Disabled"]),
                            ]),
                        ]),
                    ]),
                ]),
                el("button", { class: "oknetwork", "data-lang-key": "ok", role: "button", id: "btnOkOfflineTxnSigning", tabindex: "4" }, ["Ok"]),
                el("button", { class: "cancel", "data-lang-key": "cancel", role: "button", id: "btnCancelOfflineTxnSigning", tabindex: "1" }, ["Cancel"]),
            ]),
        ]),
    ]);
}

function buildAdvancedSigningDialog(): HTMLElement {
    return el("dialog", { id: "modalAdvancedSigning", class: "modal", tabindex: "-1", role: "dialog" }, [
        el("div", { class: "modal-content" }, [
            el("div", { style: "margin-bottom:10px;" }, [
                el("h3", { "data-lang-key": "signing" }, ["Signing"]),
                el("div", { style: "margin-bottom:20px;" }, [
                    el("p", { "data-lang-key": "advanced-signing-description" }, ["Applicable wallets will incur 30 times higher gas price if this setting is enabled"]),
                ]),
                el("div", { id: "divAdvancedSigning" }, [
                    el("div", { style: "padding-bottom:20px;", class: "network-template" }, [
                        el("form", { id: "advancedSigningForm", style: "display: flex; flex-direction: column; gap: 10px;" }, [
                            el("div", { class: "tab-label", style: "text-align: left;cursor:pointer;", role: "button", onclick: check("optAdvancedSigningEnabled") }, [
                                el("input", { type: "radio", name: "optAdvancedSigning", value: "enabled", class: "safety_quiz_option", id: "optAdvancedSigningEnabled", tabindex: "2" }),
                                el("label", { "data-lang-key": "advanced-signing-option", style: "cursor: pointer;" }, ["Enable advanced signing (may incur 30 times higher gas price)"]),
                            ]),
                            el("div", { class: "tab-label", style: "text-align: left;cursor:pointer;", role: "button", onclick: check("optAdvancedSigningDisabled") }, [
                                el("input", { type: "radio", name: "optAdvancedSigning", value: "disabled", class: "safety_quiz_option", id: "optAdvancedSigningDisabled", tabindex: "3" }),
                                el("label", { "data-lang-key": "disabled", style: "cursor: pointer;" }, ["Disabled"]),
                            ]),
                        ]),
                    ]),
                ]),
                el("button", { class: "oknetwork", "data-lang-key": "ok", role: "button", id: "btnOkAdvancedSigning", tabindex: "4" }, ["Ok"]),
                el("button", { class: "cancel", "data-lang-key": "cancel", role: "button", id: "btnCancelAdvancedSigning", tabindex: "1" }, ["Cancel"]),
            ]),
        ]),
    ]);
}

function buildWaitDialog(): HTMLElement {
    return el("dialog", { id: "modalWaitDialog", class: "modal", tabindex: "-1", role: "dialog" }, [
        el("div", { class: "modal-content" }, [
            el("div", { style: "float:left;", id: "divLoadingModalIcon" }, [
                el("img", { src: "assets/icons/loading.gif", style: "width:70px;margin-top:12px;margin-right:10px;", alt: "Loading" }),
            ]),
            el("div", { style: "margin-bottom:10px;" }, [
                el("div", { style: "padding-bottom:20px;" }, [
                    el("p", { id: "pWaitDetails", class: "scrollbar", style: "overflow:auto;", tabindex: "1" }, ["Some text in the Modal.."]),
                ]),
            ]),
        ]),
    ]);
}

function buildOfflineSignatureDialog(): HTMLElement {
    return el("dialog", { id: "modalOfflineSignature", class: "modal", tabindex: "-1", role: "dialog" }, [
        el("div", { class: "modal-content" }, [
            el("div", { style: "margin-bottom:10px;" }, [
                el("h3", { "data-lang-key": "offline-txn-signing" }, ["Offline Transaction Signing"]),
                el("div", { style: "margin-bottom:20px;" }, [
                    el("p", {}, [
                        el("label", { "data-lang-key": "offline-txn-help" }, ["Copy the below signed transaction and submit it at: "]),
                        " ",
                        el("a", { tabindex: "4", href: "#", onclick: (event: Event) => { event.preventDefault(); void openOfflineTxnSigningUrl(); } }, ["https://QuantumCoin.org/offline-transaction-signing.html"]),
                    ]),
                ]),
                el("div", { id: "divOfflineSignature" }, [
                    el("div", { style: "padding-bottom:20px;", class: "network-template" }, [
                        el("textarea", { id: "txtOfflineSignature", style: "width: 100%;", disabled: true, rows: "15", cols: "100", tabindex: "1" }),
                        el("div", { class: "copy-container", role: "button", style: "float:left;", id: "divOfflineSignatureCopy", tabindex: "2", onclick: () => { void copyOfflineSignature(); } }),
                    ]),
                ]),
                el("button", { class: "oknetwork", "data-lang-key": "ok", role: "button", id: "btnOkOfflineSignature", tabindex: "3" }, ["Ok"]),
            ]),
        ]),
    ]);
}

function buildTransactionReviewDialog(): HTMLElement {
    const labelledRow = (labelKey: string, labelText: string, spanId: string) =>
        el("div", { style: "margin-top:8px;" }, [
            el("label", { "data-lang-key": labelKey, style: "font-weight:bold;display:block;" }, [labelText]),
            el("span", { id: spanId, style: "word-break:break-all;" }),
        ]);

    return el("dialog", { id: "modalTransactionReview", class: "modal", tabindex: "-1", role: "dialog", style: "overflow:hidden;" }, [
        el("div", { class: "modal-content", style: "margin:8% auto; max-height:calc(90vh - 50px); display:flex; flex-direction:column; overflow:hidden;" }, [
            el("p", { id: "pTxReviewPrompt", style: "font-weight:bold;overflow:visible;min-height:24px;flex-shrink:0;", "data-lang-key": "review-transaction-prompt", tabindex: "6" }, ["Please review your transaction request to be sent:"]),
            el("div", { class: "scrollbar", style: "overflow:auto; flex:1 1 auto; min-height:0;" }, [
                el("div", { style: "margin-top:8px;" }, [
                    el("label", { id: "lblTxReviewAsset", "data-lang-key": "action", style: "font-weight:bold;display:block;" }, ["Action"]),
                    el("span", { id: "spanTxReviewAsset", style: "word-break:break-all;" }),
                ]),
                el("div", { id: "rowTxReviewContract", style: "margin-top:8px;display:none;" }, [
                    el("label", { "data-lang-key": "contract-address", style: "font-weight:bold;display:block;" }, ["Contract address"]),
                    el("span", { id: "spanTxReviewContract", style: "word-break:break-all;" }),
                ]),
                el("div", { id: "rowTxReviewFromTokenContract", style: "margin-top:8px;display:none;" }, [
                    el("label", { id: "lblTxReviewFromTokenContract", "data-lang-key": "swap-from-token-contract", style: "font-weight:bold;display:block;" }, ["From token contract"]),
                    el("span", { id: "spanTxReviewFromTokenContract", style: "word-break:break-all;" }),
                ]),
                el("div", { id: "rowTxReviewToTokenContract", style: "margin-top:8px;display:none;" }, [
                    el("label", { "data-lang-key": "swap-to-token-contract", style: "font-weight:bold;display:block;" }, ["To token contract"]),
                    el("span", { id: "spanTxReviewToTokenContract", style: "word-break:break-all;" }),
                ]),
                labelledRow("from-address", "From Address", "spanTxReviewFrom"),
                el("div", { id: "rowTxReviewTo", style: "margin-top:8px;" }, [
                    el("label", { "data-lang-key": "to-address", style: "font-weight:bold;display:block;" }, ["To Address"]),
                    el("span", { id: "spanTxReviewTo", style: "word-break:break-all;" }),
                ]),
                el("div", { style: "margin-top:8px;" }, [
                    el("label", { id: "lblTxReviewQuantity", "data-lang-key": "send-quantity", style: "font-weight:bold;" }, ["Quantity (Q)"]),
                    " : ",
                    el("span", { id: "spanTxReviewQuantity", style: "word-break:break-all;" }),
                ]),
                el("div", { id: "rowTxReviewTokenQuantity", style: "margin-top:8px;display:none;" }, [
                    el("label", { id: "lblTxReviewTokenQuantity", "data-lang-key": "token-quantity", style: "font-weight:bold;" }, ["Token quantity"]),
                    " : ",
                    el("span", { id: "spanTxReviewTokenQuantity", style: "word-break:break-all;" }),
                ]),
                el("div", { id: "rowTxReviewGasLimit", style: "margin-top:8px;" }, [
                    el("label", { "data-lang-key": "gas-limit", style: "font-weight:bold;" }, ["Gas limit (gas-units)"]),
                    " : ",
                    el("span", { id: "spanTxReviewGasLimit" }),
                ]),
                el("div", { id: "rowTxReviewGasFee", style: "margin-top:8px;" }, [
                    el("label", { "data-lang-key": "gas-fee", style: "font-weight:bold;" }, ["Estimated gas fee (coins)"]),
                    " : ",
                    el("span", { id: "spanTxReviewGasFee" }),
                ]),
                el("div", { style: "margin-top:8px;" }, [
                    el("label", { "data-lang-key": "network", style: "font-weight:bold;" }, ["Network"]),
                    " : ",
                    el("span", { id: "spanTxReviewNetwork", style: "color:green;" }),
                ]),
            ]),
            el("div", { style: "margin-top:12px;" }, [
                el("label", { "data-lang-key": "type-i-agree-to-confirm" }, ["Type "]),
                " ",
                el("span", { style: "color:blue", "data-lang-key": "i-agree-literal" }, ["i agree"]),
                el("label", { "data-lang-key": "type-i-agree-to-confirm-suffix" }, [" to confirm:"]),
                " ",
                el("input", { type: "text", style: "width:63px;font-size:16px;border-radius:10px;border:1px solid;padding:3px;", id: "txtTxReviewIAgree", tabindex: "1" }),
            ]),
            el("div", { id: "rowTxReviewPassword", style: "margin-top:12px;" }, [
                el("label", { "data-lang-key": "enter-wallet-password", style: "display:block;font-weight:bold;" }, ["Password"]),
                el("div", { style: "display:flex;align-items:center;gap:6px;margin-top:4px;" }, [
                    el("input", { type: "password", style: "width:100%;max-width:200px;font-size:16px;border-radius:10px;border:1px solid;padding:3px;", id: "txtTxReviewPassword", tabindex: "2", autocomplete: "off" }),
                    el("img", {
                        id: "imgTxReviewPasswordEye", src: "assets/svg/eye-outline.svg", alt: "Show Password", class: "qs-eye", style: "flex-shrink:0;",
                        "data-alt-key": "show-password", role: "button", tabindex: "3", title: "Show/Hide password",
                        onclick: (event: Event) => togglePasswordBox(event.currentTarget as HTMLElement, "txtTxReviewPassword"),
                    }),
                ]),
            ]),
            el("div", { id: "rowTxReviewNonce", style: "margin-top:12px;display:none;" }, [
                el("label", { "data-lang-key": "current-nonce", style: "display:block;font-weight:bold;" }, ["Current Nonce"]),
                el("input", {
                    id: "txtTxReviewNonce", type: "number", min: "0", step: "1", tabindex: "4",
                    autocomplete: "off", style: "width:110px;font-size:16px;border-radius:10px;border:1px solid;padding:3px;margin-top:4px;",
                }),
            ]),
            el("div", { style: "margin-top:25px;display:flex;gap:15px;justify-content:flex-end;" }, [
                el("button", { class: "cancel", "data-lang-key": "cancel", role: "button", tabindex: "6", id: "btnTxReviewCancel" }, ["Cancel"]),
                el("button", { class: "proceed", "data-lang-key": "ok", role: "button", tabindex: "5", id: "btnTxReviewSubmit" }, ["Ok"]),
            ]),
        ]),
    ]);
}

function buildGasConfigDialog(): HTMLElement {
    return el("dialog", { id: "modalGasConfig", class: "modal", tabindex: "-1", role: "dialog" }, [
        el("div", { class: "modal-content", style: "margin:10% auto; max-width:460px;" }, [
            el("h3", { "data-lang-key": "gas", style: "margin-top:0;" }, ["Gas"]),
            el("div", { class: "input_container", style: "margin-top:10px;" }, [
                el("div", { class: "heading medium", "data-lang-key": "gas-limit" }, ["Gas limit (gas-units)"]),
                el("input", { class: "tab-name", type: "number", min: "0", step: "1", id: "txtGasLimit", style: "text-align: left; width: 100%; border: 1px solid #ccc; border-radius: 6px; padding: 6px;", tabindex: "1" }),
            ]),
            el("div", { class: "input_container", style: "margin-top:10px;gap:2px;" }, [
                el("div", { class: "heading medium", "data-lang-key": "gas-fee" }, ["Estimated gas fee (coins)"]),
                el("div", { class: "tab-name", style: "display:flex;align-items:center;gap:5px;text-align:left;width:100%;padding:0;" }, [
                    el("span", { id: "spanGasFee" }),
                    el("span", {}, ["Q"]),
                ]),
            ]),
            el("div", { style: "margin-top:20px; display:flex; gap:15px; justify-content:flex-end;" }, [
                el("button", { class: "cancel", "data-lang-key": "cancel", role: "button", tabindex: "4", id: "btnGasConfigCancel" }, ["Cancel"]),
                el("button", { class: "proceed", "data-lang-key": "ok", role: "button", tabindex: "3", id: "btnGasConfigOk" }, ["Ok"]),
            ]),
        ]),
    ]);
}

// Numbered multi-step transaction progress dialog (approve -> submit flows on
// multi-step submit flows). Ported from the web app's txSteps
// component: each row shows a number badge that becomes a spinner while the
// step's transaction confirms, then a check (done) or cross (failed). Rows are
// built at runtime by src/app/txsteps.ts.
function buildTxStepsDialog(): HTMLElement {
    return el("dialog", { id: "modalTxSteps", class: "modal", tabindex: "-1", role: "dialog" }, [
        el("div", { class: "modal-content", style: "margin:10% auto; max-width:520px;" }, [
            el("div", { style: "display:flex; align-items:flex-start; justify-content:space-between; gap:12px;" }, [
                el("h3", { id: "h3TxStepsTitle", style: "margin:0;" }),
                el("div", { style: "display:flex; align-items:center; gap:12px; flex-shrink:0;" }, [
                    el("div", { id: "divTxStepsGas", class: "gas-header-right", style: "display:none;" }, [
                        el("span", { id: "spanTxStepsGasFee", class: "gas-fee-label" }),
                        el("div", {
                            id: "divTxStepsGasIcon", class: "gas-container", role: "button",
                            tabindex: "2", title: "Gas",
                        }),
                    ]),
                    el("button", {
                        id: "btnTxStepsDismiss", type: "button", title: "Close", "aria-label": "Close",
                        style: "border:0; background:transparent; color:inherit; font-size:24px; line-height:1; cursor:pointer; padding:0 2px;",
                    }, ["\u00d7"]),
                ]),
            ]),
            el("div", {
                id: "divTxStepsWait", style: "display:none; margin-top:12px; color:#ffffff;",
                "data-lang-key": "tx-step-please-wait",
            }, ["Please wait, this can take up to a minute..."]),
            el("ol", { id: "olTxStepsList", class: "tx-step-list" }),
            el("div", { id: "divTxStepsHashRow", style: "display:none; margin-top:12px;" }, [
                el("div", { style: "display:flex; align-items:center; justify-content:space-between;" }, [
                    el("label", { "data-lang-key": "transaction-id", style: "font-weight:bold;" }, ["Transaction ID"]),
                    el("div", { style: "display:flex; align-items:center; gap:12px;" }, [
                        el("div", { class: "copy-container", role: "button", id: "divTxStepsCopy", title: "Copy", tabindex: "2" }),
                        el("div", { class: "scan-container", role: "button", id: "divTxStepsExplorer", title: "Block Explorer", tabindex: "3" }),
                    ]),
                ]),
                el("p", { id: "pTxStepsTxHash", style: "font-family:monospace; word-break:break-all; margin-top:4px;" }),
            ]),
            el("div", { id: "divTxStepsResult", style: "display:none; margin-top:12px; word-break:break-word;" }),
            el("p", { id: "pTxStepsError", class: "tx-steps-error", style: "display:none; margin-top:12px; word-break:break-word;" }),
            el("div", { style: "margin-top:20px; display:flex; justify-content:flex-end;" }, [
                el("button", { class: "proceed", role: "button", tabindex: "1", id: "btnTxStepsClose" }, ["Close"]),
            ]),
        ]),
    ]);
}

// Transient status pill shown while a gas estimate is refreshing.
function buildGasToast(): HTMLElement {
    return el("div", { id: "divGasToast", class: "gas-toast", role: "status", "aria-live": "polite" });
}

function buildSendCompletedDialog(): HTMLElement {
    return el("dialog", { id: "modalSendCompleted", class: "modal", tabindex: "-1", role: "dialog" }, [
        el("div", { class: "modal-content", style: "margin:10% auto; max-width:520px;" }, [
            el("p", { id: "pSendCompletedMessage", style: "margin:0;" }),
            el("div", { style: "margin-top:16px;" }, [
                el("div", { style: "display:flex; align-items:center; justify-content:space-between;" }, [
                    el("label", { "data-lang-key": "transaction-id", style: "font-weight:bold;" }, ["Transaction ID"]),
                    el("div", { style: "display:flex; align-items:center; gap:12px;" }, [
                        el("div", { class: "copy-container", role: "button", id: "divSendCompletedCopy", title: "Copy", tabindex: "2" }),
                        el("div", { class: "scan-container", role: "button", id: "divSendCompletedExplorer", title: "Block Explorer", tabindex: "3" }),
                    ]),
                ]),
                el("p", { id: "pSendCompletedTxHash", style: "font-family:monospace; word-break:break-all; margin-top:4px;" }),
                el("div", { id: "divSendCompletedStatus", style: "display:flex; align-items:center; gap:10px; margin-top:12px;" }, [
                    el("img", { id: "imgSendCompletedStatus", src: "assets/icons/loading.gif", alt: "Loading", style: "width:30px; height:30px; flex-shrink:0;" }),
                    el("span", { id: "spanSendCompletedStatus", style: "font-size:0.9em;" }),
                ]),
            ]),
            el("div", { style: "margin-top:20px; display:flex; justify-content:flex-end;" }, [
                el("button", { class: "proceed", "data-lang-key": "ok", role: "button", tabindex: "1", id: "btnSendCompletedOk" }, ["Ok"]),
            ]),
        ]),
    ]);
}

function buildTokenPickerDialog(): HTMLElement {
    return el("dialog", { id: "modalTokenPicker", class: "modal", tabindex: "-1", role: "dialog" }, [
        el("div", { class: "modal-content token-picker-dialog" }, [
            el("div", { class: "token-picker-head" }, [
                el("h3", { "data-lang-key": "select-a-token" }, ["Select a token"]),
                el("button", {
                    id: "btnTokenPickerClose", class: "token-picker-close", type: "button",
                    title: "Close", "aria-label": "Close",
                }, ["\u00d7"]),
            ]),
            el("div", { class: "token-picker-search-wrap" }, [
                el("input", {
                    id: "txtTokenPickerSearch", class: "token-picker-search", type: "text",
                    autocomplete: "off", spellcheck: "false",
                    "data-placeholder-key": "token-picker-search-placeholder",
                    placeholder: "Search name / symbol or paste address",
                }),
                el("span", { id: "spanTokenPickerSpinner", class: "token-picker-spinner", style: "display:none;", "aria-hidden": "true" }),
            ]),
            el("label", { id: "labelTokenPickerUnrecognized", class: "token-picker-unrecognized-toggle", style: "display:none;" }, [
                el("input", { id: "chkTokenPickerUnrecognized", type: "checkbox" }),
                el("span", { "data-lang-key": "show-unrecognized-tokens" }, ["Show unrecognized tokens"]),
            ]),
            el("div", { id: "divTokenPickerStatus", class: "token-picker-status" }),
            el("div", { id: "divTokenPickerList", class: "token-picker-list scrollbar", role: "listbox" }),
        ]),
    ]);
}

export const dialogModules: ScreenModule[] = [
    { parentId: null, build: buildEulaDialog },
    { parentId: null, build: buildOkDialog },
    { parentId: null, build: buildConfirmDialog },
    { parentId: null, build: buildYesNoDialog },
    { parentId: null, build: buildNetworkDialog },
    { parentId: null, build: buildOfflineTxnSigningDialog },
    { parentId: null, build: buildAdvancedSigningDialog },
    { parentId: null, build: buildWaitDialog },
    { parentId: null, build: buildOfflineSignatureDialog },
    { parentId: null, build: buildTransactionReviewDialog },
    { parentId: null, build: buildGasConfigDialog },
    { parentId: null, build: buildTxStepsDialog },
    { parentId: null, build: buildGasToast },
    { parentId: null, build: buildSendCompletedDialog },
    { parentId: null, build: buildTokenPickerDialog },
];
