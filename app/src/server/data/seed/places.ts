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
 * pages a curator should open; CURATION.md turns that into a checklist. The
 * screens are still complete with `？` everywhere — that is the whole point of
 * separating "fit" from "confidence".
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

/** A park nobody has surveyed yet: six `？`, honest hours, a source to go read. */
function park(input: {
  id: string;
  name: string;
  areaCode: string;
  areaLabel: string;
  lat: number;
  lng: number;
  category?: string;
  minAgeMonths?: number | null;
  candidateSource?: { label: string; url: string };
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
    sources: input.candidateSource
      ? [
          {
            key: `${input.id}:candidate`,
            kind: 'official_site',
            label: input.candidateSource.label,
            url: input.candidateSource.url,
            checkedAt: null,
          },
        ]
      : [],
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
    candidateSource: { label: '矢橋帰帆島公園 公式サイト', url: 'https://hikari-g.com/kihan/' },
  }),
  park({
    id: 'rokuha-park',
    name: 'ロクハ公園',
    areaCode: 'shiga-kusatsu',
    areaLabel: '草津市',
    lat: 34.9852,
    lng: 135.9821,
    category: 'large_park',
  }),
  park({
    id: 'kusatsugawa-deai',
    name: '草津川跡地公園 de愛ひろば',
    areaCode: 'shiga-kusatsu',
    areaLabel: '草津市',
    lat: 35.0176,
    lng: 135.9604,
    category: 'park',
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
  }),
  park({
    id: 'moriyama-sports-park',
    name: '守山市民運動公園',
    areaCode: 'shiga-moriyama',
    areaLabel: '守山市',
    lat: 35.0602,
    lng: 135.9902,
    category: 'large_park',
  }),
  park({
    id: 'dai2-nagisa',
    name: '第2なぎさ公園',
    areaCode: 'shiga-moriyama',
    areaLabel: '守山市',
    lat: 35.0902,
    lng: 135.9498,
    category: 'lakeside_park',
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
  }),
  park({
    id: 'otsu-kogan-nagisa',
    name: '大津湖岸なぎさ公園',
    areaCode: 'shiga-otsu',
    areaLabel: '大津市',
    lat: 35.0053,
    lng: 135.8764,
    category: 'lakeside_park',
  }),
  park({
    id: 'omijingu-gaien',
    name: '近江神宮外苑公園',
    areaCode: 'shiga-otsu',
    areaLabel: '大津市',
    lat: 35.0451,
    lng: 135.8557,
    category: 'park',
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
  }),
  park({
    id: 'takaragaike-kodomo',
    name: '宝が池公園 子どもの楽園',
    areaCode: 'kyoto-sakyo',
    areaLabel: '京都市左京区',
    lat: 35.0546,
    lng: 135.792,
    category: 'large_park',
  }),
  park({
    id: 'okazaki-park',
    name: '岡崎公園',
    areaCode: 'kyoto-sakyo',
    areaLabel: '京都市左京区',
    lat: 35.0142,
    lng: 135.7825,
    category: 'park',
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
