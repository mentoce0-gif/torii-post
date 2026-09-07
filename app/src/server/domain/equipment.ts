import {
  EQUIPMENT_KEYS,
  EQUIPMENT_VALUES,
  UNKNOWN,
  type EquipmentKey,
  type EquipmentMap,
  type EquipmentValue,
} from './types.ts';

/** Every key is always present. Absence of data is `？`, never a blank cell. */
export function emptyEquipment(): EquipmentMap {
  const map = {} as EquipmentMap;
  for (const key of EQUIPMENT_KEYS) map[key] = UNKNOWN;
  return map;
}

export function isEquipmentValue(value: unknown): value is EquipmentValue {
  return typeof value === 'string' && (EQUIPMENT_VALUES as readonly string[]).includes(value);
}

export function isEquipmentKey(key: unknown): key is EquipmentKey {
  return typeof key === 'string' && (EQUIPMENT_KEYS as readonly string[]).includes(key);
}

/** True only when the value states something. `？` states nothing. */
export function isKnown(value: EquipmentValue): boolean {
  return value !== UNKNOWN;
}

/**
 * True when the field is confirmed usable. `△` is a qualified yes and does not
 * count; `？` is not an answer at all and must never reach here as `true`.
 */
export function isAvailable(value: EquipmentValue): boolean {
  return value === '○';
}

/** True only for a confirmed absence. `？` is not an absence. */
export function isAbsent(value: EquipmentValue): boolean {
  return value === '×';
}

export function unknownKeys(equipment: EquipmentMap): EquipmentKey[] {
  return EQUIPMENT_KEYS.filter((key) => !isKnown(equipment[key]));
}

export function knownKeys(equipment: EquipmentMap): EquipmentKey[] {
  return EQUIPMENT_KEYS.filter((key) => isKnown(equipment[key]));
}
