import type {
  Child,
  Decision,
  DecisionKind,
  EquipmentKey,
  EquipmentValue,
  Household,
  Mobility,
  MobilityProfile,
  Parent,
  ParentRole,
  PlaceWithEquipment,
  PreferenceHistory,
  Reaction,
  Recommendation,
  RecommendationSession,
  Revisit,
  StayBucket,
  SubjectiveAnswer,
  Visit,
  VisitFeedback,
} from '../domain/types.ts';

export interface AnalyticsEventRow {
  id: string;
  name: string;
  householdId: string | null;
  sessionId: string | null;
  placeId: string | null;
  recommendationRank: number | null;
  createdAt: string;
  props: Record<string, unknown> | null;
}

export interface HistoryRow {
  decisionId: string;
  decidedAt: string;
  kind: DecisionKind;
  placeId: string | null;
  placeName: string | null;
  areaLabel: string | null;
  visitId: string | null;
  stayMinutes: number | null;
  reaction: Reaction | null;
  revisit: Revisit | null;
  timeToDecisionMs: number | null;
}

export interface TimeToDecisionMetrics {
  count: number;
  medianMs: number | null;
  meanMs: number | null;
  p90Ms: number | null;
  underTargetRate: number | null;
  targetMs: number;
}

export interface MetricsSummary {
  timeToDecision: TimeToDecisionMetrics;
  decisions: Record<DecisionKind, number>;
  eventCounts: Record<string, number>;
  subjective: Record<SubjectiveAnswer, number>;
  feedbackRate: number | null;
  households: number;
}

export interface NewFeedback {
  visitId: string;
  reaction: Reaction;
  stayMinutes: number;
  stayBucket: StayBucket;
  revisit: Revisit;
  note: string | null;
  equipmentReports: { key: EquipmentKey; value: EquipmentValue }[];
}

/**
 * Everything the API layer is allowed to know about storage.
 *
 * Every read and write is async. The local SQLite implementation resolves
 * immediately — nothing about it needs a promise — but a database that lives
 * anywhere other than this process cannot be synchronous, and the interface has
 * to admit that or it can only ever describe an on-disk file. D1 reaches the
 * Worker over a binding; Postgres would be a socket. Both are awaited.
 *
 * Swapping SQLite for Postgres means writing one more implementation of this;
 * no route, and nothing in domain/, touches a driver directly.
 */
export interface Repository {
  createHousehold(input: {
    homeAreaCode?: string | null;
    homeAreaLabel?: string | null;
    parentRole?: ParentRole;
    childBirthYear?: number;
    childBirthMonth?: number;
    mobility?: Mobility;
  }): Promise<Household>;
  getHousehold(id: string): Promise<Household | null>;
  updateHousehold(id: string, patch: Partial<Household>): Promise<Household | null>;
  deleteHousehold(id: string): Promise<boolean>;

  getParents(householdId: string): Promise<Parent[]>;
  getChildren(householdId: string): Promise<Child[]>;
  replaceChildren(householdId: string, children: Omit<Child, 'id' | 'householdId'>[]): Promise<Child[]>;
  getMobilityProfile(householdId: string): Promise<MobilityProfile | null>;
  upsertMobilityProfile(householdId: string, mode: Mobility, prepMinutes: number): Promise<MobilityProfile>;

  listPlaces(): Promise<PlaceWithEquipment[]>;
  getPlace(id: string): Promise<PlaceWithEquipment | null>;

  createSession(householdId: string, contextJson: string, shownAt: string): Promise<RecommendationSession>;
  getSession(id: string): Promise<RecommendationSession | null>;
  saveRecommendations(rows: Omit<Recommendation, 'id'>[]): Promise<Recommendation[]>;
  getRecommendation(id: string): Promise<Recommendation | null>;
  getRecommendationsForSession(sessionId: string): Promise<Recommendation[]>;

  createDecision(input: {
    sessionId: string;
    recommendationId: string | null;
    placeId: string | null;
    kind: DecisionKind;
    clientElapsedMs: number | null;
  }): Promise<{ decision: Decision; visit: Visit | null }>;
  getDecision(id: string): Promise<Decision | null>;

  getVisit(id: string): Promise<Visit | null>;
  getOpenVisits(householdId: string): Promise<(Visit & { placeName: string })[]>;
  saveFeedback(input: NewFeedback): Promise<VisitFeedback>;

  countVisits(householdId: string, placeId: string): Promise<number>;
  lastRevisitAnswer(householdId: string, placeId: string): Promise<Revisit | null>;
  getPreferenceHistory(householdId: string): Promise<PreferenceHistory[]>;
  listHistory(householdId: string, limit: number): Promise<HistoryRow[]>;

  recordEvent(event: Omit<AnalyticsEventRow, 'id' | 'createdAt'> & { createdAt?: string }): Promise<void>;
  hasEvent(householdId: string, name: string): Promise<boolean>;

  recordSubjective(householdId: string, decisionId: string | null, answer: SubjectiveAnswer): Promise<void>;

  metrics(): Promise<MetricsSummary>;

  close(): void;
}
