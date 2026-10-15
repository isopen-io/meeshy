import { describe, expect, test } from 'bun:test';

import type { ApiResult, Credential, HttpRequest, HttpTransport } from './http';
import {
  SOCIAL_EVENTS_BATCH_CAP,
  SOCIAL_EVENTS_SEND_CAP,
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

  test(`le lot est coupé à ${SOCIAL_EVENTS_SEND_CAP} — sous le plafond de la porte (${SOCIAL_EVENTS_BATCH_CAP}) et sous les 64 Kio d'un envoi keepalive`, async () => {
    expect(SOCIAL_EVENTS_SEND_CAP).toBeLessThanOrEqual(SOCIAL_EVENTS_BATCH_CAP);
    const sent: (readonly SocialEvent[])[] = [];
    const clock = manualScheduler();
    const emitter = createSocialEventsEmitter({ send: async (events) => { sent.push(events); return 'sent'; }, schedule: clock.schedule });
    for (let n = 0; n < 250; n += 1) emitter.record(impression(n));
    clock.fire();
    await settle();
    expect(sent.map((batch) => batch.length)).toEqual([100, 100, 50]);
    expect(emitter.pending()).toBe(0);
  });

  test('un lot plein de séances tient sous les 64 Kio qu’un navigateur accorde à un envoi keepalive', () => {
    const dwell = (n: number): SocialEvent => ({
      type: 'dwell', sessionId: '0f8fad5b-d9cb-469f-a165-70867728950e', postId: OID(n), contentType: 'STATUS',
      surface: 'detail', startedAt: new Date(0).toISOString(), dwellMs: 300_000, watchMs: 300_000, mediaDurationMs: 300_000, completed: false,
    });
    const body = JSON.stringify({ events: Array.from({ length: SOCIAL_EVENTS_SEND_CAP }, (_, n) => dwell(n)) });
    expect(new TextEncoder().encode(body).length).toBeLessThan(64 * 1024);
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
    expect(requests[0]?.keepalive).toBe(true);
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

  test('chaque ouverture d’un visiteur est une vue : le même contenu ouvert deux fois ⇒ deux vues', async () => {
    const { recorder, requests } = recorderWith(null);
    recorder.record({ type: 'view', postId: OID(7) });
    recorder.record({ type: 'view', postId: OID(7) });
    await recorder.flush();
    const sent = requests.flatMap((r) => (r.body as { events: SocialEvent[] }).events);
    expect(sent).toEqual([{ type: 'view', postId: OID(7) }, { type: 'view', postId: OID(7) }]);
  });

  test('chaque listage d’un visiteur est une impression : le même post listé trois fois ⇒ trois impressions', async () => {
    const { recorder, requests } = recorderWith(null);
    recorder.record(impression(1));
    recorder.record(impression(1));
    recorder.record(impression(1));
    await recorder.flush();
    const sent = requests.flatMap((r) => (r.body as { events: SocialEvent[] }).events);
    expect(sent).toEqual([impression(1), impression(1), impression(1)]);
  });

  test('un compte compte aussi chaque listage et chaque ouverture, sans fenêtre', async () => {
    const { recorder, requests } = recorderWith({ kind: 'registered', token: 't' });
    recorder.record(impression(1));
    recorder.record(impression(1));
    recorder.record({ type: 'view', postId: OID(1) });
    recorder.record({ type: 'view', postId: OID(1) });
    await recorder.flush();
    const sent = requests.flatMap((r) => (r.body as { events: SocialEvent[] }).events);
    expect(sent).toEqual([impression(1), impression(1), { type: 'view', postId: OID(1) }, { type: 'view', postId: OID(1) }]);
  });

  test('vue en panne (503) et impression refusée par un ancien serveur (403) : seule la vue repart, l’impression n’est jamais rejouée', async () => {
    const requests: HttpRequest[] = [];
    let viewStatus = 503;
    const transport = {
      request: async <T>(request: HttpRequest): Promise<ApiResult<T>> => {
        requests.push(request);
        const kind = (request.body as { events: SocialEvent[] }).events[0]?.type;
        const status = kind === 'impression' ? 403 : viewStatus;
        return (status === 200 ? { ok: true, data: { recorded: 1, rejected: 0 } } : { ok: false, status, error: 'x' }) as ApiResult<T>;
      },
    } as unknown as HttpTransport;
    const recorder = createSocialEventsRecorder({
      transport, credential: () => null, visitorKey: () => 'visitor_abc', schedule: () => undefined,
    });
    recorder.record({ type: 'impression', postId: OID(1), source: 'detail' });
    recorder.record({ type: 'view', postId: OID(1) });
    await recorder.flush();
    expect(recorder.pending()).toBe(1);
    viewStatus = 200;
    await recorder.flush();
    expect(recorder.pending()).toBe(0);
    const kinds = requests.map((r) => (r.body as { events: SocialEvent[] }).events.map((e) => e.type).join(','));
    expect(kinds.filter((k) => k === 'impression')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'view')).toHaveLength(2);
  });

  test('vue écrite et impression en panne : seule l’impression repart, la vue n’est pas recomptée', async () => {
    const requests: HttpRequest[] = [];
    let impressionStatus = 503;
    const transport = {
      request: async <T>(request: HttpRequest): Promise<ApiResult<T>> => {
        requests.push(request);
        const kind = (request.body as { events: SocialEvent[] }).events[0]?.type;
        const status = kind === 'impression' ? impressionStatus : 200;
        return (status === 200 ? { ok: true, data: { recorded: 1, rejected: 0 } } : { ok: false, status, error: 'x' }) as ApiResult<T>;
      },
    } as unknown as HttpTransport;
    const recorder = createSocialEventsRecorder({
      transport, credential: () => null, visitorKey: () => 'visitor_abc', schedule: () => undefined,
    });
    recorder.record({ type: 'impression', postId: OID(1), source: 'detail' });
    recorder.record({ type: 'view', postId: OID(1) });
    await recorder.flush();
    impressionStatus = 200;
    await recorder.flush();
    const views = requests.flatMap((r) => (r.body as { events: SocialEvent[] }).events).filter((e) => e.type === 'view');
    expect(views).toHaveLength(1);
    expect(recorder.pending()).toBe(0);
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

describe('l’engagement d’ouverture `open` voyage à part (#10483)', () => {
  const opening: SocialEvent = { type: 'open', postId: OID(9), origin: 'feed' };
  const statusBy = (open: number) => {
    const requests: HttpRequest[] = [];
    const transport = {
      request: async <T>(request: HttpRequest): Promise<ApiResult<T>> => {
        requests.push(request);
        const kinds = (request.body as { events: SocialEvent[] }).events.map((e) => e.type);
        const status = kinds.includes('open') ? open : 200;
        return (status === 200 ? { ok: true, data: { recorded: 1, rejected: 0 } } : { ok: false, status, error: 'x' }) as ApiResult<T>;
      },
    } as unknown as HttpTransport;
    return { transport, requests };
  };
  const bodies = (requests: readonly HttpRequest[]) =>
    requests.map((r) => (r.body as { events: SocialEvent[] }).events.map((e) => e.type).join(','));

  for (const [who, credential] of [['un compte', { kind: 'registered', token: 't' } as Credential], ['un visiteur', null]] as const) {
    test(`${who} : les \`open\` partent dans une requête SÉPARÉE de celle des vues et impressions`, async () => {
      const { transport, requests } = statusBy(200);
      const recorder = createSocialEventsRecorder({ transport, credential: () => credential, visitorKey: () => 'visitor_abc', schedule: () => undefined });
      recorder.record(impression(9));
      recorder.record(opening);
      recorder.record({ type: 'view', postId: OID(9) });
      await recorder.flush();
      expect(bodies(requests).filter((b) => b.includes('open'))).toEqual(['open']);
      expect(recorder.pending()).toBe(0);
    });

    for (const refusal of [400, 403]) {
      test(`${who} : un ${refusal} d’un ancien serveur sur les \`open\` les retire sans rejeu ; la vue et l’impression passent`, async () => {
        const { transport, requests } = statusBy(refusal);
        const recorder = createSocialEventsRecorder({ transport, credential: () => credential, visitorKey: () => 'visitor_abc', schedule: () => undefined });
        recorder.record(impression(9));
        recorder.record(opening);
        recorder.record({ type: 'view', postId: OID(9) });
        await recorder.flush();
        expect(recorder.pending()).toBe(0);
        await recorder.flush();
        const sent = requests.flatMap((r) => (r.body as { events: SocialEvent[] }).events);
        expect(sent.filter((e) => e.type === 'open')).toHaveLength(1);
        expect(sent.filter((e) => e.type === 'view')).toHaveLength(1);
        expect(sent.filter((e) => e.type === 'impression')).toHaveLength(1);
      });
    }

    test(`${who} : un \`open\` en panne (503) repart seul, la vue écrite n’est pas recomptée`, async () => {
      let open = 503;
      const requests: HttpRequest[] = [];
      const transport = {
        request: async <T>(request: HttpRequest): Promise<ApiResult<T>> => {
          requests.push(request);
          const kinds = (request.body as { events: SocialEvent[] }).events.map((e) => e.type);
          const status = kinds.includes('open') ? open : 200;
          return (status === 200 ? { ok: true, data: { recorded: 1, rejected: 0 } } : { ok: false, status, error: 'x' }) as ApiResult<T>;
        },
      } as unknown as HttpTransport;
      const recorder = createSocialEventsRecorder({ transport, credential: () => credential, visitorKey: () => 'visitor_abc', schedule: () => undefined });
      recorder.record(opening);
      recorder.record({ type: 'view', postId: OID(9) });
      await recorder.flush();
      expect(recorder.pending()).toBe(1);
      open = 200;
      await recorder.flush();
      const sent = requests.flatMap((r) => (r.body as { events: SocialEvent[] }).events);
      expect(sent.filter((e) => e.type === 'view')).toHaveLength(1);
      expect(sent.filter((e) => e.type === 'open')).toHaveLength(2);
      expect(recorder.pending()).toBe(0);
    });
  }

  test('la vue porte sa provenance et le listing d’origine, tels quels', async () => {
    const { recorder, requests } = recorderWith({ kind: 'registered', token: 't' });
    recorder.record({ type: 'view', postId: OID(2), provenance: 'listing', origin: 'profile' });
    await recorder.flush();
    expect(requests[0]?.body).toEqual({ events: [{ type: 'view', postId: OID(2), provenance: 'listing', origin: 'profile' }] });
  });
});

describe('l’enveloppe v2 sur les événements de comptage (#10500)', () => {
  const CONTEXT = {
    schemaVersion: 2 as const,
    sentAt: '2026-10-13T10:00:00.000Z',
    appSessionId: 'sess-1',
    platform: 'web' as const,
    appVersion: '2.13.0',
    os: { name: 'android', version: '14.1' },
    deviceClass: 'phone' as const,
    network: { type: 'wifi' as const },
    uiLanguage: 'fr',
    deviceLocale: 'en-US',
    consent: 'unknown' as const,
    capabilities: ['scroll' as const],
    sampling: { scroll: 1, playback: 1, visibility: 1 },
  };

  function enveloped(credential: Credential | null, statuses: number[]) {
    const requests: HttpRequest[] = [];
    const transport = {
      request: async <T>(request: HttpRequest): Promise<ApiResult<T>> => {
        requests.push(request);
        const status = statuses.shift() ?? 200;
        return (status === 200 ? { ok: true, data: { recorded: 1, rejected: 0 } } : { ok: false, status, error: 'x' }) as ApiResult<T>;
      },
    } as unknown as HttpTransport;
    let n = 0;
    const recorder = createSocialEventsRecorder({
      transport,
      credential: () => credential,
      visitorKey: () => 'visitor_abc',
      schedule: () => undefined,
      stamp: () => ({ eventId: `evt-${(n += 1)}`, occurredAt: '2026-10-13T09:59:00.000Z' }),
      context: () => CONTEXT,
    });
    return { recorder, requests };
  }

  const eventsOf = (request: HttpRequest | undefined) => (request?.body as { events: SocialEvent[] }).events;

  test('chaque événement reçoit son eventId et son heure à la MISE EN FILE', async () => {
    const { recorder, requests } = enveloped({ kind: 'registered', token: 't' }, []);
    recorder.record(impression(1));
    recorder.record({ type: 'view', postId: OID(1) });
    await recorder.flush();
    expect(eventsOf(requests[0])).toEqual([
      { ...impression(1), eventId: 'evt-1', occurredAt: '2026-10-13T09:59:00.000Z' },
      { type: 'view', postId: OID(1), eventId: 'evt-2', occurredAt: '2026-10-13T09:59:00.000Z' },
    ]);
  });

  test('l’eventId est IDENTIQUE après un 503 et le renvoi — la passerelle reconnaît le rejeu', async () => {
    const { recorder, requests } = enveloped({ kind: 'registered', token: 't' }, [503, 200]);
    recorder.record(impression(1));
    await recorder.flush();
    await recorder.flush();
    expect(requests).toHaveLength(2);
    expect(eventsOf(requests[0])[0]?.eventId).toBe('evt-1');
    expect(eventsOf(requests[1])[0]?.eventId).toBe('evt-1');
  });

  test('le contexte part UNE fois par requête, au niveau du lot', async () => {
    const { recorder, requests } = enveloped({ kind: 'registered', token: 't' }, []);
    recorder.record(impression(1));
    recorder.record(impression(2));
    await recorder.flush();
    const body = requests[0]?.body as { events: SocialEvent[]; context: unknown };
    expect(body.context).toEqual(CONTEXT);
    expect(body.events.every((event) => !('context' in event))).toBe(true);
  });

  test('un VISITEUR envoie le contexte réduit : ni session, ni OS, ni locale', async () => {
    const { recorder, requests } = enveloped(null, []);
    recorder.record({ type: 'view', postId: OID(3) });
    await recorder.flush();
    const context = (requests[0]?.body as { context: Record<string, unknown> }).context;
    expect(context).toEqual({ schemaVersion: 2, sentAt: CONTEXT.sentAt, platform: 'web', uiLanguage: 'fr', capabilities: ['scroll'], sampling: CONTEXT.sampling });
  });
});

describe('ce qui reste en file quand la page s’en va se reprend au prochain chargement (#10519)', () => {
  test('`snapshot()` rend ce qui n’est pas DÉJÀ parti — le lot en vol, envoyé en keepalive, arrive ou se perd, il ne se rejoue pas', async () => {
    let release: (verdict: SendVerdict) => void = () => undefined;
    let calls = 0;
    const emitter = createSocialEventsEmitter({
      send: () => {
        calls += 1;
        return calls === 1 ? new Promise<SendVerdict>((resolve) => { release = resolve; }) : Promise.resolve('sent');
      },
      schedule: () => undefined,
    });
    emitter.record(impression(1));
    const inFlight = emitter.flush();
    emitter.record({ type: 'view', postId: OID(1), durationMs: 4000 });
    expect(emitter.snapshot()).toEqual([{ type: 'view', postId: OID(1), durationMs: 4000 }]);
    release('sent');
    await inFlight;
    expect(emitter.snapshot()).toEqual([]);
  });

  test('`restore()` remet les événements repris AVANT les nouveaux et arme un envoi', async () => {
    const sent: (readonly SocialEvent[])[] = [];
    const clock = manualScheduler();
    const emitter = createSocialEventsEmitter({ send: async (events) => { sent.push(events); return 'sent'; }, schedule: clock.schedule });
    emitter.record(impression(2));
    clock.fire();
    await settle();
    emitter.record(impression(3));
    emitter.restore([impression(1)]);
    expect(emitter.snapshot()).toEqual([impression(1), impression(3)]);
    expect(clock.armed()).toBe(1);
    clock.fire();
    await settle();
    expect(sent[1]).toEqual([impression(1), impression(3)]);
  });

  test('`restore()` garde la borne de la file', () => {
    const emitter = createSocialEventsEmitter({ send: async () => 'sent', schedule: () => undefined });
    emitter.restore(Array.from({ length: SOCIAL_EVENTS_PENDING_CAP + 10 }, (_, n) => impression(n)));
    expect(emitter.pending()).toBe(SOCIAL_EVENTS_PENDING_CAP);
  });
});
