import { ApiError, api } from './api.ts';
import { track } from './analytics.ts';
import { h } from './dom.ts';
import { navigate } from './router.ts';
import { elapsedSinceShown, findCandidate, store } from './state.ts';
import { sheet } from './ui.ts';

export interface DecisionInput {
  kind: 'go' | 'skip' | 'usual';
  sessionId: string;
  recommendationId: string | null;
  placeId?: string | null;
  rank?: number | null;
}

function overlay(node: HTMLElement): () => void {
  document.body.append(node);
  const close = () => node.remove();
  return close;
}

/**
 * Asked once, and rarely: the server decides when a household is due, so the
 * question never becomes the thing they have to dismiss every weekend.
 */
function askSubjective(decisionId: string): void {
  const close = overlay(
    sheet(
      '普段より早く決められましたか？',
      h(
        'div',
        { class: 'sheet-actions' },
        ...(
          [
            ['faster', 'はい'],
            ['same', '同じ'],
            ['slower', '遅い'],
          ] as const
        ).map(([answer, label]) =>
          h('button', {
            class: 'btn btn-outline',
            type: 'button',
            text: label,
            onClick: () => {
              void api.subjective({ decisionId, answer }).catch(() => undefined);
              close();
            },
          }),
        ),
      ),
      () => close(),
    ),
  );
}

function afterDecisionSheet(input: DecisionInput, visitId: string | null, askAgain: () => void): void {
  const candidate = input.placeId ? findCandidate(input.placeId) : null;
  const coords = candidate?.coords ?? null;

  const body = h(
    'div',
    { class: 'sheet-body' },
    h(
      'p',
      { class: 'sheet-text' },
      input.kind === 'go'
        ? `${candidate?.name ?? 'この場所'}に行く、で記録しました`
        : input.kind === 'usual'
          ? 'いつもの場、で記録しました'
          : '今日は見送る、で記録しました',
    ),
  );

  const actions = h('div', { class: 'sheet-actions' });

  if (input.kind === 'go' && coords) {
    actions.append(
      h('a', {
        class: 'btn btn-secondary',
        href: `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`,
        target: '_blank',
        rel: 'noopener noreferrer',
        text: '地図アプリで開く',
        onClick: () => {
          track({
            name: 'external_app_open',
            sessionId: input.sessionId,
            placeId: input.placeId ?? null,
            props: { target: 'maps' },
          });
        },
      }),
    );
  }

  if (visitId) {
    actions.append(
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        text: '帰ったら記録する',
        onClick: () => {
          close();
          navigate(`#/after/${visitId}`);
        },
      }),
    );
  }

  actions.append(
    h('button', {
      class: 'btn btn-quiet',
      type: 'button',
      text: '閉じる',
      onClick: () => {
        close();
        askAgain();
      },
    }),
  );

  body.append(actions);
  const close = overlay(sheet('記録しました', body, () => {
    closeAndAsk();
  }));

  function closeAndAsk(): void {
    close();
    askAgain();
  }
}

/**
 * The one action that stops the Time to Decision clock. Everything the metric
 * needs is captured here: the server's own measurement plus the client's
 * stopwatch, kept side by side rather than one standing in for the other.
 */
export async function decide(input: DecisionInput): Promise<void> {
  const clientElapsedMs = elapsedSinceShown();

  try {
    const result = await api.decide({
      sessionId: input.sessionId,
      recommendationId: input.recommendationId,
      placeId: input.placeId ?? null,
      kind: input.kind,
      clientElapsedMs,
    });

    store.lastDecisionId = result.decisionId;

    track({
      name: `decision_${input.kind}`,
      sessionId: input.sessionId,
      placeId: input.placeId ?? null,
      recommendationRank: input.rank ?? null,
      props: { clientElapsedMs, serverTimeToDecisionMs: result.timeToDecisionMs },
    });

    afterDecisionSheet(input, result.visitId, () => {
      if (result.askSubjective) askSubjective(result.decisionId);
    });
  } catch (error) {
    const close = overlay(
      sheet(
        '記録できませんでした',
        h(
          'div',
          { class: 'sheet-body' },
          h('p', {
            class: 'sheet-text',
            text: error instanceof ApiError ? error.message : '情報を取得できませんでした',
          }),
          h('div', { class: 'sheet-actions' }, h('button', {
            class: 'btn btn-quiet',
            type: 'button',
            text: '閉じる',
            onClick: () => close(),
          })),
        ),
        () => close(),
      ),
    );
  }
}
