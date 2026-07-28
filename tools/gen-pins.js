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
  // Private onsen article pins
  "pin-onsen-01.png": pinSvg({
    kicker: "Private onsen in Japan",
    titleLines: ["Rent an Entire", "Onsen to", "Yourself"],
    sub: "6 places that book in English",
    art: `
      <path d="M 300 1000 h 400 M 320 1000 c 0 130 70 190 180 190 s 180 -60 180 -190" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>
      <path d="M 350 1045 q 30 -18 60 0 t 60 0 t 60 0 t 60 0" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
      <g stroke="${ACCENT}" stroke-width="9" fill="none" stroke-linecap="round">
        <path d="M 420 940 c -18 -34 18 -50 0 -84"/>
        <path d="M 500 950 c -20 -40 20 -60 0 -100"/>
        <path d="M 580 940 c -18 -34 18 -50 0 -84"/>
      </g>
      <rect x="760" y="960" width="110" height="86" rx="10" fill="${SOFT}" stroke="${INK}" stroke-width="6"/>
      <path d="M 782 960 v -20 a 33 33 0 0 1 66 0 v 20" fill="none" stroke="${INK}" stroke-width="6"/>
      <circle cx="815" cy="1000" r="9" fill="${INK}"/>
    `,
  }),
  "pin-onsen-02.png": pinSvg({
    kicker: "Tattoo-friendly by default",
    titleLines: ["Tattoos and", "Onsen: The", "Clean Solution"],
    sub: "Private baths, zero cover stickers",
    art: `
      <rect x="150" y="900" width="180" height="290" rx="90" fill="none" stroke="${INK}" stroke-width="7"/>
      <path d="M 185 1000 q 55 -40 110 0 M 185 1060 q 55 40 110 0" fill="none" stroke="${ACCENT}" stroke-width="6"/>
      <circle cx="600" cy="1040" r="120" fill="${SOFT}"/>
      <path d="M 545 1040 l 40 44 84 -92" fill="none" stroke="${ACCENT}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
      <g stroke="${ACCENT}" stroke-width="8" fill="none" stroke-linecap="round" opacity="0.8">
        <path d="M 800 1010 c -16 -30 16 -46 0 -76"/>
        <path d="M 860 1020 c -16 -30 16 -46 0 -76"/>
      </g>
    `,
  }),
  "pin-onsen-03.png": pinSvg({
    kicker: "Couples travel Japan",
    titleLines: ["Bathe Together", "at a Japanese", "Onsen"],
    sub: "The kashikiri loophole, explained",
    art: `
      <circle cx="790" cy="920" r="60" fill="none" stroke="${SAND}" stroke-width="6"/>
      <path d="M 200 1020 h 460 M 220 1020 c 0 120 80 170 210 170 s 210 -50 210 -170" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>
      <path d="M 260 1062 q 30 -16 60 0 t 60 0 t 60 0 t 60 0 t 60 0" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
      <g fill="none" stroke="${ACCENT}" stroke-width="7">
        <rect x="330" y="900" width="70" height="84" rx="12"/>
        <rect x="450" y="900" width="70" height="84" rx="12"/>
      </g>
    `,
  }),
  "pin-onsen-04.png": pinSvg({
    kicker: "85 min from Tokyo",
    titleLines: ["A Private", "Forest Onsen", "for ¥6,000"],
    sub: "Hakone Yuryo, booked in English",
    art: `
      <rect x="120" y="960" width="180" height="130" rx="16" fill="none" stroke="${INK}" stroke-width="7"/>
      <circle cx="165" cy="1110" r="16" fill="${INK}"/><circle cx="255" cy="1110" r="16" fill="${INK}"/>
      <line x1="120" y1="1020" x2="300" y2="1020" stroke="${INK}" stroke-width="5"/>
      <path d="M 360 1030 h 60 M 460 1030 h 60" stroke="${ACCENT}" stroke-width="5" stroke-dasharray="3 14" stroke-linecap="round"/>
      <g stroke="${ACCENT}" stroke-width="7" fill="none" stroke-linecap="round">
        <path d="M 590 1090 v -120 M 560 1010 l 30 -40 30 40 M 550 1060 l 40 -54 40 54"/>
      </g>
      <path d="M 700 1010 h 190 M 715 1010 c 0 70 40 100 80 100 s 80 -30 80 -100" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
      <g stroke="${ACCENT}" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.85">
        <path d="M 770 970 c -12 -24 12 -36 0 -60"/>
        <path d="M 820 970 c -12 -24 12 -36 0 -60"/>
      </g>
    `,
  }),
  "pin-onsen-05.png": pinSvg({
    kicker: "Beppu, Kyushu",
    titleLines: ["The ¥2,300", "Michelin-Star", "Onsen Hack"],
    sub: "14 private baths, 3 stars",
    art: `
      <path d="M 280 890 c -40 0 -70 30 -70 65 0 28 18 45 18 45 -40 22 -68 60 -68 105 0 66 54 105 120 105 s 120 -39 120 -105 c 0 -45 -28 -83 -68 -105 0 0 18 -17 18 -45 0 -35 -30 -65 -70 -65 z" fill="${SOFT}" stroke="${INK}" stroke-width="7"/>
      <g fill="${ACCENT}">
        <path d="M 560 950 l 14 30 33 4 -24 23 6 33 -29 -16 -29 16 6 -33 -24 -23 33 -4 z"/>
        <path d="M 680 950 l 14 30 33 4 -24 23 6 33 -29 -16 -29 16 6 -33 -24 -23 33 -4 z"/>
        <path d="M 800 950 l 14 30 33 4 -24 23 6 33 -29 -16 -29 16 6 -33 -24 -23 33 -4 z"/>
      </g>
      <rect x="560" y="1080" width="270" height="90" rx="12" fill="none" stroke="${INK}" stroke-width="6"/>
      <text x="695" y="1142" font-family="${FONT}" font-size="52" font-weight="bold" fill="${INK}" text-anchor="middle">&#165;2,300</text>
    `,
  }),
  "pin-onsen-06.png": pinSvg({
    kicker: "First time in Japan?",
    titleLines: ["Your First", "Onsen, Minus", "the Audience"],
    sub: "Private baths for nervous first-timers",
    art: `
      <rect x="380" y="880" width="240" height="320" rx="8" fill="none" stroke="${INK}" stroke-width="8"/>
      <circle cx="580" cy="1045" r="12" fill="${INK}"/>
      <rect x="680" y="1000" width="100" height="80" rx="10" fill="${SOFT}" stroke="${ACCENT}" stroke-width="6"/>
      <path d="M 700 1000 v -18 a 30 30 0 0 1 60 0 v 18" fill="none" stroke="${ACCENT}" stroke-width="6"/>
      <g stroke="${ACCENT}" stroke-width="7" fill="none" stroke-linecap="round" opacity="0.85">
        <path d="M 250 1010 c -16 -30 16 -46 0 -76"/>
        <path d="M 305 1020 c -18 -36 18 -54 0 -90"/>
      </g>
    `,
  }),
  "pin-onsen-07.png": pinSvg({
    kicker: "The splurge worth making",
    titleLines: ["A Ryokan Room", "With Its Own", "Open-Air Bath"],
    sub: "How to find one in English",
    art: `
      <circle cx="810" cy="900" r="8" fill="${ACCENT}"/><circle cx="740" cy="870" r="5" fill="${ACCENT}"/><circle cx="860" cy="950" r="5" fill="${ACCENT}"/>
      <path d="M 140 1190 h 720" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
      <rect x="180" y="930" width="300" height="260" fill="none" stroke="${INK}" stroke-width="7"/>
      <path d="M 180 995 h 300 M 330 930 v 65" stroke="${INK}" stroke-width="5"/>
      <path d="M 560 1080 h 240 M 575 1080 c 0 75 45 110 105 110 s 105 -35 105 -110" fill="none" stroke="${ACCENT}" stroke-width="8" stroke-linecap="round"/>
      <path d="M 600 1115 q 25 -14 50 0 t 50 0 t 50 0" fill="none" stroke="${ACCENT}" stroke-width="5" stroke-linecap="round"/>
    `,
  }),
  "pin-onsen-08.png": pinSvg({
    kicker: "2.5 hours from Kyoto",
    titleLines: ["The Onsen Town", "You Can Book", "in English"],
    sub: "Kinosaki, Japan's easiest ryokan stay",
    art: `
      <path d="M 120 1100 q 200 40 380 0 t 380 0" fill="none" stroke="${ACCENT}" stroke-width="7" stroke-linecap="round"/>
      <path d="M 120 1150 q 200 40 380 0 t 380 0" fill="none" stroke="${ACCENT}" stroke-width="4" stroke-linecap="round" opacity="0.5"/>
      <g stroke="${INK}" stroke-width="7" fill="none" stroke-linecap="round">
        <path d="M 300 880 v 160 M 300 900 c -50 20 -90 60 -110 110 M 300 900 c 50 20 90 60 110 110 M 300 940 c -30 16 -55 44 -68 80 M 300 940 c 30 16 55 44 68 80"/>
      </g>
      <g stroke="${INK}" stroke-width="6" fill="none">
        <rect x="620" y="1000" width="130" height="34" rx="6"/>
        <line x1="650" y1="1034" x2="650" y2="1058"/><line x1="720" y1="1034" x2="720" y2="1058"/>
      </g>
    `,
  }),
  "pin-onsen-09.png": pinSvg({
    kicker: "Japan travel hack",
    titleLines: ["Book Any", "“Phone Only”", "Onsen Bath"],
    sub: "The front-desk trick, explained",
    art: `
      <g transform="rotate(-38 280 1030)" fill="${SOFT}" stroke="${INK}" stroke-width="6">
        <rect x="160" y="1000" width="72" height="62" rx="16"/>
        <rect x="330" y="1000" width="72" height="62" rx="16"/>
        <path d="M 196 1004 c 0 -58 170 -58 170 0" fill="none" stroke-width="16"/>
      </g>
      <rect x="470" y="880" width="280" height="320" fill="none" stroke="${INK}" stroke-width="6"/>
      <g stroke="${SAND}" stroke-width="6" stroke-linecap="round">
        <line x1="505" y1="950" x2="715" y2="950"/>
        <line x1="505" y1="1010" x2="680" y2="1010"/>
        <line x1="505" y1="1070" x2="715" y2="1070"/>
      </g>
      <path d="M 505 1135 l 20 22 40 -46" fill="none" stroke="${ACCENT}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="820" cy="1040" r="60" fill="none" stroke="${ACCENT}" stroke-width="6"/>
      <path d="M 795 1040 l 18 20 36 -40" fill="none" stroke="${ACCENT}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  }),
  "pin-onsen-10.png": pinSvg({
    kicker: "Real 2026 numbers",
    titleLines: ["What a Private", "Onsen Actually", "Costs"],
    sub: "From ¥4,000 for two",
    art: `
      <g font-family="${FONT}" font-size="30" fill="#54544f">
        <rect x="150" y="1090" width="160" height="100" fill="${SOFT}"/>
        <rect x="420" y="1030" width="160" height="160" fill="${SAND}"/>
        <rect x="690" y="920" width="160" height="270" fill="${ACCENT}" opacity="0.85"/>
        <text x="230" y="1075" text-anchor="middle" font-weight="bold">&#165;4,000</text>
        <text x="500" y="1015" text-anchor="middle" font-weight="bold">&#165;9,000</text>
        <text x="770" y="905" text-anchor="middle" font-weight="bold">&#165;50,000+</text>
      </g>
      <g stroke="${ACCENT}" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.8">
        <path d="M 205 1050 c -12 -24 12 -36 0 -60" transform="translate(0,-30)"/>
      </g>
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
