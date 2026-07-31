// Settings, network-list and add-network screens (the #settings-content
// container's children), extracted 1:1 from the legacy fixture.
import { el } from "../ui/dom";
import type { ScreenModule } from "../ui/screens";
import { addNetwork, showAddNetworkScreen, showNetworksScreen, showSettingsScreen, showWalletPath, showWalletScreen } from "../app/app";
import { showAdvancedSigningSettingDialog, showOfflineTxnSettingDialog } from "../app/dialog";

type MenuAction = () => unknown;

function menuLink(langKey: string, textContent: string, tabindex: string, action: MenuAction, id?: string): HTMLElement {
    const attrs: Record<string, string | EventListener> = {
        href: "#",
        "data-lang-key": langKey,
        tabindex,
        onclick: (event: Event) => { event.preventDefault(); void action(); },
    };
    if (id != null) attrs["id"] = id;
    return el("div", { class: "vertical-menu-item" }, [el("a", attrs, [textContent])]);
}

function buildSettingsScreen(): HTMLElement {
    return el("div", { class: "content", id: "settingsScreen", style: "display: none;" }, [
        el("div", { class: "center-content" }, [
            el("div", { class: "center-content-rounded-container", style: "margin-top:15px;" }, [
                el("div", { class: "back-container", role: "button", tabindex: "4006", onclick: () => { void showWalletScreen(); } }),
                el("div", { class: "roundex-box scrollbar", style: "overflow-y: auto;overflow-x: auto;" }, [
                    el("div", { class: "heading bold large", "data-lang-key": "settings" }, ["Settings"]),
                    el("div", { class: "divider" }),
                    el("div", { class: "input_container" }, [
                        el("div", { class: "vertical-menu" }, [
                            menuLink("wallet-path", "Wallet Path", "4000", showWalletPath, "ahrefWalletPath"),
                            el("div", { class: "divider" }),
                            menuLink("networks", "Networks", "4001", showNetworksScreen),
                            el("div", { class: "divider" }),
                            menuLink("offline-txn-signing", "Offline Transaction Signing", "4002", showOfflineTxnSettingDialog),
                            el("div", { class: "divider" }),
                            menuLink("signing", "Signing", "4003", showAdvancedSigningSettingDialog),
                            el("div", { class: "divider" }),
                        ]),
                    ]),
                ]),
            ]),
        ]),
    ]);
}

function buildNetworkListScreen(): HTMLElement {
    return el("div", { class: "content", id: "networkListScreen", style: "display: none;" }, [
        el("div", { class: "center-content" }, [
            el("div", { class: "center-content-rounded-container", style: "margin-top:15px;" }, [
                el("div", { class: "back-container", role: "button", tabindex: "3", onclick: () => { void showSettingsScreen(); } }),
                el("div", { class: "roundex-box", style: "padding-top: 15px; padding-bottom: 15px;" }, [
                    el("div", {}, [
                        el("div", { class: "heading large", style: "float:left;width:fit-content;", "data-lang-key": "networks" }, ["Networks"]),
                    ]),
                    el("div", { class: "divider" }),
                    el("div", { class: "blocks-content scrollbar", style: "text-align: left; overflow: auto ;max-height:380px;", id: "divNetworkList", tabindex: "1" }, [
                        el("table", { class: "styled-table" }, [
                            el("thead", {}, [
                                el("tr", {}, [
                                    el("th", { "data-lang-key": "id" }, ["ID"]),
                                    el("th", { "data-lang-key": "name" }, ["Name"]),
                                    el("th", { "data-lang-key": "scan-api-url" }, ["Scan API URL"]),
                                    el("th", { "data-lang-key": "block-explorer-url" }, ["Block Explorer URL"]),
                                    el("th", { "data-lang-key": "rpc-endpoint" }, ["RPC Endpoint"]),
                                ]),
                            ]),
                            el("tbody", { id: "tbodyNetworkRow" }),
                        ]),
                    ]),
                    el("div", { class: "divider" }),
                    el("div", { style: "align-content:center;" }, [
                        el("a", { href: "#", "data-lang-key": "add-network", tabindex: "2", onclick: (event: Event) => { event.preventDefault(); void showAddNetworkScreen(); } }, ["Add Network"]),
                    ]),
                ]),
            ]),
        ]),
    ]);
}

const NETWORK_JSON_SAMPLE = `
{
 "scanApiDomain": "readrelay.quantumcoinapi.com",
 "blockExplorerDomain": "quantumscan.com",
 "blockchainName": "QUANTUM COIN",
 "networkId": 123123,
 "rpcEndpoint": "public.rpc.quantumcoinapi.com"
}
`;

function buildNetworkAddScreen(): HTMLElement {
    return el("div", { class: "content", id: "networkAddScreen", style: "display: none;" }, [
        el("div", { class: "center-content" }, [
            el("div", { class: "center-content-rounded-container", style: "margin-top:15px;" }, [
                el("div", { class: "back-container", role: "button", tabindex: "3", onclick: () => { void showNetworksScreen(); } }),
                el("div", { class: "roundex-box", style: "padding-top: 15px; padding-bottom: 15px;" }, [
                    el("div", {}, [
                        el("div", { class: "heading large", style: "float:left;width:fit-content;", "data-lang-key": "add-network" }, ["Add Network"]),
                    ]),
                    el("div", { class: "divider" }),
                    el("div", { class: "blocks-content scrollbar", style: "text-align: left; overflow: auto ;" }, [
                        el("div", { class: "input_container" }, [
                            el("div", { class: "heading medium", "data-lang-key": "enter-network-json" }, ["Enter Blockchain Network JSON"]),
                            el("div", {}, [
                                el("textarea", { id: "txtNetworkJSON", style: "width: 100%;", rows: "9", cols: "100", tabindex: "1" }, [NETWORK_JSON_SAMPLE]),
                            ]),
                        ]),
                    ]),
                    el("div", { class: "large_button_container heading large", style: "float:right;", "data-lang-key": "add", role: "button", tabindex: "2", onclick: () => addNetwork() }, ["Add"]),
                ]),
            ]),
        ]),
    ]);
}

export const settingsScreenModules: ScreenModule[] = [
    { parentId: "settings-content", build: buildSettingsScreen },
    { parentId: "settings-content", build: buildNetworkListScreen },
    { parentId: "settings-content", build: buildNetworkAddScreen },
];
