// Transactions screen, extracted 1:1 from the legacy fixture. The four hidden
// rows inside #tbodyComplextedTransactions are the row templates captured at
// startup by initApp() (completed/failed x in/out); clones get their real
// click handlers attached in app.ts when the table is filled, so the
// placeholder rows themselves carry no listeners.
import { el, ElChild } from "../ui/dom";
import type { ScreenModule } from "../ui/screens";
import { showNextTxnPage, showPrevTxnPage, showTransactionsScreen, showWalletScreen, toggleTransactionStatus } from "../app/app";

function txnTableHead(): HTMLElement {
    return el("thead", {}, [
        el("tr", {}, [
            el("th", { "data-lang-key": "inout" }, ["In/Out"]),
            el("th", { "data-lang-key": "coins" }, ["Coins"]),
            el("th", { "data-lang-key": "date" }, ["Date"]),
            el("th", { "data-lang-key": "from" }, ["From"]),
            el("th", { "data-lang-key": "to" }, ["To"]),
            el("th", { "data-lang-key": "hash" }, ["Hash"]),
        ]),
    ]);
}

// Template row (legacy [VALUE]/[DATE]/... placeholders). `failed` adds the
// alert icon before the direction arrow.
function txnTemplateRow(rowClass: string, direction: "in" | "out", failed: boolean): HTMLElement {
    const arrowSrc = direction === "in" ? "assets/svg/arrow-down-circle-outline.svg" : "assets/svg/arrow-up-circle-outline.svg";
    const iconCell: ElChild[] = [];
    if (failed) {
        iconCell.push(el("img", { src: "assets/svg/alert-outline.svg", alt: "Failed", style: "width: 30px;" }));
    }
    iconCell.push(el("img", { src: arrowSrc, style: "width:30px;" }));
    return el("tr", { class: rowClass }, [
        el("td", {}, iconCell),
        el("td", {}, ["[VALUE]"]),
        el("td", {}, ["[DATE]"]),
        el("td", {}, [el("a", { href: "#" }, ["[SHORT_FROM]"])]),
        el("td", {}, [el("a", { href: "#" }, ["[SHORT_TO]"])]),
        el("td", {}, [el("a", { href: "#" }, ["[SHORT_HASH]"])]),
    ]);
}

function buildTransactionsScreen(): HTMLElement {
    return el("div", { class: "center-content home-content", id: "TransactionsScreen" }, [
        el("div", { class: "center-content-rounded-container", style: "width:95%;max-width: 95%;" }, [
            el("div", { style: "display: flex; margin-bottom: 5px;" }, [
                el("div", { class: "back-container", role: "button", style: "float: left;", tabindex: "320", onclick: () => { void showWalletScreen(); } }),
                el("div", { class: "refresh-container", role: "button", id: "divTxnRefreshStatus", tabindex: "321", onclick: () => { void showTransactionsScreen(true); } }),
                el("div", { style: "float: left; width: 30px; height: 30px; ", id: "divTxnLoadingStatus" }, [
                    el("img", { src: "assets/icons/loading.gif", style: "width:30px;height:30px" }),
                ]),
            ]),
            el("div", { class: "roundex-box", style: "padding-top: 15px; padding-bottom: 15px;" }, [
                el("div", { class: "top_toggle" }, [
                    el("div", { id: "toggle_trans_status_1", class: "top_toggle_frame", style: "cursor: pointer;", role: "button", tabindex: "322", onclick: () => toggleTransactionStatus(0) }, [
                        el("div", { class: "top_toggle_btn", "data-lang-key": "completed-transactions" }, ["Completed Transactions"]),
                        el("div", { class: "top_toggle_btn_line" }),
                    ]),
                    el("div", { id: "toggle_trans_status_2", class: "top_toggle_frame disabled", style: "cursor: pointer;", role: "button", tabindex: "323", onclick: () => toggleTransactionStatus(1) }, [
                        el("div", { class: "top_toggle_btn disabled", "data-lang-key": "pending-transactions" }, ["Pending Transactions"]),
                        el("div", { class: "top_toggle_btn_line disabled" }),
                    ]),
                ]),
                el("div", { class: "blocks-content scrollbar", style: "text-align: left; overflow: auto ;", id: "divCompleted" }, [
                    el("table", { class: "styled-table" }, [
                        txnTableHead(),
                        el("tbody", { id: "tbodyComplextedTransactions" }, [
                            txnTemplateRow("completed-txn-in-row", "in", false),
                            txnTemplateRow("completed-txn-out-row", "out", false),
                            txnTemplateRow("failed-txn-in-row", "in", true),
                            txnTemplateRow("failed-txn-out-row", "out", true),
                        ]),
                    ]),
                ]),
                el("div", { class: "blocks-content scrollbar disabledhide", style: "text-align: left; overflow: auto ;", id: "divPending" }, [
                    el("table", { class: "styled-table" }, [
                        txnTableHead(),
                        el("tbody", { id: "tbodyPendingTransactions" }),
                    ]),
                ]),
                el("div", { class: "pagination-container", style: "width: 30%;margin: auto;" }, [
                    el("div", { class: "prev-container", id: "divPrevTxnList", role: "button", tabindex: "720", onclick: () => { void showPrevTxnPage(); } }),
                    el("div", { class: "next-container ", id: "divNextTxnList", role: "button", tabindex: "721", onclick: () => { void showNextTxnPage(); } }),
                ]),
            ]),
        ]),
    ]);
}

export const transactionsScreenModule: ScreenModule = { parentId: "divMainContent", build: buildTransactionsScreen };
