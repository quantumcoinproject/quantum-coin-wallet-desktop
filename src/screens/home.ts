// Home screen (wallet address card with action buttons + token list),
// extracted 1:1 from the legacy fixture. The hidden .token-list-row is the
// row template captured at startup by initApp(); clones get real listeners
// when the token table is filled in app.ts.
import { el } from "../ui/dom";
import type { ScreenModule } from "../ui/screens";
import {
    copyAddress,
    openBlockExplorerAccount,
    refreshAccountBalance,
    selectTokenTab,
    showReceiveScreen,
    showTransactionsScreen,
} from "../app/app";
import { showSendScreen } from "../app/send";

function actionButton(label: string, langKey: string, tabindex: string, buttonStyle: string, buttonClass: string, iconSrc: string, action: () => unknown, nameProps: Record<string, string> = {}, iconSize = "30px"): HTMLElement {
    return el("div", { class: "buttonBox", role: "button", tabindex, onclick: () => { void action(); } }, [
        el("div", { class: buttonClass, style: buttonStyle }, [
            el("img", { src: iconSrc, alt: label, style: "width:" + iconSize + ";height:" + iconSize + ";position:relative;top:50%;transform:translateY(-50%);" }),
        ]),
        el("div", { class: "button-name", "data-lang-key": langKey, ...nameProps }, [label]),
    ]);
}

function buildHomeScreen(): HTMLElement {
    const quantumTheme = document.body.classList.contains("theme-quantum");
    const quantumButtonStyle = "border-radius:10px;align-self:center;min-height:50px;min-width:50px;";
    // Legacy theme: the tile carries its own colour and the icon is the black
    // outline glyph on top, exactly as the pre-TypeScript app rendered it. The
    // quantum theme colours the tile from CSS instead, so it passes no
    // background here. Both use the same 30px outline icons.
    const legacyTile = (color: string) =>
        "background: " + color + " !important; border-radius: 10px; align-self: center; min-height: 50px; min-width: 50px; ";
    return el("div", { class: "center-content home-content", id: "HomeScreen" }, [
        el("div", { class: "center-content-rounded-container" }, [
            el("div", { class: "roundex-box boxeffect" }, [
                el("div", { class: "wallet-address-container" }, [
                    el("div", { id: "walletAddress", class: "tab-name text-wallet-address", style: "color: #000000; " }),
                ]),
                el("div", { style: "display: flex; flex-direction: row; height: 40px; justify-content: center;" }, [
                    el("div", { class: "copy-container", role: "button", tabindex: "1", onclick: () => { void copyAddress(); } }),
                    el("div", { class: "scan-container", role: "button", style: "margin-left:15px;margin-top:-2px;", tabindex: "2", onclick: () => { void openBlockExplorerAccount(); } }),
                    el("div", { class: "refresh-container", role: "button", style: "margin-left:15px;", id: "divRefreshBalance", tabindex: "3", onclick: () => { void refreshAccountBalance(true); } }),
                    el("div", { style: "float: left; width: 30px; height: 30px; margin-left:15px;", id: "divLoadingBalance" }, [
                        el("img", { src: "assets/icons/loading.gif", style: "width:30px;height:30px" }),
                    ]),
                ]),
                el("div", { class: "balance-container", style: "display: flex;flex-direction: row;height: 40px;justify-content: center;margin-top:15px;" }, [
                    el("div", { id: "totalBalance", class: "heading bold", style: "height: 30px;font-size: 20px;margin-top: -15px;color: #35980e;width:fit-content;" }, [
                        el("span", { style: "color:black;", "data-lang-key": "balance" }, ["Balance"]),
                        " : ",
                        el("span", { style: "color:green;", id: "spnAccountBalance" }),
                    ]),
                ]),
                el("div", { class: "divider", style: "margin-top: -25px;" }),
                el("div", { class: "buttons-container" }, [
                    actionButton("Send", "send", "3", quantumTheme ? quantumButtonStyle : legacyTile("#FFB400"), "button", "assets/svg/arrow-up-outline.svg", showSendScreen, {}, "30px"),
                    actionButton("Receive", "receive", "4", quantumTheme ? quantumButtonStyle : legacyTile("#1DCC70"), "button", "assets/svg/arrow-down-outline.svg", showReceiveScreen, { role: "button" }, "30px"),
                    actionButton("Transactions", "transactions", "5", quantumTheme ? quantumButtonStyle : legacyTile("#55D0F0"), "button", "assets/svg/txn-outline.svg", showTransactionsScreen, {}, "30px"),
                ]),
            ]),
        ]),
        el("div", { class: "center-content-rounded-container", id: "divAccountTokens", style: "display: none" }, [
            el("div", { id: "divTokenTabs", style: "display:none; text-align:center; margin-bottom:8px;" }, [
                el("button", { type: "button", id: "btnTokensRecognized", "data-lang-key": "tokens-tab", style: "cursor:pointer; border:none; background:none; padding:6px 12px; font-weight:700; border-bottom:2px solid green;", onclick: () => selectTokenTab(false) }, ["Tokens"]),
                el("button", { type: "button", id: "btnTokensUnrecognized", "data-lang-key": "unrecognized-tokens-tab", style: "cursor:pointer; border:none; background:none; padding:6px 12px; font-weight:400; border-bottom:2px solid transparent;", onclick: () => selectTokenTab(true) }, ["Unrecognized Tokens"]),
            ]),
            el("div", { class: "roundex-box-small boxeffect scrollbar", id: "divMainScreenTokens", style: "overflow-y: auto;overflow-x: auto;max-height: 295px;text-align: left;" }, [
                el("table", { class: "styled-table" }, [
                    el("thead", {}, [
                        el("tr", {}, [
                            el("th", { "data-lang-key": "symbol" }, ["Symbol"]),
                            el("th", { "data-lang-key": "balance" }, ["Balance"]),
                            el("th", { "data-lang-key": "contract" }, ["Contract"]),
                            el("th", { "data-lang-key": "name" }, ["Name"]),
                        ]),
                    ]),
                    el("tbody", { id: "tbodyAccountTokens" }, [
                        el("tr", { class: "token-list-row" }, [
                            el("td", {}, ["[TOKEN_SYMBOL]"]),
                            el("td", {}, ["[TOKEN_BALANCE]"]),
                            el("td", {}, [el("a", { href: "#" }, ["[SHORT_CONTRACT]"])]),
                            el("td", {}, ["[TOKEN_NAME]"]),
                        ]),
                    ]),
                ]),
            ]),
        ]),
    ]);
}

export const homeScreenModule: ScreenModule = { parentId: "divMainContent", build: buildHomeScreen };
