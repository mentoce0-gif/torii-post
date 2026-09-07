import type { CoordPrecision, EquipmentValue, HoursStatus, PlaceKind } from '../../domain/types.ts';

/**
 * Curated seed for the 90-day PoC. Kyoto — Otsu — Kusatsu — Moriyama only.
 *
 * The rule this file follows, without exception:
 *
 *   a facility value is anything other than `？` only when a human has read a
 *   named source and written down where and when they read it.
 *
 * Nothing here was confirmed against a facility's own page, so every park ships
 * with six `？` and `hoursStatus: 'unverified'`. `candidateSources` records the
 * pages a curator should open — located by search, read by nobody, and carrying
 * `checkedAt: null` so they render as 未確認 and unlock no value. CURATION.md
 * turns that into a checklist. The screens are still complete with `？`
 * everywhere — that is the whole point of separating "fit" from "confidence".
 *
 * Coordinates are locality centroids, marked as such, so travel time is shown
 * as an estimate rather than a routed time.
 */

export interface SeedSource {
  key: string;
  kind: 'official_site' | 'municipal_page' | 'curator_field_note' | 'demo_placeholder';
  label: string;
  url: string | null;
  /** null means: found, not yet read by a human. */
  checkedAt: string | null;
}

export interface SeedPlace {
  id: string;
  name: string;
  areaCode: string;
  areaLabel: string;
  kind: PlaceKind;
  lat: number | null;
  lng: number | null;
  coordPrecision: CoordPrecision;
  priceLabel: string;
  indoorShelter: EquipmentValue;
  escapeRoute: string | null;
  hoursStatus: HoursStatus;
  hoursLabel: string;
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
  category: string;
  notes: string | null;
  sources: SeedSource[];
  /** Only keys a curator has confirmed appear here. Everything else stays `？`. */
  equipment: Record<string, { value: EquipmentValue; sourceKey: string; verifiedAt: string; confidence: number }>;
}

const UNVERIFIED_HOURS = '利用可能時間 未確認';

/** A park nobody has surveyed yet: six `？`, honest hours, sources to go read. */
function park(input: {
  id: string;
  name: string;
  areaCode: string;
  areaLabel: string;
  lat: number;
  lng: number;
  category?: string;
  minAgeMonths?: number | null;
  candidateSources?: { kind: 'official_site' | 'municipal_page'; label: string; url: string }[];
}): SeedPlace {
  return {
    id: input.id,
    name: input.name,
    areaCode: input.areaCode,
    areaLabel: input.areaLabel,
    kind: 'outdoor',
    lat: input.lat,
    lng: input.lng,
    coordPrecision: 'locality',
    priceLabel: '未確認',
    indoorShelter: '？',
    escapeRoute: null,
    hoursStatus: 'unverified',
    hoursLabel: UNVERIFIED_HOURS,
    minAgeMonths: input.minAgeMonths === undefined ? 12 : input.minAgeMonths,
    maxAgeMonths: null,
    category: input.category ?? 'park',
    notes: null,
    sources: (input.candidateSources ?? []).map((candidate) => ({
      key: `${input.id}:${candidate.kind === 'municipal_page' ? 'municipal' : 'official'}`,
      kind: candidate.kind,
      label: candidate.label,
      url: candidate.url,
      // Located by search, never opened from here. `checkedAt: null` renders as
      // 未確認 and unlocks no value: it only saves the curator the hunt.
      checkedAt: null,
    })),
    equipment: {},
  };
}

export const SEED_PLACES: SeedPlace[] = [
  // --- 草津市 ---------------------------------------------------------------
  park({
    id: 'yabase-kihanjima',
    name: '矢橋帰帆島公園',
    areaCode: 'shiga-kusatsu',
    areaLabel: '草津市',
    lat: 35.0047,
    lng: 135.9255,
    category: 'large_park',
    candidateSources: [
      { kind: 'official_site', label: '矢橋帰帆島公園 公式サイト', url: 'https://hikari-g.com/kihan/' },
    ],
  }),
  park({
    id: 'rokuha-park',
    name: 'ロクハ公園',
    areaCode: 'shiga-kusatsu',
    areaLabel: '草津市',
    lat: 34.9852,
    lng: 135.9821,
    category: 'large_park',
    candidateSources: [
      { kind: 'official_site', label: 'ロクハ公園 公式サイト', url: 'https://www.park-698.net/' },
      {
        kind: 'municipal_page',
        label: '草津市 ロクハ公園',
        url: 'https://www.city.kusatsu.shiga.jp/citysales/koen/rokuhakoen/index.html',
      },
    ],
  }),
  park({
    id: 'kusatsugawa-deai',
    name: '草津川跡地公園 de愛ひろば',
    areaCode: 'shiga-kusatsu',
    areaLabel: '草津市',
    lat: 35.0176,
    lng: 135.9604,
    category: 'park',
    candidateSources: [
      {
        kind: 'official_site',
        label: '草津川跡地公園 de愛ひろば 公式サイト',
        url: 'https://www.kusatsugawaatochi-park.com/de_top',
      },
      {
        kind: 'municipal_page',
        label: '草津市 de愛ひろば（区間5）',
        url: 'https://www.city.kusatsu.shiga.jp/kurashi/toshikeikaku/kusatsugawaatochi/kusatsu_river.html',
      },
    ],
  }),

  // --- 守山市 ---------------------------------------------------------------
  park({
    id: 'enmadou-park',
    name: 'えんまどう公園',
    areaCode: 'shiga-moriyama',
    areaLabel: '守山市',
    lat: 35.0585,
    lng: 135.9975,
    category: 'park',
    // No page of its own turned up in search; the city's park index is the
    // place to start looking.
    candidateSources: [
      {
        kind: 'municipal_page',
        label: '守山市 公園一覧',
        url: 'https://www.city.moriyama.lg.jp/shisetsu/kouen/index.html',
      },
    ],
  }),
  park({
    id: 'moriyama-sports-park',
    name: '守山市民運動公園',
    areaCode: 'shiga-moriyama',
    areaLabel: '守山市',
    lat: 35.0602,
    lng: 135.9902,
    category: 'large_park',
    candidateSources: [
      {
        kind: 'official_site',
        label: '守山市民運動公園 公式サイト',
        url: 'https://www.moriyama-s-p.com/',
      },
      {
        kind: 'municipal_page',
        label: '守山市 守山市民運動公園',
        url: 'https://www.city.moriyama.lg.jp/shisetsu/kouen/1006761.html',
      },
    ],
  }),
  park({
    id: 'dai2-nagisa',
    name: '第2なぎさ公園',
    areaCode: 'shiga-moriyama',
    areaLabel: '守山市',
    lat: 35.0902,
    lng: 135.9498,
    category: 'lakeside_park',
    candidateSources: [
      {
        kind: 'municipal_page',
        label: '守山市 公園一覧',
        url: 'https://www.city.moriyama.lg.jp/shisetsu/kouen/index.html',
      },
    ],
  }),

  // --- 大津市 ---------------------------------------------------------------
  park({
    id: 'ojigaoka-park',
    name: '皇子が丘公園',
    areaCode: 'shiga-otsu',
    areaLabel: '大津市',
    lat: 35.0323,
    lng: 135.8651,
    category: 'large_park',
    candidateSources: [
      {
        kind: 'municipal_page',
        label: '大津市 皇子が丘公園',
        url: 'https://www.city.otsu.lg.jp/shisei/c/s/f/ps/park/1387954889254.html',
      },
    ],
  }),
  park({
    id: 'otsu-kogan-nagisa',
    name: '大津湖岸なぎさ公園',
    areaCode: 'shiga-otsu',
    areaLabel: '大津市',
    lat: 35.0053,
    lng: 135.8764,
    category: 'lakeside_park',
    candidateSources: [
      {
        kind: 'municipal_page',
        label: '大津市 大津湖岸なぎさ公園（市民プラザ）',
        url: 'https://www.city.otsu.lg.jp/soshiki/035/1809/g/koen/n/index.html',
      },
    ],
  }),
  park({
    id: 'omijingu-gaien',
    name: '近江神宮外苑公園',
    areaCode: 'shiga-otsu',
    areaLabel: '大津市',
    lat: 35.0451,
    lng: 135.8557,
    category: 'park',
    // The park sits inside a commercial development that runs its own page;
    // treat it as the operator's page, not the city's.
    candidateSources: [
      {
        kind: 'official_site',
        label: 'ブランチ大津京 近江神宮外苑公園',
        url: 'https://www.branch-sc.com/otsukyo/shop/page.jsp?id=25',
      },
    ],
  }),

  // --- 京都市 ---------------------------------------------------------------
  park({
    id: 'umekoji-park',
    name: '梅小路公園',
    areaCode: 'kyoto-shimogyo',
    areaLabel: '京都市下京区',
    lat: 34.9878,
    lng: 135.748,
    category: 'large_park',
    candidateSources: [
      {
        kind: 'official_site',
        label: '京都市都市緑化協会 梅小路公園 園内マップと施設の紹介',
        url: 'https://www.kyoto-ga.jp/umekouji/facilities/',
      },
      {
        kind: 'municipal_page',
        label: '京都市 梅小路公園',
        url: 'https://www.city.kyoto.lg.jp/kensetu/page/0000257046.html',
      },
    ],
  }),
  park({
    id: 'takaragaike-kodomo',
    name: '宝が池公園 子どもの楽園',
    areaCode: 'kyoto-sakyo',
    areaLabel: '京都市左京区',
    lat: 35.0546,
    lng: 135.792,
    category: 'large_park',
    candidateSources: [
      {
        kind: 'official_site',
        label: '京都市都市緑化協会 宝が池公園 子どもの楽園',
        url: 'https://www.kyoto-ga.jp/kodomonorakuen/',
      },
      {
        kind: 'municipal_page',
        label: '京都市 宝が池公園 子どもの楽園',
        url: 'https://www.city.kyoto.lg.jp/kensetu/page/0000043529.html',
      },
    ],
  }),
  park({
    id: 'okazaki-park',
    name: '岡崎公園',
    areaCode: 'kyoto-sakyo',
    areaLabel: '京都市左京区',
    lat: 35.0142,
    lng: 135.7825,
    category: 'park',
    candidateSources: [
      {
        kind: 'municipal_page',
        label: '京都市 岡崎公園',
        url: 'https://www.city.kyoto.lg.jp/kensetu/page/0000082743.html',
      },
    ],
  }),

  // --- fallback ---------------------------------------------------------------
  // There is no seeded "usual spot": which place counts as the household's
  // default is theirs to name in Settings, and inventing one would put a card
  // nobody asked for into a list of three.
  {
    id: 'home',
    name: '家・室内',
    areaCode: 'household',
    areaLabel: '自宅',
    kind: 'home',
    lat: null,
    lng: null,
    coordPrecision: 'locality',
    priceLabel: '0円',
    indoorShelter: '○',
    escapeRoute: 'いつでも中断できる',
    hoursStatus: 'always_open',
    hoursLabel: 'いつでも',
    minAgeMonths: null,
    maxAgeMonths: null,
    category: 'home',
    notes: '準備2分 / 汚れ少 / 移動ゼロ',
    sources: [
      {
        key: 'home:self',
        kind: 'curator_field_note',
        label: '自宅のため世帯が既知',
        url: null,
        checkedAt: '2026-09-07',
      },
    ],
    // The one record whose facilities the household does not need us to verify.
    equipment: {
      sandbox: { value: '×', sourceKey: 'home:self', verifiedAt: '2026-09-07', confidence: 1 },
      shade: { value: '○', sourceKey: 'home:self', verifiedAt: '2026-09-07', confidence: 1 },
      water: { value: '○', sourceKey: 'home:self', verifiedAt: '2026-09-07', confidence: 1 },
      toilet: { value: '○', sourceKey: 'home:self', verifiedAt: '2026-09-07', confidence: 1 },
      diaper: { value: '○', sourceKey: 'home:self', verifiedAt: '2026-09-07', confidence: 1 },
      stroller: { value: '○', sourceKey: 'home:self', verifiedAt: '2026-09-07', confidence: 1 },
    },
  },
];
