/**
 * #18556 — « si l'interlocuteur lit le message et quitte, le message se
 * détruit devant nos yeux ». Le client appelle la consommation en sortant ;
 * quand il ne le peut pas (app tuée, réseau coupé), le serveur constate le
 * départ lui-même — et ne retient que ce qui a été lu PENDANT un regard.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import {
  AfterReadDepartureTracker,
  AFTER_READ_MAX_PERIODS,
  AFTER_READ_VIEW_STOP_GRACE_MS,
  AFTER_READ_MAX_RETRY_DELAY_MS,
  AFTER_READ_RECHECK_MS,
  AFTER_READ_MAX_HOLD_MS,
  AFTER_READ_MAX_TOUCHED,
  AFTER_READ_VIEW_STARTS_PER_MINUTE,
  AFTER_READ_VIEW_STARTS_PER_USER_PER_MINUTE,
  type AfterReadDeparture,
  type AfterReadPeriod,
  type AfterReadReader,
} from '../AfterReadDepartureTracker';

const GRACE_MS = 30_000;
const T0 = new Date('2026-11-14T12:00:00.000Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

function reader(overrides: Partial<AfterReadReader> = {}): AfterReadReader {
  return { conversationId: 'conv-1', participantId: 'p-reader', readerKey: 'u-reader', ...overrides };
}

type Options = {
  resolve?: (socketId: string, conversationId: string) => AfterReadReader | null;
  viewedElsewhere?: (reader: AfterReadReader) => Promise<boolean>;
  isAuthenticated?: (socketId: string) => boolean;
  holdsDeparture?: (reader: AfterReadReader) => Promise<boolean>;
  onDeparture?: (departure: AfterReadDeparture) => Promise<void>;
  viewStopGraceMs?: number;
  /** L'horloge suit les faux minuteurs (`jest.useFakeTimers({ now: T0 })`) : le plafond de retenue se mesure. */
  followTimers?: boolean;
  userOf?: (socketId: string) => string | undefined;
  overflowLimits?: { perKey?: number; perReader?: number; total?: number };
};

function buildTracker(options: Options = {}) {
  const departures: AfterReadDeparture[] = [];
  const marks: Array<{ socketId: string; conversationId: string; viewing: boolean }> = [];
  const clock = { now: T0 };
  const tracker = new AfterReadDepartureTracker({
    resolveReader: async (socketId, conversationId) =>
      options.resolve ? options.resolve(socketId, conversationId) : reader({ conversationId }),
    onDeparture: async (departure) => {
      await options.onDeparture?.(departure);
      departures.push(departure);
    },
    viewedElsewhere: options.viewedElsewhere,
    isAuthenticated: options.isAuthenticated,
    holdsDeparture: options.holdsDeparture,
    viewStopGraceMs: options.viewStopGraceMs,
    markViewing: (socketId, marked, viewing) => marks.push({ socketId, conversationId: marked.conversationId, viewing }),
    graceMs: GRACE_MS,
    now: () => (options.followTimers ? new Date(Date.now()) : clock.now),
    userOf: options.userOf,
    overflowLimits: options.overflowLimits,
  });
  return { tracker, departures, marks, clock };
}

const settle = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

const periodsOf = (departure: AfterReadDeparture) =>
  departure.periods.map((period) => [period.from.toISOString(), period.to.toISOString()]);

afterEach(() => {
  jest.useRealTimers();
});

/** Avance les faux minuteurs par pas, en laissant les départs asynchrones se résoudre à chaque pas. */
async function elapse(ms: number, step: number = AFTER_READ_RECHECK_MS / 4): Promise<void> {
  for (let done = 0; done < ms; done += step) {
    jest.advanceTimersByTime(Math.min(step, ms - done));
    await settle();
  }
}

describe('AfterReadDepartureTracker — le regard borne ce qui a été vu (#18556)', () => {
  it('un regard clos puis une déconnexion : le départ porte la période du regard, après la grâce', async () => {
    jest.useFakeTimers();
    const { tracker, departures, clock } = buildTracker();

    await tracker.viewStart('s-1', 'conv-1');
    clock.now = at(5);
    await tracker.viewStop('s-1', 'conv-1');
    clock.now = at(60);
    await tracker.disconnecting('s-1');
    await settle();
    expect(departures).toEqual([]);

    jest.advanceTimersByTime(GRACE_MS);
    await settle();
    expect(departures).toHaveLength(1);
    expect(departures[0]).toMatchObject(reader());
    expect(periodsOf(departures[0])).toEqual([[T0.toISOString(), at(5).toISOString()]]);
  });

  it('une déconnexion en plein regard clôt la période à l’instant de la coupure', async () => {
    jest.useFakeTimers();
    const { tracker, departures, clock } = buildTracker();

    await tracker.viewStart('s-1', 'conv-1');
    clock.now = at(3);
    await tracker.disconnecting('s-1');
    jest.advanceTimersByTime(GRACE_MS);
    await settle();

    expect(periodsOf(departures[0])).toEqual([[T0.toISOString(), at(3).toISOString()]]);
  });

  it('une conversation jamais regardée ne se consomme pas, même si sa room est tenue toute la vie de la socket', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker();
    const handlers = new Map<string, (data: unknown) => void>();
    const socket = { id: 's-1', on: (event: string, handler: (data: unknown) => void) => handlers.set(event, handler) };
    tracker.listen(socket as never);

    handlers.get('conversation:join')?.({ conversationId: 'conv-1' });
    await settle();
    await tracker.background('s-1');
    await tracker.disconnecting('s-1');
    jest.advanceTimersByTime(GRACE_MS);
    await settle();

    expect(departures).toEqual([]);
  });

  it('ATTAQUE B2 — une heure après le regard, l’arrière-plan ne déclare que la période regardée, jamais « depuis la première ouverture »', async () => {
    jest.useFakeTimers();
    const { tracker, departures, clock } = buildTracker();

    await tracker.viewStart('s-1', 'conv-1');
    clock.now = at(1);
    await tracker.viewStop('s-1', 'conv-1');
    clock.now = at(61);
    await tracker.background('s-1');
    jest.advanceTimersByTime(GRACE_MS);
    await settle();

    expect(departures).toHaveLength(1);
    expect(periodsOf(departures[0])).toEqual([[T0.toISOString(), at(1).toISOString()]]);
  });

  it('ATTAQUE B4 — après un départ, la période est oubliée : une lecture posée en arrière-plan n’appartient à aucun regard', async () => {
    jest.useFakeTimers();
    const { tracker, departures, clock } = buildTracker();

    await tracker.viewStart('s-1', 'conv-1');
    clock.now = at(1);
    await tracker.background('s-1');
    jest.advanceTimersByTime(GRACE_MS);
    await settle();
    expect(departures).toHaveLength(1);

    clock.now = at(10);
    await tracker.disconnecting('s-1');
    jest.advanceTimersByTime(GRACE_MS);
    await settle();

    expect(departures).toHaveLength(1);
  });

  it('quitter la conversation en restant connecté (viewing:stop, socket vivante) consomme après sa grâce', async () => {
    jest.useFakeTimers();
    const { tracker, departures, clock } = buildTracker();

    await tracker.viewStart('s-1', 'conv-1');
    clock.now = at(2);
    await tracker.viewStop('s-1', 'conv-1');
    jest.advanceTimersByTime(AFTER_READ_VIEW_STOP_GRACE_MS - 1);
    await settle();
    expect(departures).toEqual([]);

    jest.advanceTimersByTime(1);
    await settle();
    expect(departures).toHaveLength(1);
    expect(departures[0]).toMatchObject(reader());
    expect(periodsOf(departures[0])).toEqual([[T0.toISOString(), at(2).toISOString()]]);
  });

  it('AUDIT B1/D2 — un appel en cours retient le départ du viewing:stop, et la fin de l’appel le libère après une grâce entière', async () => {
    jest.useFakeTimers();
    const call = { live: true };
    const { tracker, departures } = buildTracker({ holdsDeparture: async () => call.live });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStop('s-1', 'conv-1');
    jest.advanceTimersByTime(AFTER_READ_VIEW_STOP_GRACE_MS + AFTER_READ_RECHECK_MS * 20);
    await settle();
    expect(departures).toEqual([]);

    call.live = false;
    jest.advanceTimersByTime(AFTER_READ_RECHECK_MS);
    await settle();
    expect(departures).toEqual([]);

    jest.advanceTimersByTime(AFTER_READ_VIEW_STOP_GRACE_MS);
    await settle();
    expect(departures).toHaveLength(1);
  });

  it('AUDIT A2 — la fin d’un appel rouvre une grâce entière : l’écran de conversation a le temps de revenir', async () => {
    jest.useFakeTimers();
    const call = { live: true };
    const { tracker, departures } = buildTracker({ holdsDeparture: async () => call.live });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStop('s-1', 'conv-1');
    jest.advanceTimersByTime(AFTER_READ_VIEW_STOP_GRACE_MS + AFTER_READ_RECHECK_MS * 3);
    await settle();
    call.live = false;
    jest.advanceTimersByTime(AFTER_READ_RECHECK_MS);
    await settle();
    expect(departures).toEqual([]);

    await tracker.viewStart('s-1', 'conv-1');
    jest.advanceTimersByTime(AFTER_READ_VIEW_STOP_GRACE_MS * 3);
    await settle();
    expect(departures).toEqual([]);
  });

  it('AUDIT A2 — un viewing:stop arrivé pendant le réexamen d’un appel garde sa grâce entière', async () => {
    jest.useFakeTimers();
    let release: (held: boolean) => void = () => undefined;
    const call = { pending: false, live: true };
    const { tracker, departures } = buildTracker({
      holdsDeparture: () =>
        call.pending ? new Promise<boolean>((resolve) => { release = resolve; }) : Promise.resolve(call.live),
    });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStop('s-1', 'conv-1');
    call.pending = true;
    jest.advanceTimersByTime(AFTER_READ_VIEW_STOP_GRACE_MS);
    await settle();
    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStop('s-1', 'conv-1');
    release(true);
    call.pending = false;
    call.live = false;
    await settle();
    jest.advanceTimersByTime(AFTER_READ_VIEW_STOP_GRACE_MS - 1);
    await settle();

    expect(departures).toEqual([]);
  });

  it('AUDIT C1 — un regard rouvert puis quitté PENDANT la vérification d’appel garde sa grâce de viewing:stop', async () => {
    jest.useFakeTimers();
    let release: (held: boolean) => void = () => undefined;
    const check = { first: true };
    const { tracker, departures, clock } = buildTracker({
      holdsDeparture: () => {
        if (!check.first) return Promise.resolve(false);
        check.first = false;
        return new Promise<boolean>((resolve) => { release = resolve; });
      },
    });

    await tracker.viewStart('s-1', 'conv-1');
    clock.now = new Date(T0.getTime() + 60_000);
    await tracker.background('s-1');
    jest.advanceTimersByTime(GRACE_MS);
    await settle();
    clock.now = new Date(T0.getTime() + 91_000);
    await tracker.viewStart('s-1', 'conv-1');
    clock.now = new Date(T0.getTime() + 95_000);
    await tracker.viewStop('s-1', 'conv-1');
    release(false);
    await settle();
    expect(departures).toEqual([]);

    jest.advanceTimersByTime(AFTER_READ_VIEW_STOP_GRACE_MS);
    await settle();
    expect(departures).toHaveLength(1);
    expect(departures[0].periods).toHaveLength(2);
  });

  it('AUDIT A1 — la déconnexion d’un AUTRE appareil ne raccourcit pas la grâce d’un viewing:stop', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker();

    await tracker.viewStart('s-phone', 'conv-1');
    await tracker.viewStart('s-desk', 'conv-1');
    await tracker.viewStop('s-phone', 'conv-1');
    await tracker.disconnecting('s-desk');
    jest.advanceTimersByTime(AFTER_READ_VIEW_STOP_GRACE_MS - 1);
    await settle();
    expect(departures).toEqual([]);

    jest.advanceTimersByTime(1);
    await settle();
    expect(departures).toHaveLength(1);
  });

  it('l’arrière-plan du MÊME appareil ramène la grâce d’un viewing:stop à la sienne', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker();

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStop('s-1', 'conv-1');
    await tracker.background('s-1');
    jest.advanceTimersByTime(GRACE_MS);
    await settle();

    expect(departures).toHaveLength(1);
  });

  it('AUDIT D5 — l’arrière-plan pendant un appel est retenu de même, puis libéré une grâce après la fin de l’appel', async () => {
    jest.useFakeTimers();
    const call = { live: true };
    const { tracker, departures } = buildTracker({ holdsDeparture: async () => call.live });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.background('s-1');
    jest.advanceTimersByTime(GRACE_MS + AFTER_READ_RECHECK_MS * 20);
    await settle();
    expect(departures).toEqual([]);

    call.live = false;
    jest.advanceTimersByTime(AFTER_READ_RECHECK_MS);
    await settle();
    expect(departures).toEqual([]);

    jest.advanceTimersByTime(AFTER_READ_VIEW_STOP_GRACE_MS);
    await settle();
    expect(departures).toHaveLength(1);
  });

  it('conversation:leave brûle aussitôt, même pendant un appel', async () => {
    const { tracker, departures } = buildTracker({ holdsDeparture: async () => true });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.close('s-1', 'conv-1');
    await settle();

    expect(departures).toHaveLength(1);
  });

  it('AUDIT D3 — un écran poussé 45 s (fiche, infos) puis le retour ne brûle rien', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker();

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStop('s-1', 'conv-1');
    jest.advanceTimersByTime(45_000);
    await settle();
    await tracker.viewStart('s-1', 'conv-1');
    jest.advanceTimersByTime(GRACE_MS * 10);
    await settle();

    expect(departures).toEqual([]);
  });

  it('AUDIT D6 — l’échéance se lit sur l’horloge INJECTÉE, jamais sur Date.now', async () => {
    jest.useFakeTimers();
    const { tracker, departures, clock } = buildTracker();

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStart('s-2', 'conv-1');
    await tracker.background('s-1');
    jest.advanceTimersByTime(25_000);
    clock.now = new Date(T0.getTime() - 10_000);
    await tracker.disconnecting('s-2');
    jest.advanceTimersByTime(GRACE_MS - 25_000);
    await settle();

    expect(departures).toHaveLength(1);
  });

  it('AUDIT B1 — une vérification d’appel qui lève retient le départ : une brûlure ne se rattrape pas', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker({
      holdsDeparture: async () => {
        throw new Error('mongo down');
      },
    });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStop('s-1', 'conv-1');
    jest.advanceTimersByTime(GRACE_MS * 10);
    await settle();

    expect(departures).toEqual([]);
  });

  it('AUDIT B1 — une vérification d’appel qui lève puis répond « pas d’appel » libère le départ', async () => {
    jest.useFakeTimers();
    const check = { fails: true };
    const { tracker, departures } = buildTracker({
      holdsDeparture: async () => {
        if (check.fails) throw new Error('mongo down');
        return false;
      },
    });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStop('s-1', 'conv-1');
    jest.advanceTimersByTime(AFTER_READ_VIEW_STOP_GRACE_MS + AFTER_READ_RECHECK_MS * 5);
    await settle();
    check.fails = false;
    jest.advanceTimersByTime(AFTER_READ_RECHECK_MS);
    await settle();
    jest.advanceTimersByTime(AFTER_READ_VIEW_STOP_GRACE_MS);
    await settle();

    expect(departures).toHaveLength(1);
  });

  it('AUDIT C1 — un viewing:stop ne raccourcit pas la grâce d’une déconnexion déjà armée', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker({ viewStopGraceMs: 10_000 });

    await tracker.viewStart('s-phone', 'conv-1');
    await tracker.viewStart('s-web', 'conv-1');
    await tracker.disconnecting('s-phone');
    await tracker.viewStop('s-web', 'conv-1');
    jest.advanceTimersByTime(15_000);
    await tracker.viewStart('s-phone-2', 'conv-1');
    jest.advanceTimersByTime(GRACE_MS * 10);
    await settle();

    expect(departures).toEqual([]);
  });

  it('AUDIT C2 — un départ qui échoue rend ses regards et se redemande', async () => {
    jest.useFakeTimers();
    const failures = { left: 1 };
    const { tracker, departures, clock } = buildTracker({
      onDeparture: async () => {
        if (failures.left > 0) {
          failures.left -= 1;
          throw new Error('mongo down');
        }
      },
    });

    await tracker.viewStart('s-1', 'conv-1');
    clock.now = at(2);
    await tracker.close('s-1', 'conv-1');
    await settle();
    expect(departures).toEqual([]);

    jest.advanceTimersByTime(GRACE_MS);
    await settle();
    expect(departures).toHaveLength(1);
    expect(periodsOf(departures[0])).toEqual([[T0.toISOString(), at(2).toISOString()]]);
  });

  it('AUDIT D4 — un départ refusé parce qu’un autre appareil regarde se redemande à intervalle court et fixe', async () => {
    jest.useFakeTimers();
    const elsewhere = { viewing: true };
    const { tracker, departures } = buildTracker({ viewedElsewhere: async () => elsewhere.viewing });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.close('s-1', 'conv-1');
    for (let i = 0; i < 5; i += 1) {
      jest.advanceTimersByTime(AFTER_READ_RECHECK_MS);
      await settle();
    }
    elsewhere.viewing = false;
    jest.advanceTimersByTime(AFTER_READ_RECHECK_MS);
    await settle();

    expect(departures).toHaveLength(1);
  });

  it('AUDIT C3 — une consommation en échec se redemande à intervalle DOUBLÉ', async () => {
    jest.useFakeTimers();
    const attempts: number[] = [];
    const { tracker } = buildTracker({
      onDeparture: async () => {
        attempts.push(attempts.length);
        throw new Error('mongo down');
      },
    });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.close('s-1', 'conv-1');
    await settle();
    expect(attempts).toHaveLength(1);
    jest.advanceTimersByTime(GRACE_MS);
    await settle();
    expect(attempts).toHaveLength(2);
    jest.advanceTimersByTime(GRACE_MS * 2 - 1);
    await settle();
    expect(attempts).toHaveLength(2);
    jest.advanceTimersByTime(1);
    await settle();
    expect(attempts).toHaveLength(3);
  });

  it('AUDIT C4 — un départ réussi remet le compteur d’essais à zéro', async () => {
    jest.useFakeTimers();
    const failures = { left: 3 };
    const attempts: number[] = [];
    const { tracker, departures } = buildTracker({
      onDeparture: async () => {
        attempts.push(1);
        if (failures.left > 0) {
          failures.left -= 1;
          throw new Error('mongo down');
        }
      },
    });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.close('s-1', 'conv-1');
    jest.advanceTimersByTime(GRACE_MS * 7);
    await settle();
    for (let i = 0; i < 4; i += 1) {
      jest.advanceTimersByTime(GRACE_MS * 4);
      await settle();
    }
    expect(departures).toHaveLength(1);

    failures.left = 1;
    await tracker.viewStart('s-1', 'conv-1');
    await tracker.close('s-1', 'conv-1');
    await settle();
    jest.advanceTimersByTime(GRACE_MS);
    await settle();
    expect(departures).toHaveLength(2);
  });

  it('AUDIT C3 — un autre appareil qui regarde plus d’une heure n’efface pas les regards', async () => {
    jest.useFakeTimers();
    const elsewhere = { viewing: true };
    const { tracker, departures } = buildTracker({ viewedElsewhere: async () => elsewhere.viewing });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.close('s-1', 'conv-1');
    for (let i = 0; i < 30; i += 1) {
      jest.advanceTimersByTime(AFTER_READ_MAX_RETRY_DELAY_MS);
      await settle();
    }
    elsewhere.viewing = false;
    jest.advanceTimersByTime(AFTER_READ_MAX_RETRY_DELAY_MS);
    await settle();

    expect(departures).toHaveLength(1);
  });

  it('un écran poussé puis le retour dans la conversation pendant la grâce courte ne brûle rien', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker();

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStop('s-1', 'conv-1');
    jest.advanceTimersByTime(AFTER_READ_VIEW_STOP_GRACE_MS - 1);
    await tracker.viewStart('s-1', 'conv-1');
    jest.advanceTimersByTime(GRACE_MS * 10);
    await settle();

    expect(departures).toEqual([]);
  });

  it('regarder une AUTRE conversation n’annule pas le départ de la première', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker();

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStop('s-1', 'conv-1');
    await tracker.viewStart('s-1', 'conv-2');
    jest.advanceTimersByTime(AFTER_READ_VIEW_STOP_GRACE_MS);
    await settle();

    expect(departures.map((departure) => departure.conversationId)).toEqual(['conv-1']);
  });

  it('deux regards séparés par un écran poussé donnent deux périodes, sans le trou', async () => {
    jest.useFakeTimers();
    const { tracker, departures, clock } = buildTracker();

    await tracker.viewStart('s-1', 'conv-1');
    clock.now = at(2);
    await tracker.viewStop('s-1', 'conv-1');
    clock.now = at(8);
    await tracker.viewStart('s-1', 'conv-1');
    clock.now = at(9);
    await tracker.disconnecting('s-1');
    jest.advanceTimersByTime(GRACE_MS);
    await settle();

    expect(periodsOf(departures[0])).toEqual([
      [T0.toISOString(), at(2).toISOString()],
      [at(8).toISOString(), at(9).toISOString()],
    ]);
  });

  it('quitter la conversation (conversation:leave) consomme aussitôt ce qui a été regardé', async () => {
    const { tracker, departures, clock } = buildTracker();

    await tracker.viewStart('s-1', 'conv-1');
    clock.now = at(4);
    await tracker.close('s-1', 'conv-1');
    await settle();

    expect(departures).toHaveLength(1);
    expect(periodsOf(departures[0])).toEqual([[T0.toISOString(), at(4).toISOString()]]);
  });

  it('conversation:leave sans aucun regard ne consomme rien', async () => {
    const { tracker, departures } = buildTracker();

    await tracker.close('s-1', 'conv-1');
    await settle();

    expect(departures).toEqual([]);
  });

  it('rien ne part tant qu’un autre appareil du même lecteur regarde la conversation', async () => {
    jest.useFakeTimers();
    const { tracker, departures, clock } = buildTracker();

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStart('s-2', 'conv-1');
    clock.now = at(2);
    await tracker.disconnecting('s-1');
    jest.advanceTimersByTime(GRACE_MS);
    await settle();
    expect(departures).toEqual([]);

    clock.now = at(6);
    await tracker.disconnecting('s-2');
    jest.advanceTimersByTime(GRACE_MS);
    await settle();
    expect(departures).toHaveLength(1);
    expect(periodsOf(departures[0])).toEqual([[T0.toISOString(), at(6).toISOString()]]);
  });

  it('un regard repris pendant la grâce (reconnexion, retour au premier plan) annule le départ', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker();

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.disconnecting('s-1');
    await tracker.viewStart('s-2', 'conv-1');
    jest.advanceTimersByTime(GRACE_MS);
    await settle();

    expect(departures).toEqual([]);
  });

  it('un départ refusé parce qu’un autre appareil regarde GARDE les regards : ils brûlent quand plus personne ne regarde', async () => {
    jest.useFakeTimers();
    const elsewhere = { viewing: true };
    const { tracker, departures, clock } = buildTracker({ viewedElsewhere: async () => elsewhere.viewing });

    await tracker.viewStart('s-1', 'conv-1');
    clock.now = at(2);
    await tracker.close('s-1', 'conv-1');
    await settle();
    expect(departures).toEqual([]);

    elsewhere.viewing = false;
    jest.advanceTimersByTime(GRACE_MS);
    await settle();
    expect(departures).toHaveLength(1);
    expect(periodsOf(departures[0])).toEqual([[T0.toISOString(), at(2).toISOString()]]);
  });

  it('ATTAQUE B3 — tant qu’un autre nœud voit le lecteur regarder, rien ne part', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker({ viewedElsewhere: async () => true });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStop('s-1', 'conv-1');
    jest.advanceTimersByTime(GRACE_MS * 20);
    await settle();
    await tracker.disconnecting('s-1');
    jest.advanceTimersByTime(GRACE_MS * 20);
    await settle();

    expect(departures).toEqual([]);
  });

  it('une vérification inter-nœuds qui lève ne consomme rien', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker({
      viewedElsewhere: async () => {
        throw new Error('redis down');
      },
    });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.disconnecting('s-1');
    jest.advanceTimersByTime(GRACE_MS);
    await settle();

    expect(departures).toEqual([]);
  });

  it('le regard est marqué puis démarqué pour les autres nœuds', async () => {
    const { tracker, marks } = buildTracker();

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStop('s-1', 'conv-1');

    expect(marks).toEqual([
      { socketId: 's-1', conversationId: 'conv-1', viewing: true },
      { socketId: 's-1', conversationId: 'conv-1', viewing: false },
    ]);
  });

  it('ignore un regard qu’aucun participant vivant ne porte', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker({ resolve: () => null });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.disconnecting('s-1');
    jest.advanceTimersByTime(GRACE_MS);
    await settle();

    expect(departures).toEqual([]);
  });

  it('un regard annoncé avant l’authentification est rejoué après elle', async () => {
    jest.useFakeTimers();
    const session = { authenticated: false };
    const { tracker, departures, clock } = buildTracker({
      isAuthenticated: () => session.authenticated,
      resolve: (_socketId, conversationId) => (session.authenticated ? reader({ conversationId }) : null),
    });

    await tracker.viewStart('s-1', 'conv-1');
    session.authenticated = true;
    clock.now = at(1);
    await tracker.afterAuthentication('s-1');
    clock.now = at(3);
    await tracker.disconnecting('s-1');
    jest.advanceTimersByTime(GRACE_MS);
    await settle();

    expect(periodsOf(departures[0])).toEqual([[at(1).toISOString(), at(3).toISOString()]]);
  });

  it('applique les gestes d’un socket dans l’ordre reçu, même si le regard tarde à se résoudre', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const departures: AfterReadDeparture[] = [];
    const tracker = new AfterReadDepartureTracker({
      resolveReader: async () => {
        await gate;
        return reader();
      },
      onDeparture: async (departure) => {
        departures.push(departure);
      },
      graceMs: GRACE_MS,
    });

    const starting = tracker.viewStart('s-1', 'conv-1');
    const leaving = tracker.close('s-1', 'conv-1');
    release();
    await Promise.all([starting, leaving]);
    await settle();

    expect(departures).toHaveLength(1);
  });

  it('au-delà du nombre de périodes retenues, les plus anciennes BRÛLENT, elles ne sont pas jetées', async () => {
    const { tracker, departures, clock } = buildTracker();

    for (let i = 0; i < AFTER_READ_MAX_PERIODS + 3; i += 1) {
      clock.now = at(i * 2);
      await tracker.viewStart('s-1', 'conv-1');
      clock.now = at(i * 2 + 1);
      await tracker.viewStop('s-1', 'conv-1');
    }
    await tracker.close('s-1', 'conv-1');
    await settle();

    const burned = departures.flatMap((departure) => departure.periods.map((period) => period.from.getTime()));
    expect(burned).toHaveLength(AFTER_READ_MAX_PERIODS + 3);
    expect(new Set(burned).size).toBe(AFTER_READ_MAX_PERIODS + 3);
    expect(burned).toContain(at(0).getTime());
    expect(departures.every((departure) => departure.periods.length <= AFTER_READ_MAX_PERIODS)).toBe(true);
  });

  it('des regards évincés dont la brûlure échoue se redemandent, jamais jetés', async () => {
    jest.useFakeTimers();
    const base = { down: true };
    const { tracker, departures, clock } = buildTracker({
      onDeparture: async () => {
        if (base.down) throw new Error('mongo down');
      },
    });

    for (let i = 0; i < AFTER_READ_MAX_PERIODS + 1; i += 1) {
      clock.now = at(i * 2);
      await tracker.viewStart('s-1', 'conv-1');
      clock.now = at(i * 2 + 1);
      await tracker.viewStop('s-1', 'conv-1');
    }
    await tracker.viewStart('s-1', 'conv-1');
    await settle();
    base.down = false;
    jest.advanceTimersByTime(AFTER_READ_MAX_RETRY_DELAY_MS);
    await settle();

    const burned = departures.flatMap((departure) => departure.periods.map((period) => period.from.getTime()));
    expect(burned).toContain(at(0).getTime());
  });

  it('un départ qui échoue ne lève pas', async () => {
    const errors: unknown[] = [];
    const tracker = new AfterReadDepartureTracker({
      resolveReader: async () => reader(),
      onDeparture: async () => {
        throw new Error('mongo down');
      },
      graceMs: GRACE_MS,
      onError: (error) => errors.push(error),
    });

    await tracker.viewStart('s-1', 'conv-1');
    await expect(tracker.close('s-1', 'conv-1')).resolves.toBeUndefined();
    await settle();

    expect(errors).toHaveLength(1);
  });
});

describe('AfterReadDepartureTracker — les événements du socket', () => {
  function fakeSocket(id: string) {
    const handlers = new Map<string, (data: unknown) => void>();
    const socket = {
      id,
      on: (event: string, handler: (data: unknown) => void) => {
        handlers.set(event, handler);
        return socket;
      },
    };
    const fire = (event: string, data: unknown) => handlers.get(event)?.(data);
    return { socket, fire };
  }

  it('le passage en arrière-plan iOS (viewing:stop puis app-state) consomme après la grâce, pas avant', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker();
    const { socket, fire } = fakeSocket('s-1');
    tracker.listen(socket as never);

    fire('viewing:start', { conversationId: 'conv-1' });
    await settle();
    fire('viewing:stop', { conversationId: 'conv-1' });
    fire('presence:app-state', { foreground: false });
    await settle();
    expect(departures).toEqual([]);

    jest.advanceTimersByTime(GRACE_MS);
    await settle();
    expect(departures).toHaveLength(1);
  });

  it('un retour au premier plan sans arrière-plan déclaré ne déclenche rien', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker();
    const { socket, fire } = fakeSocket('s-1');
    tracker.listen(socket as never);

    fire('viewing:start', { conversationId: 'conv-1' });
    fire('presence:app-state', { foreground: true });
    await settle();
    jest.advanceTimersByTime(GRACE_MS);
    await settle();

    expect(departures).toEqual([]);
  });

  it('une charge sans conversationId est ignorée', async () => {
    const { tracker, marks } = buildTracker();
    const { socket, fire } = fakeSocket('s-1');
    tracker.listen(socket as never);

    fire('viewing:start', {});
    fire('viewing:start', null);
    await settle();

    expect(marks).toEqual([]);
  });
});

describe('AfterReadDepartureTracker — aucune retenue n’est éternelle : au plafond, on BRÛLE (#18556, revue de sécurité)', () => {
  afterEach(() => jest.useRealTimers());

  it('un appel actif au-delà du plafond brûle : grâce d’origine + AFTER_READ_MAX_HOLD_MS au plus', async () => {
    jest.useFakeTimers({ now: T0 });
    const { tracker, departures } = buildTracker({ holdsDeparture: async () => true, followTimers: true });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStop('s-1', 'conv-1');
    await elapse(AFTER_READ_VIEW_STOP_GRACE_MS + AFTER_READ_MAX_HOLD_MS - AFTER_READ_RECHECK_MS);
    expect(departures).toEqual([]);

    await elapse(AFTER_READ_RECHECK_MS * 2);
    expect(departures).toHaveLength(1);
  });

  it('l’arrière-plan pendant un appel interminable (CallKit, écran verrouillé) brûle au même plafond', async () => {
    jest.useFakeTimers({ now: T0 });
    const { tracker, departures } = buildTracker({ holdsDeparture: async () => true, followTimers: true });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.background('s-1');
    await elapse(GRACE_MS + AFTER_READ_MAX_HOLD_MS + AFTER_READ_RECHECK_MS);

    expect(departures).toHaveLength(1);
  });

  it('une vérification d’appel qui lève en continu brûle après le plafond', async () => {
    jest.useFakeTimers({ now: T0 });
    const { tracker, departures } = buildTracker({
      holdsDeparture: async () => {
        throw new Error('mongo down');
      },
      followTimers: true,
    });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.background('s-1');
    await elapse(GRACE_MS + AFTER_READ_MAX_HOLD_MS - AFTER_READ_RECHECK_MS);
    expect(departures).toEqual([]);

    await elapse(AFTER_READ_RECHECK_MS * 2);
    expect(departures).toHaveLength(1);
  });

  it('un autre appareil qui regarde sans fin ne retient les flammes que jusqu’au plafond', async () => {
    jest.useFakeTimers({ now: T0 });
    const { tracker, departures } = buildTracker({ viewedElsewhere: async () => true, followTimers: true });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.close('s-1', 'conv-1');
    await elapse(AFTER_READ_MAX_HOLD_MS - AFTER_READ_RECHECK_MS);
    expect(departures).toEqual([]);

    await elapse(AFTER_READ_RECHECK_MS * 2);
    expect(departures).toHaveLength(1);
  });

  it('une vérification inter-nœuds qui lève en continu brûle après le plafond', async () => {
    jest.useFakeTimers({ now: T0 });
    const { tracker, departures } = buildTracker({
      viewedElsewhere: async () => {
        throw new Error('redis down');
      },
      followTimers: true,
    });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.disconnecting('s-1');
    await elapse(GRACE_MS + AFTER_READ_MAX_HOLD_MS - AFTER_READ_RECHECK_MS, 1_000);
    expect(departures).toEqual([]);

    await elapse(AFTER_READ_RECHECK_MS, 1_000);
    expect(departures).toHaveLength(1);
  });

  it('une consommation en échec au-delà des redemandes n’est jamais oubliée : elle brûle quand la base revient', async () => {
    jest.useFakeTimers({ now: T0 });
    const base = { down: true };
    let attempts = 0;
    const { tracker, departures } = buildTracker({
      onDeparture: async () => {
        attempts += 1;
        if (base.down) throw new Error('mongo down');
      },
      followTimers: true,
    });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.close('s-1', 'conv-1');
    for (let i = 0; i < 320; i += 1) {
      jest.advanceTimersByTime(AFTER_READ_MAX_RETRY_DELAY_MS);
      await settle();
    }
    expect(attempts).toBeGreaterThan(300);

    base.down = false;
    jest.advanceTimersByTime(AFTER_READ_MAX_RETRY_DELAY_MS);
    await settle();
    expect(departures).toHaveLength(1);
  });

  it('AUDIT 4.1 — un arrière-plan répété pendant un appel ne repousse pas le plafond', async () => {
    jest.useFakeTimers({ now: T0 });
    const { tracker, departures } = buildTracker({ holdsDeparture: async () => true, followTimers: true });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.background('s-1');
    for (let t = 0; t < GRACE_MS + AFTER_READ_MAX_HOLD_MS + 2 * AFTER_READ_RECHECK_MS; t += 25_000) {
      await elapse(25_000, 5_000);
      await tracker.background('s-1');
    }

    expect(departures).toHaveLength(1);
  });

  it('AUDIT 4.1 — sans appel, un arrière-plan répété par la même socket ne repousse pas sa grâce', async () => {
    jest.useFakeTimers({ now: T0 });
    const { tracker, departures } = buildTracker({ followTimers: true });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.background('s-1');
    await elapse(20_000, 5_000);
    await tracker.background('s-1');
    await elapse(GRACE_MS - 20_000, 5_000);

    expect(departures).toHaveLength(1);
  });

  it('AUDIT 4.1 — un autre appareil qui part juste avant le plafond ne le repousse pas', async () => {
    jest.useFakeTimers({ now: T0 });
    const { tracker, departures } = buildTracker({ holdsDeparture: async () => true, followTimers: true });

    await tracker.viewStart('s-2', 'conv-1');
    await tracker.viewStop('s-2', 'conv-1');
    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStop('s-1', 'conv-1');
    await elapse(AFTER_READ_VIEW_STOP_GRACE_MS + AFTER_READ_MAX_HOLD_MS - 2_000, 1_000);
    expect(departures).toEqual([]);

    await tracker.disconnecting('s-2');
    await elapse(3_000, 1_000);
    expect(departures).toHaveLength(1);
  });

  it('AUDIT 4.3 — une conversation évincée du registre de la socket BRÛLE, elle n’est pas oubliée', async () => {
    jest.useFakeTimers({ now: T0 });
    const { tracker, departures } = buildTracker({ holdsDeparture: async () => true, followTimers: true });

    await tracker.viewStart('s-1', 'conv-0');
    await tracker.viewStop('s-1', 'conv-0');
    for (let i = 1; i <= AFTER_READ_MAX_TOUCHED; i += 1) {
      await tracker.viewStart('s-1', `conv-${i}`);
      await tracker.viewStop('s-1', `conv-${i}`);
    }
    await elapse(AFTER_READ_VIEW_STOP_GRACE_MS + AFTER_READ_MAX_HOLD_MS + 2 * AFTER_READ_RECHECK_MS, 10_000);

    expect(departures.map((departure) => departure.conversationId)).toContain('conv-0');
  });

  it('AUDIT 4.4 — une sortie déclarée qui échoue se redemande sans qu’un appel la retienne', async () => {
    jest.useFakeTimers({ now: T0 });
    const failures = { left: 1 };
    const { tracker, departures } = buildTracker({
      holdsDeparture: async () => true,
      onDeparture: async () => {
        if (failures.left > 0) {
          failures.left -= 1;
          throw new Error('mongo down');
        }
      },
      followTimers: true,
    });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.close('s-1', 'conv-1');
    await elapse(GRACE_MS + 1_000, 1_000);

    expect(departures).toHaveLength(1);
  });

  it('après le plafond, une consommation qui échoue se redemande SANS que l’appel la retienne de nouveau', async () => {
    jest.useFakeTimers({ now: T0 });
    const failures = { left: 1 };
    const { tracker, departures } = buildTracker({
      holdsDeparture: async () => true,
      onDeparture: async () => {
        if (failures.left > 0) {
          failures.left -= 1;
          throw new Error('mongo down');
        }
      },
      followTimers: true,
    });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.background('s-1');
    await elapse(GRACE_MS + AFTER_READ_MAX_HOLD_MS + AFTER_READ_RECHECK_MS, 1_000);
    expect(departures).toEqual([]);

    await elapse(GRACE_MS + 1_000, 1_000);
    expect(departures).toHaveLength(1);
  });

  it.each([
    ['sans appel', async () => false],
    ['pendant un appel', async () => true],
  ])('AUDIT 4.1 — deux appareils qui alternent l’arrière-plan ne repoussent pas le plafond (%s)', async (_label, holds) => {
    jest.useFakeTimers({ now: T0 });
    const { tracker, departures } = buildTracker({ holdsDeparture: holds, followTimers: true });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStart('s-2', 'conv-1');
    await tracker.background('s-1');
    await tracker.background('s-2');
    for (let t = 0, turn = 0; t < GRACE_MS + AFTER_READ_MAX_HOLD_MS + 2 * AFTER_READ_RECHECK_MS; t += 25_000, turn += 1) {
      await elapse(25_000, 5_000);
      await tracker.background(turn % 2 === 0 ? 's-1' : 's-2');
    }

    expect(departures).toHaveLength(1);
  });

  it.each([
    ['sans appel', async () => false],
    ['pendant un appel décroché', async () => true],
  ])('AUDIT H — une vieille socket qui part pendant que la nouvelle regarde n’ancre aucun plafond (%s)', async (_label, holds) => {
    jest.useFakeTimers({ now: T0 });
    const { tracker, departures } = buildTracker({ holdsDeparture: holds, followTimers: true });

    await tracker.viewStart('s-old', 'conv-1');
    await tracker.viewStart('s-new', 'conv-1');
    await tracker.disconnecting('s-old');
    await elapse(15 * 60_000, 30_000);
    await tracker.viewStop('s-new', 'conv-1');
    await elapse(AFTER_READ_VIEW_STOP_GRACE_MS - 1_000, 1_000);

    expect(departures).toEqual([]);
  });
});

describe('AfterReadDepartureTracker — le débordement des regards reste borné en mémoire (#18556, revue)', () => {
  afterEach(() => jest.useRealTimers());

  function failingBase() {
    const base = { down: true };
    const attempts: AfterReadDeparture[] = [];
    const built = buildTracker({
      onDeparture: async (departure) => {
        attempts.push(departure);
        if (base.down) throw new Error('mongo down');
      },
    });
    return { ...built, base, attempts };
  }

  async function cycles(
    tracker: AfterReadDepartureTracker,
    clock: { now: Date },
    count: number,
  ): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      clock.now = at(i * 2);
      await tracker.viewStart('s-1', 'conv-1');
      clock.now = at(i * 2 + 1);
      await tracker.viewStop('s-1', 'conv-1');
      await settle();
    }
  }

  it('pendant une panne, au plus UNE brûlure de débordement est en vol par clé', async () => {
    jest.useFakeTimers();
    const { tracker, clock, attempts } = failingBase();

    await cycles(tracker, clock, AFTER_READ_MAX_PERIODS * 4);

    expect(attempts).toHaveLength(1);
  });

  it('les débordements fusionnés brûlent en un départ borné quand la base revient, sans rien perdre', async () => {
    jest.useFakeTimers();
    const { tracker, clock, base, departures } = failingBase();

    await cycles(tracker, clock, AFTER_READ_MAX_PERIODS * 4);
    await tracker.viewStart('s-1', 'conv-1');
    base.down = false;
    for (let i = 0; i < 12; i += 1) {
      jest.advanceTimersByTime(AFTER_READ_MAX_RETRY_DELAY_MS);
      await settle();
    }

    expect(departures.every((departure) => departure.periods.length <= AFTER_READ_MAX_PERIODS)).toBe(true);
    const covered = (instant: Date) =>
      departures.some((departure) =>
        departure.periods.some((period) => period.from <= instant && instant <= period.to),
      );
    const overflowed = Array.from({ length: AFTER_READ_MAX_PERIODS * 3 }, (_unused, i) => at(i * 2));
    expect(overflowed.every(covered)).toBe(true);
  });

  it('une brûlure de débordement en échec se redemande à intervalle DOUBLÉ', async () => {
    jest.useFakeTimers();
    const { tracker, clock, attempts } = failingBase();

    await cycles(tracker, clock, AFTER_READ_MAX_PERIODS + 1);
    await tracker.viewStart('s-1', 'conv-1');
    jest.advanceTimersByTime(GRACE_MS);
    await settle();
    expect(attempts).toHaveLength(2);
    jest.advanceTimersByTime(GRACE_MS * 2 - 1);
    await settle();
    expect(attempts).toHaveLength(2);
    jest.advanceTimersByTime(1);
    await settle();
    expect(attempts).toHaveLength(3);
  });

  it('au-delà de AFTER_READ_VIEW_STARTS_PER_MINUTE par socket, un viewing:start n’ouvre plus de regard', async () => {
    const { tracker, marks } = buildTracker();

    for (let i = 0; i < AFTER_READ_VIEW_STARTS_PER_MINUTE + 5; i += 1) {
      await tracker.viewStart('s-1', 'conv-1');
      await tracker.viewStop('s-1', 'conv-1');
    }

    expect(marks.filter((mark) => mark.viewing)).toHaveLength(AFTER_READ_VIEW_STARTS_PER_MINUTE);
  });

  it('AUDIT K — tant que la borne n’est pas atteinte, une panne ne fusionne aucun trou : rien de non regardé ne brûle', async () => {
    jest.useFakeTimers();
    const { tracker, clock, base, departures } = failingBase();

    await cycles(tracker, clock, AFTER_READ_MAX_PERIODS * 4);
    await tracker.viewStart('s-1', 'conv-1');
    base.down = false;
    for (let i = 0; i < 12; i += 1) {
      jest.advanceTimersByTime(AFTER_READ_MAX_RETRY_DELAY_MS);
      await settle();
    }

    const periods = departures.flatMap((departure) => departure.periods);
    expect(periods.every((period) => period.to.getTime() - period.from.getTime() <= 60_000)).toBe(true);
  });

  it('AUDIT L — une socket dont aucun regard ne s’est résolu ne laisse rien derrière sa déconnexion', async () => {
    const { tracker } = buildTracker({ resolve: () => null });

    await tracker.viewStart('s-ghost', 'conv-1');
    await tracker.disconnecting('s-ghost');

    const internals = tracker as unknown as { viewStarts: ReadonlyMap<string, unknown> };
    expect(internals.viewStarts.size).toBe(0);
  });

  it('ÉQUITÉ — un lecteur A qui sature le budget global ne fait pas fusionner la clé d’un lecteur B', async () => {
    jest.useFakeTimers();
    const base = { down: true };
    const departures: AfterReadDeparture[] = [];
    const clock = { now: T0 };
    const tracker = new AfterReadDepartureTracker({
      resolveReader: async (socketId, conversationId) => ({
        conversationId,
        participantId: `p-${socketId}`,
        readerKey: socketId === 's-b' ? 'u-b' : 'u-a',
      }),
      onDeparture: async (departure) => {
        if (base.down) throw new Error('mongo down');
        departures.push(departure);
      },
      graceMs: GRACE_MS,
      now: () => clock.now,
      overflowLimits: { perKey: 4, perReader: 6, total: 8 },
    });
    const watch = async (socketId: string, conversationId: string, count: number, offset: number) => {
      for (let i = 0; i < count; i += 1) {
        clock.now = at((offset + i) * 2);
        await tracker.viewStart(socketId, conversationId);
        clock.now = at((offset + i) * 2 + 1);
        await tracker.viewStop(socketId, conversationId);
        await settle();
      }
    };

    await watch('s-a', 'conv-a1', AFTER_READ_MAX_PERIODS + 6, 0);
    await watch('s-a', 'conv-a2', AFTER_READ_MAX_PERIODS + 6, 100);
    await watch('s-b', 'conv-b', AFTER_READ_MAX_PERIODS + 3, 200);
    base.down = false;
    for (let i = 0; i < 12; i += 1) {
      jest.advanceTimersByTime(AFTER_READ_MAX_RETRY_DELAY_MS);
      await settle();
    }

    const burnedForB = departures.filter((departure) => departure.readerKey === 'u-b').flatMap((d) => d.periods);
    expect(burnedForB.length).toBeGreaterThan(0);
    expect(burnedForB.every((period) => period.to.getTime() - period.from.getTime() <= 60_000)).toBe(true);
  });

  it('au-delà de AFTER_READ_VIEW_STARTS_PER_USER_PER_MINUTE par UTILISATEUR, plusieurs sockets n’ouvrent plus de regard', async () => {
    const { tracker, marks } = buildTracker({ userOf: () => 'u-1' });

    for (const socketId of ['s-1', 's-2', 's-3']) {
      for (let i = 0; i < AFTER_READ_VIEW_STARTS_PER_MINUTE; i += 1) {
        await tracker.viewStart(socketId, 'conv-1');
        await tracker.viewStop(socketId, 'conv-1');
      }
    }

    expect(marks.filter((mark) => mark.viewing)).toHaveLength(AFTER_READ_VIEW_STARTS_PER_USER_PER_MINUTE);
  });

  it('ÉQUITÉ — à égalité de charge, c’est la file la plus RÉCENTE qui se resserre, jamais le lecteur arrivé avant', async () => {
    jest.useFakeTimers({ now: T0 });
    const tracker = new AfterReadDepartureTracker({
      resolveReader: async () => null,
      onDeparture: async () => {
        throw new Error('mongo down');
      },
      overflowLimits: { perKey: 4, perReader: 4, total: 8 },
    });
    const internals = tracker as unknown as {
      burnOverflow: (reader: AfterReadReader, periods: readonly AfterReadPeriod[]) => void;
      overflows: ReadonlyMap<string, { periods: readonly AfterReadPeriod[] }>;
    };
    const fourLooks = () =>
      Array.from({ length: 4 }, (_unused, i) => ({ from: at(i), to: new Date(at(i).getTime() + 1_000) }));

    internals.burnOverflow({ conversationId: 'c-b', participantId: 'p-b', readerKey: 'u-b' }, fourLooks());
    await settle();
    internals.burnOverflow({ conversationId: 'c-a1', participantId: 'p-a1', readerKey: 'u-a1' }, fourLooks());
    internals.burnOverflow({ conversationId: 'c-a2', participantId: 'p-a2', readerKey: 'u-a2' }, fourLooks());
    await settle();

    expect(internals.overflows.get('u-b\u0000c-b')?.periods).toHaveLength(4);
  });
});

