/**
 * #18556 — « si l'interlocuteur lit le message et quitte, le message se
 * détruit devant nos yeux ». Le client appelle la consommation en sortant ;
 * quand il ne le peut pas (app tuée, réseau coupé), le serveur constate le
 * départ lui-même.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { AfterReadDepartureTracker, type AfterReadReader } from '../AfterReadDepartureTracker';

const GRACE_MS = 30_000;

function reader(overrides: Partial<AfterReadReader> = {}): AfterReadReader {
  return { conversationId: 'conv-1', participantId: 'p-reader', readerKey: 'u-reader', ...overrides };
}

function buildTracker(resolve: (socketId: string, conversationId: string) => AfterReadReader | null = () => reader()) {
  const departures: AfterReadReader[] = [];
  const openings: Date[] = [];
  const clock = { now: new Date('2026-11-14T12:00:00.000Z') };
  const tracker = new AfterReadDepartureTracker({
    resolveReader: async (socketId, conversationId) => resolve(socketId, conversationId),
    onDeparture: async ({ openedAt, ...departure }) => {
      departures.push(departure);
      openings.push(openedAt);
    },
    graceMs: GRACE_MS,
    now: () => clock.now,
  });
  return { tracker, departures, openings, clock };
}

const settle = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

afterEach(() => {
  jest.useRealTimers();
});

describe('AfterReadDepartureTracker (#18556)', () => {
  it('quitter la conversation la consomme aussitôt', async () => {
    const { tracker, departures } = buildTracker();

    await tracker.open('s-1', 'conv-1');
    await tracker.close('s-1', 'conv-1');
    await settle();

    expect(departures).toEqual([reader()]);
  });

  it('rien ne part tant qu’un autre appareil du même lecteur a la conversation ouverte', async () => {
    const { tracker, departures } = buildTracker();

    await tracker.open('s-1', 'conv-1');
    await tracker.open('s-2', 'conv-1');
    await tracker.close('s-1', 'conv-1');
    await settle();
    expect(departures).toEqual([]);

    await tracker.close('s-2', 'conv-1');
    await settle();
    expect(departures).toEqual([reader()]);
  });

  it('une conversation jamais ouverte ne se consomme pas', async () => {
    const { tracker, departures } = buildTracker();

    await tracker.close('s-1', 'conv-1');
    await tracker.disconnecting('s-1');
    await settle();

    expect(departures).toEqual([]);
  });

  it('une déconnexion consomme après la grâce, pas avant', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker();

    await tracker.open('s-1', 'conv-1');
    await tracker.disconnecting('s-1');
    await settle();
    expect(departures).toEqual([]);

    jest.advanceTimersByTime(GRACE_MS);
    await settle();
    expect(departures).toEqual([reader()]);
  });

  it('une reconnexion qui rouvre la conversation pendant la grâce annule la consommation', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker();

    await tracker.open('s-1', 'conv-1');
    await tracker.disconnecting('s-1');
    await tracker.open('s-2', 'conv-1');
    jest.advanceTimersByTime(GRACE_MS);
    await settle();

    expect(departures).toEqual([]);
  });

  it('le passage en arrière-plan suit la grâce de la déconnexion', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker();

    await tracker.open('s-1', 'conv-1');
    await tracker.background('s-1');
    await settle();
    expect(departures).toEqual([]);

    jest.advanceTimersByTime(GRACE_MS);
    await settle();
    expect(departures).toEqual([reader()]);
  });

  it('ignore une ouverture qu’aucun participant vivant ne porte', async () => {
    const { tracker, departures } = buildTracker(() => null);

    await tracker.open('s-1', 'conv-1');
    await tracker.close('s-1', 'conv-1');
    await settle();

    expect(departures).toEqual([]);
  });

  it('applique les gestes d’un socket dans l’ordre reçu, même si l’ouverture tarde à se résoudre', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const departures: AfterReadReader[] = [];
    const tracker = new AfterReadDepartureTracker({
      resolveReader: async () => {
        await gate;
        return reader();
      },
      onDeparture: async ({ openedAt: _openedAt, ...departure }) => {
        departures.push(departure);
      },
      graceMs: GRACE_MS,
    });

    const opening = tracker.open('s-1', 'conv-1');
    const closing = tracker.close('s-1', 'conv-1');
    release();
    await Promise.all([opening, closing]);
    await settle();

    expect(departures).toEqual([reader()]);
  });

  it('le départ porte l’instant de la PREMIÈRE ouverture de la période', async () => {
    const { tracker, openings, clock } = buildTracker();
    const first = clock.now;

    await tracker.open('s-1', 'conv-1');
    clock.now = new Date('2026-11-14T12:05:00.000Z');
    await tracker.open('s-2', 'conv-1');
    await tracker.close('s-1', 'conv-1');
    await tracker.close('s-2', 'conv-1');
    await settle();

    expect(openings).toEqual([first]);
  });

  it('viewing:stop sans room tenue est un départ soumis à la grâce, annulé par un viewing:start', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker();

    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStop('s-1', 'conv-1');
    await tracker.viewStart('s-2', 'conv-1');
    jest.advanceTimersByTime(GRACE_MS);
    await settle();
    expect(departures).toEqual([]);

    await tracker.viewStop('s-2', 'conv-1');
    jest.advanceTimersByTime(GRACE_MS);
    await settle();
    expect(departures).toEqual([reader()]);
  });

  it('une room tenue par un appareil en arrière-plan ne retient pas le départ', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker();

    await tracker.open('s-1', 'conv-1');
    await tracker.viewStart('s-1', 'conv-1');
    await tracker.viewStop('s-1', 'conv-1');
    await tracker.background('s-1');
    jest.advanceTimersByTime(GRACE_MS);
    await settle();

    expect(departures).toEqual([reader()]);
  });

  it('un retour au premier plan (viewing:start) pendant la grâce annule le départ', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker();

    await tracker.open('s-1', 'conv-1');
    await tracker.background('s-1');
    await tracker.viewStart('s-1', 'conv-1');
    jest.advanceTimersByTime(GRACE_MS);
    await settle();

    expect(departures).toEqual([]);
  });

  it('un départ qui échoue ne lève pas', async () => {
    const tracker = new AfterReadDepartureTracker({
      resolveReader: async () => reader(),
      onDeparture: async () => {
        throw new Error('mongo down');
      },
      graceMs: GRACE_MS,
    });

    await tracker.open('s-1', 'conv-1');
    await expect(tracker.close('s-1', 'conv-1')).resolves.toBeUndefined();
    await settle();
  });
});

// PREUVE D'AUDIT (auditeur adversarial, #18556) — iOS émet `viewing:stop`
// quand un écran est poussé par-dessus la conversation (#9052), quand l'écran
// d'appel s'affiche, et quand l'app passe en arrière-plan
// (`ConversationViewingReporter.transition`), SANS `conversation:leave`. Le
// registre range `conversation:join` et `viewing:start` sous la MÊME clé : le
// `viewing:stop` ferme donc la conversation que la room tient encore ouverte,
// et consomme AUSSITÔT — sans la grâce de 30 s de l'arrière-plan.
describe('PREUVE — viewing:stop seul ne dit pas « a quitté la conversation »', () => {
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

  it('un écran poussé (viewing:stop) sans conversation:leave ne consomme pas', async () => {
    const { tracker, departures } = buildTracker();
    const { socket, fire } = fakeSocket('s-1');
    tracker.listen(socket as never);

    fire('conversation:join', { conversationId: 'conv-1' });
    fire('viewing:start', { conversationId: 'conv-1' });
    await settle();
    fire('viewing:stop', { conversationId: 'conv-1' });
    await settle();

    expect(departures).toEqual([]);
  });

  it('le passage en arrière-plan iOS (viewing:stop puis app-state) garde sa grâce', async () => {
    jest.useFakeTimers();
    const { tracker, departures } = buildTracker();
    const { socket, fire } = fakeSocket('s-1');
    tracker.listen(socket as never);

    fire('conversation:join', { conversationId: 'conv-1' });
    fire('viewing:start', { conversationId: 'conv-1' });
    await settle();
    fire('viewing:stop', { conversationId: 'conv-1' });
    fire('presence:app-state', { foreground: false });
    await settle();

    expect(departures).toEqual([]);
  });
});
