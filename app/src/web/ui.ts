import { h } from './dom.ts';

export function loading(message = '候補を組み立てています'): HTMLElement {
  return h(
    'div',
    { class: 'state', role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'spinner', 'aria-hidden': 'true' }),
    h('p', { class: 'state-text', text: message }),
  );
}

/**
 * Never "おすすめがありません" for a failed request — that reads as a verdict on
 * the neighbourhood rather than on our own plumbing.
 */
export function errorState(message: string, retry?: () => void): HTMLElement {
  return h(
    'div',
    { class: 'state state-error', role: 'alert' },
    h('p', { class: 'state-text', text: message }),
    retry ? h('button', { class: 'btn btn-secondary', type: 'button', onClick: retry, text: 'もう一度試す' }) : null,
  );
}

export function emptyState(message: string): HTMLElement {
  return h('div', { class: 'state' }, h('p', { class: 'state-text', text: message }));
}

export function placeholderBanner(): HTMLElement {
  return h(
    'div',
    { class: 'banner banner-demo', role: 'note' },
    h('strong', { text: 'デモデータ' }),
    ' 施設情報は未検証の仮データです。実際の判断には使わないでください。',
  );
}

export function sheet(title: string, body: HTMLElement, onClose: () => void): HTMLElement {
  const panel = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('h2', { class: 'sheet-title', text: title }),
    body,
  );
  const backdrop = h(
    'div',
    { class: 'backdrop', onClick: (event: MouseEvent) => {
      if (event.target === backdrop) onClose();
    } },
    panel,
  );
  return backdrop;
}

export function travelLabel(
  minutes: number | null,
  precision: 'measured' | 'estimate' | 'unknown',
  mobilityLabel: string,
): string {
  if (precision === 'unknown' || minutes === null) return '移動時間 未確認';
  if (minutes === 0) return '移動なし';
  return precision === 'estimate'
    ? `${mobilityLabel}${minutes}分（目安）`
    : `${mobilityLabel}${minutes}分`;
}

export const MOBILITY_LABELS: Record<string, string> = {
  car: '車',
  walk: '徒歩',
  bicycle: '自転車',
  transit: '公共交通',
};

export const WEATHER_LABELS: Record<string, string> = {
  sunny: '晴れ',
  cloudy: 'くもり',
  rain: '雨',
  snow: '雪',
  hot: '猛暑',
  cold: '寒い',
};

export const WEATHER_ICONS: Record<string, string> = {
  sunny: '☀',
  cloudy: '☁',
  rain: '☂',
  snow: '❄',
  hot: '🌡',
  cold: '❄',
};

export function ageLabel(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${months}か月`;
  return rest === 0 ? `${years}歳` : `${years}歳${rest}か月`;
}
