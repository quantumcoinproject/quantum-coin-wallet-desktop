/*
Built-in TypeScript autocomplete dropdown for contenteditable divs.
Behavioral port of the previously vendored AutoCompleteDropdownControl
(lib/autocomplete/autocomplete.js) with the same public surface used by the
app: limitToList, optionValues, initialize(), reset(), setSelectedValue(),
value. Rendering uses DOM nodes instead of innerHTML.
The companion stylesheet (acd-choices / acd-choice classes) is unchanged.
*/

export class AutoCompleteDropdownControl {
    private elSel: HTMLElement;
    private selectedValue = "";
    private choicesArray: string[] = [];
    private restrictEntryToOptionValues = true;
    private minChars = 1;
    private offsetLeft = 0;
    private offsetTop = 1;
    private onSelectCallback: () => void = () => { };
    private divChoices: HTMLDivElement;
    private choicesMaxHeight = 0;
    private choiceHeight = 0;

    constructor(elSelectorControl: HTMLElement) {
        this.elSel = elSelectorControl;

        this.divChoices = document.createElement("div");
        this.divChoices.className = "acd-choices";
        document.body.appendChild(this.divChoices);

        // The original used a MutationObserver (characterData) to catch typing and
        // pasting inside the editable div; keep that model for identical behavior.
        const mutationObserverConfig: MutationObserverInit = { subtree: true, characterData: true, characterDataOldValue: true };
        const observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === "characterData" && mutation.target.ownerDocument?.activeElement != null) {
                    const selText = (mutation.target.ownerDocument.activeElement as HTMLElement).textContent || "";
                    this.onSelChange(selText);
                }
            }
        });
        observer.observe(this.elSel, mutationObserverConfig);

        window.addEventListener("resize", () => { this.drawOptionsContainer(); });
        this.elSel.addEventListener("focus", () => { this.positionCursorAtEndOfEntryText(); }, false);
        this.elSel.addEventListener("blur", () => { this.processFocusOut(); }, false);
        this.elSel.addEventListener("keydown", (event) => { this.keydownHandler(event); }, false);
        this.divChoices.addEventListener("mouseup", (event) => { this.onMouseUp(event); }, false);
        this.divChoices.addEventListener("mouseover", (event) => { this.onMouseOver(event); }, false);
        this.createPasteHandler();
    }

    set optionValues(arrayOfOptionsValues: string[]) {
        this.clearChoicesDom();
        this.elSel.textContent = "";
        this.choicesArray = arrayOfOptionsValues;
        this.minChars = arrayOfOptionsValues.length > 500 ? 1 : 0;
        this.onSelChange("");
    }

    get limitToList(): boolean {
        return this.restrictEntryToOptionValues;
    }

    set limitToList(areChoicesLimited: boolean) {
        this.restrictEntryToOptionValues = areChoicesLimited ? true : false;
    }

    set onSelect(onSelectCallbackFx: () => void) {
        this.onSelectCallback = onSelectCallbackFx;
    }

    set dropdownOffsetTop(intOffset: number) {
        this.offsetTop = parseInt(String(intOffset)) || 1;
    }

    set dropdownOffsetLeft(intOffset: number) {
        this.offsetLeft = parseInt(String(intOffset)) || 0;
    }

    get value(): string {
        return this.selectedValue;
    }

    setSelectedValue(newValue: string): void {
        if (this.selectedValue !== newValue) {
            this.selectedValue = newValue;
            this.onSelectCallback();
        }
    }

    initialize(): void {
        this.onSelChange("");
        this.drawOptionsContainer();
    }

    private clearChoicesDom(): void {
        while (this.divChoices.firstChild) {
            this.divChoices.removeChild(this.divChoices.firstChild);
        }
    }

    private onSelChange(newText: string): void {
        this.clearChoicesDom();

        const entryLen = newText.length;
        if (entryLen < this.minChars) return;
        newText = newText.toUpperCase();

        for (const choice of this.choicesArray) {
            const choiceText = choice.toUpperCase();
            const choiceBeginChars = choiceText.substring(0, entryLen);

            if (choiceBeginChars === newText || entryLen === 0) {
                const aChoiceDiv = document.createElement("div");
                aChoiceDiv.className = choiceText === newText ? "acd-choice selected" : "acd-choice";
                aChoiceDiv.setAttribute("data-val", choiceText);
                // Highlight the matched prefix (was `<b>${matched}</b>${rest}` via innerHTML).
                const bold = document.createElement("b");
                bold.textContent = newText;
                aChoiceDiv.appendChild(bold);
                aChoiceDiv.appendChild(document.createTextNode(choiceText.substring(entryLen)));
                this.divChoices.appendChild(aChoiceDiv);
            }
        }

        this.drawOptionsContainer();
    }

    private keydownHandler(e: KeyboardEvent): void {
        const divChoices = this.divChoices;
        const key = e.keyCode;
        let elMoveTo: Element | null = null;
        const divSelected = divChoices.querySelector(".acd-choice.selected");

        divChoices.style.display = "block";
        switch (key) {
            //Arrow keys: down (40), up (38)
            case 38:
            case 40: {
                if (!divChoices.hasChildNodes()) return;
                e.preventDefault();

                if (!divSelected) {
                    elMoveTo = divChoices.firstElementChild;
                } else {
                    elMoveTo = key === 40
                        ? (divChoices.lastElementChild === divSelected ? divSelected : divSelected.nextElementSibling)
                        : (divChoices.firstElementChild === divSelected ? divSelected : divSelected.previousElementSibling);
                    divSelected.className = divSelected.className.split(" selected").join("");
                }

                if (elMoveTo) {
                    elMoveTo.className += " selected";
                }

                divChoices.style.display = "block";
                if (!this.choicesMaxHeight) {
                    this.choicesMaxHeight = parseInt(getComputedStyle(divChoices, null).maxHeight);
                }
                if (!this.choiceHeight) {
                    const firstChoice = divChoices.querySelector(".acd-choice") as HTMLElement | null;
                    this.choiceHeight = firstChoice ? firstChoice.offsetHeight : 0;
                }

                if (this.choiceHeight) {
                    if (!elMoveTo) {
                        divChoices.scrollTop = 0;
                    } else {
                        const scrTop = divChoices.scrollTop;
                        const selTop = elMoveTo.getBoundingClientRect().top - divChoices.getBoundingClientRect().top;
                        if (selTop + this.choiceHeight - this.choicesMaxHeight > 0) {
                            divChoices.scrollTop = selTop + this.choiceHeight + scrTop - this.choicesMaxHeight;
                        } else if (selTop < 0) {
                            divChoices.scrollTop = selTop + scrTop;
                        }
                    }
                }

                if (elMoveTo) {
                    this.setSelectedValue((elMoveTo as HTMLElement).innerText);
                }
                break;
            }
            //ESC-key: hide the open choices-dropdown-div, set text, move cursor
            case 27:
                divChoices.style.display = "none";
                this.elSel.innerText = this.selectedValue;
                this.positionCursorAtEndOfEntryText();
                this.onSelectCallback();
                break;
            //Enter
            case 13:
                this.processSelectionAction(13);
                e.preventDefault();
                break;
            //Tab
            case 9:
                this.processSelectionAction(9);
                break;
        }
        this.drawOptionsContainer();
    }

    private createPasteHandler(): void {
        this.elSel.addEventListener("paste", (e: ClipboardEvent) => {
            e.preventDefault();
            let pasted = "";
            if (e.clipboardData) {
                pasted = e.clipboardData.getData("text/plain");
            }
            pasted = pasted.trimStart();
            pasted = pasted.split("\n").join(""); //remove line breaks
            pasted = pasted.replace(/[^\x20-\xFF]/gi, ""); //remove non-UTF-8 chars

            // Insert as plain text at the caret, replacing any selection
            // (equivalent to the original document.execCommand('insertText') path).
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                const textNode = document.createTextNode(pasted);
                range.insertNode(textNode);
                range.setStartAfter(textNode);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            } else {
                this.elSel.textContent = (this.elSel.textContent || "") + pasted;
            }
            this.onSelChange(this.elSel.textContent || "");
        });
    }

    private drawOptionsContainer(): void {
        const divChoices = this.divChoices;
        const rect = this.elSel.getBoundingClientRect();

        divChoices.style.left = Math.round(rect.left + (window.pageXOffset || document.documentElement.scrollLeft) + this.offsetLeft) + "px";
        divChoices.style.top = Math.round(rect.bottom + (window.pageYOffset || document.documentElement.scrollTop) + this.offsetTop) + "px";
        divChoices.style.width = Math.round(rect.right - rect.left) + "px";
    }

    private onMouseOver(e: MouseEvent): void {
        const divChoices = this.divChoices;
        if (!divChoices.hasChildNodes()) return;

        const divSelected = divChoices.querySelector(".acd-choice.selected");
        if (divSelected) divSelected.className = divSelected.className.split(" selected").join("");

        const elMoveTo = e.target as HTMLElement;
        elMoveTo.className += " selected";
    }

    private onMouseUp(e: MouseEvent): void {
        if (e.target !== this.divChoices) {
            this.processSelectionAction(13);
        }
    }

    private processFocusOut(): void {
        if (this.divChoices.style.display !== "none") {
            this.processSelectionAction(9);
        }
    }

    reset(): void {
        const divChoices = this.divChoices;
        const divSelected = divChoices.querySelector(".acd-choice.selected");
        if (divSelected) {
            divSelected.setAttribute("data-val", "");
        }
        if (divChoices.firstElementChild) {
            divChoices.firstElementChild.setAttribute("data-val", "");
        }
    }

    private processSelectionAction(key: number): void {
        const divChoices = this.divChoices;
        this.divChoices.style.display = "none";

        const divSelected = divChoices.querySelector(".acd-choice.selected");
        let currentSelValue = "";

        if (divSelected) {
            currentSelValue = divSelected.getAttribute("data-val") || "";
        } else {
            if (this.restrictEntryToOptionValues) {
                if (divChoices.firstElementChild) {
                    currentSelValue = divChoices.firstElementChild.getAttribute("data-val") || "";
                } else {
                    //Choose closest alphabetically in list of choices when possible
                    if (key != 9) {
                        currentSelValue = this.choicesArray.length !== 0
                            ? this.choicesArray.reduce((prev, curr) => (prev < this.elSel.innerText ? curr : prev))
                            : "";
                    }
                }
            } else {
                currentSelValue = this.elSel.innerText;
            }
        }

        this.elSel.innerText = currentSelValue;
        this.setSelectedValue(currentSelValue);

        //If Enter-key, remain in div and set the cursor-position immediately after chosen value
        if (key === 13) {
            this.positionCursorAtEndOfEntryText();
        }
    }

    private positionCursorAtEndOfEntryText(): void {
        if (this.elSel.firstChild) {
            const range = document.createRange();
            range.setStart(this.elSel.firstChild, this.selectedValue.length);
            range.collapse(true);

            const winSel = window.getSelection();
            if (winSel) {
                winSel.removeAllRanges();
                winSel.addRange(range);
            }
        }
    }
}
