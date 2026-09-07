import type { EquipmentCell } from '../api.ts';
import { h } from '../dom.ts';

/**
 * The four values, and what each is called out loud for a screen reader.
 * `？` gets its own voice — "未確認" — so it is never read as a bad score.
 */
const VALUE_MEANING: Record<string, string> = {
  '○': '利用可能と確認済み',
  '△': '条件付き',
  '×': '無い、または利用困難',
  '？': '未確認',
};

const VALUE_CLASS: Record<string, string> = {
  '○': 'v-yes',
  '△': 'v-partial',
  '×': 'v-no',
  '？': 'v-unknown',
};

export function equipmentChip(cell: EquipmentCell): HTMLElement {
  return h(
    'div',
    {
      class: `chip ${VALUE_CLASS[cell.value] ?? 'v-unknown'}`,
      role: 'listitem',
      'aria-label': `${cell.label}: ${VALUE_MEANING[cell.value] ?? cell.value}`,
    },
    h('span', { class: 'chip-label', text: cell.label }),
    h('span', { class: 'chip-value', 'aria-hidden': 'true', text: cell.value }),
  );
}

export function equipmentGrid(cells: EquipmentCell[]): HTMLElement {
  return h(
    'div',
    { class: 'chips', role: 'list', 'aria-label': '設備の確認状況' },
    ...cells.map(equipmentChip),
  );
}

export function equipmentLegend(): HTMLElement {
  return h(
    'p',
    { class: 'legend' },
    '○ 確認済み / △ 条件付き / × 無い / ？ 未確認（推測では埋めていません）',
  );
}
