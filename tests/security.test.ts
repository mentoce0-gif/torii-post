import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IncomingMessage } from 'node:http';

import { splitStatements } from '../src/server/data/d1Driver.ts';
import { SCHEMA_SQL } from '../src/server/data/schema.ts';
import { peerAddress } from '../src/server/http/server.ts';
import { areaCodeToRemember } from '../src/web/origin.ts';
import { startServer } from './helpers.ts';

/**
 * The PoC is going out as a free public service with no login. That removes the
 * usual back-pressure — nobody has to sign up, so nobody is slowed down — and
 * puts the whole burden on the limiter and the headers. These pin the parts a
 * later edit could quietly undo.
 */

const CONTEXT = {
  childAgeMonths: 18,
  remainingMinutes: 90,
  mobility: 'car',
  weather: 'cloudy',
  origin: { areaCode: 'shiga-otsu' },
};

/** Minimal stand-in: peerAddress only ever looks at headers and the socket. */
function fakeReq(forwardedFor: string | undefined, socketAddress: string): IncomingMessage {
  return {
    headers: forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor },
    socket: { remoteAddress: socketAddress },
  } as unknown as IncomingMessage;
}

describe('reads are rate limited', () => {
  it('caps GET, which used to be unlimited', async () => {
    // Only writes were counted before. A free endpoint that runs a SQLite read
    // and is capped by nothing is the cheapest possible way to take the service
    // down, and it needs no account to do it.
    const server = await startServer('demo', { rateLimitReadPerMin: 3 });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 5; i += 1) {
        codes.push((await server.fetch('/api/history')).status);
      }
      assert.ok(codes.includes(429), `GET was never limited: ${codes.join(', ')}`);
      assert.equal(codes[0], 200, 'the first read should still succeed');
    } finally {
      await server.stop();
    }
  });

  it('gives reads and writes separate budgets', async () => {
    // A household reading its history should not spend the allowance it needs
    // to record a decision.
    const server = await startServer('demo', { rateLimitReadPerMin: 2, rateLimitPerMin: 10 });
    try {
      for (let i = 0; i < 4; i += 1) await server.fetch('/api/history');
      const write = await server.fetch('/api/recommend', {
        method: 'POST',
        body: JSON.stringify(CONTEXT),
      });
      assert.equal(write.status, 201, 'exhausted reads must not block a write');
    } finally {
      await server.stop();
    }
  });

  it('answers a limited request with Retry-After', async () => {
    const server = await startServer('demo', { rateLimitReadPerMin: 1 });
    try {
      await server.fetch('/api/history');
      const limited = await server.fetch('/api/history');
      assert.equal(limited.status, 429);
      assert.ok(limited.headers.get('retry-after'), 'a 429 should say when to come back');
    } finally {
      await server.stop();
    }
  });
});

describe('X-Forwarded-For is only believed behind a proxy', () => {
  it('ignores the header by default, because anyone can send it', () => {
    // On a directly-exposed port this header is attacker-controlled. Believing
    // it would hand out a fresh identity per request and make the limiter
    // decorative.
    const address = peerAddress(fakeReq('203.0.113.9', '198.51.100.4'), false);
    assert.equal(address, '198.51.100.4');
  });

  it('uses the left-most entry when a proxy is declared', () => {
    const address = peerAddress(fakeReq('203.0.113.9, 70.41.3.18', '198.51.100.4'), true);
    assert.equal(address, '203.0.113.9');
  });

  it('falls back to the socket when a trusted proxy sends nothing', () => {
    const address = peerAddress(fakeReq(undefined, '198.51.100.4'), true);
    assert.equal(address, '198.51.100.4');
  });

  it('keeps every client on one bucket when the header is not trusted', async () => {
    // The failure this prevents: behind a terminator every request arrives from
    // the same socket, so without TRUST_PROXY the limiter must still hold — and
    // a forged header must not buy a fresh allowance.
    const server = await startServer('demo', { rateLimitReadPerMin: 2 });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        codes.push(
          (await server.fetch('/api/history', { headers: { 'X-Forwarded-For': `203.0.113.${i}` } }))
            .status,
        );
      }
      assert.ok(codes.includes(429), `a forged header bought more requests: ${codes.join(', ')}`);
    } finally {
      await server.stop();
    }
  });
});

describe('metrics stay shut', () => {
  it('cannot be opened by forging a loopback address', async () => {
    // The loopback gate reads the socket directly and must keep doing so. If it
    // ever moves to the proxy-aware helper, "X-Forwarded-For: 127.0.0.1" would
    // publish the metrics endpoint to the internet.
    const server = await startServer('demo', { metricsToken: 'secret-token' });
    try {
      const forged = await server.fetch('/api/metrics', {
        headers: { 'X-Forwarded-For': '127.0.0.1' },
      });
      assert.equal(forged.status, 401);

      const authorised = await server.fetch('/api/metrics', {
        headers: { Authorization: 'Bearer secret-token' },
      });
      assert.equal(authorised.status, 200);
    } finally {
      await server.stop();
    }
  });
});

describe('responses carry the headers a public deployment needs', () => {
  it('sets HSTS, a frame ban, and a permissions policy', async () => {
    const server = await startServer('demo');
    try {
      const response = await server.fetch('/api/history');
      assert.match(response.headers.get('strict-transport-security') ?? '', /max-age=\d+/);
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
      assert.match(response.headers.get('permissions-policy') ?? '', /camera=\(\)/);
      assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'self'/);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    } finally {
      await server.stop();
    }
  });

  it('never lets facility data into a cache', async () => {
    const server = await startServer('demo');
    try {
      const response = await server.fetch('/api/history');
      assert.equal(response.headers.get('cache-control'), 'no-store');
    } finally {
      await server.stop();
    }
  });
});

describe('the D1 schema split', () => {
  it('drops the PRAGMAs D1 refuses', () => {
    // D1 answers PRAGMA with SQLITE_AUTH, which took down the whole Worker on
    // its first request. Both PRAGMAs in schema.ts are questions for a local
    // file — how one process journals to a disk, and a foreign-key default D1
    // already applies — so they are dropped here rather than forking the schema.
    const statements = splitStatements(SCHEMA_SQL);
    assert.ok(statements.length > 0, 'the schema should still produce statements');
    for (const statement of statements) {
      assert.ok(!/^pragma\b/i.test(statement), `PRAGMA survived: ${statement.slice(0, 40)}`);
    }
    assert.ok(
      statements.some((s) => /CREATE TABLE/i.test(s)),
      'the tables must survive the filter',
    );
  });

  it('drops comments and blank lines, keeping statements whole', () => {
    const statements = splitStatements(`
      -- a comment
      CREATE TABLE a (id TEXT);

      PRAGMA foreign_keys = ON;
      CREATE TABLE b (id TEXT);
    `);
    assert.deepEqual(statements, ['CREATE TABLE a (id TEXT)', 'CREATE TABLE b (id TEXT)']);
  });
});

describe('a default never becomes a choice', () => {
  it('does not remember a town nobody picked', () => {
    // The bug this replaces: the client saved whatever area the server
    // answered with, including the configured default. One reload later the
    // request carried an areaCode, the server correctly called it 'chosen',
    // 「（既定）」 vanished, and the screen showed Otsu as the household's own
    // answer. Observed live before the fix — the label appeared on the first
    // load and never again.
    assert.equal(areaCodeToRemember('default', null, 'shiga-otsu'), null);
  });

  it('leaves an earlier real choice alone when it falls back', () => {
    assert.equal(areaCodeToRemember('default', 'shiga-kusatsu', 'shiga-otsu'), 'shiga-kusatsu');
  });

  it('remembers a town the household actually chose', () => {
    assert.equal(areaCodeToRemember('chosen', null, 'shiga-kusatsu'), 'shiga-kusatsu');
  });

  it('remembers where a location fix put them', () => {
    assert.equal(areaCodeToRemember('gps', 'shiga-otsu', 'kyoto-sakyo'), 'kyoto-sakyo');
  });
});
