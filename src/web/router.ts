export type Route =
  | { name: 'home' }
  | { name: 'place'; placeId: string }
  | { name: 'after'; visitId: string }
  | { name: 'history' }
  | { name: 'settings' }
  | { name: 'map' };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const head = path[0];
  if (head === 'place' && path[1]) return { name: 'place', placeId: path[1] };
  if (head === 'after' && path[1]) return { name: 'after', visitId: path[1] };
  if (head === 'history') return { name: 'history' };
  if (head === 'settings') return { name: 'settings' };
  if (head === 'map') return { name: 'map' };
  return { name: 'home' };
}

export function navigate(hash: string): void {
  if (window.location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else window.location.hash = hash;
}

export function back(): void {
  if (window.history.length > 1) window.history.back();
  else navigate('#/');
}
