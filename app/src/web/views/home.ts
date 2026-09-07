import { ApiError, api, setHouseholdId, type Candidate } from '../api.ts';
import { track } from '../analytics.ts';
import { fitAndConfidence, unknownNote } from '../components/confidence.ts';
import { equipmentGrid, equipmentLegend } from '../components/equipment.ts';
import { h, mount } from '../dom.ts';
import { navigate } from '../router.ts';
import { saveConditions, store, type Conditions } from '../state.ts';
import {
  MOBILITY_LABELS,
  WEATHER_ICONS,
  WEATHER_LABELS,
  ageLabel,
  errorState,
  loading,
  placeholderBanner,
  travelLabel,
} from '../ui.ts';
import { decide } from '../decision.ts';

const AREA_FALLBACK: { code: string; label: string }[] = [
  { code: 'shiga-kusatsu', label: '草津市' },
  { code: 'shiga-moriyama', label: '守山市' },
  { code: 'shiga-otsu', label: '大津市' },
  { code: 'shiga-ritto', label: '栗東市' },
  { code: 'kyoto-shimogyo', label: '京都市下京区' },
  { code: 'kyoto-sakyo', label: '京都市左京区' },
  { code: 'kyoto-fushimi', label: '京都市伏見区' },
];

const COPY_KEY = 'kns.homeCopy';

/** Two headline variants, so the wording itself can be A/B'd during the PoC. */
export function homeHeadline(): string {
  try {
    return localStorage.getItem(COPY_KEY) === 'b' ? '今日、知らない場に出る？' : '今日どうする？';
  } catch {
    return '今日どうする？';
  }
}

/** A GPS fix, or nothing. Refusal is a normal outcome, not an error path. */
function locate(): Promise<{ lat: number; lng: number } | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), 6000);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timer);
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        window.clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 300_000 },
    );
  });
}

function conditionBar(conditions: Conditions, areaLabel: string | null, onEdit: () => void): HTMLElement {
  const summary = [
    ageLabel(conditions.childAgeMonths),
    MOBILITY_LABELS[conditions.mobility] ?? conditions.mobility,
    `あと${conditions.remainingMinutes}分`,
  ].join(' / ');

  return h(
    'button',
    { class: 'condition-bar', type: 'button', onClick: onEdit, 'aria-label': '条件を変更する' },
    h(
      'span',
      { class: 'condition-main' },
      h('span', { class: 'weather-icon', 'aria-hidden': 'true', text: WEATHER_ICONS[conditions.weather] ?? '☁' }),
      h('span', { text: WEATHER_LABELS[conditions.weather] ?? conditions.weather }),
      areaLabel ? h('span', { class: 'condition-area', text: areaLabel }) : null,
    ),
    h('span', { class: 'condition-sub', text: summary }),
    h('span', { class: 'condition-edit', 'aria-hidden': 'true', text: '変更' }),
  );
}

function conditionEditor(conditions: Conditions, onApply: (next: Conditions) => void): HTMLElement {
  const next: Conditions = { ...conditions };

  const chipRow = <T extends string>(
    legend: string,
    options: { value: T; label: string }[],
    current: T,
    onPick: (value: T) => void,
  ): HTMLElement => {
    const group = h('div', { class: 'option-row', role: 'radiogroup', 'aria-label': legend });
    const buttons = options.map((option) =>
      h('button', {
        class: `option${option.value === current ? ' on' : ''}`,
        type: 'button',
        role: 'radio',
        'aria-checked': option.value === current ? 'true' : 'false',
        text: option.label,
        onClick: () => {
          onPick(option.value);
          for (const button of buttons) {
            const on = button.textContent === option.label;
            button.classList.toggle('on', on);
            button.setAttribute('aria-checked', on ? 'true' : 'false');
          }
        },
      }),
    );
    group.append(...buttons);
    return h('div', { class: 'field' }, h('span', { class: 'field-label', text: legend }), group);
  };

  return h(
    'form',
    {
      class: 'editor',
      onSubmit: (event: SubmitEvent) => {
        event.preventDefault();
        onApply(next);
      },
    },
    chipRow(
      '天気',
      Object.entries(WEATHER_LABELS).map(([value, label]) => ({ value, label })),
      conditions.weather,
      (value) => {
        next.weather = value;
      },
    ),
    chipRow(
      '残り時間',
      [30, 60, 90, 120, 180].map((m) => ({ value: String(m), label: `${m}分` })),
      String(conditions.remainingMinutes),
      (value) => {
        next.remainingMinutes = Number(value);
      },
    ),
    chipRow(
      '移動手段',
      Object.entries(MOBILITY_LABELS).map(([value, label]) => ({ value, label })),
      conditions.mobility,
      (value) => {
        next.mobility = value;
      },
    ),
    chipRow(
      '起点',
      [{ value: 'gps', label: '現在地' }, ...AREA_FALLBACK.map((a) => ({ value: a.code, label: a.label }))],
      conditions.useGps ? 'gps' : (conditions.areaCode ?? 'gps'),
      (value) => {
        next.useGps = value === 'gps';
        next.areaCode = value === 'gps' ? conditions.areaCode : value;
      },
    ),
    h('button', { class: 'btn btn-primary', type: 'submit', text: 'この条件で見る' }),
  );
}

function candidateCard(candidate: Candidate, sessionId: string, mobility: string): HTMLElement {
  const openDetail = () => {
    track({
      name: 'place_detail_open',
      sessionId,
      placeId: candidate.placeId,
      recommendationRank: candidate.rank,
    });
    navigate(`#/place/${candidate.placeId}`);
  };

  const roleTag =
    candidate.role === 'home' ? '家' : candidate.role === 'usual' ? 'いつもの場' : '知らない場所';

  return h(
    'article',
    { class: `card card-${candidate.role}` },
    h(
      'header',
      { class: 'card-head' },
      h('span', { class: 'rank', text: String(candidate.rank), 'aria-hidden': 'true' }),
      h(
        'div',
        { class: 'card-title' },
        h('h2', { class: 'place-name', text: candidate.name }),
        h(
          'p',
          { class: 'place-meta' },
          `${candidate.areaLabel}・${travelLabel(candidate.travelMinutes, candidate.travelPrecision, MOBILITY_LABELS[mobility] ?? '')}・${candidate.priceLabel}`,
        ),
      ),
      h('span', { class: 'role-tag', text: roleTag }),
    ),
    fitAndConfidence(candidate.fitGrade, candidate.confidence),
    equipmentGrid(candidate.equipment),
    h('p', { class: 'headline', text: candidate.headline }),
    // When nothing is confirmed the headline already says so; repeating the
    // list of all six underneath is noise on a card meant to be read in seconds.
    candidate.confidence.knownCount > 0 ? unknownNote(candidate.confidence) : null,
    h(
      'div',
      { class: 'card-actions' },
      h('button', {
        class: 'btn btn-secondary',
        type: 'button',
        text: '詳しく見る',
        onClick: openDetail,
      }),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        text: '行く',
        onClick: () =>
          void decide({
            kind: 'go',
            sessionId,
            recommendationId: candidate.recommendationId,
            placeId: candidate.placeId,
            rank: candidate.rank,
          }),
      }),
    ),
  );
}

export async function renderHome(root: HTMLElement): Promise<void> {
  let editorOpen = false;

  const draw = (content: HTMLElement, areaLabel: string | null): void => {
    mount(
      root,
      h(
        'div',
        { class: 'home' },
        conditionBar(store.conditions, areaLabel, () => {
          editorOpen = !editorOpen;
          void run(editorOpen);
        }),
        editorOpen
          ? conditionEditor(store.conditions, (next) => {
              store.conditions = next;
              saveConditions(next);
              editorOpen = false;
              void run(false);
            })
          : null,
        h('h1', { class: 'headline-question', text: homeHeadline() }),
        content,
      ),
    );
  };

  const run = async (keepEditorOpen = false): Promise<void> => {
    editorOpen = keepEditorOpen;
    const current = store.conditions;
    const knownArea =
      AREA_FALLBACK.find((area) => area.code === current.areaCode)?.label ?? null;

    draw(loading(), knownArea);

    let origin: { lat?: number; lng?: number; areaCode?: string } = {};
    if (current.useGps) {
      const fix = await locate();
      if (fix) origin = fix;
      else if (current.areaCode) origin = { areaCode: current.areaCode };
    } else if (current.areaCode) {
      origin = { areaCode: current.areaCode };
    }

    try {
      const response = await api.recommend({
        childAgeMonths: current.childAgeMonths,
        remainingMinutes: current.remainingMinutes,
        mobility: current.mobility,
        weather: current.weather,
        origin,
      });

      setHouseholdId(response.householdId);
      store.session = { response, shownAtLocal: performance.now() };
      store.conditions = { ...current, areaCode: response.context.areaCode };
      saveConditions(store.conditions);

      track({
        name: 'recommendations_shown',
        sessionId: response.sessionId,
        props: { count: response.candidates.length, source: 'client' },
      });

      const list = h(
        'div',
        { class: 'cards' },
        response.dataNotice === 'demo_placeholder' ? placeholderBanner() : null,
        ...response.candidates.map((candidate) =>
          candidateCard(candidate, response.sessionId, current.mobility),
        ),
        response.shortlistNote
          ? h('p', { class: 'shortlist-note', text: response.shortlistNote })
          : null,
        equipmentLegend(),
        h(
          'div',
          { class: 'secondary-actions' },
          h('button', {
            class: 'btn btn-quiet',
            type: 'button',
            text: '地図で見る',
            onClick: () => navigate('#/map'),
          }),
        ),
        h(
          'div',
          { class: 'decision-bar' },
          h('button', {
            class: 'btn btn-outline',
            type: 'button',
            text: '今日は見送る',
            onClick: () =>
              void decide({ kind: 'skip', sessionId: response.sessionId, recommendationId: null }),
          }),
          h('button', {
            class: 'btn btn-outline',
            type: 'button',
            text: 'いつもの場',
            onClick: () =>
              void decide({ kind: 'usual', sessionId: response.sessionId, recommendationId: null }),
          }),
        ),
      );

      draw(list, response.context.areaLabel);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'origin_required') {
        // Location refused and no town chosen yet: ask for the town rather than
        // guessing one.
        draw(
          h(
            'div',
            { class: 'state' },
            h('p', { class: 'state-text', text: '現在地を取得できませんでした。今いるエリアを選んでください。' }),
            h(
              'div',
              { class: 'option-row' },
              ...AREA_FALLBACK.map((area) =>
                h('button', {
                  class: 'option',
                  type: 'button',
                  text: area.label,
                  onClick: () => {
                    store.conditions = { ...store.conditions, areaCode: area.code, useGps: false };
                    saveConditions(store.conditions);
                    void run();
                  },
                }),
              ),
            ),
          ),
          null,
        );
        return;
      }
      draw(
        errorState(
          error instanceof ApiError ? error.message : '情報を取得できませんでした',
          () => void run(),
        ),
        knownArea,
      );
    }
  };

  await run();
}
