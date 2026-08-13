// Regenerate the raster icons from src/assets/img/favicon.svg.
// The SVG is the source of truth; everything below is derived output.
//
//   node tools/make-icons.js
//
// Produces:
//   src/favicon.ico                     16 / 32 / 48 / 256, PNG payloads
//   src/assets/img/apple-touch-icon.png 180x180 (iOS home screen)
//   src/assets/img/icon-512.png         512x512 (manifests)
//   src/assets/img/icon-1024.png        1024x1024 (profile avatars — Pinterest,
//                                       Telegram, PayPal; upload the largest you
//                                       have and let each service downscale)

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SRC = path.join(__dirname, "..", "src", "assets", "img", "favicon.svg");
const IMG = path.join(__dirname, "..", "src", "assets", "img");
const ICO = path.join(__dirname, "..", "src", "favicon.ico");
const ICO_SIZES = [16, 32, 48, 256];

// Minimal ICO writer. An .ico is a 6-byte header, one 16-byte directory entry
// per image, then the image payloads — which modern browsers accept as PNG.
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);

  let offset = 6 + pngs.length * 16;
  const entries = pngs.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size === 256 ? 0 : size, 0); // width
    e.writeUInt8(size === 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette size
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });

  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

(async () => {
  const svg = fs.readFileSync(SRC);
  const png = (size) => sharp(svg).resize(size, size).png().toBuffer();

  const icoPngs = [];
  for (const size of ICO_SIZES) icoPngs.push({ size, data: await png(size) });
  fs.writeFileSync(ICO, buildIco(icoPngs));

  fs.writeFileSync(path.join(IMG, "apple-touch-icon.png"), await png(180));
  fs.writeFileSync(path.join(IMG, "icon-512.png"), await png(512));
  fs.writeFileSync(path.join(IMG, "icon-1024.png"), await png(1024));

  console.log(
    `favicon.ico (${ICO_SIZES.join("/")}) + apple-touch-icon.png + icon-512.png + icon-1024.png`
  );
})();
