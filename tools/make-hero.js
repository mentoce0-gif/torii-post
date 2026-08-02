// Render article hero images from SVG sources.
//
//   node tools/make-hero.js            all of them
//   node tools/make-hero.js tattoo-onsen   just one
//
// tools/heroes/<name>.svg  ->  src/assets/img/hero-<name>.png  (1200x630)
//
// 1200x630 is the Open Graph size, so the same file serves as the in-page
// hero and as the social card. Keep the important content away from the
// edges: social platforms crop this aspect ratio differently.

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SRC = path.join(__dirname, "heroes");
const OUT = path.join(__dirname, "..", "src", "assets", "img");

(async () => {
  const only = process.argv[2];
  const names = fs
    .readdirSync(SRC)
    .filter((f) => f.endsWith(".svg"))
    .map((f) => f.replace(/\.svg$/, ""))
    .filter((n) => !only || n === only);

  if (!names.length) {
    console.error(only ? `no tools/heroes/${only}.svg` : "no SVGs in tools/heroes/");
    process.exit(1);
  }

  for (const name of names) {
    const out = path.join(OUT, `hero-${name}.png`);
    await sharp(path.join(SRC, `${name}.svg`)).resize(1200, 630).png().toFile(out);
    console.log(`hero-${name}.png`);
  }
})();
