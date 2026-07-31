// Header chrome (burger menu, network dropdown, gradient brand row), the
// decorative background orbs and the network-row <template>, extracted 1:1
// from the legacy fixture.
import { el } from "../ui/dom";
import type { ScreenModule } from "../ui/screens";
import { closeBurgerMenu, showSettingsScreen, showWalletListScreen, toggleBurgerMenu } from "../app/app";
import { showNetworkDialog } from "../app/dialog";
import { DROPDOWN_TEXT, networkStore } from "../app/state";
import { showValidatorScreen } from "../app/validator";

function buildOrb1(): HTMLElement {
    return el("div", { class: "qs-orb qs-orb-1" });
}

function buildOrb2(): HTMLElement {
    return el("div", { class: "qs-orb qs-orb-2" });
}

// Row template for the settings network list; initApp() captures it via
// byId("tplBlockchainNetworkRow") and clones per network.
function buildNetworkRowTemplate(): HTMLElement {
    const template = el("template", { id: "tplBlockchainNetworkRow" });
    (template as HTMLTemplateElement).content.appendChild(
        el("tr", { class: "network-row" }, [
            el("td", {}, ["[BLOCKCHAIN_NETWORK_ID]"]),
            el("td", {}, ["[BLOCKCHAIN_NETWORK_NAME]"]),
            el("td", {}, ["[BLOCKCHAIN_SCAN_API_URL]"]),
            el("td", {}, ["[BLOCKCHAIN_EXPLORER_API_URL]"]),
            el("td", {}, ["[BLOCKCHAIN_RPC_ENDPOINT_URL]"]),
        ]),
    );
    return template;
}

function burgerItem(id: string, tabindex: string, iconSrc: string, iconAlt: string, langKey: string, label: string, action: () => unknown): HTMLElement {
    return el("div", { class: "burger-item", id, role: "button", tabindex, onclick: () => { closeBurgerMenu(); void action(); } }, [
        el("img", { class: "tab-icon", src: iconSrc, alt: iconAlt }),
        el("div", { class: "tab-name", "data-lang-key": langKey }, [label]),
    ]);
}

function buildHeader(): HTMLElement {
    const networkChip = el("span", { class: "networkbox", id: "spnNetwork" }, ["MAINNET" + DROPDOWN_TEXT]);
    networkStore.subscribe(() => {
        const network = networkStore.currentBlockchainNetwork;
        if (network != null) {
            networkChip.textContent = String(network.blockchainName) + DROPDOWN_TEXT;
        }
    });
    return el("div", { style: "margin: -10px;" }, [
        el("div", { class: "burger-menu", id: "burgerMenu", style: "display:none;" }, [
            el("div", {
                class: "burger-button", id: "burgerButton", role: "button", tabindex: "9", "aria-label": "Menu",
                onclick: () => toggleBurgerMenu(),
                onkeydown: (event: Event) => {
                    const key = (event as KeyboardEvent).key;
                    if (key === "Enter" || key === " ") {
                        (document.getElementById("burgerButton") as HTMLElement).click();
                    }
                },
            }, [el("span", {}), el("span", {}), el("span", {})]),
            el("div", { class: "burger-dropdown", id: "burgerDropdown", style: "display:none;" }, [
                burgerItem("tab1", "10", "assets/svg/wallet-outline.svg", "Wallets Icon", "wallets", "Wallets", showWalletListScreen),
                burgerItem("tab4", "11", "assets/svg/settings.svg", "Settings Icon", "settings", "Settings", showSettingsScreen),
                burgerItem("tab6", "13", "assets/icons/application-server.svg", "Validator Icon", "validator-options", "Validator Options", showValidatorScreen),
            ]),
        ]),
        el("div", { class: "dropdown", id: "divNetworkDropdown", role: "button", tabindex: "1000", style: "display:none;", onclick: () => { void showNetworkDialog(); } }, [
            el("div", { style: "width:fit-content;margin-top:4px;float:left;" }, [networkChip]),
        ]),
        el("div", { class: "gradient", id: "gradient" }, [
            el("div", { class: "logo" }, [
                el("img", { src: "assets/icons/app/dp.png", alt: "Title", class: "logoimg", id: "imgLogo" }),
            ]),
            el("div", { class: "animate-character", id: "divWalletTitle", "data-lang-key": "title" }, ["Title"]),
        ]),
    ]);
}

export const headerModules: ScreenModule[] = [
    { parentId: null, build: buildOrb1 },
    { parentId: null, build: buildOrb2 },
    { parentId: null, build: buildNetworkRowTemplate },
    { parentId: null, build: buildHeader },
];

// The four top-level screen containers the legacy show-functions toggle.
// #divMainContent hosts all wallet screens (home, send, receive, ...).
export const containerModules: ScreenModule[] = [
    { parentId: null, build: () => el("div", { class: "tabs-content", id: "login-content", style: "display: none;" }) },
    { parentId: null, build: () => el("div", { class: "tabs-wallet-content", id: "main-content", style: "display: none;" }, [el("div", { class: "content", id: "divMainContent" })]) },
    { parentId: null, build: () => el("div", { id: "settings-content", class: "tabs-content", style: "display: none;" }) },
    { parentId: null, build: () => el("div", { id: "wallets-content", class: "tabs-content", style: "display: none;" }) },
];
