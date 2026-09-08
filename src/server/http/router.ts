/**
 * What a handler is given, with nothing in it that names a runtime.
 *
 * This used to carry Node's IncomingMessage and ServerResponse, which meant a
 * handler could only ever run on a Node server. The two things anything
 * actually reached into them for — a request header and the peer address — are
 * named here instead, so the same handlers serve a `node:http` server and a
 * Worker's fetch event.
 */
export interface RequestContext {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  householdId: string | null;
  clientKey: string;
  /** Case-insensitive; null when absent. */
  header(name: string): string | null;
  /**
   * The address the request actually arrived from, never a forwarded header.
   * Empty where the runtime has no such notion (a Worker), which correctly
   * fails any loopback-only check rather than passing it.
   */
  peerAddress: string;
}

export type Handler = (ctx: RequestContext) => Promise<unknown> | unknown;

interface Route {
  method: string;
  segments: string[];
  handler: Handler;
}

/** Enough router for seven endpoints. No dependency earns its weight here. */
export class Router {
  private readonly routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler): this {
    this.routes.push({
      method,
      segments: pattern.split('/').filter(Boolean),
      handler,
    });
    return this;
  }

  get = (pattern: string, handler: Handler) => this.add('GET', pattern, handler);
  post = (pattern: string, handler: Handler) => this.add('POST', pattern, handler);
  put = (pattern: string, handler: Handler) => this.add('PUT', pattern, handler);
  delete = (pattern: string, handler: Handler) => this.add('DELETE', pattern, handler);

  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | null {
    const parts = pathname.split('/').filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let matched = true;
      for (let i = 0; i < route.segments.length; i += 1) {
        const segment = route.segments[i] as string;
        const value = parts[i] as string;
        if (segment.startsWith(':')) params[segment.slice(1)] = decodeURIComponent(value);
        else if (segment !== value) {
          matched = false;
          break;
        }
      }
      if (matched) return { handler: route.handler, params };
    }
    return null;
  }
}
