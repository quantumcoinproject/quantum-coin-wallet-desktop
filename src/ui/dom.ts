// Tiny typed DOM builder used to construct the UI programmatically.
// Hand-written screen modules keep the legacy ids, classes and inline styles
// so styles.css and the theme CSS apply unchanged.
import { langJson } from "../lib/i18n";

export type ElChild = Node | string | null | undefined;

export type ElAttrs = Record<string, string | number | boolean | EventListener>;

const PROPERTY_KEYS = new Set(["value", "checked", "disabled", "readOnly", "selected", "indeterminate"]);

export function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs: ElAttrs = {},
    children: ElChild[] = [],
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    for (const key of Object.keys(attrs)) {
        const value = attrs[key];
        if (typeof value === "function") {
            // "onclick" -> "click"
            node.addEventListener(key.replace(/^on/, ""), value);
        } else if (PROPERTY_KEYS.has(key)) {
            (node as unknown as Record<string, unknown>)[key] = value;
        } else if (typeof value === "boolean") {
            if (value) node.setAttribute(key, "");
        } else {
            node.setAttribute(key, String(value));
        }
    }
    appendChildren(node, children);
    return node;
}

export function appendChildren(node: Node, children: ElChild[]): void {
    for (const child of children) {
        if (child == null) continue;
        if (typeof child === "string") {
            node.appendChild(document.createTextNode(child));
        } else {
            node.appendChild(child);
        }
    }
}

export function text(value: string): Text {
    return document.createTextNode(value);
}

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

// i18n at render time for dynamically (re)built DOM. Static markup mounted at
// bootstrap should keep using data-lang-key & co. (initApp()'s localization
// pass covers it); this is for text created after langJson is loaded, such as
// table rows and lazily rebuilt panels.
export function t(key: string): string {
    const value = langJson?.langValues?.[key];
    return value == null ? key : value;
}
