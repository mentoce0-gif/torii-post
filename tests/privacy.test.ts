import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { validateSeed } from '../src/server/data/seed/index.ts';
import { SEED_PLACES } from '../src/server/data/seed/places.ts';
import { startServer, type TestServer } from './helpers.ts';

let server: TestServer;

before(async () => {
  server = await startServer('demo');
});

after(async () => {
  await server.stop();
});

const CONTEXT = {
  childAgeMonths: 18,
  remainingMinutes: 90,
  mobility: 'car',
  weather: 'cloudy',
};

describe('location is only ever kept at town resolution', () => {
  it('never writes down a precise fix', async () => {
    // A deliberately over-precise reading, as a phone would report it.
    const precise = { lat: 35.0128456789, lng: 135.9605123456 };
    const body = (await server.json('/api/recommend', {
      method: 'POST',
      body: JSON.stringify({ ...CONTEXT, origin: precise }),
    })) as { sessionId: string };

    const session = await server.repo.getSession(body.sessionId);
    assert.ok(session);
    const stored = session.contextJson;

    assert.ok(!stored.includes('35.0128456789'), 'the raw latitude must not be stored');
    assert.ok(!stored.includes('135.9605123456'), 'the raw longitude must not be stored');
    // What is kept is the town, and nothing finer.
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    assert.equal(parsed['areaCode'], 'shiga-kusatsu');
    assert.ok(!('lat' in parsed) && !('lng' in parsed));
  });

  it('does not log coordinates against the analytics event either', async () => {
    const body = (await server.json('/api/recommend', {
      method: 'POST',
      body: JSON.stringify({ ...CONTEXT, origin: { lat: 35.0128456789, lng: 135.9605123456 } }),
    })) as { householdId: string };
    const rows = server.repo.handle
      .prepare('SELECT props_json FROM analytics_events WHERE household_id = ?')
      .all(body.householdId) as { props_json: string | null }[];
    for (const row of rows) {
      assert.ok(!(row.props_json ?? '').includes('35.0128'), 'events must not carry a fix');
    }
  });
});

describe('the child record holds no identity', () => {
  it('stores a year and a month, and has nowhere to put a name or a birth date', async () => {
    const body = (await server.json('/api/recommend', {
      method: 'POST',
      body: JSON.stringify({ ...CONTEXT, origin: { areaCode: 'shiga-kusatsu' } }),
    })) as { householdId: string };

    await server.fetch('/api/profile', {
      method: 'PUT',
      householdId: body.householdId,
      body: JSON.stringify({ children: [{ birthYear: 2025, birthMonth: 3 }] }),
    });

    const columns = server.repo.handle.prepare('PRAGMA table_info(children)').all() as {
      name: string;
    }[];
    const names = columns.map((column) => column.name);
    assert.deepEqual(names.sort(), ['birth_month', 'birth_year', 'handle', 'household_id', 'id']);
    assert.ok(!names.includes('name'));
    assert.ok(!names.includes('birth_date'));
    assert.ok(!names.includes('photo'));
  });

  it('has no table anywhere for photos or addresses', () => {
    const tables = server.repo.handle
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];
    const text = tables.map((t) => t.name).join(',');
    for (const forbidden of ['photo', 'image', 'address', 'medical']) {
      assert.ok(!text.includes(forbidden), `unexpected table matching ${forbidden}`);
    }
  });
});

describe('DELETE /api/profile', () => {
  it('removes the household and everything hanging off it', async () => {
    const body = (await server.json('/api/recommend', {
      method: 'POST',
      body: JSON.stringify({ ...CONTEXT, origin: { areaCode: 'shiga-kusatsu' } }),
    })) as { householdId: string; sessionId: string; candidates: { recommendationId: string }[] };

    await server.fetch('/api/decisions', {
      method: 'POST',
      householdId: body.householdId,
      body: JSON.stringify({
        sessionId: body.sessionId,
        recommendationId: body.candidates[0]?.recommendationId,
        kind: 'go',
        clientElapsedMs: 5000,
      }),
    });

    const response = await server.fetch('/api/profile', {
      method: 'DELETE',
      householdId: body.householdId,
    });
    assert.equal(response.status, 200);

    assert.equal(await server.repo.getHousehold(body.householdId), null);
    assert.equal((await server.repo.getChildren(body.householdId)).length, 0);
    assert.equal((await server.repo.listHistory(body.householdId, 50)).length, 0);

    const events = server.repo.handle
      .prepare('SELECT COUNT(*) AS n FROM analytics_events WHERE household_id = ?')
      .get(body.householdId) as { n: number };
    assert.equal(Number(events.n), 0, 'the measurement trail goes too');

    const visits = server.repo.handle
      .prepare('SELECT COUNT(*) AS n FROM visits WHERE household_id = ?')
      .get(body.householdId) as { n: number };
    assert.equal(Number(visits.n), 0);
  });
});

describe('seed provenance', () => {
  it('states nothing without a source and a date', () => {
    assert.deepEqual(validateSeed(SEED_PLACES), []);
  });

  it('states a facility value in the PoC profile only with provenance behind it', async () => {
    // Deliberately not "every value is ？". That would freeze the seed at zero
    // and fail the moment a curator does what CURATION.md step 3 asks. What has
    // to hold is the rule itself: a value is stated only when someone read a
    // named, non-demo source and wrote down when. Curating a place is supposed
    // to make this test pass with more values, never to make it fail.
    const strict = await startServer('poc');
    try {
      for (const entry of await strict.repo.listPlaces()) {
        if (entry.place.kind === 'home') continue;
        const sourceById = new Map(entry.sources.map((source) => [source.id, source]));

        for (const row of entry.equipmentRows) {
          if (row.value === '？') continue;
          const source = row.sourceId === null ? undefined : sourceById.get(row.sourceId);
          assert.ok(
            source !== undefined,
            `${entry.place.name}.${row.key} claims ${row.value} without naming a source`,
          );
          assert.notEqual(
            source?.kind,
            'demo_placeholder',
            `${entry.place.name}.${row.key} claims ${row.value} on demo data`,
          );
          assert.ok(
            row.verifiedAt,
            `${entry.place.name}.${row.key} claims ${row.value} without a date`,
          );
        }

        // Hours are never guessed: unverified has to read as unverified.
        if (entry.place.hoursStatus === 'unverified') {
          assert.match(entry.place.hoursLabel, /未確認/);
        }
      }
    } finally {
      await strict.stop();
    }
  });

  it('marks demo values as placeholders so the UI can say so', async () => {
    const demo = await startServer('demo');
    try {
      const entry = await demo.repo.getPlace('yabase-kihanjima');
      assert.ok(entry);
      const placeholderIds = new Set(
        entry.sources.filter((source) => source.kind === 'demo_placeholder').map((s) => s.id),
      );
      assert.ok(placeholderIds.size > 0, 'demo values must carry a demo source');
      const stated = entry.equipmentRows.filter((row) => row.value !== '？');
      assert.ok(stated.length > 0);
      for (const row of stated) {
        assert.ok(row.sourceId !== null, 'a stated value always names where it came from');
      }
    } finally {
      await demo.stop();
    }
  });
});
