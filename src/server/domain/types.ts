/**
 * Domain types for the "今日どうする？" decision layer.
 *
 * Nothing in this directory is shipped to the browser. The client receives the
 * rendered result of these rules (grades, percentages, sentences), never the
 * inputs, weights, or thresholds that produced them.
 */

/** The only four values a facility field may ever hold. Blank is not allowed. */
export type EquipmentValue = '○' | '△' | '×' | '？';

export const EQUIPMENT_VALUES: readonly EquipmentValue[] = ['○', '△', '×', '？'];

/**
 * `？` means "we could not confirm this", not "this is missing". Treating it as
 * `×` would invent a fact; treating it as `○` would invent a better one. Both
 * are bugs, and both are covered by tests.
 */
export const UNKNOWN: EquipmentValue = '？';

/** The six fields a one-year-old's outing actually turns on. */
export const EQUIPMENT_KEYS = [
  'sandbox',
  'shade',
  'water',
  'toilet',
  'diaper',
  'stroller',
] as const;

export type EquipmentKey = (typeof EQUIPMENT_KEYS)[number];

export const EQUIPMENT_LABELS: Record<EquipmentKey, string> = {
  sandbox: '砂場',
  shade: '日陰',
  water: '水道',
  toilet: 'トイレ',
  diaper: 'オムツ台',
  stroller: 'ベビーカー',
};

export type EquipmentMap = Record<EquipmentKey, EquipmentValue>;

/**
 * Where a value came from. `demo_placeholder` exists so that illustrative data
 * can never be mistaken for a confirmed fact: it is loaded only under
 * SEED_PROFILE=demo and the UI banners it.
 */
export type SourceKind =
  | 'official_site'
  | 'municipal_page'
  | 'curator_field_note'
  | 'household_report'
  | 'demo_placeholder';

export interface PlaceSource {
  id: string;
  placeId: string;
  kind: SourceKind;
  label: string;
  url: string | null;
  checkedAt: string | null;
}

export interface PlaceEquipment {
  id: string;
  placeId: string;
  key: EquipmentKey;
  value: EquipmentValue;
  sourceId: string | null;
  verifiedAt: string | null;
  /** 0..1. How much weight the curator puts on this particular reading. */
  confidence: number;
}

export type PlaceKind = 'outdoor' | 'indoor' | 'usual' | 'home';

/** Whether the place can be used at a given time. Never guessed. */
export type HoursStatus = 'unverified' | 'always_open' | 'documented';

/** How much a coordinate can be trusted. Locality means "somewhere in that town". */
export type CoordPrecision = 'exact' | 'locality';

export interface Place {
  id: string;
  name: string;
  areaCode: string;
  areaLabel: string;
  kind: PlaceKind;
  lat: number | null;
  lng: number | null;
  coordPrecision: CoordPrecision;
  /** Free-text price band, e.g. "無料" / "駐車場 450円" / "未確認". */
  priceLabel: string;
  /** Covered/indoor shelter exists on site, used by the weather rules. */
  indoorShelter: EquipmentValue;
  /** The "逃げ道": what you do when it goes wrong. */
  escapeRoute: string | null;
  hoursStatus: HoursStatus;
  hoursLabel: string;
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
  /** Category used for endurance history, e.g. "large_park". */
  category: string;
  notes: string | null;
  updatedAt: string;
}

export interface PlaceWithEquipment {
  place: Place;
  equipment: EquipmentMap;
  equipmentRows: PlaceEquipment[];
  sources: PlaceSource[];
}

export type Mobility = 'car' | 'walk' | 'bicycle' | 'transit';

export type Weather = 'sunny' | 'cloudy' | 'rain' | 'snow' | 'hot' | 'cold';

export const WEATHER_LABELS: Record<Weather, string> = {
  sunny: '晴れ',
  cloudy: 'くもり',
  rain: '雨',
  snow: '雪',
  hot: '猛暑',
  cold: '寒い',
};

export const MOBILITY_LABELS: Record<Mobility, string> = {
  car: '車',
  walk: '徒歩',
  bicycle: '自転車',
  transit: '公共交通',
};

/** Coarse origin. Raw GPS never reaches storage; see docs/PRIVACY notes. */
export interface Origin {
  lat?: number;
  lng?: number;
  areaCode?: string;
}

export interface RecommendContext {
  childAgeMonths: number;
  remainingMinutes: number;
  mobility: Mobility;
  weather: Weather;
  origin: Origin;
}

export type FitGrade = '◎' | '○' | '△';

export type ReasonTone = 'good' | 'caution' | 'unknown';

/** A sentence the user reads. Deliberately carries no score. */
export interface Reason {
  id: string;
  tone: ReasonTone;
  text: string;
}

export type DecisionKind = 'go' | 'skip' | 'usual';

export type Reaction = 'bored_fast' | 'ok' | 'lasted';
export type StayBucket = 'under15' | 'about30' | 'over60' | 'custom';
export type Revisit = 'yes' | 'conditional' | 'no';
export type SubjectiveAnswer = 'faster' | 'same' | 'slower';

export type ParentRole = 'father' | 'mother' | 'grandparent' | 'other';

export interface Household {
  id: string;
  createdAt: string;
  homeAreaCode: string | null;
  homeAreaLabel: string | null;
  usualPlaceId: string | null;
  notificationOptIn: boolean;
  subjectivePromptCount: number;
  subjectivePromptLastAt: string | null;
  returnMarks: string;
}

export interface Parent {
  id: string;
  householdId: string;
  role: ParentRole;
  label: string | null;
}

/** No name, no date of day: year and month only. */
export interface Child {
  id: string;
  householdId: string;
  birthYear: number;
  birthMonth: number;
  /** Optional short handle chosen by the parent. Never required, never a real name. */
  handle: string | null;
}

export interface MobilityProfile {
  id: string;
  householdId: string;
  mode: Mobility;
  /** Minutes of getting-out-of-the-door overhead for this household. */
  prepMinutes: number;
}

export interface RecommendationSession {
  id: string;
  householdId: string;
  createdAt: string;
  shownAt: string | null;
  contextJson: string;
}

export interface Recommendation {
  id: string;
  sessionId: string;
  placeId: string;
  rank: number;
  fitGrade: FitGrade;
  confidencePct: number;
  travelMinutes: number | null;
  reasonsJson: string;
}

export interface Decision {
  id: string;
  sessionId: string;
  recommendationId: string | null;
  placeId: string | null;
  kind: DecisionKind;
  decidedAt: string;
  timeToDecisionMs: number | null;
  clientElapsedMs: number | null;
}

export interface Visit {
  id: string;
  decisionId: string;
  householdId: string;
  placeId: string;
  createdAt: string;
}

export interface VisitFeedback {
  id: string;
  visitId: string;
  reaction: Reaction;
  stayMinutes: number;
  stayBucket: StayBucket;
  revisit: Revisit;
  note: string | null;
  createdAt: string;
}

export interface PreferenceHistory {
  id: string;
  householdId: string;
  category: string;
  samples: number;
  avgStayMinutes: number;
  lastReaction: Reaction | null;
  updatedAt: string;
}
