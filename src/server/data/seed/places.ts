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
  candidateSources?: {
    kind: 'official_site' | 'municipal_page';
    /**
     * Distinguishes two candidates of the same kind. Without it the key is
     * derived from the kind alone, so a park listing two official pages would
     * give both the same key and the second would shadow the first.
     */
    slug?: string;
    label: string;
    url: string;
  }[];
  /**
   * Pages a curator has actually opened, with the date they read them. Only
   * these may back a stated value — `candidateSources` stay at `checkedAt:
   * null` and unlock nothing.
   */
  readSources?: {
    kind: 'official_site' | 'municipal_page';
    slug: string;
    label: string;
    url: string;
    checkedAt: string;
  }[];
  equipment?: SeedPlace['equipment'];
  notes?: string;
  escapeRoute?: string;
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
    escapeRoute: input.escapeRoute ?? null,
    hoursStatus: 'unverified',
    hoursLabel: UNVERIFIED_HOURS,
    minAgeMonths: input.minAgeMonths === undefined ? 12 : input.minAgeMonths,
    maxAgeMonths: null,
    category: input.category ?? 'park',
    notes: input.notes ?? null,
    sources: [
      ...(input.candidateSources ?? []).map((candidate) => ({
        key: `${input.id}:${candidate.slug ?? (candidate.kind === 'municipal_page' ? 'municipal' : 'official')}`,
        kind: candidate.kind,
        label: candidate.label,
        url: candidate.url,
        // Located by search, never opened from here. `checkedAt: null` renders
        // as 未確認 and unlocks no value: it only saves the curator the hunt.
        checkedAt: null,
      })),
      ...(input.readSources ?? []).map((source) => ({
        key: `${input.id}:${source.slug}`,
        kind: source.kind,
        label: source.label,
        url: source.url,
        checkedAt: source.checkedAt,
      })),
    ],
    equipment: input.equipment ?? {},
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
      {
        kind: 'official_site',
        slug: 'official-facility',
        label: '矢橋帰帆島公園 無料施設案内',
        url: 'https://hikari-g.com/kihan/facility/',
      },
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
        kind: 'official_site',
        slug: 'official-baby',
        label: 'ロクハ公園 赤ちゃんの駅',
        url: 'https://www.park-698.net/akacyan/',
      },
      {
        kind: 'official_site',
        slug: 'official-faq',
        label: 'ロクハ公園 よくあるご質問',
        url: 'https://www.park-698.net/situmon/',
      },
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
        kind: 'official_site',
        slug: 'official-section5',
        label: '草津川跡地公園 de愛ひろば（区間5）施設',
        url: 'https://www.kusatsugawaatochi-park.com/6-1',
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
      {
        kind: 'municipal_page',
        slug: 'municipal-baby',
        label: '守山市 赤ちゃんの駅',
        url: 'https://www.city.moriyama.lg.jp/kodomoseisaku/kosodateshien_3.html',
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
      {
        kind: 'municipal_page',
        slug: 'municipal-baby',
        label: '守山市 赤ちゃんの駅',
        url: 'https://www.city.moriyama.lg.jp/kodomoseisaku/kosodateshien_3.html',
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
      {
        kind: 'municipal_page',
        slug: 'municipal-baby',
        label: '守山市 赤ちゃんの駅',
        url: 'https://www.city.moriyama.lg.jp/kodomoseisaku/kosodateshien_3.html',
      },
    ],
  }),

  // --- 大津市 ---------------------------------------------------------------
  // First place surveyed for the PoC. Two independent audits of the same
  // research agreed on every value below except the ones left at `？`.
  park({
    id: 'ojigaoka-park',
    name: '皇子が丘公園',
    areaCode: 'shiga-otsu',
    // The city's own map centres the park here. The previous pair was ~1.5km
    // north-east, which matters now that the card leads with travel time.
    // Still a centroid, so `coordPrecision` stays 'locality' and the estimate
    // keeps its 「（目安）」.
    lat: 35.0204,
    lng: 135.8544,
    areaLabel: '大津市',
    category: 'large_park',
    notes: 'トイレは屋外5か所。遊具からの距離は未確認。体育館・プールは別施設で、その中の設備は数えていません',
    readSources: [
      {
        kind: 'municipal_page',
        slug: 'opendata-yugu',
        label: '大津市 都市公園遊具一覧（公園緑地課所管）',
        url: 'https://www.city.otsu.lg.jp/soshiki/035/1809/od/68228.html',
        checkedAt: '2026-09-08',
      },
      {
        kind: 'municipal_page',
        slug: 'opendata-toilet',
        label: '大津市 公衆トイレ一覧（公園緑地課所管）',
        url: 'https://www.city.otsu.lg.jp/soshiki/035/1809/od/61538.html',
        checkedAt: '2026-09-08',
      },
    ],
    equipment: {
      // 遊具一覧の皇子が丘公園の行に「砂場」1。
      sandbox: {
        value: '○',
        sourceKey: 'ojigaoka-park:opendata-yugu',
        verifiedAt: '2026-09-08',
        confidence: 1,
      },
      // 公衆トイレ一覧に屋外トイレ5か所（グラウンド / 旧憩いの村前 / 旧ユース前 /
      // プール上 / テニスコート上）。体育館内のものではありません。
      toilet: {
        value: '○',
        sourceKey: 'ojigaoka-park:opendata-toilet',
        verifiedAt: '2026-09-08',
        confidence: 1,
      },
    },
    candidateSources: [
      {
        kind: 'municipal_page',
        label: '大津市 皇子が丘公園',
        url: 'https://www.city.otsu.lg.jp/shisei/c/s/f/ps/park/1387954889254.html',
      },
      {
        kind: 'municipal_page',
        slug: 'municipal-park',
        label: '大津市 皇子が丘公園（公園緑地課）',
        url: 'https://www.city.otsu.lg.jp/soshiki/035/1809/g/koen/koen/1387446057398.html',
      },
      {
        kind: 'municipal_page',
        slug: 'municipal-baby',
        label: '大津市 赤ちゃんの駅 登録施設',
        url: 'https://www.city.otsu.lg.jp/soshiki/015/1488/g/ks/40844.html',
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
    notes: '浜大津〜近江大橋の約4.5kmの帯状公園。区域ごとに設備が違います。ここは市民プラザ側の値です',
    escapeRoute: 'LAGO（市民プラザ内）に屋内退避先。ただし営業時間内のみ',
    readSources: [
      {
        kind: 'municipal_page',
        slug: 'opendata-toilet',
        label: '大津市 公衆トイレ一覧（公園緑地課所管）',
        url: 'https://www.city.otsu.lg.jp/soshiki/035/1809/od/61538.html',
        checkedAt: '2026-09-08',
      },
      {
        kind: 'municipal_page',
        slug: 'municipal-saiseibi',
        label: '大津市 大津湖岸なぎさ公園（市民プラザ）の再整備について',
        url: 'https://www.city.otsu.lg.jp/soshiki/035/1809/g/keikaku/43995.html',
        checkedAt: '2026-09-08',
      },
    ],
    equipment: {
      // 公衆トイレ一覧に設置位置「市民プラザ」。膳所晴嵐1・2も同区域帯。
      toilet: {
        value: '○',
        sourceKey: 'otsu-kogan-nagisa:opendata-toilet',
        verifiedAt: '2026-09-08',
        confidence: 1,
      },
    },
    candidateSources: [
      {
        kind: 'municipal_page',
        label: '大津市 大津湖岸なぎさ公園（市民プラザ）',
        url: 'https://www.city.otsu.lg.jp/soshiki/035/1809/g/koen/n/index.html',
      },
      {
        kind: 'municipal_page',
        slug: 'municipal-baby',
        label: '大津市 赤ちゃんの駅 登録施設',
        url: 'https://www.city.otsu.lg.jp/soshiki/015/1488/g/ks/40844.html',
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
      {
        kind: 'municipal_page',
        slug: 'municipal-baby',
        label: '大津市 赤ちゃんの駅 登録施設',
        url: 'https://www.city.otsu.lg.jp/soshiki/015/1488/g/ks/40844.html',
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
        kind: 'official_site',
        slug: 'official-facility',
        label: '子どもの楽園 園内マップと施設',
        url: 'https://www.kyoto-ga.jp/kodomonorakuen/facilities/index.html',
      },
      {
        kind: 'official_site',
        slug: 'official-guide',
        label: '子どもの楽園 ご利用案内（開園時間・休園日）',
        url: 'https://www.kyoto-ga.jp/kodomonorakuen/guide/',
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

  // No 家・室内 fallback, and no seeded "usual spot".
  //
  // Both were padding to guarantee three cards. Neither is why a parent opens
  // this: they already know staying in is an option, and the card cost a slot
  // that a real place could use. buildRecommendations promotes a third outdoor
  // candidate when there is no home record, which is the answer the question
  // actually wants.
];
