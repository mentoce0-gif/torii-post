import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { startServer, type TestServer } from './helpers.ts';

let server: TestServer;

before(async () => {
  server = await startServer('demo');
});

after(async () => {
  await server.stop();
});

interface ProfileBody {
  householdId: string;
  homeAreaCode: string | null;
  usualPlaceId: string | null;
  mobility: string;
  children: { birthYear: number; birthMonth: number; ageMonths: number }[];
  areas: { code: string }[];
  usualPlaceOptions: { id: string }[];
}

describe('PUT /api/profile', () => {
  it('creates a household on first save and returns the shape Settings needs', async () => {
    const profile = (await server.json('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({
        homeAreaCode: 'shiga-moriyama',
        mobility: 'car',
        children: [{ birthYear: 2025, birthMonth: 3 }],
      }),
    })) as ProfileBody;

    assert.ok(profile.householdId);
    assert.equal(profile.homeAreaCode, 'shiga-moriyama');
    assert.equal(profile.children.length, 1);
    assert.ok(profile.children[0]?.ageMonths ?? 0 > 0);
    assert.ok(profile.areas.length > 0);
    assert.ok(profile.usualPlaceOptions.length > 0);
  });

  it('lets a household nominate its own default spot', async () => {
    const created = (await server.json('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({ homeAreaCode: 'shiga-kusatsu' }),
    })) as ProfileBody;

    const usual = ((await server.repo.listPlaces()).find((p) => p.place.kind === 'outdoor') as {
      place: { id: string };
    }).place.id;

    const updated = (await server.json('/api/profile', {
      method: 'PUT',
      householdId: created.householdId,
      body: JSON.stringify({ homeAreaCode: 'shiga-kusatsu', usualPlaceId: usual }),
    })) as ProfileBody;
    assert.equal(updated.usualPlaceId, usual);

    const body = (await server.json('/api/recommend', {
      method: 'POST',
      householdId: created.householdId,
      body: JSON.stringify({
        childAgeMonths: 18,
        remainingMinutes: 90,
        mobility: 'car',
        weather: 'cloudy',
        origin: { areaCode: 'shiga-kusatsu' },
      }),
    })) as { candidates: { placeId: string; role: string }[] };

    const usualCard = body.candidates.find((c) => c.role === 'usual');
    assert.ok(usualCard, 'the nominated spot should hold the fallback slot');
    assert.equal(usualCard.placeId, usual);
  });

  it('rejects an unknown area or place rather than storing it', async () => {
    for (const bad of [{ homeAreaCode: 'atlantis' }, { usualPlaceId: 'nowhere' }]) {
      const response = await server.fetch('/api/profile', {
        method: 'PUT',
        body: JSON.stringify(bad),
      });
      assert.equal(response.status, 400);
    }
  });

  it('falls back to the household home area when no location is given', async () => {
    const created = (await server.json('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({ homeAreaCode: 'kyoto-shimogyo' }),
    })) as ProfileBody;

    const body = (await server.json('/api/recommend', {
      method: 'POST',
      householdId: created.householdId,
      body: JSON.stringify({
        childAgeMonths: 18,
        remainingMinutes: 90,
        mobility: 'car',
        weather: 'cloudy',
        origin: {},
      }),
    })) as { context: { areaCode: string } };

    assert.equal(body.context.areaCode, 'kyoto-shimogyo');
  });
});

describe('the household id is opaque and swappable', () => {
  it('ignores a malformed id rather than trusting it', async () => {
    const body = (await server.json('/api/recommend', {
      method: 'POST',
      householdId: '../../etc/passwd',
      body: JSON.stringify({
        childAgeMonths: 18,
        remainingMinutes: 90,
        mobility: 'car',
        weather: 'cloudy',
        origin: { areaCode: 'shiga-kusatsu' },
      }),
    })) as { householdId: string };
    assert.notEqual(body.householdId, '../../etc/passwd');
    assert.match(body.householdId, /^[0-9a-f-]{36}$/);
  });
});
