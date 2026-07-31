// Receive screen, extracted 1:1 from the legacy fixture (ids/classes/inline
// styles preserved so styles.css, the theme CSS and app.ts keep working).
import { el } from "../ui/dom";
import type { ScreenModule } from "../ui/screens";
import { copyAddressReceiveScreen, showWalletScreen } from "../app/app";

function buildReceiveScreen(): HTMLElement {
    return el("div", { class: "center-content home-content", id: "ReceiveScreen" }, [
        el("div", { class: "center-content-rounded-container" }, [
            el("div", { class: "back-container", role: "button", tabindex: "310", id: "divBackReceiveScreen", onclick: () => { void showWalletScreen(); } }),
            el("div", { class: "roundex-box", style: "padding-top: 15px; padding-bottom: 15px;overflow-y: auto;overflow-x: auto;" }, [
                el("div", { class: "heading bold", "data-lang-key": "receive-coins" }, ["Receive Coins"]),
                el("div", { class: "divider" }),
                el("div", { style: "color:red", "data-lang-key": "send-only" }, ["Send only DP coins to this address!"]),
                el("div", { id: "receiveWalletAddress", class: "tab-name text-wallet-address", style: "text-align: center; font-size: 0.88em;color:black;" }),
                el("div", { class: "copy-container", role: "button", style: "display: flex; align-self: center;margin-bottom:10px;", tabindex: "311", id: "divCopyReceiveScreen", onclick: () => { void copyAddressReceiveScreen(); } }),
                el("div", { style: "text-align: center; max-height: 270px; display: flex; align-items: center; justify-content: center;" }, [
                    el("div", { id: "qrcode" }),
                ]),
            ]),
        ]),
    ]);
}

export const receiveScreenModule: ScreenModule = { parentId: "divMainContent", build: buildReceiveScreen };
