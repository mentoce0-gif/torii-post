import { h } from '../dom.ts';

const TONE_MARK: Record<string, string> = { good: '○', caution: '△', unknown: '？' };
const TONE_WORD: Record<string, string> = { good: '好条件', caution: '注意', unknown: '未確認' };

/** The card's argument, shown as a list rather than folded into a score. */
export function reasonList(reasons: { tone: string; text: string }[]): HTMLElement {
  return h(
    'ul',
    { class: 'reasons' },
    ...reasons.map((reason) =>
      h(
        'li',
        { class: `reason r-${reason.tone}` },
        h('span', {
          class: 'reason-mark',
          text: TONE_MARK[reason.tone] ?? '・',
          'aria-label': TONE_WORD[reason.tone] ?? '',
        }),
        h('span', { class: 'reason-text', text: reason.text }),
      ),
    ),
  );
}
