/**
 * Build public/assets/icons/loading.gif - the app's please-wait spinner.
 *
 * A lit trace runs the border of a rounded square around the Quantum Coin
 * mark: a cyan head pulling a violet tail along a soft grey track. The mark
 * comes from build/icon-src (see build-icons.js), so the loader and the app
 * icon can never drift apart.
 *
 * The canvas is opaque white because that is the ground the loader always
 * sits on - the please-wait dialog and the white cards behind the 30px
 * inline spinners. Opaque also sidesteps GIF's 1-bit alpha, which would
 * fringe the mark's antialiased edge.
 *
 * Frames after the first are written as partial frames: only the pixels that
 * changed since the previous frame, positioned with an x/y offset and left in
 * place (dispose 1). The coin is identical in every frame, so this drops the
 * file roughly tenfold against writing 40 full frames. The loop is safe
 * because frame 0 is full and repaints the whole canvas on every repeat.
 *
 * sharp is intentionally not in package.json - see build-icons.js. Run with:
 *     npm install --no-save sharp gifenc
 *     npm run build-loader
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { GIFEncoder, quantize, applyPalette } = require("gifenc");

const ROOT = path.join(__dirname, "..");
const COIN_PATH = path.join(ROOT, "build", "icon-src", "quantum-coin-256.png");
const OUT_PATH = path.join(ROOT, "public", "assets", "icons", "loading.gif");

const SIZE = 200;
const FRAMES = 40;
const DELAY = 45;
const COIN_PX = 108;

const CYAN = "#12B5E5";
const VIOLET = "#7C3BFF";
const TRACK = "#E9E7F6";
const BACKGROUND = "#ffffff";

// Rounded-square track the trace runs along.
const INSET = 9;
const SIDE = SIZE - INSET * 2;
const RADIUS = 32;
const TRACK_PATH = `M${INSET + RADIUS},${INSET} h${SIDE - 2 * RADIUS} a${RADIUS},${RADIUS} 0 0 1 ${RADIUS},${RADIUS}`
    + ` v${SIDE - 2 * RADIUS} a${RADIUS},${RADIUS} 0 0 1 -${RADIUS},${RADIUS} h-${SIDE - 2 * RADIUS}`
    + ` a${RADIUS},${RADIUS} 0 0 1 -${RADIUS},-${RADIUS} v-${SIDE - 2 * RADIUS} a${RADIUS},${RADIUS} 0 0 1 ${RADIUS},-${RADIUS} z`;
const PERIMETER = 2 * (SIDE - 2 * RADIUS) * 2 + 2 * Math.PI * RADIUS;

// The comet is a run of short dashes chasing the head, each one thinner and
// fainter than the last, which reads as a tail without needing a blur filter.
const TAIL_DASHES = 14;
const DASH = 7;

function overlaySvg(t) {
    let tail = "";
    for (let k = TAIL_DASHES - 1; k >= 0; k--) {
        const offset = PERIMETER * t - k * DASH * 0.92;
        const fade = 1 - k / TAIL_DASHES;
        tail += `<path d="${TRACK_PATH}" fill="none" stroke="${k < 4 ? CYAN : VIOLET}"`
            + ` stroke-width="${(2.5 + 3 * fade).toFixed(2)}" stroke-linecap="round"`
            + ` stroke-dasharray="${DASH} ${PERIMETER.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"`
            + ` opacity="${(0.12 + 0.88 * fade * fade).toFixed(3)}"/>`;
    }
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">`
        + `<path d="${TRACK_PATH}" fill="none" stroke="${TRACK}" stroke-width="4"/>${tail}</svg>`,
    );
}

/** Bounding box of the pixels that differ between two RGBA buffers. */
function changedBounds(previous, current) {
    let minX = SIZE, minY = SIZE, maxX = -1, maxY = -1;
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const i = (y * SIZE + x) * 4;
            if (previous[i] !== current[i] || previous[i + 1] !== current[i + 1] || previous[i + 2] !== current[i + 2]) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * gifenc always writes an image descriptor positioned at 0,0 - it has no
 * option for a frame offset - so a partial frame would be painted into the
 * corner instead of where it belongs. Walk the encoded stream and write each
 * frame's real position into the two 16-bit LE fields at the head of its
 * image descriptor. Block walking follows the GIF89a grammar: extensions and
 * image data are both runs of length-prefixed sub-blocks ended by a zero.
 * @see https://www.w3.org/Graphics/GIF/spec-gif89a.txt (sections 20, 23-26)
 */
function patchFrameOffsets(buffer, boxes) {
    const skipSubBlocks = (at) => {
        let size = buffer[at];
        at += 1;
        while (size !== 0) {
            at += size;
            size = buffer[at];
            at += 1;
        }
        return at;
    };

    const globalTable = (buffer[10] & 0x80) ? 3 * (2 << (buffer[10] & 7)) : 0;
    let at = 13 + globalTable;
    let frame = 0;
    while (at < buffer.length) {
        const block = buffer[at];
        if (block === 0x3b) break; // trailer
        if (block === 0x21) { // extension: label, then sub-blocks
            at = skipSubBlocks(at + 2);
        } else if (block === 0x2c) { // image descriptor
            const box = boxes[frame];
            if (box == null) throw new Error(`more frames encoded than boxes (${frame})`);
            buffer.writeUInt16LE(box.x, at + 1);
            buffer.writeUInt16LE(box.y, at + 3);
            if (buffer.readUInt16LE(at + 5) !== box.width || buffer.readUInt16LE(at + 7) !== box.height) {
                throw new Error(`frame ${frame} size mismatch: descriptor says `
                    + `${buffer.readUInt16LE(at + 5)}x${buffer.readUInt16LE(at + 7)}, expected ${box.width}x${box.height}`);
            }
            const localTable = (buffer[at + 9] & 0x80) ? 3 * (2 << (buffer[at + 9] & 7)) : 0;
            at = skipSubBlocks(at + 10 + localTable + 1); // + LZW minimum code size
            frame++;
        } else {
            throw new Error(`unexpected block 0x${block.toString(16)} at ${at}`);
        }
    }
    if (frame !== boxes.length) throw new Error(`patched ${frame} frames, expected ${boxes.length}`);
    return buffer;
}

function crop(frame, box) {
    const out = new Uint8Array(box.width * box.height * 4);
    for (let y = 0; y < box.height; y++) {
        const from = ((box.y + y) * SIZE + box.x) * 4;
        out.set(frame.subarray(from, from + box.width * 4), y * box.width * 4);
    }
    return out;
}

async function main() {
    const coin = await sharp(COIN_PATH).resize(COIN_PX, COIN_PX).png().toBuffer();
    const coinAt = Math.round((SIZE - COIN_PX) / 2);

    const frames = [];
    for (let i = 0; i < FRAMES; i++) {
        const overlay = await sharp(overlaySvg(i / FRAMES)).png().toBuffer();
        const raw = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: BACKGROUND } })
            .composite([{ input: overlay, left: 0, top: 0 }, { input: coin, left: coinAt, top: coinAt }])
            .raw()
            .toBuffer();
        frames.push(new Uint8Array(raw));
    }

    // One palette for the whole loop, sampled across it so no frame's colours
    // are missing from it.
    const samples = [0, 0.25, 0.5, 0.75].map((p) => frames[Math.floor(p * FRAMES)]);
    const merged = new Uint8Array(samples.reduce((n, s) => n + s.length, 0));
    let at = 0;
    for (const s of samples) { merged.set(s, at); at += s.length; }
    const palette = quantize(merged, 256, { format: "rgb565" });

    const gif = GIFEncoder();
    const boxes = [{ x: 0, y: 0, width: SIZE, height: SIZE }];
    gif.writeFrame(applyPalette(frames[0], palette, "rgb565"), SIZE, SIZE, { palette, delay: DELAY });
    for (let i = 1; i < FRAMES; i++) {
        const box = changedBounds(frames[i - 1], frames[i]) || { x: 0, y: 0, width: SIZE, height: SIZE };
        boxes.push(box);
        gif.writeFrame(applyPalette(crop(frames[i], box), palette, "rgb565"), box.width, box.height, {
            palette, delay: DELAY, dispose: 1,
        });
    }
    gif.finish();

    const partial = boxes.filter((b) => b.width < SIZE || b.height < SIZE).length;
    const buffer = patchFrameOffsets(Buffer.from(gif.bytes()), boxes);
    fs.writeFileSync(OUT_PATH, buffer);
    console.log(`loading.gif  ${SIZE}x${SIZE}  ${FRAMES} frames (${partial} partial)  ${DELAY}ms`
        + `  ${(buffer.length / 1024).toFixed(0)}KB  loop ${(FRAMES * DELAY / 1000).toFixed(2)}s`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
