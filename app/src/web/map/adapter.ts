export interface MapPin {
  id: string;
  label: string;
  rank: number;
  lat: number;
  lng: number;
  /** Travel time as the card stated it, so the map adds context rather than repeating. */
  note?: string;
}

export interface MapScene {
  origin: { lat: number; lng: number; label: string } | null;
  pins: MapPin[];
}

/**
 * The whole map surface, kept deliberately small.
 *
 * The product's position is that a map invites comparison shopping, which is
 * the cost this app exists to remove — so the contract is "current position and
 * these three", never "what else is around here". A Leaflet, MapLibre or Google
 * implementation slots in behind this without any screen changing, and would
 * still only ever be handed three pins.
 */
export interface MapProvider {
  readonly id: string;
  render(scene: MapScene): HTMLElement;
  /** A link out to a real navigation app, or null if the provider has none. */
  directionsUrl(pin: MapPin): string | null;
}
