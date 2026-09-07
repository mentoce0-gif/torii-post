import { ApiError, api } from '../api.ts';
import { h, mount } from '../dom.ts';
import { navigate } from '../router.ts';
import { emptyState, errorState, loading } from '../ui.ts';

function formatDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * A ledger, not a timeline. Every column exists because it feeds the next set
 * of three: what we suggested, what they actually did, and how long it held.
 */
export async function renderHistory(root: HTMLElement): Promise<void> {
  mount(root, loading('履歴を読み込んでいます'));

  try {
    const history = await api.history();

    if (history.entries.length === 0 && history.openVisits.length === 0) {
      mount(
        root,
        h(
          'div',
          { class: 'page' },
          h('h1', { class: 'page-title', text: '履歴' }),
          emptyState('まだ記録がありません。ホームで候補を出して判断すると、ここに残ります。'),
        ),
      );
      return;
    }

    mount(
      root,
      h(
        'div',
        { class: 'page' },
        h('h1', { class: 'page-title', text: '履歴' }),
        history.openVisits.length > 0
          ? h(
              'section',
              { class: 'section' },
              h('h2', { class: 'section-title', text: '未記録' }),
              ...history.openVisits.map((visit) =>
                h(
                  'div',
                  { class: 'history-row history-open' },
                  h('span', { class: 'history-place', text: visit.placeName }),
                  h('button', {
                    class: 'btn btn-secondary',
                    type: 'button',
                    text: '10秒で記録',
                    onClick: () => navigate(`#/after/${visit.visitId}`),
                  }),
                ),
              ),
            )
          : null,
        h(
          'section',
          { class: 'section' },
          h('h2', { class: 'section-title', text: '判断の記録' }),
          h(
            'ul',
            { class: 'history-list' },
            ...history.entries.map((entry) =>
              h(
                'li',
                { class: 'history-row' },
                h('span', { class: 'history-date', text: formatDate(entry.decidedAt) }),
                h(
                  'span',
                  { class: 'history-body' },
                  h('span', { class: 'history-place', text: entry.placeName ?? '（場所なし）' }),
                  h(
                    'span',
                    { class: 'history-meta' },
                    `${entry.kindLabel}`,
                    entry.went ? ' / 行った' : '',
                    entry.recorded
                      ? ` / ${entry.stayMinutes}分 / ${entry.reactionLabel ?? ''} / ${entry.revisitLabel ?? ''}`
                      : entry.went
                        ? ' / 未記録'
                        : '',
                    entry.timeToDecisionMs !== null
                      ? ` / 判断 ${Math.round(entry.timeToDecisionMs / 1000)}秒`
                      : '',
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  } catch (error) {
    mount(
      root,
      errorState(
        error instanceof ApiError ? error.message : '情報を取得できませんでした',
        () => void renderHistory(root),
      ),
    );
  }
}
