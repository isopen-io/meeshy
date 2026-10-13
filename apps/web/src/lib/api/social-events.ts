import * as socialEndpoints from '@meeshy/shared/api/endpoints/social';

import type { ApiResult, Credential, HttpRequest, HttpTransport } from './http';

/**
 * **LA TÉLÉMÉTRIE DE LECTURE DU WEB** (#10401) — l'émetteur UNIQUE des
 * impressions, des vues et des temps de lecture que `POST /social/events`
 * ingère (`services/gateway/src/routes/social/events.ts`).
 *
 * Avant lui, le seul événement que `apps/web` émettait était la vue d'une
 * story (`markStoryViewed`) : le fil, le détail, les profils, les hashtags,
 * les favoris et les réels laissaient aimer sans rien compter, d'où les
 * publications « 3 j'aime, 0 impression, 0 vue » servies au porteur.
 *
 * - Un COMPTE groupe ses événements : un lot part au plus toutes les
 *   `flushDelayMs` (la porte plafonne un compte à 30 lots par minute), coupé à
 *   {@link SOCIAL_EVENTS_BATCH_CAP} — le plafond de la porte, au-delà duquel
 *   le lot ENTIER serait refusé.
 * - Un échec transitoire (hors ligne, 408, 429, 5xx) GARDE le lot en file :
 *   il repart au flush suivant. Un refus définitif (400, 403, 413) le jette —
 *   le rejouer bloquerait la file à jamais pour un défaut que rien ne répare.
 * - Un VISITEUR (sans compte, ou invité d'un lien) émet ses vues ET ses
 *   impressions (#10483), groupées à la même cadence, sous son jeton d'invité
 *   ou sa clé de visiteur. Vues et impressions partent en DEUX requêtes : un
 *   serveur antérieur à #10483 refuse en 403 un lot anonyme qui porte une
 *   impression — il ne doit refuser qu'elle, jamais la vue voisine. Le 403
 *   retire l'impression de la file, sans rejeu. `dwell` et `download`
 *   restent réservés aux comptes et ne partent pas.
 */
export const SOCIAL_EVENTS_BATCH_CAP = 200;

/** La file ne grossit pas sans borne quand le réseau manque longtemps. */
export const SOCIAL_EVENTS_PENDING_CAP = 1000;

/** Un corps `keepalive` au-delà de 64 Kio est refusé par le navigateur : le
 * lot de sortie (`pagehide`) est coupé plus court que celui de la porte. */
export const KEEPALIVE_BATCH_CAP = 100;

/** La fenêtre pendant laquelle un visiteur ne recompte pas l'impression d'un
 * même contenu — celle que la passerelle applique (#10483 § 5). */
export const VISITOR_IMPRESSION_WINDOW_MS = 30 * 60_000;

export type ImpressionSource =
  | 'feed'
  | 'profile'
  | 'search'
  | 'shared_link'
  | 'notification'
  | 'detail'
  | 'story'
  | 'status';

/**
 * L'ÉCRAN qui a montré le contenu (#10483 § 8) — champ FACULTATIF des
 * impressions et des vues. Un serveur antérieur l'ignore (`z.object` n'est
 * pas strict) : rien côté client n'en dépend.
 */
export type ContentSurface =
  | 'feed'
  | 'reels'
  | 'profile'
  | 'bookmarks'
  | 'hashtag'
  | 'community'
  | 'nearby'
  | 'sound'
  | 'story_rail'
  | 'mood_avatar'
  | 'citation'
  | 'detail'
  | 'story'
  | 'visitor';

export type DwellContentType = 'POST' | 'REEL' | 'STORY' | 'STATUS';

export type SocialEvent =
  | { readonly type: 'view'; readonly postId: string; readonly durationMs?: number; readonly surface?: ContentSurface }
  | { readonly type: 'impression'; readonly postId: string; readonly source: ImpressionSource; readonly surface?: ContentSurface }
  | {
      readonly type: 'dwell';
      readonly sessionId: string;
      readonly postId: string;
      readonly contentType: DwellContentType;
      readonly surface: string;
      readonly startedAt: string;
      readonly dwellMs: number;
      readonly watchMs?: number;
      readonly mediaDurationMs?: number;
      readonly completed: boolean;
    };

/** `sent` : écrit · `retry` : panne transitoire, garder · `drop` : refus définitif. */
export type SendVerdict = 'sent' | 'retry' | 'drop';

export type FlushOptions = { readonly keepalive?: boolean };

export type SocialEventsEmitter = {
  readonly record: (event: SocialEvent) => void;
  readonly flush: (options?: FlushOptions) => Promise<void>;
  readonly pending: () => number;
};

const DURATION_CAP_MS = 300_000;

const clampDuration = (ms: number): number => Math.max(0, Math.min(DURATION_CAP_MS, Math.round(ms)));

/** La forme que la porte accepte — les durées bornées comme elle les borne. */
export function normalizeSocialEvent(event: SocialEvent): SocialEvent {
  if (event.type === 'view') {
    return event.durationMs === undefined ? event : { ...event, durationMs: clampDuration(event.durationMs) };
  }
  if (event.type === 'dwell') {
    return {
      ...event,
      dwellMs: clampDuration(event.dwellMs),
      ...(event.watchMs === undefined ? {} : { watchMs: clampDuration(event.watchMs) }),
      ...(event.mediaDurationMs === undefined ? {} : { mediaDurationMs: Math.max(0, Math.round(event.mediaDurationMs)) }),
    };
  }
  return event;
}

export function createSocialEventsEmitter(deps: {
  readonly send: (events: readonly SocialEvent[], options: FlushOptions) => Promise<SendVerdict>;
  readonly schedule: (run: () => void, delayMs: number) => void;
  readonly flushDelayMs?: number;
}): SocialEventsEmitter {
  const flushDelayMs = deps.flushDelayMs ?? 4000;
  let queue: readonly SocialEvent[] = [];
  let scheduled = false;
  let flushing = false;

  function arm(): void {
    if (scheduled || queue.length === 0) return;
    scheduled = true;
    deps.schedule(() => {
      scheduled = false;
      void flush();
    }, flushDelayMs);
  }

  function record(event: SocialEvent): void {
    const next = [...queue, normalizeSocialEvent(event)];
    queue = next.length > SOCIAL_EVENTS_PENDING_CAP ? next.slice(next.length - SOCIAL_EVENTS_PENDING_CAP) : next;
    arm();
  }

  async function flush(options: FlushOptions = {}): Promise<void> {
    if (flushing) return;
    flushing = true;
    const cap = options.keepalive === true ? KEEPALIVE_BATCH_CAP : SOCIAL_EVENTS_BATCH_CAP;
    try {
      while (queue.length > 0) {
        const batch = queue.slice(0, cap);
        const verdict = await deps.send(batch, options).catch((): SendVerdict => 'retry');
        if (verdict === 'retry') break;
        queue = queue.slice(batch.length);
      }
    } finally {
      flushing = false;
    }
  }

  return { record, flush, pending: () => queue.length };
}

/** Le verdict d'un appel — ce qui mérite d'être rejoué, ce qui ne le mérite pas. */
export function verdictOf(result: ApiResult<unknown>): SendVerdict {
  if (result.ok) return 'sent';
  const { status } = result;
  if (status === 0 || status === 408 || status === 429 || status >= 500) return 'retry';
  return 'drop';
}

export type SocialEventsTransportDeps = {
  readonly transport: HttpTransport;
  readonly credential: () => Credential | null;
  /** La clé de seau d'un visiteur SANS jeton — la porte refuse un anonyme sans elle. */
  readonly visitorKey: () => string;
  /** Une réponse qui n'arrive jamais (changement d'identité en vol) ne bloque pas la file. */
  readonly timeoutMs?: number;
};

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}

/** L'identité d'un appel : le crédential de la session (compte), ou celle
 * d'un visiteur figée à l'enregistrement. */
type CallIdentity = Pick<HttpRequest, 'credential' | 'headers'>;

function postEvents(
  deps: SocialEventsTransportDeps,
  events: readonly SocialEvent[],
  options: FlushOptions,
  identity: CallIdentity,
): Promise<SendVerdict> {
  return withTimeout(
    deps.transport
      .request<{ readonly recorded: number; readonly rejected: number }>({
        method: 'POST',
        path: socialEndpoints.events,
        body: { events },
        ...(options.keepalive === true ? { keepalive: true } : {}),
        ...identity,
      })
      .then(verdictOf),
    deps.timeoutMs ?? 20_000,
    'retry',
  );
}

/** Un lot d'un COMPTE — le transport y pose son crédential. */
export function sendAccountBatch(deps: SocialEventsTransportDeps) {
  return (events: readonly SocialEvent[], options: FlushOptions = {}): Promise<SendVerdict> =>
    postEvents(deps, events, options, {});
}

function combine(verdicts: readonly SendVerdict[]): SendVerdict {
  if (verdicts.includes('retry')) return 'retry';
  return verdicts.includes('sent') ? 'sent' : 'drop';
}

/**
 * Un lot d'un VISITEUR, sous l'identité figée à l'enregistrement. Les vues et
 * les impressions partent séparément : un serveur antérieur à #10483 refuse
 * en 403 l'impression d'un anonyme, et ce refus ne doit pas emporter la vue.
 * Rejouer après une panne est sans risque : la passerelle dédoublonne la vue
 * par lecteur et l'impression sur 30 minutes.
 */
export function sendVisitorBatch(deps: SocialEventsTransportDeps, identity: CallIdentity) {
  return async (events: readonly SocialEvent[], options: FlushOptions = {}): Promise<SendVerdict> => {
    const parts = [
      events.filter((event) => event.type === 'view'),
      events.filter((event) => event.type === 'impression'),
    ].filter((part) => part.length > 0);
    const verdicts = await Promise.all(parts.map((part) => postEvents(deps, part, options, identity)));
    return combine(verdicts);
  };
}

/** La mémoire de dédoublonnage d'un onglet reste bornée sur une longue séance. */
const VISITOR_MEMORY_CAP = 2000;

type VisitorLane = { readonly key: string; readonly identity: () => CallIdentity };

function visitorLaneOf(credential: Credential | null, deps: SocialEventsTransportDeps): VisitorLane {
  if (credential !== null && credential.kind === 'anonymous') {
    return { key: `guest:${credential.sessionToken}`, identity: () => ({ credential }) };
  }
  return { key: 'visitor', identity: () => ({ credential: null, headers: { 'X-Session-Token': deps.visitorKey() } }) };
}

/**
 * L'émetteur câblé : un compte et un visiteur passent chacun par une file
 * groupée. L'identité est décidée à l'ENREGISTREMENT — c'est le crédential de
 * cet instant qui dit qui a vu ; un visiteur qui se connecte ensuite n'envoie
 * pas ses vues d'avant sous son compte.
 */
export function createSocialEventsRecorder(deps: SocialEventsTransportDeps & {
  readonly schedule: (run: () => void, delayMs: number) => void;
  readonly flushDelayMs?: number;
  readonly now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  const cadence = {
    schedule: deps.schedule,
    ...(deps.flushDelayMs === undefined ? {} : { flushDelayMs: deps.flushDelayMs }),
  };
  const account = createSocialEventsEmitter({ send: sendAccountBatch(deps), ...cadence });
  const lanes = new Map<string, SocialEventsEmitter>();
  const opened = new Set<string>();
  const impressedAt = new Map<string, number>();

  function laneEmitter(lane: VisitorLane): SocialEventsEmitter {
    const known = lanes.get(lane.key);
    if (known !== undefined) return known;
    const emitter = createSocialEventsEmitter({ send: sendVisitorBatch(deps, lane.identity()), ...cadence });
    lanes.set(lane.key, emitter);
    return emitter;
  }

  function forgetStaleImpressions(at: number): void {
    for (const [key, last] of impressedAt) {
      if (at - last >= VISITOR_IMPRESSION_WINDOW_MS) impressedAt.delete(key);
    }
    if (impressedAt.size >= VISITOR_MEMORY_CAP) impressedAt.clear();
  }

  /* Ce qu'un visiteur envoie : l'ouverture une fois par contenu et par onglet,
     la vue de sortie avec sa durée (la passerelle garde la plus longue),
     l'impression une fois par fenêtre de 30 minutes. */
  function admitsVisitor(laneKey: string, event: SocialEvent): boolean {
    const key = `${laneKey}|${event.postId}`;
    if (event.type === 'view') {
      if (event.durationMs !== undefined) return true;
      if (opened.has(key)) return false;
      if (opened.size >= VISITOR_MEMORY_CAP) opened.clear();
      opened.add(key);
      return true;
    }
    if (event.type === 'impression') {
      const at = now();
      if (impressedAt.size >= VISITOR_MEMORY_CAP) forgetStaleImpressions(at);
      const last = impressedAt.get(key);
      if (last !== undefined && at - last < VISITOR_IMPRESSION_WINDOW_MS) return false;
      impressedAt.set(key, at);
      return true;
    }
    return false;
  }

  function record(event: SocialEvent): void {
    const credential = deps.credential();
    if (credential?.kind === 'registered') {
      account.record(event);
      return;
    }
    const lane = visitorLaneOf(credential, deps);
    if (!admitsVisitor(lane.key, event)) return;
    laneEmitter(lane).record(event);
  }

  async function flush(options: FlushOptions = {}): Promise<void> {
    await Promise.all([account, ...lanes.values()].map((emitter) => emitter.flush(options)));
  }

  const pending = (): number => [...lanes.values()].reduce((total, lane) => total + lane.pending(), account.pending());

  return { record, flush, pending };
}

export function newEngagementSessionId(): string {
  const c = globalThis.crypto;
  if (c !== undefined && typeof c.randomUUID === 'function') return c.randomUUID();
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}
