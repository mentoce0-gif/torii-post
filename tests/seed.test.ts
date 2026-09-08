import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEMO_OBSERVATIONS } from '../src/server/data/seed/demoObservations.ts';
import { validateSeed } from '../src/server/data/seed/index.ts';
import { SEED_PLACES, type SeedPlace } from '../src/server/data/seed/places.ts';
import { startServer } from './helpers.ts';

/**
 * Two items on the CURATION.md checklist used to be eyeball checks a person
 * had to redo by hand before every PoC start:
 *
 *   - boot with SEED_PROFILE=poc and confirm no demo banner appears
 *   - confirm no demoObservations.ts value has crept into places.ts
 *
 * A check that only holds while someone remembers to look is not a guarantee.
 * Both are pinned here instead, so the honest-data rule survives the next
 * person who edits the seed in a hurry.
 */

const CONTEXT = {
  childAgeMonths: 18,
  remainingMinutes: 90,
  mobility: 'car',
  weather: 'cloudy',
  origin: { areaCode: 'shiga-kusatsu' },
};

describe('demo data never reaches the PoC profile', () => {
  it('declares no demo source in the curated seed', () => {
    // The one way a placeholder can be laundered into a fact is by pasting the
    // value into places.ts and giving it a source. Any source at all is enough
    // to satisfy validateSeed, so the kind is checked here: curated files carry
    // pages a human read, never the demo file's own marker.
    for (const place of SEED_PLACES) {
      for (const source of place.sources) {
        assert.notEqual(
          source.kind,
          'demo_placeholder',
          `${place.name} carries a demo source; demo values belong in demoObservations.ts`,
        );
      }
    }
  });

  it('serves no placeholder value and no banner under SEED_PROFILE=poc', async () => {
    const strict = await startServer('poc');
    try {
      for (const entry of await strict.repo.listPlaces()) {
        for (const source of entry.sources) {
          assert.notEqual(
            source.kind,
            'demo_placeholder',
            `${entry.place.name} loaded a demo source in the poc profile`,
          );
        }
      }

      const response = await strict.fetch('/api/recommend', {
        method: 'POST',
        body: JSON.stringify(CONTEXT),
      });
      assert.equal(response.status, 201);
      const body = (await response.json()) as { dataNotice: string | null };

      // No banner, because there is nothing unverified being shown as if it
      // were checked. This is the state a PoC actually starts in.
      assert.equal(body.dataNotice, null, 'the poc profile must not raise a demo banner');
    } finally {
      await strict.stop();
    }
  });

  it('raises the banner under SEED_PROFILE=demo, so the two profiles stay distinguishable', async () => {
    const demo = await startServer('demo');
    try {
      const response = await demo.fetch('/api/recommend', {
        method: 'POST',
        body: JSON.stringify(CONTEXT),
      });
      assert.equal(response.status, 201);
      const body = (await response.json()) as { dataNotice: string | null };
      assert.equal(body.dataNotice, 'demo_placeholder');
    } finally {
      await demo.stop();
    }
  });
});

describe('candidate sources stay candidates', () => {
  it('never lets an unread source back a stated value', () => {
    // `checkedAt: null` means "found, not yet read". validateSeed only asks
    // that a value name *some* declared source, so half-finished curation —
    // filling in a value while citing a page nobody has opened — would slip
    // past it. The date on the value and the date on the source have to agree
    // that a human was actually there.
    for (const place of SEED_PLACES) {
      const sourceByKey = new Map(place.sources.map((source) => [source.key, source]));
      for (const [key, entry] of Object.entries(place.equipment)) {
        if (entry.value === '？') continue;
        const source = sourceByKey.get(entry.sourceKey);
        assert.ok(source, `${place.name}.${key} cites a source that is not declared`);
        assert.notEqual(
          source?.checkedAt,
          null,
          `${place.name}.${key} cites ${entry.sourceKey}, which nobody has read yet`,
        );
      }
    }
  });

  it('gives every candidate source a URL to open', () => {
    // A candidate exists to save the curator the hunt. Without a link it just
    // puts an unverified label on the card and saves nobody anything.
    for (const place of SEED_PLACES) {
      for (const source of place.sources) {
        if (source.checkedAt !== null) continue;
        assert.ok(source.url, `${place.name} lists an unread source with no URL`);
      }
    }
  });
});

describe('a citation points at exactly one page', () => {
  it('gives every source in a place a distinct key', () => {
    // Source keys used to be derived from the source's kind alone, so a park
    // listing two official pages gave both `<id>:official`. `sourceKey` then
    // named a page ambiguously, and the lookup that resolves a value to its
    // evidence would answer with whichever row happened to win.
    for (const place of SEED_PLACES) {
      const keys = place.sources.map((source) => source.key);
      assert.equal(
        new Set(keys).size,
        keys.length,
        `${place.name} declares two sources under one key: ${keys.join(', ')}`,
      );
    }
  });

  it('refuses a seed whose sources collide, rather than silently picking one', () => {
    const base = SEED_PLACES[0];
    assert.ok(base, 'the seed should not be empty');

    const collided: SeedPlace = {
      ...base,
      sources: [
        { key: 'dup', kind: 'official_site', label: 'A', url: 'https://a.example', checkedAt: '2026-09-07' },
        { key: 'dup', kind: 'municipal_page', label: 'B', url: 'https://b.example', checkedAt: '2026-09-07' },
      ],
      equipment: {
        toilet: { value: '○', sourceKey: 'dup', verifiedAt: '2026-09-07', confidence: 1 },
      },
    };

    const violations = validateSeed([collided]);
    assert.ok(
      violations.some((violation) => violation.reason === 'duplicate source key'),
      'a duplicate source key must be a boot-time violation',
    );
  });
});

describe('the demo file stays wired to real places', () => {
  it('observes only place ids that exist', () => {
    // A renamed id would make an observation silently do nothing, and the demo
    // profile would quietly lose the coverage it exists to provide.
    const known = new Set(SEED_PLACES.map((place) => place.id));
    for (const observation of DEMO_OBSERVATIONS) {
      assert.ok(
        known.has(observation.placeId),
        `demoObservations references unknown place ${observation.placeId}`,
      );
    }
  });
});
