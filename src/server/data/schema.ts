/**
 * One statement per table, applied on every boot with IF NOT EXISTS. The PoC is
 * small enough that this is a schema file rather than a migration chain; the
 * repository interface is what keeps the storage engine swappable.
 */
export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS households (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  home_area_code TEXT,
  home_area_label TEXT,
  usual_place_id TEXT,
  notification_opt_in INTEGER NOT NULL DEFAULT 0,
  subjective_prompt_count INTEGER NOT NULL DEFAULT 0,
  subjective_prompt_last_at TEXT,
  return_marks TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS parents (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  label TEXT
);

-- Birth year and month only. No day, no name: see the privacy notes in README.
CREATE TABLE IF NOT EXISTS children (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  birth_year INTEGER NOT NULL,
  birth_month INTEGER NOT NULL,
  handle TEXT
);

CREATE TABLE IF NOT EXISTS mobility_profiles (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  prep_minutes INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS places (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  area_code TEXT NOT NULL,
  area_label TEXT NOT NULL,
  kind TEXT NOT NULL,
  lat REAL,
  lng REAL,
  -- 'exact' = surveyed point, 'locality' = town centroid used for a rough estimate.
  coord_precision TEXT NOT NULL DEFAULT 'locality',
  price_label TEXT NOT NULL,
  indoor_shelter TEXT NOT NULL,
  escape_route TEXT,
  hours_status TEXT NOT NULL,
  hours_label TEXT NOT NULL,
  min_age_months INTEGER,
  max_age_months INTEGER,
  category TEXT NOT NULL,
  notes TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS place_sources (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  url TEXT,
  checked_at TEXT
);

-- Split from places so a single field can be corrected without touching the
-- rest of the record, and so each field carries its own provenance.
CREATE TABLE IF NOT EXISTS place_equipment (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  source_id TEXT REFERENCES place_sources(id) ON DELETE SET NULL,
  verified_at TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  UNIQUE (place_id, key)
);

CREATE TABLE IF NOT EXISTS recommendation_sessions (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  shown_at TEXT,
  context_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES recommendation_sessions(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  fit_grade TEXT NOT NULL,
  confidence_pct INTEGER NOT NULL,
  travel_minutes INTEGER,
  reasons_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES recommendation_sessions(id) ON DELETE CASCADE,
  recommendation_id TEXT REFERENCES recommendations(id) ON DELETE SET NULL,
  place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  time_to_decision_ms INTEGER,
  client_elapsed_ms INTEGER
);

CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visit_feedback (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL UNIQUE REFERENCES visits(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL,
  stay_minutes INTEGER NOT NULL,
  stay_bucket TEXT NOT NULL,
  revisit TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS preference_history (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  samples INTEGER NOT NULL,
  avg_stay_minutes REAL NOT NULL,
  last_reaction TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (household_id, category)
);

-- Corrections a household reports from the field. Kept apart from the curated
-- rows so a single report never silently overwrites a sourced value.
CREATE TABLE IF NOT EXISTS equipment_reports (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  household_id TEXT,
  session_id TEXT,
  place_id TEXT,
  recommendation_rank INTEGER,
  created_at TEXT NOT NULL,
  props_json TEXT
);

CREATE TABLE IF NOT EXISTS subjective_ratings (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  decision_id TEXT REFERENCES decisions(id) ON DELETE SET NULL,
  answer TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_equipment_place ON place_equipment(place_id);
CREATE INDEX IF NOT EXISTS idx_recs_session ON recommendations(session_id);
CREATE INDEX IF NOT EXISTS idx_decisions_session ON decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_visits_household ON visits(household_id);
CREATE INDEX IF NOT EXISTS idx_events_name ON analytics_events(name);
CREATE INDEX IF NOT EXISTS idx_events_household ON analytics_events(household_id);
`;
