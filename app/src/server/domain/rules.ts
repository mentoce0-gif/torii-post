import type { ConfidenceResult } from './confidence.ts';
import { isAbsent, isAvailable, isKnown } from './equipment.ts';
import type { TravelEstimate } from './travel.ts';
import {
  EQUIPMENT_LABELS,
  WEATHER_LABELS,
  type EquipmentMap,
  type Place,
  type PreferenceHistory,
  type Reason,
  type RecommendContext,
} from './types.ts';

export const RULE_SET_VERSION = 'v1';

export interface RuleInput {
  place: Place;
  equipment: EquipmentMap;
  context: RecommendContext;
  travel: TravelEstimate;
  confidence: ConfidenceResult;
  history: PreferenceHistory | null;
  visitCount: number;
  lastRevisitAnswer: 'yes' | 'conditional' | 'no' | null;
}

/**
 * Normalised 0..1 signals. These never leave the server: the client is given
 * the sentences below and a grade, not the arithmetic behind them.
 */
export interface Signals {
  timeFit: number;
  weatherFit: number;
  ageFit: number;
  equipmentFit: number;
  escapeRoute: number;
  endurance: number;
  novelty: number;
}

export interface RuleOutcome {
  reasons: Reason[];
  signals: Signals;
  /** Minutes left on site after the round trip. Can be negative. */
  playMinutes: number;
}

function ageLabel(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${months}か月`;
  return rest === 0 ? `${years}歳` : `${years}歳${rest}か月`;
}

/**
 * Evaluates one candidate against today's conditions.
 *
 * Every branch here answers "what would I want to be told before driving 30
 * minutes with a toddler in the back". None of them removes the candidate: the
 * three CTAs stay on screen whatever this returns.
 */
export function evaluate(input: RuleInput): RuleOutcome {
  const { place, equipment, context, travel, confidence, history, visitCount } = input;
  const reasons: Reason[] = [];

  const roundTripMinutes = travel.minutes === null ? null : travel.minutes * 2;
  const playMinutes =
    roundTripMinutes === null ? context.remainingMinutes : context.remainingMinutes - roundTripMinutes;

  // --- time -----------------------------------------------------------------
  let timeFit: number;
  if (place.kind === 'home') {
    timeFit = 1;
    reasons.push({ id: 'time.home', tone: 'good', text: '移動時間ゼロ。準備だけで始められます' });
  } else if (roundTripMinutes === null) {
    // No coordinate, so no claim about the clock either.
    timeFit = 0.6;
    reasons.push({ id: 'time.unknown', tone: 'unknown', text: '移動時間が未確認です' });
  } else if (playMinutes <= 0) {
    timeFit = 0;
    reasons.push({
      id: 'time.none',
      tone: 'caution',
      text: `残り${context.remainingMinutes}分では往復${roundTripMinutes}分で終わります`,
    });
  } else if (roundTripMinutes >= context.remainingMinutes * 0.5) {
    timeFit = 0.35;
    reasons.push({
      id: 'time.tight',
      tone: 'caution',
      text: `往復${roundTripMinutes}分。遊べる時間は約${playMinutes}分と短めです`,
    });
  } else {
    timeFit = 1;
    reasons.push({
      id: 'time.ok',
      tone: 'good',
      text: `残り時間内。現地で約${playMinutes}分`,
    });
  }

  // --- weather --------------------------------------------------------------
  let weatherFit = 0.6;
  const wet = context.weather === 'rain' || context.weather === 'snow';
  const hot = context.weather === 'hot';

  if (place.kind === 'indoor' || place.kind === 'home') {
    weatherFit = 1;
    if (wet) {
      reasons.push({ id: 'weather.indoor', tone: 'good', text: `${WEATHER_LABELS[context.weather]}でも屋内で完結します` });
    }
  } else if (wet) {
    if (isAbsent(place.indoorShelter)) {
      weatherFit = 0.1;
      reasons.push({
        id: 'weather.wet.noshelter',
        tone: 'caution',
        text: `${WEATHER_LABELS[context.weather]}。屋根のある逃げ場がありません`,
      });
    } else if (isAvailable(place.indoorShelter)) {
      weatherFit = 0.6;
      reasons.push({ id: 'weather.wet.shelter', tone: 'good', text: '屋根のある休憩場所があります' });
    } else if (!isKnown(place.indoorShelter)) {
      // Unknown is not a "no". We say so instead of scoring it as one.
      weatherFit = 0.45;
      reasons.push({
        id: 'weather.wet.unknown',
        tone: 'unknown',
        text: `${WEATHER_LABELS[context.weather]}ですが、屋根のある場所があるか未確認です`,
      });
    } else {
      weatherFit = 0.35;
      reasons.push({ id: 'weather.wet.weak', tone: 'caution', text: '雨天時の逃げ場は限定的です' });
    }
  } else if (hot) {
    const shade = equipment.shade;
    if (isAbsent(shade)) {
      weatherFit = 0.15;
      reasons.push({ id: 'weather.hot.noshade', tone: 'caution', text: '猛暑。日陰がないため暑さ条件が弱いです' });
    } else if (isAvailable(shade)) {
      weatherFit = 0.85;
      reasons.push({ id: 'weather.hot.shade', tone: 'good', text: '日陰があり、猛暑でも逃げられます' });
    } else if (!isKnown(shade)) {
      weatherFit = 0.5;
      reasons.push({ id: 'weather.hot.unknown', tone: 'unknown', text: '猛暑ですが、日陰は未確認です' });
    } else {
      weatherFit = 0.4;
      reasons.push({ id: 'weather.hot.weak', tone: 'caution', text: '日陰が少なめです。時間帯に注意' });
    }
  } else {
    weatherFit = 0.9;
  }

  // --- age ------------------------------------------------------------------
  const min = place.minAgeMonths;
  const max = place.maxAgeMonths;
  let ageFit = 1;
  if (min !== null && context.childAgeMonths < min) {
    ageFit = 0.25;
    reasons.push({
      id: 'age.young',
      tone: 'caution',
      text: `${ageLabel(min)}からの想定です。${ageLabel(context.childAgeMonths)}には早いかもしれません`,
    });
  } else if (max !== null && context.childAgeMonths > max) {
    ageFit = 0.5;
    reasons.push({ id: 'age.old', tone: 'caution', text: '対象年齢より上です。物足りない可能性があります' });
  } else if (place.kind !== 'home') {
    reasons.push({
      id: 'age.ok',
      tone: 'good',
      text: `${ageLabel(context.childAgeMonths)}でも使いやすい想定です`,
    });
  }

  // --- equipment ------------------------------------------------------------
  // Scored over confirmed fields only. `？` is neither credit nor penalty; it
  // is reported separately as information confidence.
  let scored = 0;
  let earned = 0;
  const weights: Partial<Record<keyof EquipmentMap, number>> = {
    toilet: 1.4,
    diaper: 1.2,
    shade: 1,
    water: 0.9,
    sandbox: 0.8,
    stroller: 0.7,
  };
  for (const [key, weight] of Object.entries(weights) as [keyof EquipmentMap, number][]) {
    const value = equipment[key];
    if (!isKnown(value)) continue;
    scored += weight;
    if (value === '○') earned += weight;
    else if (value === '△') earned += weight * 0.5;
  }
  const equipmentFit = scored === 0 ? 0.6 : earned / scored;

  if (isAvailable(equipment.sandbox) && isAbsent(equipment.water)) {
    reasons.push({ id: 'equip.sand.nowater', tone: 'caution', text: '砂場ありで水道なし。汚れ対策が必要です' });
  } else if (isAvailable(equipment.sandbox) && !isKnown(equipment.water)) {
    reasons.push({
      id: 'equip.sand.water.unknown',
      tone: 'unknown',
      text: '砂場はありますが水道が未確認です。着替えがあると安心です',
    });
  }

  if (isAbsent(equipment.toilet) && playMinutes >= 60) {
    reasons.push({ id: 'equip.notoilet.long', tone: 'caution', text: 'トイレがないため長居には不向きです' });
  } else if (!isKnown(equipment.toilet) && playMinutes >= 60) {
    reasons.push({ id: 'equip.toilet.unknown', tone: 'unknown', text: '長居する場合、トイレが未確認な点に注意' });
  }

  if (isAbsent(equipment.diaper)) {
    reasons.push({ id: 'equip.nodiaper', tone: 'caution', text: 'オムツ台なし。車内で替える前提になります' });
  }

  // --- escape route ---------------------------------------------------------
  const escapeRoute = place.escapeRoute ? 1 : 0.4;
  if (place.escapeRoute) {
    reasons.push({ id: 'escape.ok', tone: 'good', text: `逃げ道: ${place.escapeRoute}` });
  } else if (place.kind !== 'home') {
    reasons.push({ id: 'escape.unknown', tone: 'unknown', text: 'ぐずったときの逃げ道は未整理です' });
  }

  // --- endurance history ----------------------------------------------------
  let endurance = 0.7;
  if (history && history.samples > 0) {
    if (history.avgStayMinutes < 15) {
      endurance = 0.2;
      reasons.push({
        id: 'history.short',
        tone: 'caution',
        text: `前回このタイプは平均${Math.round(history.avgStayMinutes)}分でした`,
      });
    } else if (history.avgStayMinutes >= 45) {
      endurance = 1;
      reasons.push({
        id: 'history.long',
        tone: 'good',
        text: `このタイプは平均${Math.round(history.avgStayMinutes)}分もっています`,
      });
    } else {
      endurance = 0.7;
    }
  }
  if (input.lastRevisitAnswer === 'no') {
    endurance = Math.min(endurance, 0.15);
    reasons.push({ id: 'history.revisit.no', tone: 'caution', text: '前回「もういい」と記録しています' });
  }

  // --- novelty --------------------------------------------------------------
  // The product exists to get people somewhere new, so an unvisited place gets
  // a nudge — never an override.
  const novelty = place.kind === 'home' || place.kind === 'usual' ? 0.3 : visitCount === 0 ? 1 : 0.5;
  if (visitCount === 0 && place.kind === 'outdoor') {
    reasons.push({ id: 'novelty.new', tone: 'good', text: 'まだ行っていない場所です' });
  }

  // --- hours ----------------------------------------------------------------
  if (place.hoursStatus === 'unverified') {
    reasons.push({ id: 'hours.unverified', tone: 'unknown', text: '利用可能時間 未確認' });
  }

  // --- information confidence (reported, never used to exclude) --------------
  if (confidence.unknownKeys.length === confidence.totalCount) {
    reasons.push({
      id: 'confidence.none',
      tone: 'unknown',
      text: '主要6項目すべてが未確認です',
    });
  } else if (confidence.unknownKeys.length >= 3) {
    reasons.push({
      id: 'confidence.low',
      tone: 'unknown',
      text: `未確認が${confidence.unknownKeys.length}項目あります`,
    });
  } else if (confidence.unknownKeys.length === 0) {
    reasons.push({ id: 'confidence.full', tone: 'good', text: '主要6項目すべて確認済みです' });
  } else {
    const names = confidence.unknownKeys.map((key) => EQUIPMENT_LABELS[key]).join('・');
    reasons.push({ id: 'confidence.partial', tone: 'unknown', text: `${names}が未確認です` });
  }

  return {
    reasons,
    playMinutes,
    signals: { timeFit, weatherFit, ageFit, equipmentFit, escapeRoute, endurance, novelty },
  };
}
