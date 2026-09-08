import type { SqlDriver } from './driver.ts';
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

/**
 * Every query the app makes, written once against {@link SqlDriver}.
 *
 * Which database answers is the driver's business: `node:sqlite` on a disk, or
 * D1 over a Worker binding. Keeping one body means the two deployments cannot
 * drift apart in their SQL, which is the kind of difference that only shows up
 * as wrong data much later.
 */
export class SqlRepository implements Repository {
  protected readonly db: SqlDriver;

  constructor(driver: SqlDriver) {
    this.db = driver;
  }

  // --- households ----------------------------------------------------------

  async createHousehold(input: {
    homeAreaCode?: string | null;
    homeAreaLabel?: string | null;
    parentRole?: ParentRole;
    childBirthYear?: number;
    childBirthMonth?: number;
    mobility?: Mobility;
  }): Promise<Household> {
    const id = randomUUID();
    const createdAt = now();
    await this.db.run(`INSERT INTO households (id, created_at, home_area_code, home_area_label, usual_place_id,
           notification_opt_in, subjective_prompt_count, subjective_prompt_last_at, return_marks)
         VALUES (?, ?, ?, ?, NULL, 0, 0, NULL, '')`, [id, createdAt, input.homeAreaCode ?? null, input.homeAreaLabel ?? null]);

    await this.db.run('INSERT INTO parents (id, household_id, role, label) VALUES (?, ?, ?, NULL)', [randomUUID(), id, input.parentRole ?? 'other']);

    if (input.childBirthYear && input.childBirthMonth) {
      await this.db.run('INSERT INTO children (id, household_id, birth_year, birth_month, handle) VALUES (?, ?, ?, ?, NULL)', [randomUUID(), id, input.childBirthYear, input.childBirthMonth]);
    }

    const mode = input.mobility ?? 'car';
    await this.db.run('INSERT INTO mobility_profiles (id, household_id, mode, prep_minutes) VALUES (?, ?, ?, ?)', [randomUUID(), id, mode, defaultPrepMinutes(mode)]);

    return (await this.getHousehold(id)) as Household;
  }

  async getHousehold(id: string): Promise<Household | null> {
    const row = await this.db.first('SELECT * FROM households WHERE id = ?', [id]) as Row | undefined;
    return row ? toHousehold(row) : null;
  }

  async updateHousehold(id: string, patch: Partial<Household>): Promise<Household | null> {
    const current = await this.getHousehold(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    await this.db.run(`UPDATE households SET home_area_code = ?, home_area_label = ?, usual_place_id = ?,
           notification_opt_in = ?, subjective_prompt_count = ?, subjective_prompt_last_at = ?,
           return_marks = ? WHERE id = ?`, [next.homeAreaCode,
        next.homeAreaLabel,
        next.usualPlaceId,
        bool(next.notificationOptIn),
        next.subjectivePromptCount,
        next.subjectivePromptLastAt,
        next.returnMarks,
        id,]);
    return await this.getHousehold(id);
  }

  /** Hard delete. The cascades take the children, visits, decisions and events with it. */
  async deleteHousehold(id: string): Promise<boolean> {
    await this.db.run('DELETE FROM analytics_events WHERE household_id = ?', [id]);
    const result = await this.db.run('DELETE FROM households WHERE id = ?', [id]);
    return Number(result.changes) > 0;
  }

  async getParents(householdId: string): Promise<Parent[]> {
    const rows = await this.db.all('SELECT * FROM parents WHERE household_id = ?', [householdId]) as Row[];
    return rows.map((row) => ({
      id: str(row, 'id'),
      householdId: str(row, 'household_id'),
      role: str(row, 'role') as ParentRole,
      label: strOrNull(row, 'label'),
    }));
  }

  async getChildren(householdId: string): Promise<Child[]> {
    const rows = await this.db.all('SELECT * FROM children WHERE household_id = ? ORDER BY birth_year, birth_month', [householdId]) as Row[];
    return rows.map((row) => ({
      id: str(row, 'id'),
      householdId: str(row, 'household_id'),
      birthYear: num(row, 'birth_year'),
      birthMonth: num(row, 'birth_month'),
      handle: strOrNull(row, 'handle'),
    }));
  }

  async replaceChildren(householdId: string, children: Omit<Child, 'id' | 'householdId'>[]): Promise<Child[]> {
    await this.db.run('DELETE FROM children WHERE household_id = ?', [householdId]);
    const insertChild =
      'INSERT INTO children (id, household_id, birth_year, birth_month, handle) VALUES (?, ?, ?, ?, ?)';
    for (const child of children) {
      await this.db.run(insertChild, [
        randomUUID(),
        householdId,
        child.birthYear,
        child.birthMonth,
        child.handle ?? null,
      ]);
    }
    return await this.getChildren(householdId);
  }

  async getMobilityProfile(householdId: string): Promise<MobilityProfile | null> {
    const row = await this.db.first('SELECT * FROM mobility_profiles WHERE household_id = ? LIMIT 1', [householdId]) as Row | undefined;
    if (!row) return null;
    return {
      id: str(row, 'id'),
      householdId: str(row, 'household_id'),
      mode: str(row, 'mode') as Mobility,
      prepMinutes: num(row, 'prep_minutes'),
    };
  }

  async upsertMobilityProfile(householdId: string, mode: Mobility, prepMinutes: number): Promise<MobilityProfile> {
    const existing = await this.getMobilityProfile(householdId);
    if (existing) {
      await this.db.run('UPDATE mobility_profiles SET mode = ?, prep_minutes = ? WHERE id = ?', [mode, prepMinutes, existing.id]);
    } else {
      await this.db.run('INSERT INTO mobility_profiles (id, household_id, mode, prep_minutes) VALUES (?, ?, ?, ?)', [randomUUID(), householdId, mode, prepMinutes]);
    }
    return (await this.getMobilityProfile(householdId)) as MobilityProfile;
  }

  // --- places --------------------------------------------------------------

  private async equipmentFor(
    placeId: string,
  ): Promise<{ map: EquipmentMap; rows: PlaceEquipment[] }> {
    const rows = await this.db.all('SELECT * FROM place_equipment WHERE place_id = ?', [placeId]) as Row[];
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

  private async sourcesFor(placeId: string): Promise<PlaceSource[]> {
    const rows = await this.db.all('SELECT * FROM place_sources WHERE place_id = ?', [placeId]) as Row[];
    return rows.map((row) => ({
      id: str(row, 'id'),
      placeId: str(row, 'place_id'),
      kind: str(row, 'kind') as SourceKind,
      label: str(row, 'label'),
      url: strOrNull(row, 'url'),
      checkedAt: strOrNull(row, 'checked_at'),
    }));
  }

  private async hydrate(row: Row): Promise<PlaceWithEquipment> {
    const place = toPlace(row);
    // Equipment and sources are independent lookups; no reason to queue them.
    const [{ map, rows }, sources] = await Promise.all([
      this.equipmentFor(place.id),
      this.sourcesFor(place.id),
    ]);
    return { place, equipment: map, equipmentRows: rows, sources };
  }

  async listPlaces(): Promise<PlaceWithEquipment[]> {
    const rows = await this.db.all('SELECT * FROM places ORDER BY name') as Row[];
    return await Promise.all(rows.map((row) => this.hydrate(row)));
  }

  async getPlace(id: string): Promise<PlaceWithEquipment | null> {
    const row = await this.db.first('SELECT * FROM places WHERE id = ?', [id]) as Row | undefined;
    return row ? await this.hydrate(row) : null;
  }

  // --- sessions ------------------------------------------------------------

  async createSession(householdId: string, contextJson: string, shownAt: string): Promise<RecommendationSession> {
    const id = randomUUID();
    const createdAt = now();
    await this.db.run('INSERT INTO recommendation_sessions (id, household_id, created_at, shown_at, context_json) VALUES (?, ?, ?, ?, ?)', [id, householdId, createdAt, shownAt, contextJson]);
    return { id, householdId, createdAt, shownAt, contextJson };
  }

  async getSession(id: string): Promise<RecommendationSession | null> {
    const row = await this.db.first('SELECT * FROM recommendation_sessions WHERE id = ?', [id]) as Row | undefined;
    if (!row) return null;
    return {
      id: str(row, 'id'),
      householdId: str(row, 'household_id'),
      createdAt: str(row, 'created_at'),
      shownAt: strOrNull(row, 'shown_at'),
      contextJson: str(row, 'context_json'),
    };
  }

  async saveRecommendations(rows: Omit<Recommendation, 'id'>[]): Promise<Recommendation[]> {
    const insert = `INSERT INTO recommendations (id, session_id, place_id, rank, fit_grade, confidence_pct, travel_minutes, reasons_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const saved: Recommendation[] = [];
    for (const row of rows) {
      const id = randomUUID();
      await this.db.run(insert, [
        id,
        row.sessionId,
        row.placeId,
        row.rank,
        row.fitGrade,
        row.confidencePct,
        row.travelMinutes,
        row.reasonsJson,
      ]);
      saved.push({ ...row, id });
    }
    return saved;
  }

  async getRecommendation(id: string): Promise<Recommendation | null> {
    const row = await this.db.first('SELECT * FROM recommendations WHERE id = ?', [id]) as
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

  async getRecommendationsForSession(sessionId: string): Promise<Recommendation[]> {
    const rows = await this.db.all('SELECT * FROM recommendations WHERE session_id = ? ORDER BY rank', [sessionId]) as Row[];
    return (await Promise.all(
      rows.map((row) => this.getRecommendation(str(row, 'id'))),
    )) as Recommendation[];
  }

  // --- decisions -----------------------------------------------------------

  async createDecision(input: {
    sessionId: string;
    recommendationId: string | null;
    placeId: string | null;
    kind: DecisionKind;
    clientElapsedMs: number | null;
  }): Promise<{ decision: Decision; visit: Visit | null }> {
    const session = await this.getSession(input.sessionId);
    if (!session) throw new Error('unknown session');

    const decidedAt = now();
    // Measured server side from the moment the cards were handed to the client.
    // The client's own stopwatch is stored alongside it, never instead of it.
    const timeToDecisionMs = session.shownAt
      ? Math.max(0, Date.parse(decidedAt) - Date.parse(session.shownAt))
      : null;

    const id = randomUUID();
    await this.db.run(`INSERT INTO decisions (id, session_id, recommendation_id, place_id, kind, decided_at, time_to_decision_ms, client_elapsed_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id,
        input.sessionId,
        input.recommendationId,
        input.placeId,
        input.kind,
        decidedAt,
        timeToDecisionMs,
        input.clientElapsedMs,]);

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
      await this.db.run('INSERT INTO visits (id, decision_id, household_id, place_id, created_at) VALUES (?, ?, ?, ?, ?)', [visitId, id, session.householdId, input.placeId, decidedAt]);
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

  async getDecision(id: string): Promise<Decision | null> {
    const row = await this.db.first('SELECT * FROM decisions WHERE id = ?', [id]) as Row | undefined;
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

  async getVisit(id: string): Promise<Visit | null> {
    const row = await this.db.first('SELECT * FROM visits WHERE id = ?', [id]) as Row | undefined;
    if (!row) return null;
    return {
      id: str(row, 'id'),
      decisionId: str(row, 'decision_id'),
      householdId: str(row, 'household_id'),
      placeId: str(row, 'place_id'),
      createdAt: str(row, 'created_at'),
    };
  }

  async getOpenVisits(householdId: string): Promise<(Visit & { placeName: string })[]> {
    const rows = await this.db.all(`SELECT v.*, p.name AS place_name FROM visits v
           JOIN places p ON p.id = v.place_id
           LEFT JOIN visit_feedback f ON f.visit_id = v.id
          WHERE v.household_id = ? AND f.id IS NULL
          ORDER BY v.created_at DESC`, [householdId]) as Row[];
    return rows.map((row) => ({
      id: str(row, 'id'),
      decisionId: str(row, 'decision_id'),
      householdId: str(row, 'household_id'),
      placeId: str(row, 'place_id'),
      createdAt: str(row, 'created_at'),
      placeName: str(row, 'place_name'),
    }));
  }

  async saveFeedback(input: NewFeedback): Promise<VisitFeedback> {
    const visit = await this.getVisit(input.visitId);
    if (!visit) throw new Error('unknown visit');
    const place = await this.getPlace(visit.placeId);

    const id = randomUUID();
    const createdAt = now();
    await this.db.run(`INSERT INTO visit_feedback (id, visit_id, reaction, stay_minutes, stay_bucket, revisit, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(visit_id) DO UPDATE SET
           reaction = excluded.reaction, stay_minutes = excluded.stay_minutes,
           stay_bucket = excluded.stay_bucket, revisit = excluded.revisit,
           note = excluded.note, created_at = excluded.created_at`, [id,
        input.visitId,
        input.reaction,
        input.stayMinutes,
        input.stayBucket,
        input.revisit,
        input.note,
        createdAt,]);

    // Field corrections land in their own table. A curated, sourced value is
    // never overwritten by a single report.
    const reportInsert =
      'INSERT INTO equipment_reports (id, place_id, household_id, key, value, created_at) VALUES (?, ?, ?, ?, ?, ?)';
    for (const report of input.equipmentReports) {
      await this.db.run(reportInsert, [
        randomUUID(),
        visit.placeId,
        visit.householdId,
        report.key,
        report.value,
        createdAt,
      ]);
    }

    if (place) await this.updatePreferenceHistory(visit.householdId, place.place.category, input);

    const row = await this.db.first('SELECT * FROM visit_feedback WHERE visit_id = ?', [input.visitId]) as Row;
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

  private async updatePreferenceHistory(
    householdId: string,
    category: string,
    input: NewFeedback,
  ): Promise<void> {
    const row = await this.db.first('SELECT * FROM preference_history WHERE household_id = ? AND category = ?', [householdId, category]) as Row | undefined;

    if (!row) {
      await this.db.run(`INSERT INTO preference_history (id, household_id, category, samples, avg_stay_minutes, last_reaction, updated_at)
           VALUES (?, ?, ?, 1, ?, ?, ?)`, [randomUUID(), householdId, category, input.stayMinutes, input.reaction, now()]);
      return;
    }

    const samples = num(row, 'samples') + 1;
    const avg = (num(row, 'avg_stay_minutes') * (samples - 1) + input.stayMinutes) / samples;
    await this.db.run('UPDATE preference_history SET samples = ?, avg_stay_minutes = ?, last_reaction = ?, updated_at = ? WHERE id = ?', [samples, avg, input.reaction, now(), str(row, 'id')]);
  }

  async countVisits(householdId: string, placeId: string): Promise<number> {
    const row = await this.db.first('SELECT COUNT(*) AS n FROM visits WHERE household_id = ? AND place_id = ?', [householdId, placeId]) as Row;
    return num(row, 'n');
  }

  async lastRevisitAnswer(householdId: string, placeId: string): Promise<Revisit | null> {
    const row = await this.db.first(`SELECT f.revisit AS revisit FROM visit_feedback f
           JOIN visits v ON v.id = f.visit_id
          WHERE v.household_id = ? AND v.place_id = ?
          ORDER BY f.created_at DESC LIMIT 1`, [householdId, placeId]) as Row | undefined;
    return row ? (str(row, 'revisit') as Revisit) : null;
  }

  async getPreferenceHistory(householdId: string): Promise<PreferenceHistory[]> {
    const rows = await this.db.all('SELECT * FROM preference_history WHERE household_id = ?', [householdId]) as Row[];
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

  async listHistory(householdId: string, limit: number): Promise<HistoryRow[]> {
    const rows = await this.db.all(`SELECT d.id AS decision_id, d.decided_at, d.kind, d.place_id, d.time_to_decision_ms,
                p.name AS place_name, p.area_label,
                v.id AS visit_id, f.stay_minutes, f.reaction, f.revisit
           FROM decisions d
           JOIN recommendation_sessions s ON s.id = d.session_id
           LEFT JOIN places p ON p.id = d.place_id
           LEFT JOIN visits v ON v.decision_id = d.id
           LEFT JOIN visit_feedback f ON f.visit_id = v.id
          WHERE s.household_id = ?
          ORDER BY d.decided_at DESC
          LIMIT ?`, [householdId, limit]) as Row[];

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

  async recordEvent(event: Omit<AnalyticsEventRow, 'id' | 'createdAt'> & { createdAt?: string }): Promise<void> {
    await this.db.run(`INSERT INTO analytics_events (id, name, household_id, session_id, place_id, recommendation_rank, created_at, props_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [randomUUID(),
        event.name,
        event.householdId,
        event.sessionId,
        event.placeId,
        event.recommendationRank,
        event.createdAt ?? now(),
        event.props ? JSON.stringify(event.props) : null,]);
  }

  async hasEvent(householdId: string, name: string): Promise<boolean> {
    const row = await this.db.first('SELECT COUNT(*) AS n FROM analytics_events WHERE household_id = ? AND name = ?', [householdId, name]) as Row;
    return num(row, 'n') > 0;
  }

  async recordSubjective(householdId: string, decisionId: string | null, answer: SubjectiveAnswer): Promise<void> {
    await this.db.run('INSERT INTO subjective_ratings (id, household_id, decision_id, answer, created_at) VALUES (?, ?, ?, ?, ?)', [randomUUID(), householdId, decisionId, answer, now()]);
  }

  async metrics(): Promise<MetricsSummary> {
    const ttdRows = await this.db.all('SELECT time_to_decision_ms AS ms FROM decisions WHERE time_to_decision_ms IS NOT NULL') as Row[];
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
    for (const row of await this.db.all('SELECT kind, COUNT(*) AS n FROM decisions GROUP BY kind') as Row[]) {
      const kind = str(row, 'kind') as DecisionKind;
      if (kind in decisions) decisions[kind] = num(row, 'n');
    }

    const eventCounts: Record<string, number> = {};
    for (const row of await this.db.all('SELECT name, COUNT(*) AS n FROM analytics_events GROUP BY name ORDER BY name') as Row[]) {
      eventCounts[str(row, 'name')] = num(row, 'n');
    }

    const subjective: Record<SubjectiveAnswer, number> = { faster: 0, same: 0, slower: 0 };
    for (const row of await this.db.all('SELECT answer, COUNT(*) AS n FROM subjective_ratings GROUP BY answer') as Row[]) {
      const answer = str(row, 'answer') as SubjectiveAnswer;
      if (answer in subjective) subjective[answer] = num(row, 'n');
    }

    const visitCount = num(await this.db.first('SELECT COUNT(*) AS n FROM visits') as Row, 'n');
    const feedbackCount = num(
      await this.db.first('SELECT COUNT(*) AS n FROM visit_feedback') as Row,
      'n',
    );
    const households = num(
      await this.db.first('SELECT COUNT(*) AS n FROM households') as Row,
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
