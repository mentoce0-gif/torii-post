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
  }): Household;
  getHousehold(id: string): Household | null;
  updateHousehold(id: string, patch: Partial<Household>): Household | null;
  deleteHousehold(id: string): boolean;

  getParents(householdId: string): Parent[];
  getChildren(householdId: string): Child[];
  replaceChildren(householdId: string, children: Omit<Child, 'id' | 'householdId'>[]): Child[];
  getMobilityProfile(householdId: string): MobilityProfile | null;
  upsertMobilityProfile(householdId: string, mode: Mobility, prepMinutes: number): MobilityProfile;

  listPlaces(): PlaceWithEquipment[];
  getPlace(id: string): PlaceWithEquipment | null;

  createSession(householdId: string, contextJson: string, shownAt: string): RecommendationSession;
  getSession(id: string): RecommendationSession | null;
  saveRecommendations(rows: Omit<Recommendation, 'id'>[]): Recommendation[];
  getRecommendation(id: string): Recommendation | null;
  getRecommendationsForSession(sessionId: string): Recommendation[];

  createDecision(input: {
    sessionId: string;
    recommendationId: string | null;
    placeId: string | null;
    kind: DecisionKind;
    clientElapsedMs: number | null;
  }): { decision: Decision; visit: Visit | null };
  getDecision(id: string): Decision | null;

  getVisit(id: string): Visit | null;
  getOpenVisits(householdId: string): (Visit & { placeName: string })[];
  saveFeedback(input: NewFeedback): VisitFeedback;

  countVisits(householdId: string, placeId: string): number;
  lastRevisitAnswer(householdId: string, placeId: string): Revisit | null;
  getPreferenceHistory(householdId: string): PreferenceHistory[];
  listHistory(householdId: string, limit: number): HistoryRow[];

  recordEvent(event: Omit<AnalyticsEventRow, 'id' | 'createdAt'> & { createdAt?: string }): void;
  hasEvent(householdId: string, name: string): boolean;

  recordSubjective(householdId: string, decisionId: string | null, answer: SubjectiveAnswer): void;

  metrics(): MetricsSummary;

  close(): void;
}
