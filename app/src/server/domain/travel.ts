import type { Mobility, Origin, Place } from './types.ts';

/**
 * Door-to-door speeds, not vehicle speeds: they already absorb traffic lights,
 * a lakeside detour, and finding the car park. Deliberately pessimistic — a
 * candidate that turns out to be closer than promised does no harm; one that
 * turns out to be further eats the 90 minutes the parent actually has.
 */
const SPEED_KMH: Record<Mobility, number> = {
  car: 26,
  walk: 4.2,
  bicycle: 13,
  transit: 17,
};

/** Getting out of the door with a one-year-old is not free. */
const DEFAULT_PREP_MINUTES: Record<Mobility, number> = {
  car: 6,
  walk: 3,
  bicycle: 6,
  transit: 9,
};

export function defaultPrepMinutes(mode: Mobility): number {
  return DEFAULT_PREP_MINUTES[mode];
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Straight-line distance underestimates road distance almost everywhere. 1.35
 * is the usual detour factor for a road network of this density.
 */
const DETOUR_FACTOR = 1.35;

/**
 * `measured`  — a surveyed coordinate, routed distance.
 * `estimate`  — a town-centroid coordinate; the number is a ballpark and is
 *               labelled as one.
 * `unknown`   — no coordinate at all. `minutes` is null and stays null: a
 *               plausible-looking number here would be exactly the invention
 *               this product refuses to make elsewhere.
 */
export type TravelPrecision = 'measured' | 'estimate' | 'unknown';

export interface TravelEstimate {
  minutes: number | null;
  distanceKm: number | null;
  precision: TravelPrecision;
}

export function estimateTravel(
  origin: Origin,
  place: Place,
  mobility: Mobility,
  prepMinutes: number,
): TravelEstimate {
  if (place.kind === 'home') {
    return { minutes: 0, distanceKm: 0, precision: 'measured' };
  }

  const hasOrigin = typeof origin.lat === 'number' && typeof origin.lng === 'number';
  const hasPlace = typeof place.lat === 'number' && typeof place.lng === 'number';

  if (!hasOrigin || !hasPlace) {
    return { minutes: null, distanceKm: null, precision: 'unknown' };
  }

  const distanceKm =
    haversineKm(
      { lat: origin.lat as number, lng: origin.lng as number },
      { lat: place.lat as number, lng: place.lng as number },
    ) * DETOUR_FACTOR;

  const minutes = Math.round((distanceKm / SPEED_KMH[mobility]) * 60 + prepMinutes);
  return {
    minutes: Math.max(1, minutes),
    distanceKm,
    precision: place.coordPrecision === 'exact' ? 'measured' : 'estimate',
  };
}
