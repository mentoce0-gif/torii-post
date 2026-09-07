import { h } from '../dom.ts';
import type { MapPin, MapProvider, MapScene } from './adapter.ts';

const SIZE = 320;
const PADDING = 44;

/**
 * A tile-free relative map: where the three candidates sit around you, and how
 * far. No basemap, no third-party request, no other pins to browse.
 *
 * It is honest about what it is — the seeded coordinates are town-level, so a
 * street map would imply a precision the data does not have.
 */
export class SchematicMapProvider implements MapProvider {
  readonly id = 'schematic';

  render(scene: MapScene): HTMLElement {
    const origin = scene.origin;
    if (!origin || scene.pins.length === 0) {
      return h('p', { class: 'empty', text: '地図に表示できる位置情報がありません' });
    }

    const points = scene.pins.map((pin) => ({
      pin,
      dx: (pin.lng - origin.lng) * Math.cos((origin.lat * Math.PI) / 180),
      dy: pin.lat - origin.lat,
    }));

    const span = Math.max(
      0.01,
      ...points.map((p) => Math.max(Math.abs(p.dx), Math.abs(p.dy))),
    );
    const scale = (SIZE / 2 - PADDING) / span;
    const centre = SIZE / 2;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
    svg.setAttribute('class', 'schematic-map');
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      `${origin.label}から見た候補${scene.pins.length}件の位置関係`,
    );

    const ns = 'http://www.w3.org/2000/svg';
    const make = (tag: string, attrs: Record<string, string>) => {
      const node = document.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      return node;
    };

    for (const radius of [0.34, 0.62, 0.9]) {
      svg.append(
        make('circle', {
          cx: String(centre),
          cy: String(centre),
          r: String((SIZE / 2 - PADDING) * radius + PADDING / 2),
          class: 'ring',
        }),
      );
    }

    for (const point of points) {
      const x = centre + point.dx * scale;
      const y = centre - point.dy * scale;
      svg.append(
        make('line', {
          x1: String(centre),
          y1: String(centre),
          x2: String(x),
          y2: String(y),
          class: 'spoke',
        }),
      );
      svg.append(make('circle', { cx: String(x), cy: String(y), r: '17', class: 'pin' }));
      const label = make('text', {
        x: String(x),
        y: String(y + 6),
        class: 'pin-rank',
        'text-anchor': 'middle',
      });
      label.textContent = String(point.pin.rank);
      svg.append(label);
    }

    svg.append(make('circle', { cx: String(centre), cy: String(centre), r: '9', class: 'origin' }));

    return h(
      'div',
      { class: 'map-wrap' },
      svg,
      h(
        'ol',
        { class: 'map-key' },
        ...points.map((point) =>
          h(
            'li',
            {},
            h('span', { class: 'map-key-rank', text: String(point.pin.rank) }),
            h(
              'span',
              { class: 'map-key-body' },
              h('span', { class: 'map-key-name', text: point.pin.label }),
              point.pin.note ? h('span', { class: 'map-key-note', text: point.pin.note }) : null,
            ),
          ),
        ),
      ),
      h('p', {
        class: 'legend',
        text: `現在地と候補${scene.pins.length}件のみを表示しています（周辺施設は出しません）`,
      }),
    );
  }

  directionsUrl(pin: MapPin): string {
    // Handing off to whatever navigation app the phone has, without embedding one.
    return `https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}`;
  }
}
