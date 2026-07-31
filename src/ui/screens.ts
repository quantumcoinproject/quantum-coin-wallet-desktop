// Mounting layer for the hand-written screen/dialog modules that make up the
// whole UI (formerly generated from the legacy index.html fixture).
//
// - Modules are mounted eagerly at bootstrap. Eager (not lazy) mounting is
//   load-bearing: initApp() captures row templates and runs the
//   data-lang-key/data-placeholder-key/data-alt-key localization passes over
//   the whole document at startup, so every element must exist in the DOM
//   before initApp() runs.
// - Modules keep their legacy element ids, so the existing show-functions
//   (byId(...).style.display = ...) keep controlling visibility unchanged.
export interface ScreenModule {
    // Id of the legacy container to mount into (e.g. "main-content"), or null
    // for top-level nodes such as <dialog> modals.
    parentId: string | null;
    build(): HTMLElement;
}

export function mountScreenModules(modules: ReadonlyArray<ScreenModule>): void {
    for (const mod of modules) {
        const parent = mod.parentId == null ? document.body : document.getElementById(mod.parentId);
        if (parent == null) {
            throw new Error("Screen module parent not found: " + mod.parentId);
        }
        parent.appendChild(mod.build());
    }
}
