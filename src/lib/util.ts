export function isNetworkError(error: { message: string }) {
    const err = error.message.toLowerCase();
    return (err.includes("failed to fetch") || err.includes("timeout") || err.includes("network request failed"));
}

export function isLargeNumber(val: string) {
    const rgx = /^([0-9]+([.][0-9]*)?|[.][0-9]+)$/;
    return Boolean(val.match(rgx));
}

export function isValidDate(dateStr: string) {
    return !isNaN(new Date(dateStr) as any);
}

export function isHex(num: string) {
    return Boolean(num.match(/^0x[0-9a-f]+$/i))
}

export function htmlEncode(rawStr: string) {
    return rawStr.replace(/[\u00A0-\u9999<>&]/g, i => '&#' + i.charCodeAt(0) + ';')
}

// True when the string contains characters that can spoof or corrupt display:
// U+202A-U+202E: LRE/RLE/PDF/LRO/RLO bidi embedding+override
// U+2066-U+2069: LRI/RLI/FSI/PDI bidi isolates
// U+200B-U+200D: zero-width space/non-joiner/joiner
// U+2060: word joiner; U+FEFF: zero-width no-break space (BOM)
// U+0000-U+001F (minus \t \n \r): C0 controls; U+007F-U+009F: DEL + C1 controls
export function containsUnsafeDisplayText(str: unknown): boolean {
    if (str == null) return false;
    const s = String(str);
    // eslint-disable-next-line no-control-regex -- detecting control characters is the point
    return /[\u202A-\u202E\u2066-\u2069\u200B-\u200D\u2060\uFEFF\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(s);
}
