export interface EquipmentCell {
  key: string;
  label: string;
  value: string;
}

export interface Confidence {
  pct: number;
  knownCount: number;
  totalCount: number;
  unknownLabels: string[];
}

export interface Candidate {
  recommendationId: string;
  placeId: string;
  rank: number;
  role: 'explore' | 'usual' | 'home';
  name: string;
  areaLabel: string;
  travelMinutes: number | null;
  travelPrecision: 'measured' | 'estimate' | 'unknown';
  priceLabel: string;
  fitGrade: string;
  confidence: Confidence;
  equipment: EquipmentCell[];
  headline: string;
  escapeRoute: string | null;
  hoursLabel: string;
  hoursVerified: boolean;
  reasons: { tone: string; text: string }[];
  coords: { lat: number; lng: number; precise: boolean } | null;
  hasPlaceholderData: boolean;
}

export interface RecommendResponse {
  householdId: string;
  sessionId: string;
  shownAt: string;
  context: {
    childAgeMonths: number;
    remainingMinutes: number;
    mobility: string;
    weather: string;
    areaCode: string;
    areaLabel: string;
  };
  candidates: Candidate[];
  shortlistNote: string | null;
  dataNotice: 'demo_placeholder' | null;
}

export interface PlaceDetail {
  placeId: string;
  name: string;
  areaLabel: string;
  kind: string;
  priceLabel: string;
  hoursLabel: string;
  hoursVerified: boolean;
  escapeRoute: string | null;
  notes: string | null;
  equipment: EquipmentCell[];
  confidence: Confidence;
  unknownNote: string | null;
  fitGrade: string | null;
  travelMinutes: number | null;
  travelPrecision: 'measured' | 'estimate' | 'unknown';
  reasons: { tone: string; text: string }[];
  sources: { kind: string; label: string; url: string | null; checkedAt: string | null }[];
  pastVisits: number;
  lastRevisit: string | null;
  coords: { lat: number; lng: number; precise: boolean } | null;
  hasPlaceholderData: boolean;
  updatedAt: string;
}

export interface DecisionResponse {
  decisionId: string;
  kind: string;
  visitId: string | null;
  timeToDecisionMs: number | null;
  askSubjective: boolean;
}

export interface HistoryResponse {
  entries: {
    decisionId: string;
    decidedAt: string;
    kind: string;
    kindLabel: string;
    placeId: string | null;
    placeName: string | null;
    areaLabel: string | null;
    went: boolean;
    visitId: string | null;
    recorded: boolean;
    stayMinutes: number | null;
    reactionLabel: string | null;
    revisitLabel: string | null;
    timeToDecisionMs: number | null;
  }[];
  openVisits: { visitId: string; placeId: string; placeName: string; createdAt: string }[];
}

export interface Profile {
  householdId: string;
  homeAreaCode: string | null;
  homeAreaLabel: string | null;
  usualPlaceId: string | null;
  notificationOptIn: boolean;
  children: { id: string; birthYear: number; birthMonth: number; ageMonths: number; handle: string | null }[];
  mobility: string;
  prepMinutes: number;
  areas: { code: string; label: string }[];
  usualPlaceOptions: { id: string; name: string; areaLabel: string }[];
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const HOUSEHOLD_KEY = 'kns.householdId';

export function getHouseholdId(): string | null {
  try {
    return localStorage.getItem(HOUSEHOLD_KEY);
  } catch {
    return null;
  }
}

export function setHouseholdId(id: string): void {
  try {
    localStorage.setItem(HOUSEHOLD_KEY, id);
  } catch {
    /* private mode: the session still works, it just will not be remembered */
  }
}

export function clearHouseholdId(): void {
  try {
    localStorage.removeItem(HOUSEHOLD_KEY);
  } catch {
    /* ignore */
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const household = getHouseholdId();
  if (household) headers['X-Household-Id'] = household;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      // Facility data is never served from a cache. Freshness and the app shell
      // are kept apart on purpose; see sw.js.
      cache: 'no-store',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'offline', '情報を取得できませんでした');
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(response.status, 'invalid_response', '情報を取得できませんでした');
  }

  if (!response.ok) {
    const error = payload as { error?: string; message?: string };
    throw new ApiError(
      response.status,
      error.error ?? 'error',
      error.message ?? '情報を取得できませんでした',
    );
  }
  return payload as T;
}

export const api = {
  recommend(input: {
    childAgeMonths: number;
    remainingMinutes: number;
    mobility: string;
    weather: string;
    origin: { lat?: number; lng?: number; areaCode?: string };
  }): Promise<RecommendResponse> {
    return request<RecommendResponse>('POST', '/api/recommend', input);
  },
  place(placeId: string, sessionId: string | null): Promise<PlaceDetail> {
    const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
    return request<PlaceDetail>('GET', `/api/places/${encodeURIComponent(placeId)}${query}`);
  },
  decide(input: {
    sessionId: string;
    recommendationId: string | null;
    placeId?: string | null;
    kind: 'go' | 'skip' | 'usual';
    clientElapsedMs: number | null;
  }): Promise<DecisionResponse> {
    return request<DecisionResponse>('POST', '/api/decisions', input);
  },
  feedback(input: {
    visitId: string;
    reaction: string;
    stayBucket: string;
    stayMinutes?: number;
    revisit: string;
    note?: string | null;
    equipmentReports?: { key: string; value: string }[];
  }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>('POST', '/api/feedback', input);
  },
  history(): Promise<HistoryResponse> {
    return request<HistoryResponse>('GET', '/api/history');
  },
  profile(): Promise<Profile> {
    return request<Profile>('GET', '/api/profile');
  },
  saveProfile(input: Record<string, unknown>): Promise<Profile> {
    return request<Profile>('PUT', '/api/profile', input);
  },
  deleteProfile(): Promise<{ deleted: boolean }> {
    return request<{ deleted: boolean }>('DELETE', '/api/profile');
  },
  events(events: unknown[]): Promise<{ accepted: number }> {
    return request<{ accepted: number }>('POST', '/api/events', { events });
  },
  subjective(input: { decisionId: string | null; answer: string }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>('POST', '/api/subjective', input);
  },
};
