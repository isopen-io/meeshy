import * as socialEndpoints from '@meeshy/shared/api/endpoints/social';

import type { ApiResult, Credential, HttpTransport } from './http';

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
 *   {@link SOCIAL_EVENTS_SEND_CAP}, sous le plafond de la porte
 *   ({@link SOCIAL_EVENTS_BATCH_CAP}) au-delà duquel le lot ENTIER serait
 *   refusé, et sous les 64 Kio d'un envoi `keepalive`.
 * - Un échec transitoire (hors ligne, 408, 429, 5xx) GARDE le lot en file :
 *   il repart au flush suivant. Un refus définitif (400, 403, 413) le jette —
 *   le rejouer bloquerait la file à jamais pour un défaut que rien ne répare.
 * - Un VISITEUR (sans compte, ou invité d'un lien) ne peut produire qu'une
 *   vue : la porte refuse en 403 un lot anonyme qui porte autre chose. Ses
 *   vues partent une à une — le seau anonyme est borné par le premier post
 *   du lot.
 */
export const SOCIAL_EVENTS_BATCH_CAP = 200;

/**
 * Un lot part en `keepalive` (il survit à la fermeture de l'onglet), et un
 * navigateur n'accorde que 64 Kio à un tel envoi : 100 séances pleines y
 * tiennent, 200 non.
 */
export const SOCIAL_EVENTS_SEND_CAP = 100;

/** La file ne grossit pas sans borne quand le réseau manque longtemps. */
export const SOCIAL_EVENTS_PENDING_CAP = 1000;

export type ImpressionSource =
  | 'feed'
  | 'profile'
  | 'search'
  | 'shared_link'
  | 'notification'
  | 'detail'
  | 'story'
  | 'status';

export type DwellContentType = 'POST' | 'REEL' | 'STORY' | 'STATUS';

export type SocialEvent =
  | { readonly type: 'view'; readonly postId: string; readonly durationMs?: number }
  | { readonly type: 'impression'; readonly postId: string; readonly source: ImpressionSource }
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

/**
 * `snapshot` rend ce qui n'est pas DÉJÀ parti (le lot en vol, envoyé en
 * keepalive, arrive ou se perd : le garder le compterait deux fois) pour
 * qu'une page qui s'en va le garde ; `restore` le reprend au chargement
 * suivant, devant les nouveaux.
 */
export type SocialEventsEmitter = {
  readonly record: (event: SocialEvent) => void;
  readonly flush: () => Promise<void>;
  readonly pending: () => number;
  readonly snapshot: () => readonly SocialEvent[];
  readonly restore: (events: readonly SocialEvent[]) => void;
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
  readonly send: (events: readonly SocialEvent[]) => Promise<SendVerdict>;
  readonly schedule: (run: () => void, delayMs: number) => void;
  readonly flushDelayMs?: number;
}): SocialEventsEmitter {
  const flushDelayMs = deps.flushDelayMs ?? 4000;
  let queue: readonly SocialEvent[] = [];
  let scheduled = false;
  let flushing = false;
  let inFlight = 0;

  function arm(): void {
    if (scheduled || queue.length === 0) return;
    scheduled = true;
    deps.schedule(() => {
      scheduled = false;
      void flush();
    }, flushDelayMs);
  }

  const bounded = (events: readonly SocialEvent[]): readonly SocialEvent[] =>
    events.length > SOCIAL_EVENTS_PENDING_CAP ? events.slice(events.length - SOCIAL_EVENTS_PENDING_CAP) : events;

  function record(event: SocialEvent): void {
    queue = bounded([...queue, normalizeSocialEvent(event)]);
    arm();
  }

  function restore(events: readonly SocialEvent[]): void {
    queue = bounded([...events.map(normalizeSocialEvent), ...queue]);
    arm();
  }

  async function flush(): Promise<void> {
    if (flushing) return;
    flushing = true;
    try {
      while (queue.length > 0) {
        const batch = queue.slice(0, SOCIAL_EVENTS_SEND_CAP);
        inFlight = batch.length;
        const verdict = await deps.send(batch).catch((): SendVerdict => 'retry');
        inFlight = 0;
        if (verdict === 'retry') break;
        queue = queue.slice(batch.length);
      }
    } finally {
      flushing = false;
      inFlight = 0;
    }
  }

  return { record, flush, pending: () => queue.length, snapshot: () => queue.slice(inFlight), restore };
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

/** Un lot d'un COMPTE — le transport y pose son crédential. */
export function sendAccountBatch(deps: SocialEventsTransportDeps) {
  return (events: readonly SocialEvent[]): Promise<SendVerdict> =>
    withTimeout(
      deps.transport
        .request<{ readonly recorded: number; readonly rejected: number }>({
          method: 'POST',
          path: socialEndpoints.events,
          body: { events },
          keepalive: true,
        })
        .then(verdictOf),
      deps.timeoutMs ?? 20_000,
      'retry',
    );
}

/** Une vue d'un VISITEUR — seule, sous son jeton d'invité ou sa clé de visiteur. */
export function sendVisitorView(deps: SocialEventsTransportDeps, event: Extract<SocialEvent, { type: 'view' }>): Promise<SendVerdict> {
  const credential = deps.credential();
  const identity = credential === null
    ? { credential: null, headers: { 'X-Session-Token': deps.visitorKey() } }
    : {};
  return withTimeout(
    deps.transport
      .request<{ readonly recorded: number; readonly rejected: number }>({
        method: 'POST',
        path: socialEndpoints.events,
        body: { events: [normalizeSocialEvent(event)] },
        ...identity,
      })
      .then(verdictOf),
    deps.timeoutMs ?? 20_000,
    'retry',
  );
}

/**
 * L'émetteur câblé : un compte passe par la file groupée, un visiteur
 * n'envoie que ses vues, une à une. Décidé à l'ENREGISTREMENT — c'est le
 * crédential de cet instant qui dit qui a vu.
 */
export function createSocialEventsRecorder(deps: SocialEventsTransportDeps & {
  readonly schedule: (run: () => void, delayMs: number) => void;
  readonly flushDelayMs?: number;
}) {
  const emitter = createSocialEventsEmitter({
    send: sendAccountBatch(deps),
    schedule: deps.schedule,
    ...(deps.flushDelayMs === undefined ? {} : { flushDelayMs: deps.flushDelayMs }),
  });

  const visitorViewed = new Set<string>();

  function record(event: SocialEvent): void {
    const credential = deps.credential();
    if (credential?.kind === 'registered') {
      emitter.record(event);
      return;
    }
    /* Un visiteur : l'OUVERTURE seule, une fois par contenu et par onglet. La
       vue de sortie (avec durée) n'ajouterait rien — la passerelle compte une
       ouverture anonyme par jeton — et userait son seau de 10 par minute. */
    if (event.type !== 'view' || event.durationMs !== undefined || visitorViewed.has(event.postId)) return;
    visitorViewed.add(event.postId);
    void sendVisitorView(deps, event).catch(() => undefined);
  }

  return { record, flush: emitter.flush, pending: emitter.pending, snapshot: emitter.snapshot, restore: emitter.restore };
}

export function newEngagementSessionId(): string {
  const c = globalThis.crypto;
  if (c !== undefined && typeof c.randomUUID === 'function') return c.randomUUID();
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}
