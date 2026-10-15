import * as socialEndpoints from '@meeshy/shared/api/endpoints/social';
import {
  SOCIAL_EVENTS_V2_BATCH_CAP,
  SOCIAL_EVENTS_V2_FLUSH_INTERVAL_MS,
  SOCIAL_EVENTS_V2_FLUSH_MAX_EVENTS,
  SOCIAL_EVENTS_V2_SLEEP_AFTER_REFUSAL_MS,
} from '@meeshy/shared/types/social-events-v2';

import type { ApiResult, Credential, HttpRequest, HttpTransport } from './http';
import { eventsBody, type EnvelopeStamp } from './social-events';

/** La sortie de page part en `keepalive`, par lots plus courts (64 Kio). */
export type FlushOptions = { readonly keepalive?: boolean };
import type { SamplingRates, SocialEventsContext } from './social-events-context';
import {
  SAMPLED_V2_TYPES,
  VISITOR_V2_TYPES,
  type SocialEventV2,
  type SocialEventV2Input,
  type SocialEventV2Type,
} from './social-events-v2-types';

/**
 * **LA FILE DES ÉVÉNEMENTS SOCIAUX v2** (#10500, décision § 8) — séparée de
 * la file de comptage (`social-events.ts`), jamais mélangée à elle dans une
 * requête : un serveur antérieur (#10491, `dev`, `main`) refuse en 400 tout
 * lot qui porte un type inconnu, et ce refus ne doit emporter QUE des
 * événements v2.
 *
 * - Un 400 sur une requête v2 JETTE ses événements (aucun rejeu) et met la
 *   file en sommeil une heure, ou jusqu'au prochain démarrage à froid.
 * - La passerelle neuve annonce `data.accepts` (les types qu'elle range) et
 *   `data.sampling` (le taux des types échantillonnables) : un type non
 *   accepté ne part plus, un type échantillonné n'est gardé que si le tirage
 *   de la session d'application tombe sous son taux — tiré UNE fois par
 *   session, une session est entière ou absente.
 * - Cadence : au plus toutes les 10 s, ou dès 50 événements, plus un envoi à
 *   la sortie de page (keepalive, ≤ 100).
 */
export const SOCIAL_EVENTS_V2_FLUSH_MS = SOCIAL_EVENTS_V2_FLUSH_INTERVAL_MS;
export const SOCIAL_EVENTS_V2_COUNT_TRIGGER = SOCIAL_EVENTS_V2_FLUSH_MAX_EVENTS;
export const SOCIAL_EVENTS_V2_SLEEP_MS = SOCIAL_EVENTS_V2_SLEEP_AFTER_REFUSAL_MS;
const BATCH_CAP = SOCIAL_EVENTS_V2_BATCH_CAP;
const KEEPALIVE_CAP = 100;
const PENDING_CAP = 500;

export type SocialEventsV2Recorder = {
  readonly record: (event: SocialEventV2Input) => void;
  readonly flush: (options?: FlushOptions) => Promise<void>;
  readonly pending: () => number;
};

export type SocialEventsV2Deps = {
  readonly transport: HttpTransport;
  readonly credential: () => Credential | null;
  readonly visitorKey: () => string;
  readonly context: () => SocialEventsContext;
  readonly stamp: EnvelopeStamp;
  readonly schedule: (run: () => void, delayMs: number) => void;
  readonly now: () => number;
  /** Le tirage d'échantillonnage, dans [0, 1[ — relu à chaque nouvelle session d'application. */
  readonly random: () => number;
  readonly timeoutMs?: number;
};

type Identity = Pick<HttpRequest, 'credential' | 'headers'> & { readonly visitor: boolean };
type Lane = { readonly identity: Identity; queue: readonly SocialEventV2[] };
type Verdict = 'sent' | 'retry' | 'drop' | 'refused';

const DEFAULT_SAMPLING: SamplingRates = { scroll: 1, playback: 1, visibility: 1 };

function verdictOf(result: ApiResult<unknown>): Verdict {
  if (result.ok) return 'sent';
  if (result.status === 400) return 'refused';
  if (result.status === 0 || result.status === 408 || result.status === 429 || result.status >= 500) return 'retry';
  return 'drop';
}

const rate = (value: unknown): number | null => (typeof value === 'number' && value >= 0 && value <= 1 ? value : null);

function samplingOf(data: unknown, previous: SamplingRates): SamplingRates {
  const raw = (data as { readonly sampling?: Record<string, unknown> } | null)?.sampling;
  if (raw === undefined || raw === null || typeof raw !== 'object') return previous;
  return {
    scroll: rate(raw.scroll) ?? previous.scroll,
    playback: rate(raw.playback) ?? previous.playback,
    visibility: rate(raw.visibility) ?? previous.visibility,
  };
}

function acceptsOf(data: unknown): ReadonlySet<string> | null {
  const raw = (data as { readonly accepts?: unknown } | null)?.accepts;
  return Array.isArray(raw) ? new Set(raw.filter((type): type is string => typeof type === 'string')) : null;
}

export function createSocialEventsV2Recorder(deps: SocialEventsV2Deps): SocialEventsV2Recorder {
  const lanes = new Map<string, Lane>();
  let sleepUntil = 0;
  let accepts: ReadonlySet<string> | null = null;
  let sampling: SamplingRates = DEFAULT_SAMPLING;
  let draw: { readonly session: string; readonly value: number } | null = null;
  let scheduled = false;
  let flushing = false;

  const pending = (): number => [...lanes.values()].reduce((total, lane) => total + lane.queue.length, 0);

  function sessionDraw(): number {
    const session = deps.context().appSessionId;
    if (draw === null || draw.session !== session) draw = { session, value: deps.random() };
    return draw.value;
  }

  function sampledOut(type: SocialEventV2Type): boolean {
    if (!SAMPLED_V2_TYPES.has(type)) return false;
    const rateFor = sampling[type as keyof SamplingRates];
    return rateFor < 1 && sessionDraw() >= rateFor;
  }

  function laneFor(type: SocialEventV2Type): { readonly key: string; readonly identity: Identity } | null {
    const credential = deps.credential();
    if (credential?.kind === 'registered') return { key: 'account', identity: { visitor: false } };
    if (!VISITOR_V2_TYPES.has(type)) return null;
    if (credential !== null && credential.kind === 'anonymous') {
      return { key: `guest:${credential.sessionToken}`, identity: { credential, visitor: true } };
    }
    return { key: 'visitor', identity: { credential: null, headers: { 'X-Session-Token': deps.visitorKey() }, visitor: true } };
  }

  function arm(): void {
    if (scheduled) return;
    scheduled = true;
    deps.schedule(() => {
      scheduled = false;
      void flush();
    }, SOCIAL_EVENTS_V2_FLUSH_MS);
  }

  function record(input: SocialEventV2Input): void {
    if (deps.now() < sleepUntil) return;
    if (accepts !== null && !accepts.has(input.type)) return;
    if (sampledOut(input.type)) return;
    const target = laneFor(input.type);
    if (target === null) return;
    const lane = lanes.get(target.key) ?? { identity: target.identity, queue: [] };
    /* Un événement DÉJÀ estampillé (la file du service worker, #10507) garde
       son eventId et son heure : le rejeu reste reconnaissable. */
    const next = [...lane.queue, { ...deps.stamp(), ...input } as SocialEventV2];
    lane.queue = next.length > PENDING_CAP ? next.slice(next.length - PENDING_CAP) : next;
    lanes.set(target.key, lane);
    if (pending() >= SOCIAL_EVENTS_V2_COUNT_TRIGGER) {
      void flush();
      return;
    }
    arm();
  }

  function contextFor(): () => SocialEventsContext {
    return () => ({ ...deps.context(), sampling });
  }

  function send(lane: Lane, events: readonly SocialEventV2[], options: FlushOptions): Promise<{ readonly verdict: Verdict; readonly data?: unknown }> {
    const request = deps.transport
      .request<unknown>({
        method: 'POST',
        path: socialEndpoints.events,
        body: eventsBody(events, contextFor(), lane.identity.visitor),
        ...(options.keepalive === true ? { keepalive: true } : {}),
        ...('credential' in lane.identity ? { credential: lane.identity.credential } : {}),
        ...(lane.identity.headers === undefined ? {} : { headers: lane.identity.headers }),
      })
      .then((result) => ({ verdict: verdictOf(result), ...(result.ok ? { data: result.data } : {}) }))
      .catch(() => ({ verdict: 'retry' as const }));
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ verdict: 'retry' }), deps.timeoutMs ?? 20_000);
      void request.then((outcome) => {
        clearTimeout(timer);
        resolve(outcome);
      });
    });
  }

  function sleep(): void {
    sleepUntil = deps.now() + SOCIAL_EVENTS_V2_SLEEP_MS;
    lanes.forEach((lane) => {
      lane.queue = [];
    });
  }

  async function flushLane(lane: Lane, options: FlushOptions): Promise<void> {
    const cap = options.keepalive === true ? KEEPALIVE_CAP : BATCH_CAP;
    while (lane.queue.length > 0) {
      const batch = lane.queue.slice(0, cap);
      const { verdict, data } = await send(lane, batch, options);
      if (verdict === 'retry') return;
      if (verdict === 'refused') {
        sleep();
        return;
      }
      if (verdict === 'sent') {
        accepts = acceptsOf(data) ?? accepts;
        sampling = samplingOf(data, sampling);
      }
      lane.queue = lane.queue.slice(batch.length);
    }
  }

  async function flush(options: FlushOptions = {}): Promise<void> {
    if (flushing) return;
    flushing = true;
    try {
      for (const lane of lanes.values()) await flushLane(lane, options);
    } finally {
      flushing = false;
    }
  }

  return { record, flush, pending };
}
