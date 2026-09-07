import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

import { emptyEquipment, isEquipmentKey, isEquipmentValue } from '../domain/equipment.ts';
import type {
  Child,
  Decision,
  DecisionKind,
  EquipmentMap,
  FitGrade,
  Household,
  HoursStatus,
  Mobility,
  MobilityProfile,
  Parent,
  ParentRole,
  Place,
  PlaceEquipment,
  PlaceKind,
  PlaceSource,
  PlaceWithEquipment,
  PreferenceHistory,
  Reaction,
  Recommendation,
  RecommendationSession,
  Revisit,
  SourceKind,
  SubjectiveAnswer,
  Visit,
  VisitFeedback,
} from '../domain/types.ts';
import { defaultPrepMinutes } from '../domain/travel.ts';
import { SCHEMA_SQL } from './schema.ts';
import type {
  AnalyticsEventRow,
  HistoryRow,
  MetricsSummary,
  NewFeedback,
  Repository,
  TimeToDecisionMetrics,
} from './repository.ts';

type Row = Record<string, unknown>;

const now = () => new Date().toISOString();
const bool = (value: unknown) => (value ? 1 : 0);

function str(row: Row, key: string): string {
  return String(row[key] ?? '');
}
function strOrNull(row: Row, key: string): string | null {
  const value = row[key];
  return value === null || value === undefined ? null : String(value);
}
function num(row: Row, key: string): number {
  return Number(row[key] ?? 0);
}
function numOrNull(row: Row, key: string): number | null {
  const value = row[key];
  return value === null || value === undefined ? null : Number(value);
}

function toPlace(row: Row): Place {
  return {
    id: str(row, 'id'),
    name: str(row, 'name'),
    areaCode: str(row, 'area_code'),
    areaLabel: str(row, 'area_label'),
    kind: str(row, 'kind') as PlaceKind,
    lat: numOrNull(row, 'lat'),
    lng: numOrNull(row, 'lng'),
    coordPrecision: str(row, 'coord_precision') === 'exact' ? 'exact' : 'locality',
    priceLabel: str(row, 'price_label'),
    indoorShelter: isEquipmentValue(row['indoor_shelter']) ? row['indoor_shelter'] : '？',
    escapeRoute: strOrNull(row, 'escape_route'),
    hoursStatus: str(row, 'hours_status') as HoursStatus,
    hoursLabel: str(row, 'hours_label'),
    minAgeMonths: numOrNull(row, 'min_age_months'),
    maxAgeMonths: numOrNull(row, 'max_age_months'),
    category: str(row, 'category'),
    notes: strOrNull(row, 'notes'),
    updatedAt: str(row, 'updated_at'),
  };
}

function toHousehold(row: Row): Household {
  return {
    id: str(row, 'id'),
    createdAt: str(row, 'created_at'),
    homeAreaCode: strOrNull(row, 'home_area_code'),
    homeAreaLabel: strOrNull(row, 'home_area_label'),
    usualPlaceId: strOrNull(row, 'usual_place_id'),
    notificationOptIn: num(row, 'notification_opt_in') === 1,
    subjectivePromptCount: num(row, 'subjective_prompt_count'),
    subjectivePromptLastAt: strOrNull(row, 'subjective_prompt_last_at'),
    returnMarks: str(row, 'return_marks'),
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return Math.round(((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2);
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] as number;
}

export const TIME_TO_DECISION_TARGET_MS = 60_000;

export class SqliteRepository implements Repository {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA_SQL);
  }

  /** Escape hatch for the seeder only. Routes must go through the interface. */
  get handle(): DatabaseSync {
    return this.db;
  }

  // --- households ----------------------------------------------------------

  createHousehold(input: {
    homeAreaCode?: string | null;
    homeAreaLabel?: string | null;
    parentRole?: ParentRole;
    childBirthYear?: number;
    childBirthMonth?: number;
    mobility?: Mobility;
  }): Household {
    const id = randomUUID();
    const createdAt = now();
    this.db
      .prepare(
        `INSERT INTO households (id, created_at, home_area_code, home_area_label, usual_place_id,
           notification_opt_in, subjective_prompt_count, subjective_prompt_last_at, return_marks)
         VALUES (?, ?, ?, ?, NULL, 0, 0, NULL, '')`,
      )
      .run(id, createdAt, input.homeAreaCode ?? null, input.homeAreaLabel ?? null);

    this.db
      .prepare('INSERT INTO parents (id, household_id, role, label) VALUES (?, ?, ?, NULL)')
      .run(randomUUID(), id, input.parentRole ?? 'other');

    if (input.childBirthYear && input.childBirthMonth) {
      this.db
        .prepare(
          'INSERT INTO children (id, household_id, birth_year, birth_month, handle) VALUES (?, ?, ?, ?, NULL)',
        )
        .run(randomUUID(), id, input.childBirthYear, input.childBirthMonth);
    }

    const mode = input.mobility ?? 'car';
    this.db
      .prepare(
        'INSERT INTO mobility_profiles (id, household_id, mode, prep_minutes) VALUES (?, ?, ?, ?)',
      )
      .run(randomUUID(), id, mode, defaultPrepMinutes(mode));

    return this.getHousehold(id) as Household;
  }

  getHousehold(id: string): Household | null {
    const row = this.db.prepare('SELECT * FROM households WHERE id = ?').get(id) as Row | undefined;
    return row ? toHousehold(row) : null;
  }

  updateHousehold(id: string, patch: Partial<Household>): Household | null {
    const current = this.getHousehold(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    this.db
      .prepare(
        `UPDATE households SET home_area_code = ?, home_area_label = ?, usual_place_id = ?,
           notification_opt_in = ?, subjective_prompt_count = ?, subjective_prompt_last_at = ?,
           return_marks = ? WHERE id = ?`,
      )
      .run(
        next.homeAreaCode,
        next.homeAreaLabel,
        next.usualPlaceId,
        bool(next.notificationOptIn),
        next.subjectivePromptCount,
        next.subjectivePromptLastAt,
        next.returnMarks,
        id,
      );
    return this.getHousehold(id);
  }

  /** Hard delete. The cascades take the children, visits, decisions and events with it. */
  deleteHousehold(id: string): boolean {
    this.db.prepare('DELETE FROM analytics_events WHERE household_id = ?').run(id);
    const result = this.db.prepare('DELETE FROM households WHERE id = ?').run(id);
    return Number(result.changes) > 0;
  }

  getParents(householdId: string): Parent[] {
    const rows = this.db
      .prepare('SELECT * FROM parents WHERE household_id = ?')
      .all(householdId) as Row[];
    return rows.map((row) => ({
      id: str(row, 'id'),
      householdId: str(row, 'household_id'),
      role: str(row, 'role') as ParentRole,
      label: strOrNull(row, 'label'),
    }));
  }

  getChildren(householdId: string): Child[] {
    const rows = this.db
      .prepare('SELECT * FROM children WHERE household_id = ? ORDER BY birth_year, birth_month')
      .all(householdId) as Row[];
    return rows.map((row) => ({
      id: str(row, 'id'),
      householdId: str(row, 'household_id'),
      birthYear: num(row, 'birth_year'),
      birthMonth: num(row, 'birth_month'),
      handle: strOrNull(row, 'handle'),
    }));
  }

  replaceChildren(householdId: string, children: Omit<Child, 'id' | 'householdId'>[]): Child[] {
    this.db.prepare('DELETE FROM children WHERE household_id = ?').run(householdId);
    const insert = this.db.prepare(
      'INSERT INTO children (id, household_id, birth_year, birth_month, handle) VALUES (?, ?, ?, ?, ?)',
    );
    for (const child of children) {
      insert.run(randomUUID(), householdId, child.birthYear, child.birthMonth, child.handle ?? null);
    }
    return this.getChildren(householdId);
  }

  getMobilityProfile(householdId: string): MobilityProfile | null {
    const row = this.db
      .prepare('SELECT * FROM mobility_profiles WHERE household_id = ? LIMIT 1')
      .get(householdId) as Row | undefined;
    if (!row) return null;
    return {
      id: str(row, 'id'),
      householdId: str(row, 'household_id'),
      mode: str(row, 'mode') as Mobility,
      prepMinutes: num(row, 'prep_minutes'),
    };
  }

  upsertMobilityProfile(householdId: string, mode: Mobility, prepMinutes: number): MobilityProfile {
    const existing = this.getMobilityProfile(householdId);
    if (existing) {
      this.db
        .prepare('UPDATE mobility_profiles SET mode = ?, prep_minutes = ? WHERE id = ?')
        .run(mode, prepMinutes, existing.id);
    } else {
      this.db
        .prepare(
          'INSERT INTO mobility_profiles (id, household_id, mode, prep_minutes) VALUES (?, ?, ?, ?)',
        )
        .run(randomUUID(), householdId, mode, prepMinutes);
    }
    return this.getMobilityProfile(householdId) as MobilityProfile;
  }

  // --- places --------------------------------------------------------------

  private equipmentFor(placeId: string): { map: EquipmentMap; rows: PlaceEquipment[] } {
    const rows = this.db
      .prepare('SELECT * FROM place_equipment WHERE place_id = ?')
      .all(placeId) as Row[];
    const map = emptyEquipment();
    const parsed: PlaceEquipment[] = [];
    for (const row of rows) {
      const key = row['key'];
      const value = row['value'];
      if (!isEquipmentKey(key) || !isEquipmentValue(value)) continue;
      map[key] = value;
      parsed.push({
        id: str(row, 'id'),
        placeId: str(row, 'place_id'),
        key,
        value,
        sourceId: strOrNull(row, 'source_id'),
        verifiedAt: strOrNull(row, 'verified_at'),
        confidence: num(row, 'confidence'),
      });
    }
    return { map, rows: parsed };
  }

  private sourcesFor(placeId: string): PlaceSource[] {
    const rows = this.db
      .prepare('SELECT * FROM place_sources WHERE place_id = ?')
      .all(placeId) as Row[];
    return rows.map((row) => ({
      id: str(row, 'id'),
      placeId: str(row, 'place_id'),
      kind: str(row, 'kind') as SourceKind,
      label: str(row, 'label'),
      url: strOrNull(row, 'url'),
      checkedAt: strOrNull(row, 'checked_at'),
    }));
  }

  private hydrate(row: Row): PlaceWithEquipment {
    const place = toPlace(row);
    const { map, rows } = this.equipmentFor(place.id);
    return { place, equipment: map, equipmentRows: rows, sources: this.sourcesFor(place.id) };
  }

  listPlaces(): PlaceWithEquipment[] {
    const rows = this.db.prepare('SELECT * FROM places ORDER BY name').all() as Row[];
    return rows.map((row) => this.hydrate(row));
  }

  getPlace(id: string): PlaceWithEquipment | null {
    const row = this.db.prepare('SELECT * FROM places WHERE id = ?').get(id) as Row | undefined;
    return row ? this.hydrate(row) : null;
  }

  // --- sessions ------------------------------------------------------------

  createSession(householdId: string, contextJson: string, shownAt: string): RecommendationSession {
    const id = randomUUID();
    const createdAt = now();
    this.db
      .prepare(
        'INSERT INTO recommendation_sessions (id, household_id, created_at, shown_at, context_json) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, householdId, createdAt, shownAt, contextJson);
    return { id, householdId, createdAt, shownAt, contextJson };
  }

  getSession(id: string): RecommendationSession | null {
    const row = this.db
      .prepare('SELECT * FROM recommendation_sessions WHERE id = ?')
      .get(id) as Row | undefined;
    if (!row) return null;
    return {
      id: str(row, 'id'),
      householdId: str(row, 'household_id'),
      createdAt: str(row, 'created_at'),
      shownAt: strOrNull(row, 'shown_at'),
      contextJson: str(row, 'context_json'),
    };
  }

  saveRecommendations(rows: Omit<Recommendation, 'id'>[]): Recommendation[] {
    const insert = this.db.prepare(
      `INSERT INTO recommendations (id, session_id, place_id, rank, fit_grade, confidence_pct, travel_minutes, reasons_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const saved: Recommendation[] = [];
    for (const row of rows) {
      const id = randomUUID();
      insert.run(
        id,
        row.sessionId,
        row.placeId,
        row.rank,
        row.fitGrade,
        row.confidencePct,
        row.travelMinutes,
        row.reasonsJson,
      );
      saved.push({ ...row, id });
    }
    return saved;
  }

  getRecommendation(id: string): Recommendation | null {
    const row = this.db.prepare('SELECT * FROM recommendations WHERE id = ?').get(id) as
      | Row
      | undefined;
    if (!row) return null;
    return {
      id: str(row, 'id'),
      sessionId: str(row, 'session_id'),
      placeId: str(row, 'place_id'),
      rank: num(row, 'rank'),
      fitGrade: str(row, 'fit_grade') as FitGrade,
      confidencePct: num(row, 'confidence_pct'),
      travelMinutes: numOrNull(row, 'travel_minutes'),
      reasonsJson: str(row, 'reasons_json'),
    };
  }

  getRecommendationsForSession(sessionId: string): Recommendation[] {
    const rows = this.db
      .prepare('SELECT * FROM recommendations WHERE session_id = ? ORDER BY rank')
      .all(sessionId) as Row[];
    return rows.map((row) => this.getRecommendation(str(row, 'id')) as Recommendation);
  }

  // --- decisions -----------------------------------------------------------

  createDecision(input: {
    sessionId: string;
    recommendationId: string | null;
    placeId: string | null;
    kind: DecisionKind;
    clientElapsedMs: number | null;
  }): { decision: Decision; visit: Visit | null } {
    const session = this.getSession(input.sessionId);
    if (!session) throw new Error('unknown session');

    const decidedAt = now();
    // Measured server side from the moment the cards were handed to the client.
    // The client's own stopwatch is stored alongside it, never instead of it.
    const timeToDecisionMs = session.shownAt
      ? Math.max(0, Date.parse(decidedAt) - Date.parse(session.shownAt))
      : null;

    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO decisions (id, session_id, recommendation_id, place_id, kind, decided_at, time_to_decision_ms, client_elapsed_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.sessionId,
        input.recommendationId,
        input.placeId,
        input.kind,
        decidedAt,
        timeToDecisionMs,
        input.clientElapsedMs,
      );

    const decision: Decision = {
      id,
      sessionId: input.sessionId,
      recommendationId: input.recommendationId,
      placeId: input.placeId,
      kind: input.kind,
      decidedAt,
      timeToDecisionMs,
      clientElapsedMs: input.clientElapsedMs,
    };

    let visit: Visit | null = null;
    if (input.kind === 'go' && input.placeId) {
      const visitId = randomUUID();
      this.db
        .prepare(
          'INSERT INTO visits (id, decision_id, household_id, place_id, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(visitId, id, session.householdId, input.placeId, decidedAt);
      visit = {
        id: visitId,
        decisionId: id,
        householdId: session.householdId,
        placeId: input.placeId,
        createdAt: decidedAt,
      };
    }

    return { decision, visit };
  }

  getDecision(id: string): Decision | null {
    const row = this.db.prepare('SELECT * FROM decisions WHERE id = ?').get(id) as Row | undefined;
    if (!row) return null;
    return {
      id: str(row, 'id'),
      sessionId: str(row, 'session_id'),
      recommendationId: strOrNull(row, 'recommendation_id'),
      placeId: strOrNull(row, 'place_id'),
      kind: str(row, 'kind') as DecisionKind,
      decidedAt: str(row, 'decided_at'),
      timeToDecisionMs: numOrNull(row, 'time_to_decision_ms'),
      clientElapsedMs: numOrNull(row, 'client_elapsed_ms'),
    };
  }

  // --- visits and feedback -------------------------------------------------

  getVisit(id: string): Visit | null {
    const row = this.db.prepare('SELECT * FROM visits WHERE id = ?').get(id) as Row | undefined;
    if (!row) return null;
    return {
      id: str(row, 'id'),
      decisionId: str(row, 'decision_id'),
      householdId: str(row, 'household_id'),
      placeId: str(row, 'place_id'),
      createdAt: str(row, 'created_at'),
    };
  }

  getOpenVisits(householdId: string): (Visit & { placeName: string })[] {
    const rows = this.db
      .prepare(
        `SELECT v.*, p.name AS place_name FROM visits v
           JOIN places p ON p.id = v.place_id
           LEFT JOIN visit_feedback f ON f.visit_id = v.id
          WHERE v.household_id = ? AND f.id IS NULL
          ORDER BY v.created_at DESC`,
      )
      .all(householdId) as Row[];
    return rows.map((row) => ({
      id: str(row, 'id'),
      decisionId: str(row, 'decision_id'),
      householdId: str(row, 'household_id'),
      placeId: str(row, 'place_id'),
      createdAt: str(row, 'created_at'),
      placeName: str(row, 'place_name'),
    }));
  }

  saveFeedback(input: NewFeedback): VisitFeedback {
    const visit = this.getVisit(input.visitId);
    if (!visit) throw new Error('unknown visit');
    const place = this.getPlace(visit.placeId);

    const id = randomUUID();
    const createdAt = now();
    this.db
      .prepare(
        `INSERT INTO visit_feedback (id, visit_id, reaction, stay_minutes, stay_bucket, revisit, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(visit_id) DO UPDATE SET
           reaction = excluded.reaction, stay_minutes = excluded.stay_minutes,
           stay_bucket = excluded.stay_bucket, revisit = excluded.revisit,
           note = excluded.note, created_at = excluded.created_at`,
      )
      .run(
        id,
        input.visitId,
        input.reaction,
        input.stayMinutes,
        input.stayBucket,
        input.revisit,
        input.note,
        createdAt,
      );

    // Field corrections land in their own table. A curated, sourced value is
    // never overwritten by a single report.
    const reportInsert = this.db.prepare(
      'INSERT INTO equipment_reports (id, place_id, household_id, key, value, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const report of input.equipmentReports) {
      reportInsert.run(
        randomUUID(),
        visit.placeId,
        visit.householdId,
        report.key,
        report.value,
        createdAt,
      );
    }

    if (place) this.updatePreferenceHistory(visit.householdId, place.place.category, input);

    const row = this.db
      .prepare('SELECT * FROM visit_feedback WHERE visit_id = ?')
      .get(input.visitId) as Row;
    return {
      id: str(row, 'id'),
      visitId: str(row, 'visit_id'),
      reaction: str(row, 'reaction') as Reaction,
      stayMinutes: num(row, 'stay_minutes'),
      stayBucket: str(row, 'stay_bucket') as NewFeedback['stayBucket'],
      revisit: str(row, 'revisit') as Revisit,
      note: strOrNull(row, 'note'),
      createdAt: str(row, 'created_at'),
    };
  }

  private updatePreferenceHistory(householdId: string, category: string, input: NewFeedback): void {
    const row = this.db
      .prepare('SELECT * FROM preference_history WHERE household_id = ? AND category = ?')
      .get(householdId, category) as Row | undefined;

    if (!row) {
      this.db
        .prepare(
          `INSERT INTO preference_history (id, household_id, category, samples, avg_stay_minutes, last_reaction, updated_at)
           VALUES (?, ?, ?, 1, ?, ?, ?)`,
        )
        .run(randomUUID(), householdId, category, input.stayMinutes, input.reaction, now());
      return;
    }

    const samples = num(row, 'samples') + 1;
    const avg = (num(row, 'avg_stay_minutes') * (samples - 1) + input.stayMinutes) / samples;
    this.db
      .prepare(
        'UPDATE preference_history SET samples = ?, avg_stay_minutes = ?, last_reaction = ?, updated_at = ? WHERE id = ?',
      )
      .run(samples, avg, input.reaction, now(), str(row, 'id'));
  }

  countVisits(householdId: string, placeId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM visits WHERE household_id = ? AND place_id = ?')
      .get(householdId, placeId) as Row;
    return num(row, 'n');
  }

  lastRevisitAnswer(householdId: string, placeId: string): Revisit | null {
    const row = this.db
      .prepare(
        `SELECT f.revisit AS revisit FROM visit_feedback f
           JOIN visits v ON v.id = f.visit_id
          WHERE v.household_id = ? AND v.place_id = ?
          ORDER BY f.created_at DESC LIMIT 1`,
      )
      .get(householdId, placeId) as Row | undefined;
    return row ? (str(row, 'revisit') as Revisit) : null;
  }

  getPreferenceHistory(householdId: string): PreferenceHistory[] {
    const rows = this.db
      .prepare('SELECT * FROM preference_history WHERE household_id = ?')
      .all(householdId) as Row[];
    return rows.map((row) => ({
      id: str(row, 'id'),
      householdId: str(row, 'household_id'),
      category: str(row, 'category'),
      samples: num(row, 'samples'),
      avgStayMinutes: num(row, 'avg_stay_minutes'),
      lastReaction: strOrNull(row, 'last_reaction') as Reaction | null,
      updatedAt: str(row, 'updated_at'),
    }));
  }

  listHistory(householdId: string, limit: number): HistoryRow[] {
    const rows = this.db
      .prepare(
        `SELECT d.id AS decision_id, d.decided_at, d.kind, d.place_id, d.time_to_decision_ms,
                p.name AS place_name, p.area_label,
                v.id AS visit_id, f.stay_minutes, f.reaction, f.revisit
           FROM decisions d
           JOIN recommendation_sessions s ON s.id = d.session_id
           LEFT JOIN places p ON p.id = d.place_id
           LEFT JOIN visits v ON v.decision_id = d.id
           LEFT JOIN visit_feedback f ON f.visit_id = v.id
          WHERE s.household_id = ?
          ORDER BY d.decided_at DESC
          LIMIT ?`,
      )
      .all(householdId, limit) as Row[];

    return rows.map((row) => ({
      decisionId: str(row, 'decision_id'),
      decidedAt: str(row, 'decided_at'),
      kind: str(row, 'kind') as DecisionKind,
      placeId: strOrNull(row, 'place_id'),
      placeName: strOrNull(row, 'place_name'),
      areaLabel: strOrNull(row, 'area_label'),
      visitId: strOrNull(row, 'visit_id'),
      stayMinutes: numOrNull(row, 'stay_minutes'),
      reaction: strOrNull(row, 'reaction') as Reaction | null,
      revisit: strOrNull(row, 'revisit') as Revisit | null,
      timeToDecisionMs: numOrNull(row, 'time_to_decision_ms'),
    }));
  }

  // --- analytics -----------------------------------------------------------

  recordEvent(event: Omit<AnalyticsEventRow, 'id' | 'createdAt'> & { createdAt?: string }): void {
    this.db
      .prepare(
        `INSERT INTO analytics_events (id, name, household_id, session_id, place_id, recommendation_rank, created_at, props_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        event.name,
        event.householdId,
        event.sessionId,
        event.placeId,
        event.recommendationRank,
        event.createdAt ?? now(),
        event.props ? JSON.stringify(event.props) : null,
      );
  }

  hasEvent(householdId: string, name: string): boolean {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM analytics_events WHERE household_id = ? AND name = ?')
      .get(householdId, name) as Row;
    return num(row, 'n') > 0;
  }

  recordSubjective(householdId: string, decisionId: string | null, answer: SubjectiveAnswer): void {
    this.db
      .prepare(
        'INSERT INTO subjective_ratings (id, household_id, decision_id, answer, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(randomUUID(), householdId, decisionId, answer, now());
  }

  metrics(): MetricsSummary {
    const ttdRows = this.db
      .prepare('SELECT time_to_decision_ms AS ms FROM decisions WHERE time_to_decision_ms IS NOT NULL')
      .all() as Row[];
    const values = ttdRows.map((row) => num(row, 'ms'));

    const timeToDecision: TimeToDecisionMetrics = {
      count: values.length,
      medianMs: median(values),
      meanMs: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null,
      p90Ms: percentile(values, 90),
      underTargetRate: values.length
        ? values.filter((v) => v <= TIME_TO_DECISION_TARGET_MS).length / values.length
        : null,
      targetMs: TIME_TO_DECISION_TARGET_MS,
    };

    const decisions: Record<DecisionKind, number> = { go: 0, skip: 0, usual: 0 };
    for (const row of this.db.prepare('SELECT kind, COUNT(*) AS n FROM decisions GROUP BY kind').all() as Row[]) {
      const kind = str(row, 'kind') as DecisionKind;
      if (kind in decisions) decisions[kind] = num(row, 'n');
    }

    const eventCounts: Record<string, number> = {};
    for (const row of this.db
      .prepare('SELECT name, COUNT(*) AS n FROM analytics_events GROUP BY name ORDER BY name')
      .all() as Row[]) {
      eventCounts[str(row, 'name')] = num(row, 'n');
    }

    const subjective: Record<SubjectiveAnswer, number> = { faster: 0, same: 0, slower: 0 };
    for (const row of this.db
      .prepare('SELECT answer, COUNT(*) AS n FROM subjective_ratings GROUP BY answer')
      .all() as Row[]) {
      const answer = str(row, 'answer') as SubjectiveAnswer;
      if (answer in subjective) subjective[answer] = num(row, 'n');
    }

    const visitCount = num(this.db.prepare('SELECT COUNT(*) AS n FROM visits').get() as Row, 'n');
    const feedbackCount = num(
      this.db.prepare('SELECT COUNT(*) AS n FROM visit_feedback').get() as Row,
      'n',
    );
    const households = num(
      this.db.prepare('SELECT COUNT(*) AS n FROM households').get() as Row,
      'n',
    );

    return {
      timeToDecision,
      decisions,
      eventCounts,
      subjective,
      feedbackRate: visitCount ? feedbackCount / visitCount : null,
      households,
    };
  }

  close(): void {
    this.db.close();
  }
}
