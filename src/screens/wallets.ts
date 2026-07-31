// Wallets list, reveal-seed and backup-specific-wallet screens (the
// #wallets-content container's children), extracted 1:1 from the legacy
// fixture. The hidden .wallet-row inside #tbodyWallet is the row template
// captured at startup by initApp(); clones get real click/keypress handlers
// in showWalletListScreen(), so the template row carries no listeners.
import { el } from "../ui/dom";
import type { ScreenModule } from "../ui/screens";
import {
    backupSpecificWallet,
    copyRevealSeed,
    createOrRestoreWallet,
    showRevealSeedPanel,
    showWalletListScreen,
    showWalletScreen,
    togglePasswordBox,
} from "../app/app";
import { seedTable, seedWordCell } from "./seed-table";

// No tabindex/listeners on the template row: showWalletListScreen() sets both
// on each clone.
function walletRowActionButton(background: string, imgSrc: string, imgAlt: string, altKey: string): HTMLElement {
    return el("div", { class: "button", style: "background: " + background + " !important; border-radius: 10px; align-self: center; width: 35px; margin-left: 18px; ", role: "button" }, [
        el("img", { src: imgSrc, alt: imgAlt, style: "width: 25px; height: 25px; position: relative; top: 3px;", "data-alt-key": altKey }),
    ]);
}

function walletTemplateRow(): HTMLElement {
    return el("tr", { class: "wallet-row" }, [
        el("td", {}, [el("a", { href: "#" }, ["[SHORT_ADDRESS]"])]),
        el("td", {}, [walletRowActionButton("#FF396F", "assets/svg/open.svg", "DpScan", "dpscan")]),
        el("td", {}, [walletRowActionButton("green", "assets/svg/backup-outline.svg", "Backup", "backup")]),
        el("td", {}, [walletRowActionButton("#ff00db", "assets/svg/eye-outline.svg", "Reveal Seed", "reveal-seed")]),
    ]);
}

function buildWalletsScreen(): HTMLElement {
    return el("div", { class: "center-content home-content", id: "WalletsScreen" }, [
        el("div", { class: "center-content-rounded-container", style: "width:95%;max-width: 95%;margin-top:15px;" }, [
            el("div", { class: "back-container", role: "button", id: "backButtonWalletListScreen", onclick: () => { void showWalletScreen(); } }),
            el("div", { class: "roundex-box", style: "padding-top: 15px; padding-bottom: 15px;" }, [
                el("div", {}, [
                    el("div", { class: "heading large", style: "float:left;width:fit-content;", "data-lang-key": "wallets" }, ["Wallets"]),
                ]),
                el("div", { class: "divider" }),
                el("div", { class: "blocks-content scrollbar", style: "text-align: left; overflow: auto ;max-height:505px;", id: "divWallets" }, [
                    el("table", { class: "styled-table" }, [
                        el("thead", {}, [
                            el("tr", {}, [
                                el("th", { "data-lang-key": "address" }, ["Address"]),
                                el("th", { "data-lang-key": "dpscan" }, ["DpScan"]),
                                el("th", { "data-lang-key": "backup" }, ["Backup"]),
                                el("th", { "data-lang-key": "reveal-seed" }, ["Reveal Seed"]),
                            ]),
                        ]),
                        el("tbody", { id: "tbodyWallet" }, [walletTemplateRow()]),
                    ]),
                ]),
                el("div", { class: "pagination-container", style: "margin: auto;" }, [
                    el("a", { href: "#", "data-lang-key": "create-or-restore-wallet", id: "aCreateNewOrRestore", onclick: (event: Event) => { event.preventDefault(); createOrRestoreWallet(); } }, ["Create New or Restore Existing Wallet"]),
                ]),
            ]),
        ]),
    ]);
}

function buildRevealSeedScreen(): HTMLElement {
    return el("div", { class: "content", id: "revealSeedScreen", style: "display: none;" }, [
        el("div", { class: "center-content" }, [
            el("div", { class: "center-content-rounded-container", style: "max-width:650px;" }, [
                el("div", { class: "back-container", role: "button", tabindex: "6", onclick: () => { void showWalletListScreen(); } }),
                el("div", { class: "roundex-box-middle scrollbar", style: "padding-top: 15px; padding-bottom: 15px;overflow-y: auto;overflow-x:auto;" }, [
                    el("div", {}, [
                        el("div", { class: "heading large", style: "float:left;width:fit-content;", "data-lang-key": "seed-words" }, ["Seed Words"]),
                    ]),
                    el("div", { class: "divider" }),
                    el("div", { class: "heading medium", id: "divRevealSeedAddress", style: "font-size:12px;" }, ["0xAa044ccF6BAD46F0de9fb4dF6b7d9fF02D2e195f"]),
                    el("div", { class: "divider" }),
                    el("div", { style: "width: fit-content; align-self: center;" }, [
                        el("div", { style: "width:100%;text-align:left;", id: "divRevealSeedHelp" }, [
                            el("div", { class: "heading medium", "data-lang-key": "enter-wallet-password" }, ["Enter Wallet Password"]),
                            el("div", { style: "width:100%;display:flex;align-items:center;" }, [
                                el("div", { style: "width: 80%;" }, [
                                    el("input", {
                                        class: "tab-name qs-input-strong",
                                        type: "password", autocomplete: "off", id: "pwdRevealSeedScreenPassword", name: "password",
                                        "data-placeholder-key": "password", placeholder: "Enter the password", tabindex: "1",
                                    }),
                                ]),
                                el("div", {}, [
                                    el("img", {
                                        src: "assets/svg/eye-outline.svg", alt: "Show Password", class: "qs-eye",
                                        role: "button", tabindex: "2",
                                        onclick: (event: Event) => togglePasswordBox(event.currentTarget as HTMLElement, "pwdRevealSeedScreenPassword"),
                                    }),
                                ]),
                            ]),
                            el("div", { style: "text-align:left;margin-top:30px;" }, [
                                el("div", { class: "divider" }),
                                el("ol", {}, [
                                    el("li", { style: "margin-bottom:5px;", "data-lang-key": "seed-words-info-1" }, ["Ensure that no one is looking at the screen other than you."]),
                                    el("li", { style: "margin-bottom:5px;", "data-lang-key": "seed-words-info-2" }, ["Ensure that there is no camera pointed at this screen, including from your phone."]),
                                    el("li", { style: "margin-bottom:5px;", "data-lang-key": "seed-words-info-3" }, ["You should save the seed words safely offline and keep multiple copies in a trustworthy and safe location."]),
                                    el("li", { style: "margin-bottom:5px;", "data-lang-key": "seed-words-info-4" }, ["If these seed words are stolen or someone else gets access to them, your wallet is compromised."]),
                                ]),
                                el("div", { class: "divider" }),
                                el("div", { class: "large_button_container heading large", "data-lang-key": "reveal", id: "divRevealButton", style: "float:right;margin-top:10px;", role: "button", tabindex: "3", onclick: () => showRevealSeedPanel() }, ["Reveal"]),
                            ]),
                        ]),
                        el("div", { class: "input_container scrollbar seedwrapper", style: "overflow:auto;display:none;", id: "divRevealSeedPanel" }, [
                            el("div", { class: "tab-content mt-2", style: "margin:auto;" }, [
                                el("div", { class: "tab-pane fade active show", id: "revealseedpart", role: "tabpanel" }, [
                                    seedTable({ rowHeadPrefix: "revealSeedRowHead", cell: seedWordCell("divRevealSeed"), bodyTabIndex: "4" }),
                                ]),
                            ]),
                        ]),
                        el("div", { class: "copy-container", role: "button", style: "float:left;", id: "divCopyRevealSeed", tabindex: "5", onclick: () => { void copyRevealSeed(); } }),
                    ]),
                ]),
            ]),
        ]),
    ]);
}

function buildBackupSpecificWalletScreen(): HTMLElement {
    return el("div", { class: "content", id: "backupSpecificWalletScreen", style: "display: none;" }, [
        el("div", { class: "center-content" }, [
            el("div", { class: "center-content-rounded-container", style: "max-width: 650px;" }, [
                el("div", { class: "back-container", role: "button", tabindex: "4", onclick: () => { void showWalletListScreen(); } }),
                el("div", { class: "roundex-box-middle scrollbar", style: "padding-top: 15px;padding-bottom: 15px;overflow-y: auto;overflow-x: auto;" }, [
                    el("div", { class: "heading bold large", "data-lang-key": "backup-wallet" }, ["Backup Wallet2"]),
                    el("div", { class: "divider" }),
                    el("div", { class: "heading medium", id: "divSpecificBackupAddress", style: "font-size:12px;" }),
                    el("div", { class: "divider" }),
                    el("div", { class: "heading large" }, [
                        el("p", { "data-lang-key": "backup-wallet-info-1" }, ["For additional safety, please make sure that you keep backup copies in atleast three different devices offline."]),
                        el("p", { "data-lang-key": "backup-wallet-info-2" }, ["And remember you need the password to restore the backup!"]),
                    ]),
                    el("div", { class: "divider" }),
                    el("div", { class: "input_container" }, [
                        el("div", { class: "heading medium", "data-lang-key": "enter-wallet-password" }, ["Enter your wallet password"]),
                        el("div", { style: "width:100%;display:flex;align-items:center;" }, [
                            el("div", { style: "width: 80%;" }, [
                                el("input", {
                                    class: "tab-name qs-input-strong",
                                    type: "password", autocomplete: "off", id: "pwdBackupSpecificWallet", name: "password",
                                    placeholder: "Enter the password", "data-placeholder-key": "password", tabindex: "1",
                                }),
                            ]),
                            el("div", {}, [
                                el("img", {
                                    src: "assets/svg/eye-outline.svg", alt: "Show Password", "data-alt-key": "show-password", class: "qs-eye",
                                    role: "button", tabindex: "2",
                                    onclick: (event: Event) => togglePasswordBox(event.currentTarget as HTMLElement, "pwdBackupSpecificWallet"),
                                }),
                            ]),
                        ]),
                        el("div", { class: "divider" }),
                    ]),
                    el("div", { style: "display: flex; justify-content: flex-end;" }, [
                        el("div", { id: "nextButtonSpecificWalletScreen", class: "large_button_container heading large", "data-lang-key": "backup", role: "button", tabindex: "3", onclick: () => backupSpecificWallet() }, ["Backup"]),
                    ]),
                ]),
            ]),
        ]),
    ]);
}

export const walletsScreenModules: ScreenModule[] = [
    { parentId: "wallets-content", build: buildWalletsScreen },
    { parentId: "wallets-content", build: buildRevealSeedScreen },
    { parentId: "wallets-content", build: buildBackupSpecificWalletScreen },
];
