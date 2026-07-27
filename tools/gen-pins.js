// Pinterest pin generator — 1000x1500 vertical, Torii Post brand style.
// Usage: node tools/gen-pins.js <outDir>
const path = require("path");
const sharp = require(path.join(__dirname, "..", "node_modules", "sharp"));
const fs = require("fs");

const outDir = process.argv[2] || path.join(__dirname, "..", "pins");

const BG = "#fafaf9";
const INK = "#1a1a1a";
const ACCENT = "#2f4f4f";
const SOFT = "#e9efed";
const LINE = "#deded9";
const SAND = "#d8d7d1";
const FONT = "Arial, Helvetica, sans-serif";

function torii(x, y, s, color, opacity = 1) {
  return `<g transform="translate(${x},${y}) scale(${s})" opacity="${opacity}">
    <rect x="-2" y="0" width="104" height="8" fill="${color}" />
    <rect x="4" y="16" width="92" height="5" fill="${color}" />
    <rect x="14" y="8" width="8" height="92" fill="${color}" />
    <rect x="78" y="8" width="8" height="92" fill="${color}" />
    <rect x="47" y="8" width="6" height="8" fill="${color}" />
  </g>`;
}

// titleLines: array of strings (manual wrap), kicker: small top label, sub: subtitle line
function pinSvg({ kicker, titleLines, sub, art }) {
  const titleY = 430;
  const lineH = 108;
  const title = titleLines
    .map(
      (t, i) =>
        `<text x="90" y="${titleY + i * lineH}" font-family="${FONT}" font-size="88" font-weight="bold" fill="${INK}" letter-spacing="-2">${t}</text>`
    )
    .join("\n");
  const subY = titleY + titleLines.length * lineH + 40;
  return `
  <svg width="1000" height="1500" xmlns="http://www.w3.org/2000/svg">
    <rect width="1000" height="1500" fill="${BG}"/>
    <rect x="40" y="40" width="920" height="1420" fill="none" stroke="${LINE}" stroke-width="2"/>
    <text x="90" y="230" font-family="${FONT}" font-size="30" font-weight="bold" fill="${ACCENT}" letter-spacing="6">${kicker.toUpperCase()}</text>
    <line x1="90" y1="270" x2="290" y2="270" stroke="${ACCENT}" stroke-width="4"/>
    ${title}
    <text x="90" y="${subY}" font-family="${FONT}" font-size="40" fill="#54544f">${sub}</text>
    ${art}
    <line x1="90" y1="1330" x2="910" y2="1330" stroke="${LINE}" stroke-width="2"/>
    <text x="90" y="1395" font-family="${FONT}" font-size="34" font-weight="bold" fill="${INK}" letter-spacing="4">TORII POST</text>
    <text x="910" y="1395" font-family="${FONT}" font-size="30" fill="${ACCENT}" text-anchor="end">toriipost.com</text>
  </svg>`;
}

const pins = {
  // Proxy article pins
  "pin-proxy-01.png": pinSvg({
    kicker: "Buying from Japan",
    titleLines: ["How to Buy", "From Any", "Japanese Store"],
    sub: "5 proxy services compared, honestly",
    art: `
      <rect x="90" y="960" width="240" height="200" fill="none" stroke="${INK}" stroke-width="5"/>
      <line x1="90" y1="1060" x2="330" y2="1060" stroke="${INK}" stroke-width="3"/>
      <line x1="210" y1="960" x2="210" y2="1060" stroke="${INK}" stroke-width="3"/>
      <rect x="400" y="920" width="290" height="240" fill="none" stroke="${ACCENT}" stroke-width="5"/>
      <line x1="400" y1="1030" x2="690" y2="1030" stroke="${ACCENT}" stroke-width="3"/>
      <line x1="545" y1="920" x2="545" y2="1030" stroke="${ACCENT}" stroke-width="3"/>
      <rect x="760" y="990" width="150" height="170" fill="${SAND}"/>
      <path d="M 150 880 C 350 800, 650 800, 850 880" fill="none" stroke="${ACCENT}" stroke-width="4" stroke-dasharray="3 16" stroke-linecap="round"/>
      ${torii(795, 588, 1.0, INK, 0.9)}
    `,
  }),
  "pin-proxy-02.png": pinSvg({
    kicker: "Save 30-50% on shipping",
    titleLines: ["The Hidden Fees", "of Japan Proxy", "Shopping"],
    sub: "4 costs nobody tells you about",
    art: `
      <circle cx="290" cy="1040" r="130" fill="${SOFT}"/>
      <text x="290" y="1075" font-family="${FONT}" font-size="90" font-weight="bold" fill="${ACCENT}" text-anchor="middle">&#165;</text>
      <line x1="470" y1="980" x2="880" y2="980" stroke="${INK}" stroke-width="4"/>
      <line x1="470" y1="1050" x2="800" y2="1050" stroke="${INK}" stroke-width="4" opacity="0.7"/>
      <line x1="470" y1="1120" x2="720" y2="1120" stroke="${ACCENT}" stroke-width="6"/>
    `,
  }),
  // AmiAmi article pins
  "pin-amiami-01.png": pinSvg({
    kicker: "Anime figure collecting",
    titleLines: ["AmiAmi", "Pre-Owned Grades,", "Decoded"],
    sub: "What A, B+ and C actually mean",
    art: `
      <line x1="120" y1="1160" x2="880" y2="1160" stroke="${INK}" stroke-width="6"/>
      <rect x="160" y="930" width="130" height="230" fill="none" stroke="${INK}" stroke-width="5"/>
      <rect x="340" y="965" width="120" height="195" fill="none" stroke="${INK}" stroke-width="5" opacity="0.7"/>
      <rect x="520" y="900" width="150" height="260" fill="none" stroke="${ACCENT}" stroke-width="7"/>
      <rect x="550" y="940" width="90" height="120" fill="${ACCENT}" opacity="0.22"/>
      <circle cx="595" cy="850" r="18" fill="none" stroke="${ACCENT}" stroke-width="5"/>
      <rect x="730" y="990" width="110" height="170" fill="${SAND}"/>
    `,
  }),
  "pin-amiami-02.png": pinSvg({
    kicker: "Is B grade safe?",
    titleLines: ["Buy Sold-Out", "Figures for", "40% Less"],
    sub: "The pre-owned system, explained",
    art: `
      <circle cx="500" cy="1030" r="150" fill="none" stroke="${ACCENT}" stroke-width="4"/>
      <text x="500" y="1080" font-family="${FONT}" font-size="150" font-weight="bold" fill="${ACCENT}" text-anchor="middle">B</text>
      <line x1="150" y1="1030" x2="330" y2="1030" stroke="${LINE}" stroke-width="4"/>
      <line x1="670" y1="1030" x2="850" y2="1030" stroke="${LINE}" stroke-width="4"/>
    `,
  }),
};

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, svg] of Object.entries(pins)) {
    await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, name));
    console.log("wrote", name);
  }
})();
