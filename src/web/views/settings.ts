import { ApiError, api, clearHouseholdId, type Profile } from '../api.ts';
import { h, mount } from '../dom.ts';
import { navigate } from '../router.ts';
import { DEFAULT_CONDITIONS, saveConditions, store } from '../state.ts';
import { MOBILITY_LABELS, errorState, loading } from '../ui.ts';

const COPY_KEY = 'kns.homeCopy';

function readCopyVariant(): 'a' | 'b' {
  try {
    return localStorage.getItem(COPY_KEY) === 'b' ? 'b' : 'a';
  } catch {
    return 'a';
  }
}

function field(label: string, ...content: (HTMLElement | string | null)[]): HTMLElement {
  return h('div', { class: 'field' }, h('span', { class: 'field-label', text: label }), ...content);
}

export async function renderSettings(root: HTMLElement): Promise<void> {
  mount(root, loading('設定を読み込んでいます'));

  let profile: Profile | null = null;
  try {
    profile = await api.profile();
  } catch (error) {
    // A household that has never asked for candidates has no server record yet.
    // That is a normal first-run state, not a failure.
    if (!(error instanceof ApiError) || error.status !== 404) {
      mount(
        root,
        errorState(
          error instanceof ApiError ? error.message : '情報を取得できませんでした',
          () => void renderSettings(root),
        ),
      );
      return;
    }
  }

  const now = new Date();
  const child = profile?.children[0] ?? null;
  const draft = {
    birthYear: child?.birthYear ?? now.getFullYear() - 1,
    birthMonth: child?.birthMonth ?? now.getMonth() + 1,
    mobility: profile?.mobility ?? store.conditions.mobility,
    homeAreaCode: profile?.homeAreaCode ?? store.conditions.areaCode ?? '',
    usualPlaceId: profile?.usualPlaceId ?? '',
    notificationOptIn: profile?.notificationOptIn ?? false,
    copyVariant: readCopyVariant(),
  };

  const areas = profile?.areas ?? [];
  const usualOptions = profile?.usualPlaceOptions ?? [];
  const status = h('p', { class: 'body-text muted', text: '' });

  const select = (
    options: { value: string; label: string }[],
    current: string,
    onChange: (value: string) => void,
    ariaLabel: string,
  ): HTMLElement => {
    const el = h('select', {
      class: 'select',
      'aria-label': ariaLabel,
      onChange: (event: Event) => onChange((event.target as HTMLSelectElement).value),
    });
    for (const option of options) {
      const node = h('option', { value: option.value, text: option.label });
      if (option.value === current) node.setAttribute('selected', 'selected');
      el.append(node);
    }
    return el;
  };

  const save = async (): Promise<void> => {
    status.textContent = '保存中…';
    try {
      await api.saveProfile({
        homeAreaCode: draft.homeAreaCode || null,
        usualPlaceId: draft.usualPlaceId || null,
        notificationOptIn: draft.notificationOptIn,
        mobility: draft.mobility,
        children: [{ birthYear: draft.birthYear, birthMonth: draft.birthMonth }],
      });
      const ageMonths =
        (now.getFullYear() - draft.birthYear) * 12 + (now.getMonth() + 1 - draft.birthMonth);
      store.conditions = {
        ...store.conditions,
        childAgeMonths: Math.max(0, ageMonths),
        mobility: draft.mobility,
        areaCode: draft.homeAreaCode || store.conditions.areaCode,
      };
      saveConditions(store.conditions);
      try {
        localStorage.setItem(COPY_KEY, draft.copyVariant);
      } catch {
        /* ignore */
      }
      status.textContent = '保存しました';
    } catch (error) {
      status.textContent = error instanceof ApiError ? error.message : '保存できませんでした';
    }
  };

  const years: { value: string; label: string }[] = [];
  for (let year = now.getFullYear(); year >= now.getFullYear() - 12; year -= 1) {
    years.push({ value: String(year), label: `${year}年` });
  }

  mount(
    root,
    h(
      'div',
      { class: 'page' },
      h('h1', { class: 'page-title', text: '設定' }),
      h(
        'section',
        { class: 'section' },
        h('h2', { class: 'section-title', text: '子ども' }),
        h('p', { class: 'body-text muted', text: '名前も生年月日も保存しません。年と月だけです。' }),
        h(
          'div',
          { class: 'inline-fields' },
          field(
            '生まれ年',
            select(years, String(draft.birthYear), (value) => {
              draft.birthYear = Number(value);
            }, '生まれ年'),
          ),
          field(
            '生まれ月',
            select(
              Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}月` })),
              String(draft.birthMonth),
              (value) => {
                draft.birthMonth = Number(value);
              },
              '生まれ月',
            ),
          ),
        ),
      ),
      h(
        'section',
        { class: 'section' },
        h('h2', { class: 'section-title', text: '移動と起点' }),
        field(
          '移動手段',
          select(
            Object.entries(MOBILITY_LABELS).map(([value, label]) => ({ value, label })),
            draft.mobility,
            (value) => {
              draft.mobility = value;
            },
            '移動手段',
          ),
        ),
        field(
          '普段の起点エリア',
          select(
            [{ value: '', label: '未設定' }, ...areas.map((area) => ({ value: area.code, label: area.label }))],
            draft.homeAreaCode,
            (value) => {
              draft.homeAreaCode = value;
            },
            '普段の起点エリア',
          ),
          h('p', { class: 'body-text muted', text: '住所は保存しません。市区町村までです。' }),
        ),
        field(
          'いつもの場',
          select(
            [{ value: '', label: '未設定' }, ...usualOptions.map((place) => ({ value: place.id, label: place.name }))],
            draft.usualPlaceId,
            (value) => {
              draft.usualPlaceId = value;
            },
            'いつもの場',
          ),
          h('p', { class: 'body-text muted', text: '設定すると3件目の候補に使われます。' }),
        ),
      ),
      h(
        'section',
        { class: 'section' },
        h('h2', { class: 'section-title', text: '通知' }),
        h(
          'label',
          { class: 'checkbox' },
          h('input', {
            type: 'checkbox',
            ...(draft.notificationOptIn ? { checked: 'checked' } : {}),
            onChange: (event: Event) => {
              draft.notificationOptIn = (event.target as HTMLInputElement).checked;
            },
          }),
          '記録のリマインドを受け取る',
        ),
      ),
      h(
        'section',
        { class: 'section' },
        h('h2', { class: 'section-title', text: 'ホームの問い（検証用）' }),
        field(
          '文言',
          select(
            [
              { value: 'a', label: '今日どうする？' },
              { value: 'b', label: '今日、知らない場に出る？' },
            ],
            draft.copyVariant,
            (value) => {
              draft.copyVariant = value === 'b' ? 'b' : 'a';
            },
            'ホームの問い',
          ),
        ),
      ),
      h(
        'div',
        { class: 'section' },
        h('button', { class: 'btn btn-primary', type: 'button', text: '保存する', onClick: () => void save() }),
        status,
      ),
      h(
        'section',
        { class: 'section section-danger' },
        h('h2', { class: 'section-title', text: 'データ削除' }),
        h('p', {
          class: 'body-text',
          text: '世帯・子ども・判断・訪問・記録・計測イベントをすべて削除します。取り消せません。',
        }),
        h('button', {
          class: 'btn btn-danger',
          type: 'button',
          text: 'すべて削除する',
          onClick: () => {
            if (!window.confirm('すべてのデータを削除します。取り消せません。よろしいですか？')) return;
            void api
              .deleteProfile()
              .catch(() => undefined)
              .then(() => {
                clearHouseholdId();
                store.session = null;
                store.conditions = { ...DEFAULT_CONDITIONS };
                saveConditions(store.conditions);
                navigate('#/');
              });
          },
        }),
      ),
    ),
  );
}
