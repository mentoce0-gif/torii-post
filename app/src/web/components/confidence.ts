import type { Confidence } from '../api.ts';
import { h } from '../dom.ts';

/**
 * Two numbers that must never be read as one.
 *
 * Fit answers "does this suit today". Confidence answers "how much of what you
 * are reading has actually been checked". A place can be a perfect fit and 33%
 * confirmed, and the card has to say both.
 */
export function fitAndConfidence(fitGrade: string | null, confidence: Confidence): HTMLElement {
  return h(
    'div',
    { class: 'metrics' },
    h(
      'div',
      { class: 'metric' },
      h('span', { class: 'metric-key', text: '今日の相性' }),
      h('span', {
        class: 'metric-grade',
        text: fitGrade ?? '—',
        'aria-label': fitGrade ? `今日の条件との相性 ${fitGrade}` : '相性 未算出',
      }),
    ),
    h(
      'div',
      { class: 'metric' },
      h('span', { class: 'metric-key', text: '情報確度' }),
      h(
        'span',
        { class: 'metric-value' },
        h('span', {
          class: 'pct',
          text: `${confidence.pct}%`,
          'aria-label': `情報確度 ${confidence.pct}パーセント。6項目中${confidence.knownCount}項目が確認済み`,
        }),
        confidenceBar(confidence),
      ),
    ),
  );
}

function confidenceBar(confidence: Confidence): HTMLElement {
  const bar = h('span', { class: 'bar', 'aria-hidden': 'true' });
  for (let i = 0; i < confidence.totalCount; i += 1) {
    bar.append(h('span', { class: i < confidence.knownCount ? 'tick on' : 'tick' }));
  }
  return bar;
}

export function unknownNote(confidence: Confidence): HTMLElement | null {
  if (confidence.unknownLabels.length === 0) return null;
  return h(
    'p',
    { class: 'unknown-note' },
    h('span', { class: 'q', text: '？', 'aria-hidden': 'true' }),
    `${confidence.unknownLabels.join('・')}は未確認です`,
  );
}
