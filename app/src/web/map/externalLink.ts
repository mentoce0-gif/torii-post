import { h } from '../dom.ts';
import type { MapPin, MapProvider, MapScene } from './adapter.ts';

/**
 * The no-map map: three links out, nothing rendered in-app. Useful when a PoC
 * household would rather stay in their own navigation app, and a demonstration
 * that the adapter boundary is real.
 */
export class ExternalLinkMapProvider implements MapProvider {
  readonly id = 'external_link';

  render(scene: MapScene): HTMLElement {
    if (scene.pins.length === 0) {
      return h('p', { class: 'empty', text: '地図に表示できる位置情報がありません' });
    }
    return h(
      'ul',
      { class: 'map-links' },
      ...scene.pins.map((pin) =>
        h(
          'li',
          {},
          h('a', {
            class: 'btn btn-secondary',
            href: this.directionsUrl(pin),
            target: '_blank',
            rel: 'noopener noreferrer',
            text: `${pin.rank}. ${pin.label}${pin.note ? `（${pin.note}）` : ''} を地図アプリで開く`,
          }),
        ),
      ),
    );
  }

  directionsUrl(pin: MapPin): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}`;
  }
}
