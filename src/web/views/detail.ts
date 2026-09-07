import { ApiError, api, type PlaceDetail } from '../api.ts';
import { track } from '../analytics.ts';
import { fitAndConfidence } from '../components/confidence.ts';
import { equipmentGrid, equipmentLegend } from '../components/equipment.ts';
import { reasonList } from '../components/reasons.ts';
import { decide } from '../decision.ts';
import { h, mount } from '../dom.ts';
import { back, navigate } from '../router.ts';
import { findCandidate, store } from '../state.ts';
import { MOBILITY_LABELS, errorState, loading, placeholderBanner, travelLabel } from '../ui.ts';

const REVISIT_LABELS: Record<string, string> = {
  yes: 'また行く',
  conditional: '条件付き',
  no: 'もういい',
};

function header(detail: PlaceDetail): HTMLElement {
  return h(
    'header',
    { class: 'detail-head' },
    h('button', { class: 'back', type: 'button', text: '← 戻る', onClick: () => back() }),
    h('h1', { class: 'detail-name', text: detail.name }),
    h(
      'p',
      { class: 'place-meta' },
      `${detail.areaLabel}・${travelLabel(detail.travelMinutes, detail.travelPrecision, MOBILITY_LABELS[store.conditions.mobility] ?? '')}・${detail.priceLabel}`,
    ),
    h(
      'p',
      { class: detail.hoursVerified ? 'hours' : 'hours hours-unverified' },
      detail.hoursLabel,
    ),
  );
}

function sourceList(detail: PlaceDetail): HTMLElement | null {
  if (detail.sources.length === 0) return null;
  return h(
    'section',
    { class: 'section' },
    h('h2', { class: 'section-title', text: '情報の出どころ' }),
    h(
      'ul',
      { class: 'sources' },
      ...detail.sources.map((source) =>
        h(
          'li',
          {},
          source.url
            ? h('a', { href: source.url, target: '_blank', rel: 'noopener noreferrer', text: source.label })
            : h('span', { text: source.label }),
          h('span', {
            class: 'source-state',
            text: source.checkedAt ? `確認 ${source.checkedAt}` : '未確認',
          }),
        ),
      ),
    ),
  );
}

export async function renderDetail(root: HTMLElement, placeId: string): Promise<void> {
  mount(root, loading('情報を読み込んでいます'));

  const sessionId = store.session?.response.sessionId ?? null;
  const candidate = findCandidate(placeId);

  let detail: PlaceDetail;
  try {
    detail = await api.place(placeId, sessionId);
  } catch (error) {
    mount(
      root,
      errorState(
        error instanceof ApiError ? error.message : '情報を取得できませんでした',
        () => void renderDetail(root, placeId),
      ),
    );
    return;
  }

  track({ name: 'place_detail_open', sessionId, placeId, recommendationRank: candidate?.rank ?? null });

  const canDecide = sessionId !== null;

  mount(
    root,
    h(
      'div',
      { class: 'detail' },
      detail.hasPlaceholderData ? placeholderBanner() : null,
      header(detail),
      fitAndConfidence(detail.fitGrade, detail.confidence),
      h(
        'section',
        { class: 'section' },
        h('h2', { class: 'section-title', text: '装備' }),
        equipmentGrid(detail.equipment),
        equipmentLegend(),
      ),
      detail.unknownNote
        ? h(
            'section',
            { class: 'section section-unknown' },
            h('h2', { class: 'section-title', text: '未確認' }),
            h('p', { class: 'body-text', text: detail.unknownNote }),
            h('p', { class: 'body-text muted', text: '推測で ○ や × にはしていません。' }),
          )
        : null,
      h(
        'section',
        { class: 'section' },
        h('h2', { class: 'section-title', text: '逃げ道' }),
        h('p', {
          class: 'body-text',
          text: detail.escapeRoute ?? 'ぐずったときの逃げ道は未整理です',
        }),
      ),
      detail.reasons.length > 0
        ? h(
            'section',
            { class: 'section' },
            h('h2', { class: 'section-title', text: '今日の判断材料' }),
            reasonList(detail.reasons),
          )
        : null,
      h(
        'section',
        { class: 'section' },
        h('h2', { class: 'section-title', text: '過去の利用' }),
        h('p', {
          class: 'body-text',
          text:
            detail.pastVisits === 0
              ? 'まだ行っていません'
              : `${detail.pastVisits}回行きました${
                  detail.lastRevisit ? `／前回の判定: ${REVISIT_LABELS[detail.lastRevisit] ?? ''}` : ''
                }`,
        }),
      ),
      sourceList(detail),
      detail.coords
        ? h(
            'div',
            { class: 'secondary-actions' },
            h('button', {
              class: 'btn btn-quiet',
              type: 'button',
              text: '地図で見る',
              onClick: () => navigate('#/map'),
            }),
          )
        : null,
      canDecide
        ? h(
            'div',
            { class: 'decision-bar decision-bar-detail' },
            h('button', {
              class: 'btn btn-primary',
              type: 'button',
              text: '行く',
              onClick: () =>
                void decide({
                  kind: 'go',
                  sessionId: sessionId as string,
                  recommendationId: candidate?.recommendationId ?? null,
                  placeId,
                  rank: candidate?.rank ?? null,
                }),
            }),
            h('button', {
              class: 'btn btn-outline',
              type: 'button',
              text: '見送る',
              onClick: () =>
                void decide({
                  kind: 'skip',
                  sessionId: sessionId as string,
                  recommendationId: candidate?.recommendationId ?? null,
                  placeId,
                  rank: candidate?.rank ?? null,
                }),
            }),
            h('button', {
              class: 'btn btn-outline',
              type: 'button',
              text: 'いつもの場',
              onClick: () =>
                void decide({
                  kind: 'usual',
                  sessionId: sessionId as string,
                  recommendationId: null,
                }),
            }),
          )
        : h('p', { class: 'body-text muted', text: 'ホームから候補を出すと、ここで判断できます' }),
    ),
  );
}
