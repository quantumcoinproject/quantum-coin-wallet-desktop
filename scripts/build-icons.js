/**
 * Build the app icon set from build/icon-src/quantum-coin-<size>.png - the
 * Quantum Coin mark as rendered at each size, copied from
 * QuantumCoinProject/docs/assets/img (32, 64, 128, 256, 512, 1024).
 *
 * Every output takes the master rendered at exactly its own size where one
 * exists; the few sizes with no master (16, 24, 48, 96) are reduced from the
 * next size up. Nothing is ever enlarged.
 *
 * Outputs under public/assets/icons (vite copies public/ into dist/renderer,
 * so these ship with the app):
 * - app/dp.png    512  in-app header logo (#imgLogo, src/screens/header.ts)
 * - app/icon.png  512  BrowserWindow icon (electron/main.ts)
 * - app/icon.ico       multi-size, package.json build.win.icon
 * - 128.png 48.png 128.jpg   legacy sizes kept in step with the mark
 *
 * Plus build/icon-trans.icns, which package.json build.mac.icon /
 * build.dmg.icon point at. It stays outside public/ deliberately: everything
 * under public/ is copied verbatim into dist/renderer and ships inside the
 * app, and nothing loads a 2MB ICNS at runtime.
 *
 * The ICO and ICNS containers are assembled here rather than by png2icons,
 * which resamples every entry from one input and so cannot use the per-size
 * masters. Both formats simply wrap PNG payloads; see the writers below.
 *
 * sharp is intentionally not in package.json - this script runs once per
 * rebrand and sharp is a large native dependency. Install it on demand:
 *     npm install --no-save sharp
 *     npm run build-icons
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const SOURCE_DIR = path.join(ROOT, "build", "icon-src");
const ICONS_DIR = path.join(ROOT, "public", "assets", "icons");
const APP_ICONS_DIR = path.join(ICONS_DIR, "app");
const MAC_ICNS_PATH = path.join(ROOT, "build", "icon-trans.icns");

const MASTER_SIZES = [32, 64, 128, 256, 512, 1024];

// Backdrop for the one opaque output (128.jpg). Matches the near-black violet
// the mark was previously composited on.
const JPG_BACKGROUND = { r: 0x0b, g: 0x06, b: 0x14 };

// Palette quantization takes the 512px mark from ~537KB to ~93KB with no
// banding visible in the artwork. Used for the PNGs that ship in the renderer
// bundle; the ICNS keeps full colour since it is a build resource only.
const PNG_OPTIONS = { compressionLevel: 9, palette: true, quality: 90, effort: 10 };

// The chunks that carry the picture itself. Everything else an encoder may
// attach - pHYs pixel density, tIME, text (tEXt/iTXt/zTXt), EXIF, colour
// profiles - is dropped, so every file written here is plain image data and
// nothing else. Applied to the standalone PNGs and to the payloads embedded
// in the ICO and ICNS, which are PNGs too.
const PNG_KEEP = new Set(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);

function plainPng(buffer) {
  const kept = [buffer.subarray(0, 8)]; // signature
  let at = 8;
  while (at + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(at);
    const type = buffer.toString("ascii", at + 4, at + 8);
    const end = at + 12 + length; // length + type + data + CRC
    if (PNG_KEEP.has(type)) kept.push(buffer.subarray(at, end));
    at = end;
    if (type === "IEND") break;
  }
  return Buffer.concat(kept);
}

const masters = new Map();

function loadMasters() {
  for (const size of MASTER_SIZES) {
    masters.set(size, fs.readFileSync(path.join(SOURCE_DIR, `quantum-coin-${size}.png`)));
  }
}

/**
 * PNG for `size`, from the master of that exact size when one exists, else
 * reduced from the smallest master larger than it. Never enlarges.
 */
async function pngAt(size, options = PNG_OPTIONS) {
  if (masters.has(size)) {
    // Still re-encoded, then stripped: applies PNG_OPTIONS and leaves nothing
    // but image data, whatever the source file carried.
    return { buffer: plainPng(await sharp(masters.get(size)).png(options).toBuffer()), from: size };
  }
  const from = MASTER_SIZES.find((s) => s > size);
  if (!from) throw new Error(`no master at or above ${size}px`);
  const buffer = await sharp(masters.get(from))
    .resize(size, size, { kernel: "lanczos3" })
    .png(options)
    .toBuffer();
  return { buffer: plainPng(buffer), from };
}

function label(size, from) {
  return from === size ? `master ${size}` : `${from} -> ${size}`;
}

/**
 * Windows ICO. Header, then one 16-byte directory entry per image, then the
 * PNG payloads. A width/height byte of 0 means 256.
 * @see https://en.wikipedia.org/wiki/ICO_(file_format)
 */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(images.length * 16);
  let offset = header.length + directory.length;
  images.forEach((image, i) => {
    const at = i * 16;
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, at + 0);
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, at + 1);
    directory.writeUInt8(0, at + 2); // palette size (0 = truecolour)
    directory.writeUInt8(0, at + 3); // reserved
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(image.buffer.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += image.buffer.length;
  });

  return Buffer.concat([header, directory, ...images.map((i) => i.buffer)]);
}

// Pixel size -> the OSTypes that carry it, matching what iconutil emits.
// icp4/5/6 are the 1x entries; ic11..ic14 are the @2x variants of 16/32/128/256.
const ICNS_TYPES = {
  16: ["icp4"],
  32: ["icp5", "ic11"],
  64: ["icp6", "ic12"],
  128: ["ic07"],
  256: ["ic08", "ic13"],
  512: ["ic09", "ic14"],
  1024: ["ic10"],
};

/** macOS ICNS: "icns", total length, then OSType + length + PNG per chunk. */
function buildIcns(images) {
  const chunks = [];
  for (const image of images) {
    for (const osType of ICNS_TYPES[image.size]) {
      const head = Buffer.alloc(8);
      head.write(osType, 0, 4, "ascii");
      head.writeUInt32BE(8 + image.buffer.length, 4);
      chunks.push(head, image.buffer);
    }
  }
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(8);
  head.write("icns", 0, 4, "ascii");
  head.writeUInt32BE(8 + body.length, 4);
  return Buffer.concat([head, body]);
}

async function main() {
  loadMasters();
  console.log(`Building icons from build/icon-src (masters: ${MASTER_SIZES.join(", ")})\n`);

  console.log("1) Transparent PNGs");
  for (const [file, size] of Object.entries({
    "app/dp.png": 512,
    "app/icon.png": 512,
    "128.png": 128,
    "48.png": 48,
  })) {
    const { buffer, from } = await pngAt(size);
    fs.writeFileSync(path.join(ICONS_DIR, file), buffer);
    console.log("   ", file.padEnd(14), String(size).padEnd(5), label(size, from));
  }

  console.log("\n2) Opaque JPG");
  const jpg = await sharp(masters.get(128))
    .flatten({ background: JPG_BACKGROUND })
    .jpeg({ quality: 90 })
    .toBuffer();
  fs.writeFileSync(path.join(ICONS_DIR, "128.jpg"), jpg);
  console.log("    128.jpg        128   master 128");

  console.log("\n3) Windows ICO");
  const icoSizes = [16, 24, 32, 48, 64, 96, 128, 256];
  const icoImages = [];
  for (const size of icoSizes) {
    const { buffer, from } = await pngAt(size);
    icoImages.push({ size, buffer });
    console.log("    ", String(size).padEnd(5), label(size, from));
  }
  fs.writeFileSync(path.join(APP_ICONS_DIR, "icon.ico"), buildIco(icoImages));
  console.log("    app/icon.ico");

  console.log("\n4) macOS ICNS");
  const icnsImages = [];
  for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
    // Full colour: this file is a build resource, not part of the bundle.
    const { buffer, from } = await pngAt(size, { compressionLevel: 9 });
    icnsImages.push({ size, buffer });
    console.log("    ", String(size).padEnd(5), ICNS_TYPES[size].join(" "), " ", label(size, from));
  }
  fs.writeFileSync(MAC_ICNS_PATH, buildIcns(icnsImages));
  console.log("    build/icon-trans.icns (build.mac.icon / build.dmg.icon)");

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
