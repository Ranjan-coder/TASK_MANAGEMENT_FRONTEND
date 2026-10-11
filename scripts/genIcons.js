/**
 * Generates every app icon from the one Serenx logo (public/icons/serenxtech.png,
 * 1024×1024, transparent rounded corners). The logo is the product's and is the
 * same for every organisation and every person; branding never changes it.
 *
 *   node scripts/genIcons.js
 */
const path = require("path");
const sharp = require("sharp");

const DIR = path.join(__dirname, "../public/icons");
const SRC = path.join(DIR, "serenxtech.png");
const TEAL = { r: 14, g: 143, b: 143, alpha: 1 }; // the logo's background colour

const out = (name) => path.join(DIR, name);
const png = (img) => img.png({ compressionLevel: 9 });

/** The logo at a size, keeping its transparent rounded corners. */
const plain = (size, name) => png(sharp(SRC).resize(size, size)).toFile(out(name));

/** On a full teal square: iOS and maskable icons are cropped by the system. */
const onTeal = async (size, logoSize, name) => {
  const logo = await sharp(SRC).resize(logoSize, logoSize).toBuffer();
  return png(sharp({ create: { width: size, height: size, channels: 4, background: TEAL } }).composite([{ input: logo, gravity: "center" }])).toFile(out(name));
};

/**
 * Android notification badge: the system shows only its shape (alpha), in one
 * colour. The mark (white loops and gold star) becomes solid; the teal disappears.
 */
const badge = async (size, name) => {
  // Shape found at full size, then scaled (scaling first blends the edges into a faint outline)
  const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
  const outBuf = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, j = 0; i < data.length; i += info.channels, j += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    const tealness = Math.max(0, 1 - (Math.abs(r - TEAL.r) + Math.abs(g - TEAL.g) + Math.abs(b - TEAL.b)) / 240);
    outBuf[j] = outBuf[j + 1] = outBuf[j + 2] = 255;
    outBuf[j + 3] = a < 255 ? 0 : Math.round(255 * (1 - tealness)); // rounded corners' edge is background
  }
  return png(sharp(outBuf, { raw: { width: info.width, height: info.height, channels: 4 } }).resize(size, size)).toFile(out(name));
};

(async () => {
  await Promise.all([
    plain(32, "favicon-32.png"),
    plain(192, "icon-192.png"),
    plain(512, "icon-512.png"),
    onTeal(180, 180, "apple-touch-icon.png"),
    // Maskable: the mark must sit inside the central safe circle (80% of the size)
    onTeal(512, 410, "maskable-512.png"),
    badge(72, "badge-72.png")
  ]);
  console.log("Icons written to public/icons");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
