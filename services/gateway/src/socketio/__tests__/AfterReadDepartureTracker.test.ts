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
  type AfterReadDeparture,
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
    markViewing: (socketId, marked, viewing) => marks.push({ socketId, conversationId: marked.conversationId, viewing }),
    graceMs: GRACE_MS,
    now: () => clock.now,
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

  it('quitter la conversation en restant connecté (viewing:stop, socket vivante) consomme après la grâce courte', async () => {
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

  it('AUDIT B1 — un appel en cours dans la conversation retient le départ du viewing:stop', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker({ holdsDeparture: async () => true });

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStop('s-1', 'conv-1');
    jest.advanceTimersByTime(GRACE_MS * 10);
    await settle();
    expect(departures).toEqual([]);

    await tracker.disconnecting('s-1');
    jest.advanceTimersByTime(GRACE_MS);
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

  it('AUDIT C1 — un viewing:stop ne raccourcit pas la grâce d’une déconnexion déjà armée', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker();

    await tracker.viewStart('s-phone', 'conv-1');
    await tracker.viewStart('s-web', 'conv-1');
    await tracker.disconnecting('s-phone');
    await tracker.viewStop('s-web', 'conv-1');
    jest.advanceTimersByTime(AFTER_READ_VIEW_STOP_GRACE_MS + 5_000);
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

  it('borne le nombre de périodes retenues : les plus anciennes sont oubliées', async () => {
    const { tracker, departures, clock } = buildTracker();

    for (let i = 0; i < AFTER_READ_MAX_PERIODS + 3; i += 1) {
      clock.now = at(i * 2);
      await tracker.viewStart('s-1', 'conv-1');
      clock.now = at(i * 2 + 1);
      await tracker.viewStop('s-1', 'conv-1');
    }
    await tracker.close('s-1', 'conv-1');
    await settle();

    expect(departures[0].periods).toHaveLength(AFTER_READ_MAX_PERIODS);
    expect(departures[0].periods[0].from).toEqual(at(6));
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
