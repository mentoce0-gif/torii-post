type Child = Node | string | null | undefined | false;

export interface Attrs {
  class?: string;
  id?: string;
  type?: string;
  href?: string;
  value?: string;
  text?: string;
  html?: string;
  disabled?: boolean;
  hidden?: boolean;
  onClick?: (event: MouseEvent) => void;
  onInput?: (event: Event) => void;
  onChange?: (event: Event) => void;
  onSubmit?: (event: SubmitEvent) => void;
  [key: string]: unknown;
}

/** Small element builder. Enough to render six screens without a framework. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = String(value);
    else if (key === 'text') el.textContent = String(value);
    else if (key === 'html') el.innerHTML = String(value);
    else if (key === 'onClick') el.addEventListener('click', value as EventListener);
    else if (key === 'onInput') el.addEventListener('input', value as EventListener);
    else if (key === 'onChange') el.addEventListener('change', value as EventListener);
    else if (key === 'onSubmit') el.addEventListener('submit', value as EventListener);
    else if (key === 'disabled') (el as HTMLButtonElement).disabled = value === true;
    else if (key === 'hidden') el.hidden = value === true;
    else if (key === 'value') (el as HTMLInputElement).value = String(value);
    else el.setAttribute(key, String(value));
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function mount(root: HTMLElement, ...nodes: (Node | null)[]): void {
  clear(root);
  for (const node of nodes) if (node) root.append(node);
  root.scrollTo({ top: 0 });
}
