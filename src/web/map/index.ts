import type { MapProvider } from './adapter.ts';
import { ExternalLinkMapProvider } from './externalLink.ts';
import { SchematicMapProvider } from './schematic.ts';

/** Chosen by MAP_PROVIDER on the server and read once at boot. */
export function createMapProvider(id: string): MapProvider {
  return id === 'external_link' ? new ExternalLinkMapProvider() : new SchematicMapProvider();
}

export type { MapPin, MapProvider, MapScene } from './adapter.ts';
