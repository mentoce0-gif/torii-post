import { installFlushOnHide, track } from './analytics.ts';
import { h } from './dom.ts';
import { parseRoute, navigate } from './router.ts';
import { store } from './state.ts';
import { renderAfter } from './views/after.ts';
import { renderDetail } from './views/detail.ts';
import { renderHistory } from './views/history.ts';
import { renderHome } from './views/home.ts';
import { renderMap } from './views/mapView.ts';
import { renderSettings } from './views/settings.ts';

const TABS: { hash: string; label: string; match: string[] }[] = [
  { hash: '#/', label: '今日', match: ['home', 'place', 'map', 'after'] },
  { hash: '#/history', label: '履歴', match: ['history'] },
  { hash: '#/settings', label: '設定', match: ['settings'] },
];

function renderNav(current: string): HTMLElement {
  return h(
    'nav',
    { class: 'tabbar', 'aria-label': 'メインナビゲーション' },
    ...TABS.map((tab) =>
      h('button', {
        class: `tab${tab.match.includes(current) ? ' on' : ''}`,
        type: 'button',
        'aria-current': tab.match.includes(current) ? 'page' : 'false',
        text: tab.label,
        onClick: () => navigate(tab.hash),
      }),
    ),
  );
}

async function route(main: HTMLElement, nav: HTMLElement): Promise<void> {
  const current = parseRoute(window.location.hash);
  nav.replaceWith(renderNav(current.name));

  switch (current.name) {
    case 'place':
      await renderDetail(main, current.placeId);
      break;
    case 'after':
      renderAfter(main, current.visitId);
      break;
    case 'history':
      await renderHistory(main);
      break;
    case 'settings':
      await renderSettings(main);
      break;
    case 'map':
      renderMap(main);
      break;
    default:
      await renderHome(main);
  }
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;

  const main = h('main', { class: 'main', id: 'main' });
  let nav = renderNav('home');
  root.append(main, nav);

  // The map provider is a server-side choice; the client only learns which one.
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (response.ok) {
      const config = (await response.json()) as { mapProvider?: string };
      if (config.mapProvider) store.mapProvider = config.mapProvider;
    }
  } catch {
    /* the schematic default is fine */
  }

  installFlushOnHide();
  track({ name: 'app_open', props: { standalone: window.matchMedia('(display-mode: standalone)').matches } });

  const rerender = (): void => {
    const currentNav = document.querySelector('.tabbar');
    if (currentNav instanceof HTMLElement) nav = currentNav;
    void route(main, nav);
  };

  window.addEventListener('hashchange', rerender);
  rerender();

  if ('serviceWorker' in navigator) {
    // After first paint, so registration never delays the first screen. boot()
    // awaits a fetch, so `load` may already have fired by the time we get here
    // — waiting for an event that has been and gone would silently skip it.
    const register = () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }
}

void boot();
