// Shared builder for the 12x4 seed-word tables (new seed, verify seed,
// restore seed, reveal seed). Recreates the legacy .divSeedTable structure:
// row i is a div.seedrowhead{i} with id {rowHeadPrefix}{i}, holding 4
// .seedCell divs labeled A1..L4, each with a caller-provided content cell.
import { el } from "../ui/dom";
import { SEED_FRIENDLY_INDEX_ARRAY } from "../lib/seedwords";

// Cosmetic placeholder words from the legacy markup; always overwritten from
// the real seed before a panel becomes visible.
export const SEED_PLACEHOLDER_WORDS = [
    "HELLOWORLD", "AEROPLANE", "ALRIGHT", "MOTIVATE",
    "BICYCLE", "LOOPWARE", "DINGDONG", "PINGPONG",
    "PINTHAT", "POROTECH", "MYSPIRIN", "OKFINE",
    "NAVY", "ME", "YES", "WITHER",
    "OK", "HIKE", "HELPWIRE", "CHOCOLATE",
    "MILKSWEET", "PIZZA", "SUGAR", "HONEY",
    "PINEAPPLE", "MANGO", "HOSTLY", "PINTBUG",
    "MICROWIN", "MEGABIG", "ALRIGHTY", "WHYNOT",
    "HELLOWORLD", "YOGHURT", "SAUCE", "WHO",
    "WHOM", "HOW", "WHY", "TAKECARE",
    "BLITLINE", "PIGHOPS", "BUNTMECA", "HASTILY",
    "PATIO", "LINTPICK", "NUTCRACK", "QWERTY",
];

export interface SeedTableOptions {
    // Row head id prefix, e.g. "revealSeedRowHead" -> ids revealSeedRowHead1..12.
    rowHeadPrefix: string;
    // Builds the content element beside the A1..L4 label for word index 0..47.
    cell: (wordIndex: number, friendlyLabel: string) => HTMLElement;
    // tabindex of the .divSeedBody wrapper (some legacy tables set one).
    bodyTabIndex?: string;
}

export function seedTable(options: SeedTableOptions): HTMLElement {
    const rows: HTMLElement[] = [];
    for (let row = 1; row <= 12; row++) {
        const cells: HTMLElement[] = [];
        for (let col = 0; col < 4; col++) {
            const wordIndex = (row - 1) * 4 + col;
            const friendlyLabel = SEED_FRIENDLY_INDEX_ARRAY[wordIndex].toUpperCase();
            cells.push(el("div", { class: "seedCell" }, [
                el("div", {}, [friendlyLabel]),
                options.cell(wordIndex, friendlyLabel),
            ]));
        }
        rows.push(el("div", { class: "seedrowhead" + row, id: options.rowHeadPrefix + row }, cells));
    }
    const bodyAttrs: Record<string, string> = {};
    bodyAttrs["class"] = "divSeedBody";
    if (options.bodyTabIndex != null) {
        bodyAttrs["tabindex"] = options.bodyTabIndex;
    }
    return el("div", { class: "divSeedTable" }, [el("div", bodyAttrs, rows)]);
}

// Content cell for display tables (new seed / reveal seed): a word div like
// <div class="seedrow3" id="divRevealSeed10">WORD</div>.
export function seedWordCell(idPrefix: string) {
    return (wordIndex: number): HTMLElement =>
        el("div", { class: "seedrow" + (Math.floor(wordIndex / 4) + 1), id: idPrefix + wordIndex }, [SEED_PLACEHOLDER_WORDS[wordIndex]]);
}

// Content cell for entry tables (verify / restore seed): a contenteditable
// autocomplete box like <div class="seedrowN"><div class="entrybox edit-div" id="txtSeedA1"></div></div>.
export function seedEntryCell(idPrefix: string) {
    return (wordIndex: number, friendlyLabel: string): HTMLElement =>
        el("div", { class: "seedrow" + (Math.floor(wordIndex / 4) + 1) }, [
            el("div", { class: "entrybox edit-div", contenteditable: "true", id: idPrefix + friendlyLabel }),
        ]);
}
