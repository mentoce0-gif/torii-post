import { track } from '../analytics.ts';
import { h, mount } from '../dom.ts';
import { createMapProvider, type MapPin } from '../map/index.ts';
import { back } from '../router.ts';
import { store } from '../state.ts';
import { MOBILITY_LABELS, emptyState, travelLabel } from '../ui.ts';

const AREA_CENTRES: Record<string, { lat: number; lng: number }> = {
  'shiga-kusatsu': { lat: 35.0128, lng: 135.9605 },
  'shiga-moriyama': { lat: 35.0587, lng: 135.9926 },
  'shiga-otsu': { lat: 35.0164, lng: 135.8547 },
  'shiga-ritto': { lat: 35.0225, lng: 136.0022 },
  'kyoto-shimogyo': { lat: 34.9903, lng: 135.7595 },
  'kyoto-sakyo': { lat: 35.0264, lng: 135.7822 },
  'kyoto-fushimi': { lat: 34.9323, lng: 135.7626 },
};

/**
 * Reached only from the cards, never before them, and it shows exactly what the
 * cards already contained. No search, no browsing, no "what else is near here".
 */
export function renderMap(root: HTMLElement): void {
  const session = store.session;
  if (!session) {
    mount(
      root,
      h(
        'div',
        { class: 'page' },
        h('button', { class: 'back', type: 'button', text: '← 戻る', onClick: () => back() }),
        emptyState('先にホームで候補を出してください'),
      ),
    );
    return;
  }

  track({ name: 'map_open', sessionId: session.response.sessionId });

  const pins: MapPin[] = session.response.candidates
    .filter((candidate) => candidate.coords !== null)
    .map((candidate) => ({
      id: candidate.placeId,
      label: candidate.name,
      rank: candidate.rank,
      lat: (candidate.coords as { lat: number }).lat,
      lng: (candidate.coords as { lng: number }).lng,
      note: travelLabel(
        candidate.travelMinutes,
        candidate.travelPrecision,
        MOBILITY_LABELS[session.response.context.mobility] ?? '',
      ),
    }));

  const centre = AREA_CENTRES[session.response.context.areaCode] ?? null;
  const provider = createMapProvider(store.mapProvider);

  mount(
    root,
    h(
      'div',
      { class: 'page' },
      h('button', { class: 'back', type: 'button', text: '← 候補に戻る', onClick: () => back() }),
      h('h1', { class: 'page-title', text: '地図で見る' }),
      provider.render({
        origin: centre ? { ...centre, label: session.response.context.areaLabel } : null,
        pins,
      }),
    ),
  );
}
