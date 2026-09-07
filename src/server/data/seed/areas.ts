/**
 * The manual fallback for when location is refused, and the coarse form any
 * origin is reduced to before it is written down. Town centroids only —
 * roughly a kilometre of resolution, which is all a travel estimate needs and
 * far less than a home address.
 */
export interface Area {
  code: string;
  label: string;
  lat: number;
  lng: number;
}

export const AREAS: Area[] = [
  { code: 'shiga-kusatsu', label: '草津市', lat: 35.0128, lng: 135.9605 },
  { code: 'shiga-moriyama', label: '守山市', lat: 35.0587, lng: 135.9926 },
  { code: 'shiga-otsu', label: '大津市', lat: 35.0164, lng: 135.8547 },
  { code: 'shiga-ritto', label: '栗東市', lat: 35.0225, lng: 136.0022 },
  { code: 'kyoto-shimogyo', label: '京都市下京区', lat: 34.9903, lng: 135.7595 },
  { code: 'kyoto-sakyo', label: '京都市左京区', lat: 35.0264, lng: 135.7822 },
  { code: 'kyoto-fushimi', label: '京都市伏見区', lat: 34.9323, lng: 135.7626 },
];

export const AREA_BY_CODE = new Map(AREAS.map((area) => [area.code, area]));

/** Nearest listed town. Used to label a GPS fix without storing the fix. */
export function nearestArea(lat: number, lng: number): Area {
  let best = AREAS[0] as Area;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const area of AREAS) {
    const d = (area.lat - lat) ** 2 + (area.lng - lng) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = area;
    }
  }
  return best;
}
