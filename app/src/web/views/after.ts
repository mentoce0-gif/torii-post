import { ApiError, api } from '../api.ts';
import { track } from '../analytics.ts';
import { h, mount } from '../dom.ts';
import { navigate } from '../router.ts';
import { errorState } from '../ui.ts';

const REACTIONS = [
  { value: 'bored_fast', label: 'すぐ飽きた' },
  { value: 'ok', label: 'まあまあ' },
  { value: 'lasted', label: '持った' },
] as const;

const STAYS = [
  { value: 'under15', label: '15分' },
  { value: 'about30', label: '30分' },
  { value: 'over60', label: '60分+' },
] as const;

const REVISITS = [
  { value: 'yes', label: '行く' },
  { value: 'conditional', label: '条件付き' },
  { value: 'no', label: 'もういい' },
] as const;

const EQUIPMENT_FIELDS = [
  { key: 'sandbox', label: '砂場' },
  { key: 'shade', label: '日陰' },
  { key: 'water', label: '水道' },
  { key: 'toilet', label: 'トイレ' },
  { key: 'diaper', label: 'オムツ台' },
  { key: 'stroller', label: 'ベビーカー' },
];

/**
 * Three taps and done.
 *
 * Everything past the third question is optional and folded away, because the
 * only version of this screen that gets filled in on the drive home is the one
 * that takes ten seconds.
 */
export function renderAfter(root: HTMLElement, visitId: string): void {
  const answers: { reaction: string | null; stayBucket: string | null; revisit: string | null } = {
    reaction: null,
    stayBucket: null,
    revisit: null,
  };
  const corrections = new Map<string, string>();
  let note = '';
  let extrasOpen = false;
  let submitting = false;

  track({ name: 'visit_feedback_started', placeId: null, props: { visitId } });

  const draw = (): void => {
    const complete =
      answers.reaction !== null && answers.stayBucket !== null && answers.revisit !== null;

    const question = <T extends string>(
      title: string,
      options: readonly { value: T; label: string }[],
      current: string | null,
      onPick: (value: T) => void,
    ): HTMLElement =>
      h(
        'fieldset',
        { class: 'question' },
        h('legend', { class: 'question-title', text: title }),
        h(
          'div',
          { class: 'option-row option-row-big' },
          ...options.map((option) =>
            h('button', {
              class: `option option-big${current === option.value ? ' on' : ''}`,
              type: 'button',
              'aria-pressed': current === option.value ? 'true' : 'false',
              text: option.label,
              onClick: () => {
                onPick(option.value);
                draw();
              },
            }),
          ),
        ),
      );

    mount(
      root,
      h(
        'div',
        { class: 'after' },
        h('h1', { class: 'headline-question', text: 'どうでしたか' }),
        h('p', { class: 'body-text muted', text: '3タップで終わります' }),
        question('子どもの反応', REACTIONS, answers.reaction, (value) => {
          answers.reaction = value;
        }),
        question('滞在時間', STAYS, answers.stayBucket, (value) => {
          answers.stayBucket = value;
        }),
        question('また行く？', REVISITS, answers.revisit, (value) => {
          answers.revisit = value;
        }),
        h(
          'div',
          { class: 'extras' },
          h('button', {
            class: 'btn btn-quiet',
            type: 'button',
            'aria-expanded': extrasOpen ? 'true' : 'false',
            text: extrasOpen ? '任意の追加を閉じる' : '任意: 付箋・設備の訂正',
            onClick: () => {
              extrasOpen = !extrasOpen;
              draw();
            },
          }),
          extrasOpen
            ? h(
                'div',
                { class: 'extras-body' },
                h('label', { class: 'field-label', for: 'note' }, '付箋（20字まで）'),
                h('input', {
                  id: 'note',
                  class: 'text-input',
                  type: 'text',
                  maxlength: '20',
                  value: note,
                  onInput: (event: Event) => {
                    note = (event.target as HTMLInputElement).value;
                  },
                }),
                h('p', { class: 'field-label', text: '設備の訂正（分かったものだけ）' }),
                ...EQUIPMENT_FIELDS.map((field) =>
                  h(
                    'div',
                    { class: 'correction-row' },
                    h('span', { class: 'correction-label', text: field.label }),
                    h(
                      'div',
                      { class: 'option-row' },
                      ...['○', '△', '×', '？'].map((value) =>
                        h('button', {
                          class: `option${corrections.get(field.key) === value ? ' on' : ''}`,
                          type: 'button',
                          'aria-label': `${field.label}を${value}に訂正`,
                          text: value,
                          onClick: () => {
                            if (corrections.get(field.key) === value) corrections.delete(field.key);
                            else corrections.set(field.key, value);
                            draw();
                          },
                        }),
                      ),
                    ),
                  ),
                ),
              )
            : null,
        ),
        h(
          'div',
          { class: 'decision-bar' },
          h('button', {
            class: 'btn btn-primary',
            type: 'button',
            disabled: !complete || submitting,
            text: submitting ? '記録中…' : '記録する',
            onClick: () => {
              if (!complete || submitting) return;
              submitting = true;
              draw();
              void api
                .feedback({
                  visitId,
                  reaction: answers.reaction as string,
                  stayBucket: answers.stayBucket as string,
                  revisit: answers.revisit as string,
                  note: note || null,
                  equipmentReports: [...corrections].map(([key, value]) => ({ key, value })),
                })
                .then(() => {
                  track({ name: 'visit_feedback_completed', props: { visitId } });
                  mount(
                    root,
                    h(
                      'div',
                      { class: 'state' },
                      h('p', { class: 'state-text', text: '記録しました。次の3件に反映されます。' }),
                      h('button', {
                        class: 'btn btn-primary',
                        type: 'button',
                        text: 'ホームへ',
                        onClick: () => navigate('#/'),
                      }),
                    ),
                  );
                })
                .catch((error: unknown) => {
                  submitting = false;
                  mount(
                    root,
                    errorState(
                      error instanceof ApiError ? error.message : '情報を取得できませんでした',
                      () => draw(),
                    ),
                  );
                });
            },
          }),
        ),
      ),
    );
  };

  draw();
}
