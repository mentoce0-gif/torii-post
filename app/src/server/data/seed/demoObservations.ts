import type { EquipmentValue } from '../../domain/types.ts';

/**
 * Illustrative facility values, loaded only when SEED_PROFILE=demo.
 *
 * These are NOT facts. They exist so the four screens can be demonstrated with
 * a realistic mix of ○ / △ / × / ？ before a curator has surveyed anything.
 * Every value written from this file is stored with source kind
 * `demo_placeholder`, and any card carrying one makes the client show a
 * persistent "デモデータ" banner. Running with SEED_PROFILE=poc ignores this
 * file entirely and every unsurveyed field stays `？`.
 *
 * Do not promote a value from here into places.ts. Survey it instead.
 */

export interface DemoObservation {
  placeId: string;
  equipment: Partial<Record<string, EquipmentValue>>;
  priceLabel?: string;
  escapeRoute?: string;
  indoorShelter?: EquipmentValue;
}

export const DEMO_OBSERVATIONS: DemoObservation[] = [
  {
    placeId: 'yabase-kihanjima',
    equipment: { sandbox: '○', shade: '○', water: '？', toilet: '○', diaper: '○', stroller: '△' },
    priceLabel: '無料エリアあり（未確認）',
    escapeRoute: '駐車場が近く、ぐずったら車に戻れる',
    indoorShelter: '△',
  },
  {
    placeId: 'enmadou-park',
    equipment: { sandbox: '○', shade: '△', water: '？', toilet: '○', diaper: '？', stroller: '○' },
    priceLabel: '無料（未確認）',
    escapeRoute: '住宅街のため、すぐ車に戻れる',
    indoorShelter: '×',
  },
  {
    placeId: 'rokuha-park',
    equipment: { sandbox: '？', shade: '○', water: '○', toilet: '○', diaper: '？', stroller: '△' },
    priceLabel: '駐車場有料（未確認）',
    indoorShelter: '？',
  },
  {
    placeId: 'kusatsugawa-deai',
    equipment: { sandbox: '×', shade: '△', water: '？', toilet: '○', diaper: '？', stroller: '○' },
    priceLabel: '無料（未確認）',
    escapeRoute: '商業施設が隣接',
    indoorShelter: '△',
  },
  {
    placeId: 'moriyama-sports-park',
    equipment: { sandbox: '？', shade: '？', water: '？', toilet: '○', diaper: '？', stroller: '？' },
    indoorShelter: '？',
  },
  {
    placeId: 'dai2-nagisa',
    equipment: { sandbox: '×', shade: '×', water: '？', toilet: '△', diaper: '×', stroller: '○' },
    priceLabel: '無料（未確認）',
    escapeRoute: '駐車場から近い',
    indoorShelter: '×',
  },
  {
    placeId: 'ojigaoka-park',
    equipment: { sandbox: '○', shade: '○', water: '○', toilet: '○', diaper: '？', stroller: '△' },
    indoorShelter: '△',
  },
  {
    placeId: 'umekoji-park',
    equipment: { sandbox: '○', shade: '○', water: '○', toilet: '○', diaper: '○', stroller: '○' },
    priceLabel: '公園は無料（未確認）',
    escapeRoute: '屋内施設と駅が近い',
    indoorShelter: '○',
  },
  {
    placeId: 'takaragaike-kodomo',
    equipment: { sandbox: '○', shade: '○', water: '？', toilet: '○', diaper: '△', stroller: '△' },
    indoorShelter: '△',
  },
];
