import { describe, expect, test } from 'bun:test';

import type { SharedLocationFix, SharedLocationStartPayload, SharedLocationVerdict } from './shared-location-sending';
import {
  createSharedLocationSharingCenter,
  SHARED_LOCATION_RETRY_MS,
  type SharedLocationEmitter,
  type SharedLocationFixResult,
  type SharedLocationFixSource,
} from './shared-location-sharing';
import { decodeSharedLocationRoster, EMPTY_ROSTER, encodeSharedLocationRoster, rosterOps } from './shared-location-roster';

/**
 * **MON PARTAGE DE POSITION, SUR CET ONGLET** (#18345, iso `SharedLocationSharingCenter.swift`
 * et ses lois de révocation, #18166) : un verrou sérialise démarrages, arrêts, échéances et
 * mises à jour ; une réponse arrivée après le changement de compte n'adopte rien ; sans
 * relevé, retirer une personne ARRÊTE tout ; un accusé perdu garde « Arrêter » pour l'union ;
 * une échéance non soldée est rejouée.
 */

const AMI = 'a'.repeat(24);
const AUTRE = 'b'.repeat(24);
const OWNER = 'c'.repeat(24);
const T0 = Date.parse('2026-11-14T08:00:00.000Z');
const HOUR = 3_600_000;
const PARIS: SharedLocationFix = { latitude: 48.8566, longitude: 2.3522, accuracy: 12 };
const STARTED: SharedLocationVerdict = { kind: 'started', expiresAt: T0 + HOUR };

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

function makeWorld({
  fix = { kind: 'fix', fix: PARIS } as SharedLocationFixResult,
  stored = null as string | null,
  granted = true,
  memory = new Map<string, string>(),
}: { readonly fix?: SharedLocationFixResult; readonly stored?: string | null; readonly granted?: boolean; readonly memory?: Map<string, string> } = {}) {
  const clock = { now: T0 };
  const account = { current: OWNER as string | null };
  const starts: SharedLocationStartPayload[] = [];
  const updates: SharedLocationFix[] = [];
  let stops = 0;
  const startQueue: Array<() => Promise<SharedLocationVerdict>> = [];
  const stopQueue: Array<() => Promise<boolean>> = [];
  const updateQueue: Array<() => Promise<SharedLocationVerdict>> = [];
  const emitter: SharedLocationEmitter = {
    start: (payload) => {
      starts.push(payload);
      return (startQueue.shift() ?? (async () => STARTED))();
    },
    update: (next) => {
      updates.push(next);
      return (updateQueue.shift() ?? (async () => STARTED))();
    },
    stop: () => {
      stops += 1;
      return (stopQueue.shift() ?? (async () => true))();
    },
  };
  const source = { result: fix, granted, prompts: 0, following: 0, listener: null as ((fix: SharedLocationFix) => void) | null };
  const fixes: SharedLocationFixSource = {
    isGranted: async () => source.granted,
    currentFix: async () => {
      source.prompts += 1;
      return source.result;
    },
    follow: (onFix) => {
      source.following += 1;
      source.listener = onFix;
      return () => {
        source.following -= 1;
        source.listener = null;
      };
    },
  };
  if (stored !== null) memory.set('roster', stored);
  const timers: Array<{ at: number; run: () => void; cancelled: boolean }> = [];
  const center = createSharedLocationSharingCenter({
    emitter,
    fixes,
    storage: {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => void memory.set(key, value),
      removeItem: (key) => void memory.delete(key),
    },
    storageKey: 'roster',
    now: () => clock.now,
    schedule: (delay, run) => {
      const timer = { at: clock.now + delay, run, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    owner: OWNER,
    currentAccount: () => account.current,
  });
  const advance = async (ms: number): Promise<void> => {
    clock.now += ms;
    const due = timers.filter((t) => !t.cancelled && t.at <= clock.now);
    due.forEach((t) => {
      t.cancelled = true;
      t.run();
    });
    await flush();
  };
  return {
    center,
    clock,
    account,
    starts,
    updates,
    stops: () => stops,
    startQueue,
    stopQueue,
    updateQueue,
    source,
    memory,
    stored: () => decodeSharedLocationRoster(memory.get('roster') ?? null),
    advance,
  };
}

describe('partager', () => {
  test('partager avec un Ami publie la liste entière, suit la position et garde la liste', async () => {
    const world = makeWorld();
    expect(await world.center.share({ userId: AMI, precision: 'neighborhood', durationMinutes: 60 })).toBeNull();
    expect(world.starts).toEqual([{ recipients: [{ userId: AMI, precision: 'neighborhood' }], durationMinutes: 60, position: PARIS }]);
    expect(world.center.entry(AMI)).toEqual({ precision: 'neighborhood', until: T0 + HOUR });
    expect(world.source.following).toBe(1);
    expect(rosterOps.entry(world.stored(), AMI)?.precision).toBe('neighborhood');
  });

  test('sans permission, rien ne part et la raison se dit', async () => {
    const world = makeWorld({ fix: { kind: 'denied' } });
    expect(await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 })).toBe('location-denied');
    expect(world.starts).toHaveLength(0);
  });

  test('un refus serveur n’adopte rien', async () => {
    const world = makeWorld();
    world.startQueue.push(async () => ({ kind: 'refused', outcome: 'rate-limited' }));
    expect(await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 })).toBe('rate-limited');
    expect(world.center.entry(AMI)).toBeNull();
  });

  test('un second Ami s’ajoute à la liste, chacun garde son échéance', async () => {
    const world = makeWorld();
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    await world.center.share({ userId: AUTRE, precision: 'exact', durationMinutes: 480 });
    expect(world.starts[1]?.recipients).toEqual([
      { userId: AMI, precision: 'city' },
      { userId: AUTRE, precision: 'exact' },
    ]);
    expect(world.starts[1]?.durationMinutes).toBe(480);
    expect(world.center.entry(AMI)?.until).toBe(T0 + HOUR);
  });
});

describe('arrêter', () => {
  test('arrêter le seul partage émet location:share-stop et vide la liste', async () => {
    const world = makeWorld();
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    expect(await world.center.stopSharing(AMI)).toBeNull();
    expect(world.stops()).toBe(1);
    expect(world.center.entry(AMI)).toBeNull();
    expect(world.source.following).toBe(0);
    expect(world.stored()).toEqual(EMPTY_ROSTER);
  });

  test('arrêter une personne republie les autres avec la dernière position envoyée', async () => {
    const world = makeWorld();
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    await world.center.share({ userId: AUTRE, precision: 'city', durationMinutes: 60 });
    world.source.result = { kind: 'denied' };
    await world.center.stopSharing(AMI);
    expect(world.starts.at(-1)?.recipients).toEqual([{ userId: AUTRE, precision: 'city' }]);
    expect(world.center.entry(AMI)).toBeNull();
  });


  test('sans relevé (liste reprise d’un rechargement, permission retirée), retirer une personne arrête TOUT', async () => {
    const roster = rosterOps.adding(rosterOps.adding(EMPTY_ROSTER, { userId: AMI, precision: 'city', durationMinutes: 60, now: T0 }), {
      userId: AUTRE,
      precision: 'city',
      durationMinutes: 60,
      now: T0,
    });
    const world = makeWorld({ stored: encodeSharedLocationRoster(roster), granted: false });
    await world.center.stopSharing(AMI);
    expect(world.source.prompts).toBe(0);
    expect(world.starts).toHaveLength(0);
    expect(world.stops()).toBe(1);
    expect(world.center.entry(AUTRE)).toBeNull();
  });
});

describe('révocation (#18166)', () => {
  test('une mise à jour en vol ne passe pas pendant qu’un démarrage attend son accusé', async () => {
    const world = makeWorld();
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    const pending = deferred<SharedLocationVerdict>();
    world.startQueue.push(() => pending.promise);
    const sharing = world.center.share({ userId: AUTRE, precision: 'city', durationMinutes: 60 });
    await flush();
    world.clock.now += 10 * 60_000;
    world.source.listener?.({ latitude: 48.9, longitude: 2.4 });
    await flush();
    expect(world.updates).toHaveLength(0);
    pending.resolve(STARTED);
    await sharing;
  });

  test('une mise à jour NOT_SHARING efface le partage local', async () => {
    const world = makeWorld();
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    world.updateQueue.push(async () => ({ kind: 'refused', outcome: 'not-sharing' }));
    world.clock.now += 10 * 60_000;
    world.source.listener?.({ latitude: 48.9, longitude: 2.4 });
    await flush();
    expect(world.center.entry(AMI)).toBeNull();
    expect(world.source.following).toBe(0);
  });

  test('un accusé perdu garde « Arrêter » pour toutes les personnes que le serveur peut servir', async () => {
    const world = makeWorld();
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    world.startQueue.push(async () => ({ kind: 'refused', outcome: 'unconfirmed' }));
    expect(await world.center.share({ userId: AUTRE, precision: 'city', durationMinutes: 60 })).toBe('unconfirmed');
    expect(world.center.entry(AMI)).not.toBeNull();
    expect(world.center.entry(AUTRE)).not.toBeNull();
  });

  test('un accusé perdu sur un retrait garde la personne retirée EN ATTENTE, et le centre rejoue le retrait', async () => {
    const world = makeWorld();
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    await world.center.share({ userId: AUTRE, precision: 'city', durationMinutes: 60 });
    world.startQueue.push(async () => ({ kind: 'refused', outcome: 'unconfirmed' }));
    expect(await world.center.stopSharing(AMI)).toBe('withdrawal-pending');
    expect(world.center.entry(AMI)).toBeNull();
    expect(rosterOps.isWithdrawalPending(world.stored(), AMI)).toBe(true);
    await world.advance(SHARED_LOCATION_RETRY_MS);
    expect(world.starts.at(-1)?.recipients).toEqual([{ userId: AUTRE, precision: 'city' }]);
    expect(rosterOps.hasPendingWithdrawals(world.stored())).toBe(false);
  });

  test('une réponse arrivée après le changement de compte n’adopte ni ne suit rien, et la liste du compte quitté garde « Arrêter »', async () => {
    const world = makeWorld();
    const pending = deferred<SharedLocationVerdict>();
    world.startQueue.push(() => pending.promise);
    const sharing = world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    await flush();
    world.account.current = AUTRE;
    pending.resolve(STARTED);
    await sharing;
    expect(world.center.entry(AMI)).toBeNull();
    expect(rosterOps.entry(world.stored(), AMI)).not.toBeNull();
    expect(world.source.following).toBe(0);
  });

  test('un autre compte connecté : le centre n’émet rien en son nom', async () => {
    const world = makeWorld();
    world.account.current = AUTRE;
    expect(await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 })).toBe('failed');
    expect(world.starts).toHaveLength(0);
  });

  test('abandonner cesse de suivre et coupe les minuteurs', async () => {
    const world = makeWorld();
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    world.center.abandon();
    expect(world.source.following).toBe(0);
    await world.advance(HOUR + 2_000);
    expect(world.starts).toHaveLength(1);
    expect(world.stops()).toBe(0);
  });
});

describe('échéances', () => {
  test('à son échéance, la personne sort du partage serveur', async () => {
    const world = makeWorld();
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    await world.center.share({ userId: AUTRE, precision: 'city', durationMinutes: 480 });
    await world.advance(HOUR + 2_000);
    expect(world.starts.at(-1)?.recipients).toEqual([{ userId: AUTRE, precision: 'city' }]);
    expect(world.center.entry(AMI)).toBeNull();
  });

  test('une échéance qui n’a pas pu se solder est rejouée toutes les 30 s', async () => {
    const world = makeWorld();
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    world.stopQueue.push(async () => false);
    await world.advance(HOUR + 2_000);
    expect(world.stops()).toBe(1);
    expect(world.stored()).not.toEqual(EMPTY_ROSTER);
    await world.advance(SHARED_LOCATION_RETRY_MS);
    expect(world.stops()).toBe(2);
    expect(world.stored()).toEqual(EMPTY_ROSTER);
  });

  test('une échéance passée pendant que l’onglet dormait se solde à la socket reconnectée', async () => {
    const roster = rosterOps.adding(EMPTY_ROSTER, { userId: AMI, precision: 'city', durationMinutes: 60, now: T0 - 2 * HOUR });
    const world = makeWorld({ stored: encodeSharedLocationRoster(roster) });
    world.stopQueue.push(async () => false);
    await flush();
    const stopsAfterRestore = world.stops();
    await world.center.reconcile();
    expect(world.stops()).toBe(stopsAfterRestore + 1);
    expect(world.center.entry(AMI)).toBeNull();
  });
});

describe('la ligne de la fiche', () => {
  test('offerte dès Ami, et gardée sous Ami tant qu’un partage court', async () => {
    const world = makeWorld();
    expect(world.center.showsRow(AMI, true)).toBe(true);
    expect(world.center.showsRow(AMI, false)).toBe(false);
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    expect(world.center.showsRow(AMI, false)).toBe(true);
  });
});

describe('audit adversarial (#18345)', () => {
  test('deux onglets du même compte : un arrêt fait dans l’un n’est jamais republié par l’autre', async () => {
    const memory = new Map<string, string>();
    const tabA = makeWorld({ memory });
    await tabA.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    const tabB = makeWorld({ memory });
    await tabA.center.stopSharing(AMI);
    await tabB.center.share({ userId: AUTRE, precision: 'city', durationMinutes: 60 });
    expect(tabB.starts.at(-1)?.recipients).toEqual([{ userId: AUTRE, precision: 'city' }]);
  });

  test('la liste relue fait disparaître « Arrêter » dans l’autre onglet', async () => {
    const memory = new Map<string, string>();
    const tabA = makeWorld({ memory });
    await tabA.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    const tabB = makeWorld({ memory });
    expect(tabB.center.entry(AMI)).not.toBeNull();
    await tabA.center.stopSharing(AMI);
    tabB.center.refresh();
    expect(tabB.center.entry(AMI)).toBeNull();
  });

  test('avant l’accusé, la liste gardée couvre déjà la nouvelle personne : un onglet fermé garde « Arrêter »', async () => {
    const world = makeWorld();
    const pending = deferred<SharedLocationVerdict>();
    world.startQueue.push(() => pending.promise);
    const sharing = world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    await flush();
    expect(rosterOps.entry(world.stored(), AMI)).not.toBeNull();
    pending.resolve({ kind: 'refused', outcome: 'rate-limited' });
    await sharing;
    expect(rosterOps.entry(world.stored(), AMI)).toBeNull();
  });

  test('reprise sans permission accordée : ni suivi, ni demande au chargement', async () => {
    const roster = rosterOps.adding(EMPTY_ROSTER, { userId: AMI, precision: 'city', durationMinutes: 60, now: T0 });
    const world = makeWorld({ stored: encodeSharedLocationRoster(roster), granted: false });
    await flush();
    expect(world.source.following).toBe(0);
    expect(world.source.prompts).toBe(0);
    const granted = makeWorld({ stored: encodeSharedLocationRoster(roster) });
    await flush();
    expect(granted.source.following).toBe(1);
  });

  test('un retrait refusé (débit) retombe sur l’arrêt complet', async () => {
    const world = makeWorld();
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    await world.center.share({ userId: AUTRE, precision: 'city', durationMinutes: 60 });
    world.startQueue.push(async () => ({ kind: 'refused', outcome: 'rate-limited' }));
    expect(await world.center.stopSharing(AMI)).toBeNull();
    expect(world.stops()).toBe(1);
    expect(world.center.entry(AMI)).toBeNull();
  });
});

describe('un « Arrêter » hors ligne part au retour du réseau (#18388, iso #18204)', () => {
  test('hors ligne, arrêter le seul partage le met en attente : la personne sort, le suivi cesse, la raison se dit', async () => {
    const world = makeWorld();
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    world.stopQueue.push(async () => false);
    expect(await world.center.stopSharing(AMI)).toBe('withdrawal-pending');
    expect(world.center.entry(AMI)).toBeNull();
    expect(world.source.following).toBe(0);
    expect(rosterOps.isWithdrawalPending(world.stored(), AMI)).toBe(true);
    expect(world.stored()).not.toEqual(EMPTY_ROSTER);
  });

  test('le retrait en attente est rejoué toutes les 30 s jusqu’à l’accusé, puis la liste se vide', async () => {
    const world = makeWorld();
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    world.stopQueue.push(async () => false, async () => false);
    await world.center.stopSharing(AMI);
    await world.advance(SHARED_LOCATION_RETRY_MS);
    expect(world.stops()).toBe(2);
    expect(rosterOps.isWithdrawalPending(world.stored(), AMI)).toBe(true);
    await world.advance(SHARED_LOCATION_RETRY_MS);
    expect(world.stops()).toBe(3);
    expect(world.stored()).toEqual(EMPTY_ROSTER);
  });

  test('la socket qui s’accroche rejoue le retrait sans attendre le minuteur', async () => {
    const world = makeWorld();
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    world.stopQueue.push(async () => false);
    await world.center.stopSharing(AMI);
    await world.center.reconcile();
    expect(world.stops()).toBe(2);
    expect(world.stored()).toEqual(EMPTY_ROSTER);
  });

  test('hors ligne, retirer une personne parmi deux la met en attente et republie les autres au retour', async () => {
    const world = makeWorld();
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    await world.center.share({ userId: AUTRE, precision: 'city', durationMinutes: 60 });
    world.startQueue.push(async () => ({ kind: 'refused', outcome: 'offline' }));
    expect(await world.center.stopSharing(AMI)).toBe('withdrawal-pending');
    expect(world.center.entry(AMI)).toBeNull();
    expect(world.center.entry(AUTRE)).not.toBeNull();
    await world.center.reconcile();
    expect(world.starts.at(-1)?.recipients).toEqual([{ userId: AUTRE, precision: 'city' }]);
    expect(rosterOps.hasPendingWithdrawals(world.stored())).toBe(false);
  });

  test('aucune mise à jour de position ne part tant qu’un retrait attend', async () => {
    const world = makeWorld();
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    await world.center.share({ userId: AUTRE, precision: 'city', durationMinutes: 60 });
    world.startQueue.push(async () => ({ kind: 'refused', outcome: 'offline' }));
    await world.center.stopSharing(AMI);
    world.clock.now += 10 * 60_000;
    world.source.listener?.({ latitude: 48.9, longitude: 2.4 });
    await flush();
    expect(world.updates).toHaveLength(0);
  });

  test('un retrait gardé d’un chargement précédent part dès le chargement suivant, sans suivre la position', async () => {
    const memory = new Map<string, string>();
    const first = makeWorld({ memory });
    await first.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    first.stopQueue.push(async () => false);
    await first.center.stopSharing(AMI);
    first.center.abandon();
    const reloaded = makeWorld({ memory });
    await flush();
    expect(reloaded.source.following).toBe(0);
    await reloaded.advance(SHARED_LOCATION_RETRY_MS);
    expect(reloaded.stops()).toBe(1);
    expect(reloaded.stored()).toEqual(EMPTY_ROSTER);
  });

  test('un retrait en attente que plus aucun partage serveur ne peut servir s’oublie sans rien émettre', async () => {
    const world = makeWorld();
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    world.stopQueue.push(async () => false);
    await world.center.stopSharing(AMI);
    world.clock.now += 8 * HOUR + 1;
    const stops = world.stops();
    await world.center.reconcile();
    expect(world.stops()).toBe(stops);
    expect(world.stored()).toEqual(EMPTY_ROSTER);
  });

  test('un retrait refusé pour autre chose que le réseau arrête tout au lieu de se rejouer', async () => {
    const world = makeWorld();
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    await world.center.share({ userId: AUTRE, precision: 'city', durationMinutes: 60 });
    world.startQueue.push(async () => ({ kind: 'refused', outcome: 'offline' }));
    await world.center.stopSharing(AMI);
    world.startQueue.push(async () => ({ kind: 'refused', outcome: 'invalid' }));
    await world.center.reconcile();
    expect(world.stops()).toBe(1);
    expect(world.stored()).toEqual(EMPTY_ROSTER);
  });

  test('une dernière position plus vieille qu’un battement n’est pas republiée comme fraîche : l’appareil est redemandé', async () => {
    const world = makeWorld();
    await world.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    await world.center.share({ userId: AUTRE, precision: 'city', durationMinutes: 60 });
    world.clock.now += 5 * 60_000;
    const moved: SharedLocationFix = { latitude: 45.764, longitude: 4.8357 };
    world.source.result = { kind: 'fix', fix: moved };
    await world.center.stopSharing(AMI);
    expect(world.starts.at(-1)?.position).toEqual(moved);
  });

  test('deux onglets : un retrait en attente posé dans l’un n’est pas republié par l’autre', async () => {
    const memory = new Map<string, string>();
    const tabA = makeWorld({ memory });
    await tabA.center.share({ userId: AMI, precision: 'city', durationMinutes: 60 });
    await tabA.center.share({ userId: AUTRE, precision: 'city', durationMinutes: 60 });
    const tabB = makeWorld({ memory });
    tabA.startQueue.push(async () => ({ kind: 'refused', outcome: 'offline' }));
    await tabA.center.stopSharing(AMI);
    tabB.center.refresh();
    expect(tabB.center.entry(AMI)).toBeNull();
    await tabB.center.reconcile();
    expect(tabB.starts.at(-1)?.recipients).toEqual([{ userId: AUTRE, precision: 'city' }]);
  });
});
