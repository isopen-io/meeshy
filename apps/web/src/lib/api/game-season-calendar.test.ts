import { describe, expect, test } from 'bun:test';

import { DEFAULT_SEASON_SCHEDULE, scheduledSeasonCalendar, type SeasonSchedule } from '@meeshy/shared/utils/game/season-schedule';

import { createSeasonCalendarStore, fetchSeasonCalendar, seasonScheduleEtag } from './game-season-calendar';
import { createHttpTransport } from './http';

/**
 * LE CALENDRIER DES SAISONS SERVI (#10232) — lecture conditionnelle
 * (`If-None-Match` sur la révision gardée), cache local par révision, repli sur
 * `DEFAULT_SEASON_SCHEDULE`. Un stockage qui refuse ne casse jamais la lecture.
 */

const SERVED: SeasonSchedule = {
  revision: 4,
  seasons: [{ number: 1, startDay: '2027-01-04', status: 'scheduled', themeKey: 'language:ja', stepPoints: 120, copy: null }],
};

type Call = { readonly url: string; readonly headers: Headers };

function gateway(respond: (call: Call) => Response, calls: Call[] = []) {
  const fetchImpl: typeof fetch = async (input, init) => {
    const call = { url: String(input), headers: new Headers(init?.headers) };
    calls.push(call);
    return respond(call);
  };
  return createHttpTransport({ base: 'https://gate.test', credential: () => ({ kind: 'registered', token: 'jwt' }), fetchImpl, timeoutMs: 0 });
}

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  };
}

const refusingStorage = (): Storage => {
  const refuse = (): never => {
    throw new Error('QuotaExceededError');
  };
  return { length: 0, clear: refuse, getItem: refuse, key: refuse, removeItem: refuse, setItem: refuse };
};

describe('seasonScheduleEtag', () => {
  test('est celui que la passerelle sert', () => {
    expect(seasonScheduleEtag(7)).toBe('"season-schedule-7"');
  });
});

describe('fetchSeasonCalendar', () => {
  test('lit GET /me/game/seasons/calendar et rend le calendrier normalisé', async () => {
    const calls: Call[] = [];
    const transport = gateway(() => json({ success: true, data: SERVED }), calls);
    const result = await fetchSeasonCalendar(transport, { knownRevision: null });
    expect(calls[0]?.url).toBe('https://gate.test/api/v1/me/game/seasons/calendar');
    expect(calls[0]?.headers.has('If-None-Match')).toBe(false);
    expect(result).toEqual({ ok: true, data: { kind: 'fresh', schedule: SERVED } });
  });

  test('pose If-None-Match sur la révision gardée et lit le 304 comme « inchangé »', async () => {
    const calls: Call[] = [];
    const transport = gateway(() => new Response(null, { status: 304 }), calls);
    const result = await fetchSeasonCalendar(transport, { knownRevision: 4 });
    expect(calls[0]?.headers.get('If-None-Match')).toBe('"season-schedule-4"');
    expect(result).toEqual({ ok: true, data: { kind: 'unchanged' } });
  });

  test('une charge illisible est un échec MALFORMED_PAYLOAD, jamais un calendrier vide', async () => {
    const transport = gateway(() => json({ success: true, data: { seasons: 'oui' } }));
    const result = await fetchSeasonCalendar(transport, { knownRevision: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('MALFORMED_PAYLOAD');
  });

  test('une définition non conforme est ignorée, les autres sont gardées (loi partagée)', async () => {
    const dirty = { revision: 5, seasons: [...SERVED.seasons, { number: 2, startDay: '2027-03-03', status: 'scheduled', themeKey: 'language:ja', stepPoints: 120, copy: null }] };
    const result = await fetchSeasonCalendar(gateway(() => json({ success: true, data: dirty })), { knownRevision: null });
    expect(result.ok && result.data.kind === 'fresh' ? result.data.schedule.seasons.map((s) => s.number) : null).toEqual([1]);
  });

  test('un refus du serveur (503) reste un échec', async () => {
    const result = await fetchSeasonCalendar(gateway(() => json({ success: false, error: 'indisponible' }, 503)), { knownRevision: null });
    expect(result.ok).toBe(false);
  });
});

describe('createSeasonCalendarStore', () => {
  test('sans rien en cache : le repli est le calendrier par défaut', () => {
    const store = createSeasonCalendarStore(() => memoryStorage());
    expect(store.get()).toBe(DEFAULT_SEASON_SCHEDULE);
  });

  test('une lecture réussie est servie, gardée par révision, et survit au rechargement', async () => {
    const storage = memoryStorage();
    const store = createSeasonCalendarStore(() => storage);
    await store.refresh(gateway(() => json({ success: true, data: SERVED })));
    expect(store.get()).toEqual(SERVED);

    const reloaded = createSeasonCalendarStore(() => storage);
    expect(reloaded.get()).toEqual(SERVED);
  });

  test('hors ligne, la copie gardée sert ; la relecture envoie sa révision', async () => {
    const storage = memoryStorage();
    await createSeasonCalendarStore(() => storage).refresh(gateway(() => json({ success: true, data: SERVED })));

    const calls: Call[] = [];
    const offline = createSeasonCalendarStore(() => storage);
    await offline.refresh(gateway(() => new Response(null, { status: 304 }), calls));
    expect(calls[0]?.headers.get('If-None-Match')).toBe('"season-schedule-4"');
    expect(offline.get()).toEqual(SERVED);

    const failing = createSeasonCalendarStore(() => storage);
    await failing.refresh(gateway(() => json({ success: false, error: 'indisponible' }, 503)));
    expect(failing.get()).toEqual(SERVED);
  });

  test('une révision plus ancienne ne remplace jamais une plus récente', async () => {
    const store = createSeasonCalendarStore(() => memoryStorage());
    await store.refresh(gateway(() => json({ success: true, data: SERVED })));
    await store.refresh(gateway(() => json({ success: true, data: { revision: 2, seasons: [] } })));
    expect(store.get().revision).toBe(4);
  });

  test('un stockage qui refuse (quota, navigation privée) ne casse ni la lecture ni l’écriture', async () => {
    const store = createSeasonCalendarStore(() => refusingStorage());
    expect(store.get()).toBe(DEFAULT_SEASON_SCHEDULE);
    await store.refresh(gateway(() => json({ success: true, data: SERVED })));
    expect(store.get()).toEqual(SERVED);
  });

  test('aucun stockage du tout (null) : la mémoire suffit', async () => {
    const store = createSeasonCalendarStore(() => null);
    await store.refresh(gateway(() => json({ success: true, data: SERVED })));
    expect(store.get().revision).toBe(4);
  });

  test('un cache corrompu retombe sur le repli, et un cache à la forme inattendue aussi', () => {
    for (const raw of ['{pas du json', '{"revision":"x"}', 'null', '[]']) {
      const store = createSeasonCalendarStore(() => memoryStorage({ 'meeshy.game.season-calendar.v1': raw }));
      expect(store.get()).toBe(DEFAULT_SEASON_SCHEDULE);
    }
  });

  test('les abonnés sont prévenus d’un nouveau calendrier, une fois, et peuvent se désabonner', async () => {
    const store = createSeasonCalendarStore(() => memoryStorage());
    let notified = 0;
    const off = store.subscribe(() => {
      notified += 1;
    });
    await store.refresh(gateway(() => json({ success: true, data: SERVED })));
    expect(notified).toBe(1);
    await store.refresh(gateway(() => new Response(null, { status: 304 })));
    expect(notified).toBe(1);
    off();
    await store.refresh(gateway(() => json({ success: true, data: { ...SERVED, revision: 9 } })));
    expect(notified).toBe(1);
  });

  test('le calendrier servi gouverne les dates : la saison décalée ouvre à son lundi', async () => {
    const store = createSeasonCalendarStore(() => memoryStorage());
    await store.refresh(gateway(() => json({ success: true, data: SERVED })));
    expect(scheduledSeasonCalendar(store.get(), 1)?.startDay).toBe('2027-01-04');
  });
});

describe('la clé du cache du calendrier', () => {
  test('l’administration invalide la MÊME clé que celle que le Jeu lit', async () => {
    const { ADMIN_SEASON_CALENDAR_QUERY_KEY } = await import('@/lib/admin/game-season-form');
    const { seasonCalendarQueryKey } = await import('./game-season-calendar');
    expect([...ADMIN_SEASON_CALENDAR_QUERY_KEY]).toEqual([...seasonCalendarQueryKey]);
  });
});
