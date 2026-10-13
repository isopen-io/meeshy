import { describe, expect, test } from 'bun:test';

import type { ApiResult, Credential, HttpRequest, HttpTransport } from './http';
import {
  KEEPALIVE_BATCH_CAP,
  SOCIAL_EVENTS_BATCH_CAP,
  SOCIAL_EVENTS_PENDING_CAP,
  createSocialEventsEmitter,
  createSocialEventsRecorder,
  type SendVerdict,
  type SocialEvent,
} from './social-events';

/**
 * LA TÉLÉMÉTRIE DE LECTURE DU WEB (#10401) — le lot, la file et la frontière
 * compte / visiteur que `POST /social/events` impose.
 */
const OID = (n: number) => n.toString(16).padStart(24, '0');
const impression = (n: number): SocialEvent => ({ type: 'impression', postId: OID(n), source: 'feed' });

function manualScheduler() {
  const runs: Array<() => void> = [];
  return {
    schedule: (run: () => void) => {
      runs.push(run);
    },
    fire: () => {
      const due = runs.splice(0);
      for (const run of due) run();
    },
    armed: () => runs.length,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createSocialEventsEmitter — le lot', () => {
  test('rien ne part avant le délai, et un seul minuteur est armé quel que soit le nombre d’événements', () => {
    const sent: (readonly SocialEvent[])[] = [];
    const clock = manualScheduler();
    const emitter = createSocialEventsEmitter({ send: async (events) => { sent.push(events); return 'sent'; }, schedule: clock.schedule });
    emitter.record(impression(1));
    emitter.record(impression(2));
    expect(sent).toHaveLength(0);
    expect(clock.armed()).toBe(1);
    expect(emitter.pending()).toBe(2);
  });

  test(`le lot est coupé à ${SOCIAL_EVENTS_BATCH_CAP} — la porte refuse le lot ENTIER au-delà`, async () => {
    const sent: (readonly SocialEvent[])[] = [];
    const clock = manualScheduler();
    const emitter = createSocialEventsEmitter({ send: async (events) => { sent.push(events); return 'sent'; }, schedule: clock.schedule });
    for (let n = 0; n < 450; n += 1) emitter.record(impression(n));
    clock.fire();
    await settle();
    expect(sent.map((batch) => batch.length)).toEqual([200, 200, 50]);
    expect(emitter.pending()).toBe(0);
  });

  test('un échec transitoire GARDE les événements : ils repartent au flush suivant', async () => {
    const verdicts: SendVerdict[] = ['retry', 'sent'];
    const sent: (readonly SocialEvent[])[] = [];
    const clock = manualScheduler();
    const emitter = createSocialEventsEmitter({
      send: async (events) => { sent.push(events); return verdicts.shift() ?? 'sent'; },
      schedule: clock.schedule,
    });
    emitter.record(impression(1));
    clock.fire();
    await settle();
    expect(emitter.pending()).toBe(1);
    await emitter.flush();
    expect(emitter.pending()).toBe(0);
    expect(sent.map((batch) => batch.map((e) => e.postId))).toEqual([[OID(1)], [OID(1)]]);
  });

  test('un transport qui LÈVE est un échec transitoire, jamais une perte', async () => {
    const emitter = createSocialEventsEmitter({ send: async () => { throw new Error('offline'); }, schedule: () => undefined });
    emitter.record(impression(1));
    await emitter.flush();
    expect(emitter.pending()).toBe(1);
  });

  test('un refus définitif (400/403) jette le lot — il ne bloque pas la file à jamais', async () => {
    const emitter = createSocialEventsEmitter({ send: async () => 'drop', schedule: () => undefined });
    emitter.record(impression(1));
    await emitter.flush();
    expect(emitter.pending()).toBe(0);
  });

  test('la file est bornée : hors ligne longtemps, les plus anciens partent les premiers', () => {
    const emitter = createSocialEventsEmitter({ send: async () => 'retry', schedule: () => undefined });
    for (let n = 0; n < SOCIAL_EVENTS_PENDING_CAP + 5; n += 1) emitter.record(impression(n));
    expect(emitter.pending()).toBe(SOCIAL_EVENTS_PENDING_CAP);
  });

  test('les durées sont bornées comme la porte les borne (5 minutes, entiers positifs)', async () => {
    const sent: (readonly SocialEvent[])[] = [];
    const emitter = createSocialEventsEmitter({ send: async (events) => { sent.push(events); return 'sent'; }, schedule: () => undefined });
    emitter.record({ type: 'view', postId: OID(1), durationMs: 999_999.4 });
    emitter.record({ type: 'view', postId: OID(2), durationMs: -3 });
    await emitter.flush();
    expect(sent[0]).toEqual([
      { type: 'view', postId: OID(1), durationMs: 300_000 },
      { type: 'view', postId: OID(2), durationMs: 0 },
    ]);
  });
});

function recordingTransport(status = 200) {
  const requests: HttpRequest[] = [];
  const transport = {
    request: async <T>(request: HttpRequest): Promise<ApiResult<T>> => {
      requests.push(request);
      return (status === 200
        ? { ok: true, data: { recorded: 1, rejected: 0 } as unknown as T }
        : { ok: false, status, error: 'x' }) as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  return { transport, requests };
}

const recorderWith = (credential: Credential | null, status = 200) => {
  const { transport, requests } = recordingTransport(status);
  const recorder = createSocialEventsRecorder({
    transport,
    credential: () => credential,
    visitorKey: () => 'visitor_abc',
    schedule: () => undefined,
  });
  return { recorder, requests };
};

describe('createSocialEventsRecorder — un compte, un visiteur', () => {
  test('un COMPTE groupe impressions, vues et séances dans UN lot vers /social/events', async () => {
    const { recorder, requests } = recorderWith({ kind: 'registered', token: 't' });
    recorder.record(impression(1));
    recorder.record({ type: 'view', postId: OID(1) });
    await recorder.flush();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.path).toContain('/social/events');
    expect(requests[0]?.body).toEqual({ events: [impression(1), { type: 'view', postId: OID(1) }] });
    expect(recorder.pending()).toBe(0);
  });

  test('un 5xx garde le lot d’un compte en file', async () => {
    const { recorder } = recorderWith({ kind: 'registered', token: 't' }, 503);
    recorder.record(impression(1));
    await recorder.flush();
    expect(recorder.pending()).toBe(1);
  });

  test('un VISITEUR sans jeton groupe sa vue d’ouverture dans un lot, sous sa clé de visiteur, sans crédential', async () => {
    const { recorder, requests } = recorderWith(null);
    recorder.record({ type: 'view', postId: OID(7) });
    expect(requests).toHaveLength(0);
    await recorder.flush();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.body).toEqual({ events: [{ type: 'view', postId: OID(7) }] });
    expect(requests[0]?.headers).toEqual({ 'X-Session-Token': 'visitor_abc' });
    expect(requests[0]?.credential).toBeNull();
  });

  test('un visiteur sur /post/:id émet l’impression `detail` ET la vue — deux requêtes, pour qu’un ancien serveur ne refuse que l’impression', async () => {
    const { recorder, requests } = recorderWith(null);
    recorder.record({ type: 'impression', postId: OID(7), source: 'detail', surface: 'detail' });
    recorder.record({ type: 'view', postId: OID(7), surface: 'detail' });
    await recorder.flush();
    const bodies = requests.map((r) => r.body);
    expect(bodies).toContainEqual({ events: [{ type: 'view', postId: OID(7), surface: 'detail' }] });
    expect(bodies).toContainEqual({ events: [{ type: 'impression', postId: OID(7), source: 'detail', surface: 'detail' }] });
    expect(requests.every((r) => r.headers?.['X-Session-Token'] === 'visitor_abc')).toBe(true);
    expect(recorder.pending()).toBe(0);
  });

  test('un 403 d’un ancien serveur sur l’impression d’un visiteur la retire de la file, sans rejeu', async () => {
    const { recorder, requests } = recorderWith(null, 403);
    recorder.record(impression(1));
    await recorder.flush();
    expect(recorder.pending()).toBe(0);
    await recorder.flush();
    expect(requests).toHaveLength(1);
  });

  test('un 5xx garde le lot d’un visiteur en file', async () => {
    const { recorder } = recorderWith(null, 503);
    recorder.record(impression(1));
    await recorder.flush();
    expect(recorder.pending()).toBe(1);
  });

  test('la sortie d’un visiteur envoie sa vue AVEC sa durée ; aucune séance `dwell` ne part', async () => {
    const { recorder, requests } = recorderWith(null);
    recorder.record({ type: 'view', postId: OID(1), durationMs: 4000 });
    recorder.record({
      type: 'dwell', sessionId: 'a', postId: OID(1), contentType: 'POST', surface: 'detail',
      startedAt: new Date(0).toISOString(), dwellMs: 10, completed: false,
    });
    await recorder.flush();
    const sent = requests.flatMap((r) => (r.body as { events: SocialEvent[] }).events);
    expect(sent).toEqual([{ type: 'view', postId: OID(1), durationMs: 4000 }]);
  });

  test('un visiteur ne compte qu’une ouverture par contenu et par onglet', async () => {
    const { recorder, requests } = recorderWith(null);
    recorder.record({ type: 'view', postId: OID(7) });
    recorder.record({ type: 'view', postId: OID(7) });
    await recorder.flush();
    expect((requests[0]?.body as { events: SocialEvent[] }).events).toHaveLength(1);
  });

  test('un visiteur ne recompte pas l’impression d’un même contenu dans la fenêtre de 30 minutes', async () => {
    let t = 0;
    const { transport, requests } = recordingTransport();
    const recorder = createSocialEventsRecorder({
      transport, credential: () => null, visitorKey: () => 'visitor_abc', schedule: () => undefined, now: () => t,
    });
    recorder.record(impression(1));
    t = 29 * 60_000;
    recorder.record(impression(1));
    await recorder.flush();
    t = 31 * 60_000;
    recorder.record(impression(1));
    await recorder.flush();
    const sent = requests.flatMap((r) => (r.body as { events: SocialEvent[] }).events);
    expect(sent).toEqual([impression(1), impression(1)]);
  });

  test('l’invité d’un lien parle sous SON jeton : aucune clé de visiteur n’est posée par-dessus', async () => {
    const guest: Credential = { kind: 'anonymous', sessionToken: 'anon_1' };
    const { recorder, requests } = recorderWith(guest);
    recorder.record({ type: 'view', postId: OID(3) });
    recorder.record(impression(3));
    await recorder.flush();
    expect(requests).toHaveLength(2);
    expect(requests.every((r) => r.headers === undefined)).toBe(true);
    expect(requests.every((r) => r.credential === guest)).toBe(true);
  });

  test('un compte reste inchangé : impression et vue dans UN lot, sous son crédential', async () => {
    const { recorder, requests } = recorderWith({ kind: 'registered', token: 't' });
    recorder.record({ type: 'impression', postId: OID(1), source: 'detail', surface: 'detail' });
    recorder.record({ type: 'view', postId: OID(1), durationMs: 10 });
    await recorder.flush();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.credential).toBeUndefined();
    expect(requests[0]?.headers).toBeUndefined();
  });
});

describe('la fermeture de la page ne perd plus rien (W3)', () => {
  test('un flush de sortie part en keepalive, pour un compte comme pour un visiteur', async () => {
    for (const credential of [{ kind: 'registered', token: 't' } as Credential, null]) {
      const { recorder, requests } = recorderWith(credential);
      recorder.record(impression(1));
      await recorder.flush({ keepalive: true });
      expect(requests).toHaveLength(1);
      expect(requests[0]?.keepalive).toBe(true);
    }
  });

  test('un flush ordinaire ne demande pas keepalive', async () => {
    const { recorder, requests } = recorderWith({ kind: 'registered', token: 't' });
    recorder.record(impression(1));
    await recorder.flush();
    expect(requests[0]?.keepalive).toBeUndefined();
  });

  test(`un lot keepalive est coupé à ${KEEPALIVE_BATCH_CAP} — le navigateur refuse un corps keepalive de plus de 64 Kio`, async () => {
    const { recorder, requests } = recorderWith({ kind: 'registered', token: 't' });
    for (let n = 0; n < KEEPALIVE_BATCH_CAP + 10; n += 1) recorder.record(impression(n));
    await recorder.flush({ keepalive: true });
    expect((requests[0]?.body as { events: SocialEvent[] }).events).toHaveLength(KEEPALIVE_BATCH_CAP);
  });
});
