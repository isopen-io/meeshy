import * as socialEndpoints from '@meeshy/shared/api/endpoints/social';
import type { ContentSurface } from '@meeshy/shared/types/content-surfaces';
import type { OpenOrigin, ViewProvenance } from '@meeshy/shared/types/content-reach';

import type { ApiResult, Credential, HttpRequest, HttpTransport } from './http';
import { visitorContextOf, type SocialEventsContext } from './social-events-context';
import type { ImpressionVisibility, ListingContext, EventTargetRef } from './social-events-v2-types';

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
 * - Un VISITEUR (sans compte, ou invité d'un lien) émet ses vues ET ses
 *   impressions (#10483), groupées à la même cadence, sous son jeton d'invité
 *   ou sa clé de visiteur. Vues et impressions partent en DEUX requêtes : un
 *   serveur antérieur à #10483 refuse en 403 un lot anonyme qui porte une
 *   impression — il ne doit refuser qu'elle, jamais la vue voisine. Le 403
 *   retire l'impression de la file, sans rejeu. `dwell` et `download`
 *   restent réservés aux comptes et ne partent pas.
 * - RÈGLE DE COMPTAGE DU PORTEUR (#10483, 2026-10-13) : chaque listage est
 *   une impression, chaque ouverture une vue — aucun dédoublonnage côté
 *   client, ni par fenêtre de temps ni par onglet. Les vues UNIQUES sont
 *   l'affaire de la passerelle (par compte ou par clé de lecteur).
 * - L'ENGAGEMENT D'OUVERTURE `open` (#10483) — le tap sur un contenu d'un
 *   listing, avec le listing d'origine ; il ne compte aucune vue. Un serveur
 *   antérieur ne le connaît pas et refuserait en 400 le lot ENTIER (union
 *   discriminée) : les `open` partent donc TOUJOURS dans leur propre requête,
 *   pour un compte comme pour un visiteur, et leur refus (400, 403) les
 *   retire sans rejeu, sans jamais emporter une vue ou une impression.
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

/**
 * L'ÉCRAN qui a montré le contenu (#10483 § 8) — champ FACULTATIF des
 * impressions et des vues, énuméré une fois dans `@meeshy/shared`. Un serveur
 * antérieur l'ignore (`z.object` n'est pas strict) : rien côté client n'en
 * dépend.
 */
export type { ContentSurface, OpenOrigin, ViewProvenance };

export type DwellContentType = 'POST' | 'REEL' | 'STORY' | 'STATUS';

/**
 * L'ENVELOPPE v2 (#10500) — posée à la MISE EN FILE, jamais à l'envoi :
 * `eventId` reste le même d'une tentative à l'autre (la passerelle reconnaît
 * le rejeu), `occurredAt` dit quand c'est arrivé, pas quand c'est parti.
 * Facultative : un serveur antérieur la retire en silence.
 */
export type EventEnvelope = { readonly eventId?: string; readonly occurredAt?: string };

export type SocialEvent = EventEnvelope & (
  | {
      readonly type: 'view';
      readonly postId: string;
      readonly durationMs?: number;
      readonly surface?: ContentSurface;
      readonly provenance?: ViewProvenance;
      readonly origin?: OpenOrigin;
    }
  | { readonly type: 'open'; readonly postId: string; readonly origin?: OpenOrigin; readonly listing?: ListingContext }
  | {
      readonly type: 'impression';
      readonly postId: string;
      readonly source: ImpressionSource;
      readonly surface?: ContentSurface;
      /** v2 (#10501) — facultatifs, retirés par un serveur antérieur. */
      readonly target?: EventTargetRef;
      readonly listing?: ListingContext;
      readonly visibility?: ImpressionVisibility;
    }
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
    }
);

/** `sent` : écrit · `retry` : panne transitoire, garder · `drop` : refus définitif. */
export type SendVerdict = 'sent' | 'retry' | 'drop';

/**
 * Le résultat d'un envoi : un verdict pour le lot ENTIER, ou la part du lot
 * à garder quand ses morceaux ont connu des sorts différents — chaque vue et
 * chaque impression comptant, rejouer la part déjà écrite la compterait deux
 * fois, et rejouer une part refusée la ferait refuser encore.
 */
export type SendOutcome = SendVerdict | { readonly retain: readonly SocialEvent[] };

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

export type EnvelopeStamp = () => { readonly eventId: string; readonly occurredAt: string };

export function createSocialEventsEmitter(deps: {
  readonly send: (events: readonly SocialEvent[]) => Promise<SendOutcome>;
  readonly schedule: (run: () => void, delayMs: number) => void;
  readonly flushDelayMs?: number;
  readonly stamp?: EnvelopeStamp;
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
    const stamped = deps.stamp === undefined || event.eventId !== undefined ? event : { ...event, ...deps.stamp() };
    queue = bounded([...queue, normalizeSocialEvent(stamped)]);
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
        const outcome = await deps.send(batch).catch((): SendOutcome => 'retry');
        inFlight = 0;
        if (outcome === 'retry') break;
        if (typeof outcome === 'object') {
          queue = [...outcome.retain, ...queue.slice(batch.length)];
          if (outcome.retain.length > 0) break;
          continue;
        }
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
  /** Le contexte de lot (#10500), relu à CHAQUE requête — son `sentAt` en dépend. */
  readonly context?: () => SocialEventsContext;
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
type CallIdentity = Pick<HttpRequest, 'credential' | 'headers'> & { readonly visitor?: boolean };

/** Le corps d'une requête : les événements, et le contexte du lot une fois — réduit pour un visiteur. */
export function eventsBody<E>(
  events: readonly E[],
  context: (() => SocialEventsContext) | undefined,
  visitor: boolean,
): { readonly events: readonly E[]; readonly context?: unknown } {
  if (context === undefined) return { events };
  const full = context();
  return { events, context: visitor ? visitorContextOf(full) : full };
}

function postEvents(
  deps: SocialEventsTransportDeps,
  events: readonly SocialEvent[],
  identity: CallIdentity,
): Promise<SendVerdict> {
  return withTimeout(
    deps.transport
      .request<{ readonly recorded: number; readonly rejected: number }>({
        method: 'POST',
        path: socialEndpoints.events,
        body: eventsBody(events, deps.context, identity.visitor === true),
        keepalive: true,
        ...('credential' in identity ? { credential: identity.credential } : {}),
        ...(identity.headers === undefined ? {} : { headers: identity.headers }),
      })
      .then(verdictOf),
    deps.timeoutMs ?? 20_000,
    'retry',
  );
}

/**
 * Des PARTS d'un même lot, chacune dans sa requête. Seule la part en PANNE
 * repart : la part écrite ne se recompte pas, la part refusée ne se fait pas
 * refuser encore.
 */
async function sendParts(
  deps: SocialEventsTransportDeps,
  parts: readonly (readonly SocialEvent[])[],
  identity: CallIdentity,
): Promise<SendOutcome> {
  const filled = parts.filter((part) => part.length > 0);
  const verdicts = await Promise.all(filled.map((part) => postEvents(deps, part, identity)));
  return { retain: filled.filter((_, index) => verdicts[index] === 'retry').flat() };
}

const isOpen = (event: SocialEvent): boolean => event.type === 'open';

/** Un lot d'un COMPTE — le transport y pose son crédential ; ses `open` à part. */
export function sendAccountBatch(deps: SocialEventsTransportDeps) {
  return (events: readonly SocialEvent[]): Promise<SendOutcome> =>
    sendParts(deps, [events.filter((event) => !isOpen(event)), events.filter(isOpen)], {});
}

/**
 * Un lot d'un VISITEUR, sous l'identité figée à l'enregistrement. Vues,
 * impressions et `open` partent séparément : un serveur antérieur à #10483
 * refuse en 403 l'impression d'un anonyme, et ce refus ne doit pas emporter
 * la vue.
 */
export function sendVisitorBatch(deps: SocialEventsTransportDeps, identity: CallIdentity) {
  return (events: readonly SocialEvent[]): Promise<SendOutcome> =>
    sendParts(
      deps,
      [
        events.filter((event) => event.type === 'view'),
        events.filter((event) => event.type === 'impression'),
        events.filter(isOpen),
      ],
      identity,
    );
}

type VisitorLane = { readonly key: string; readonly identity: () => CallIdentity };

function visitorLaneOf(credential: Credential | null, deps: SocialEventsTransportDeps): VisitorLane {
  if (credential !== null && credential.kind === 'anonymous') {
    return { key: `guest:${credential.sessionToken}`, identity: () => ({ credential, visitor: true }) };
  }
  return { key: 'visitor', identity: () => ({ credential: null, headers: { 'X-Session-Token': deps.visitorKey() }, visitor: true }) };
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
  readonly stamp?: EnvelopeStamp;
}) {
  const cadence = {
    schedule: deps.schedule,
    ...(deps.flushDelayMs === undefined ? {} : { flushDelayMs: deps.flushDelayMs }),
    ...(deps.stamp === undefined ? {} : { stamp: deps.stamp }),
  };
  const account = createSocialEventsEmitter({ send: sendAccountBatch(deps), ...cadence });
  const lanes = new Map<string, SocialEventsEmitter>();

  function laneEmitter(lane: VisitorLane): SocialEventsEmitter {
    const known = lanes.get(lane.key);
    if (known !== undefined) return known;
    const emitter = createSocialEventsEmitter({ send: sendVisitorBatch(deps, lane.identity()), ...cadence });
    lanes.set(lane.key, emitter);
    return emitter;
  }

  /* Ce qu'un visiteur envoie : chaque vue (ouverture, puis sortie avec sa
     durée), chaque impression et chaque engagement d'ouverture. La séance
     `dwell` et le téléchargement restent réservés aux comptes. */
  const admitsVisitor = (event: SocialEvent): boolean => event.type === 'view' || event.type === 'impression' || event.type === 'open';

  function record(event: SocialEvent): void {
    const credential = deps.credential();
    if (credential?.kind === 'registered') {
      account.record(event);
      return;
    }
    if (!admitsVisitor(event)) return;
    laneEmitter(visitorLaneOf(credential, deps)).record(event);
  }

  async function flush(): Promise<void> {
    await Promise.all([account, ...lanes.values()].map((emitter) => emitter.flush()));
  }

  const pending = (): number => [...lanes.values()].reduce((total, lane) => total + lane.pending(), account.pending());

  /* Seule la file d'un COMPTE se garde d'une page à l'autre (#10519) : celle
     d'un visiteur part sous une identité qu'une page suivante n'a plus. */
  return { record, flush, pending, snapshot: account.snapshot, restore: account.restore };
}

export function newEngagementSessionId(): string {
  const c = globalThis.crypto;
  if (c !== undefined && typeof c.randomUUID === 'function') return c.randomUUID();
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}
