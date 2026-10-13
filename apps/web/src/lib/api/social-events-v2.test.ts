import { describe, expect, test } from 'bun:test';

import type { ApiResult, Credential, HttpRequest, HttpTransport } from './http';
import { createSocialEventsRecorder, type SocialEvent } from './social-events';
import type { SocialEventsContext } from './social-events-context';
import {
  SOCIAL_EVENTS_V2_COUNT_TRIGGER,
  SOCIAL_EVENTS_V2_SLEEP_MS,
  createSocialEventsV2Recorder,
} from './social-events-v2';
import type { SocialEventV2, SocialEventV2Input } from './social-events-v2-types';

/**
 * LA FILE v2 (#10500, décision § 8) — séparée de la file de comptage : un
 * ancien serveur refuse en 400 tout lot qui porte un type inconnu, et ce
 * refus ne doit jamais emporter une impression ni une vue.
 */
const OID = (n: number) => n.toString(16).padStart(24, '0');

const CONTEXT: SocialEventsContext = {
  schemaVersion: 2,
  sentAt: '2026-10-13T10:00:00.000Z',
  appSessionId: 'sess-1',
  platform: 'web',
  appVersion: '2.13.0',
  os: { name: 'macos', version: '10.15' },
  deviceClass: 'desktop',
  network: { type: 'wifi' },
  uiLanguage: 'fr',
  deviceLocale: 'fr-FR',
  consent: 'unknown',
  capabilities: ['scroll', 'playback_qoe'],
  sampling: { scroll: 1, playback: 1, visibility: 1 },
};

const react = (n: number): SocialEventV2Input => ({ type: 'interaction', action: 'react', target: { kind: 'post', id: OID(n) }, surface: 'feed' });
const scroll = (): SocialEventV2Input => ({
  type: 'scroll',
  action: 'listing',
  surface: 'feed',
  listingSessionId: 'ls-1',
  segment: 0,
  durationMs: 1000,
  activeScrollMs: 500,
  itemsRendered: 3,
  itemsViewable: 2,
  maxPosition: 2,
  distancePt: 900,
  velocityHistogram: [500, 0, 0, 0],
  directionChanges: 0,
  upDistanceRatio: 0,
  flings: 0,
  stops: 0,
  refreshes: 0,
  paginations: 0,
  reachedEnd: false,
});

type Reply = { readonly status: number; readonly data?: unknown };

function harness(options: { readonly credential?: Credential | null; readonly replies?: Reply[]; readonly random?: number } = {}) {
  const requests: HttpRequest[] = [];
  const replies = options.replies ?? [];
  const transport = {
    request: async <T>(request: HttpRequest): Promise<ApiResult<T>> => {
      requests.push(request);
      const reply = replies.shift() ?? { status: 200, data: { recorded: 1, rejected: 0 } };
      return (reply.status === 200 ? { ok: true, data: reply.data } : { ok: false, status: reply.status, error: 'x' }) as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  let now = 1_000_000;
  let n = 0;
  const timers: Array<() => void> = [];
  const credential = options.credential === undefined ? ({ kind: 'registered', token: 't' } as Credential) : options.credential;
  const recorder = createSocialEventsV2Recorder({
    transport,
    credential: () => credential,
    visitorKey: () => 'visitor_abc',
    context: () => CONTEXT,
    stamp: () => ({ eventId: `v2-${(n += 1)}`, occurredAt: '2026-10-13T09:59:00.000Z' }),
    schedule: (run) => void timers.push(run),
    now: () => now,
    random: () => options.random ?? 0.5,
  });
  return {
    recorder,
    requests,
    advance: (ms: number) => {
      now += ms;
    },
    fire: () => timers.splice(0).forEach((run) => run()),
    sent: () => requests.flatMap((r) => (r.body as { events: SocialEventV2[] }).events),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('la file v2 — séparée, idempotente, en sommeil sur refus', () => {
  test('un événement v2 part avec son eventId, son heure et le contexte du lot', async () => {
    const h = harness();
    h.recorder.record(react(1));
    await h.recorder.flush();
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0]?.path).toContain('/social/events');
    const body = h.requests[0]?.body as { events: SocialEventV2[]; context: SocialEventsContext };
    expect(body.events).toEqual([{ ...react(1), eventId: 'v2-1', occurredAt: '2026-10-13T09:59:00.000Z' } as SocialEventV2]);
    expect(body.context.appSessionId).toBe('sess-1');
  });

  test('une requête v2 refusée en 400 (ancien serveur) ne retire AUCUNE impression ni vue de la file de comptage', async () => {
    const requests: HttpRequest[] = [];
    const transport = {
      request: async <T>(request: HttpRequest): Promise<ApiResult<T>> => {
        requests.push(request);
        const types = (request.body as { events: { type: string }[] }).events.map((e) => e.type);
        const legacy = types.every((type) => ['impression', 'view', 'open', 'dwell', 'download'].includes(type));
        return (legacy ? { ok: true, data: { recorded: types.length, rejected: 0 } } : { ok: false, status: 400, error: 'x' }) as ApiResult<T>;
      },
    } as unknown as HttpTransport;
    const credential = () => ({ kind: 'registered', token: 't' }) as Credential;
    const counting = createSocialEventsRecorder({ transport, credential, visitorKey: () => 'v', schedule: () => undefined });
    const v2 = createSocialEventsV2Recorder({
      transport,
      credential,
      visitorKey: () => 'v',
      context: () => CONTEXT,
      stamp: () => ({ eventId: 'e', occurredAt: 'o' }),
      schedule: () => undefined,
      now: () => 0,
      random: () => 0,
    });
    counting.record({ type: 'impression', postId: OID(1), source: 'feed' });
    counting.record({ type: 'view', postId: OID(1) });
    v2.record(react(1));
    await Promise.all([counting.flush(), v2.flush()]);
    const countingBodies = requests.map((r) => (r.body as { events: SocialEvent[] }).events).filter((events) => events.some((e) => e.type === 'impression'));
    expect(countingBodies).toHaveLength(1);
    expect(countingBodies[0]?.map((e) => e.type)).toEqual(['impression', 'view']);
    expect(requests.every((r) => {
      const types = (r.body as { events: { type: string }[] }).events.map((e) => e.type);
      return types.every((t) => t === 'interaction') || types.every((t) => t !== 'interaction');
    })).toBe(true);
    expect(counting.pending()).toBe(0);
    expect(v2.pending()).toBe(0);
  });

  test('un 400 jette les v2 sans rejeu et met la file en SOMMEIL une heure', async () => {
    const h = harness({ replies: [{ status: 400 }] });
    h.recorder.record(react(1));
    await h.recorder.flush();
    expect(h.recorder.pending()).toBe(0);
    h.recorder.record(react(2));
    await h.recorder.flush();
    expect(h.requests).toHaveLength(1);
    h.advance(SOCIAL_EVENTS_V2_SLEEP_MS + 1);
    h.recorder.record(react(3));
    await h.recorder.flush();
    expect(h.requests).toHaveLength(2);
  });

  test('l’eventId est identique après un 503 et le renvoi', async () => {
    const h = harness({ replies: [{ status: 503 }] });
    h.recorder.record(react(1));
    await h.recorder.flush();
    expect(h.recorder.pending()).toBe(1);
    await h.recorder.flush();
    expect(h.sent().map((e) => e.eventId)).toEqual(['v2-1', 'v2-1']);
    expect(h.recorder.pending()).toBe(0);
  });

  test(`rien ne part avant 10 s… sauf à ${SOCIAL_EVENTS_V2_COUNT_TRIGGER} événements`, async () => {
    const h = harness();
    h.recorder.record(react(1));
    expect(h.requests).toHaveLength(0);
    for (let i = 2; i <= SOCIAL_EVENTS_V2_COUNT_TRIGGER; i += 1) h.recorder.record(react(i));
    await settle();
    expect(h.requests).toHaveLength(1);
    expect(h.sent()).toHaveLength(SOCIAL_EVENTS_V2_COUNT_TRIGGER);
  });

  test('la passerelle annonce ce qu’elle accepte : un type qu’elle n’accepte pas ne part plus', async () => {
    const h = harness({ replies: [{ status: 200, data: { recorded: 1, rejected: 0, accepts: ['impression', 'view', 'interaction'] } }] });
    h.recorder.record(react(1));
    await h.recorder.flush();
    h.recorder.record(scroll());
    h.recorder.record(react(2));
    await h.recorder.flush();
    expect(h.sent().map((e) => e.type)).toEqual(['interaction', 'interaction']);
  });

  test('l’échantillonnage annoncé est tiré UNE fois par session et déclaré dans le contexte', async () => {
    const h = harness({ random: 0.7, replies: [{ status: 200, data: { recorded: 1, rejected: 0, sampling: { scroll: 0.5, playback: 1, visibility: 1 } } }] });
    h.recorder.record(react(1));
    await h.recorder.flush();
    h.recorder.record(scroll());
    h.recorder.record(react(2));
    await h.recorder.flush();
    expect(h.sent().map((e) => e.type)).toEqual(['interaction', 'interaction']);
    const context = (h.requests[1]?.body as { context: SocialEventsContext }).context;
    expect(context.sampling.scroll).toBe(0.5);
  });

  test('l’interaction n’est JAMAIS échantillonnée', async () => {
    const h = harness({ random: 0.99, replies: [{ status: 200, data: { recorded: 1, rejected: 0, sampling: { scroll: 0.01, playback: 0.01, visibility: 0.01 } } }] });
    h.recorder.record(react(1));
    await h.recorder.flush();
    h.recorder.record(react(2));
    await h.recorder.flush();
    expect(h.sent()).toHaveLength(2);
  });

  test('un VISITEUR n’émet que les types v2 admis, sous sa clé et le contexte réduit', async () => {
    const h = harness({ credential: null });
    h.recorder.record(react(1));
    h.recorder.record(scroll());
    await h.recorder.flush();
    expect(h.sent().map((e) => e.type)).toEqual(['scroll']);
    expect(h.requests[0]?.headers).toEqual({ 'X-Session-Token': 'visitor_abc' });
    expect(h.requests[0]?.credential).toBeNull();
    expect((h.requests[0]?.body as { context: Record<string, unknown> }).context.appSessionId).toBeUndefined();
  });

  test('la sortie de page vide la file en keepalive, coupée à 100', async () => {
    const h = harness();
    for (let i = 0; i < 49; i += 1) h.recorder.record(react(i));
    await h.recorder.flush({ keepalive: true });
    expect(h.requests[0]?.keepalive).toBe(true);
  });

  test('un événement déjà estampillé (file du service worker) garde son eventId et son heure', async () => {
    const h = harness();
    h.recorder.record({ ...react(1), eventId: 'sw-1', occurredAt: '2026-10-12T08:00:00.000Z' } as unknown as SocialEventV2Input);
    await h.recorder.flush();
    expect(h.sent()[0]).toMatchObject({ eventId: 'sw-1', occurredAt: '2026-10-12T08:00:00.000Z' });
  });
});
