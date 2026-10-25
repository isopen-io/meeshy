import { beforeAll, describe, expect, test } from 'bun:test';

import type { GameBlock } from '@meeshy/shared/types/game';
import type { GamePhotoBlock } from '@meeshy/shared/types/game-photo';
import { PHOTO_ALERT_POLICY } from '@meeshy/shared/utils/game/photo-alerts';

import { gameBlockFixture } from '@/lib/api/game-fixture';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import type { SafeStorage } from '@/lib/storage';

import { createPhotoAlerts, deferLater, invitationsPolicy, photoAlertContextFree, type PhotoAlertSource, type PhotoAlerts } from './alerts';
import { dayMoment, flameMoment, meeshMoment, type PhotoMoment } from './moments';

/**
 * LE COORDINATEUR DES INVITATIONS (#10174, L18 ; § 5.16.3) — UNE file de un, deux natures d'étape, la loi
 * partagée (`photoAlertFor`) pour décider, la mémoire APPAREIL par compte pour la ligne de base, le rythme et
 * la pastille. Rien ici ne touche le réseau : l'accusé est un port injecté.
 */
beforeAll(async () => {
  await loadGameCatalog('fr');
});

const memoryStorage = (): SafeStorage & { readonly dump: () => Record<string, string> } => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  };
};

const HOUR = 3_600_000;
const T0 = Date.parse('2026-10-22T12:00:00Z');

const photo = (over: Partial<GamePhotoBlock> = {}): GamePhotoBlock => ({
  atmosphere: null,
  invitations: 'every',
  baselineAt: null,
  baseline: null,
  treasuryPeakTier: null,
  moments: [],
  ...over,
});

const game = (patch: Parameters<typeof gameBlockFixture>[0] = {}, extra: Partial<GameBlock> = {}): GameBlock => ({ ...gameBlockFixture(patch), ...extra });

type SourceOver = { readonly kept?: readonly string[]; readonly known?: readonly string[]; readonly userId?: string };

type Bench = {
  readonly alerts: PhotoAlerts;
  readonly acked: string[][];
  readonly storage: ReturnType<typeof memoryStorage>;
  readonly clock: { now: number };
  readonly source: (block: GameBlock, over?: SourceOver) => PhotoAlertSource;
};

const bench = (over: { readonly sessionStartedAt?: number | null } = {}): Bench => {
  const storage = memoryStorage();
  const clock = { now: T0 };
  const acked: string[][] = [];
  const alerts = createPhotoAlerts({
    storage,
    now: () => clock.now,
    sessionStartedAt: over.sessionStartedAt === undefined ? T0 - HOUR : over.sessionStartedAt,
    acknowledge: (ids) => void acked.push([...ids]),
  });
  return {
    alerts,
    acked,
    storage,
    clock,
    source: (block, o = {}) => ({ userId: o.userId ?? 'u1', game: block, kept: async () => ({ kept: o.kept ?? [], known: o.known ?? [] }) }),
  };
};

const pendingId = (b: Bench): string | null => b.alerts.store.getState().pending?.propose.id ?? null;

describe('le réglage « Me proposer d’immortaliser » devient la politique de la loi', () => {
  test('chaque étape, les grands moments, jamais ; absent : chaque étape', () => {
    expect(invitationsPolicy('every').invitations).toBe('every-step');
    expect(invitationsPolicy('major').invitations).toBe('big-moments');
    expect(invitationsPolicy('never').invitations).toBe('never');
    expect(invitationsPolicy(undefined)).toEqual(PHOTO_ALERT_POLICY);
  });
});

describe('la ligne de base', () => {
  test('la première lecture d’un compte n’alerte pas : la situation est gardée, les étapes passées restent au carnet', async () => {
    const b = bench();
    expect(await b.alerts.observe(b.source(game({ streak: 30 })))).toBe('baseline');
    expect(pendingId(b)).toBeNull();
    expect(b.acked).toEqual([]);
  });

  test('la mémoire est par compte : un second compte sur le même appareil repart de sa propre ligne de base', async () => {
    const b = bench();
    await b.alerts.observe(b.source(game({ streak: 6 })));
    expect(await b.alerts.observe(b.source(game({ streak: 7 }), { userId: 'u2' }))).toBe('baseline');
    expect(pendingId(b)).toBeNull();
  });
});

describe('une étape PASSIVE (trouvée à la lecture du jeu)', () => {
  test('la Flamme constatée à 7 jours après la ligne de base : une invitation passive, l’étape annoncée et proposée', async () => {
    const b = bench();
    await b.alerts.observe(b.source(game({ streak: 6 })));
    expect(await b.alerts.observe(b.source(game({ streak: 7 })))).toBe('alert');
    const pending = b.alerts.store.getState().pending;
    expect(pending?.surface).toBe('passive');
    expect(pending?.announce.id).toBe('flame:7');
    expect(pending?.propose.id).toBe('flame:7');
    expect(pending?.reached).toEqual(['flame:7']);
  });

  test('la dixième Meesh sans la première : Meesh 10 annoncée, Meesh 1 proposée (le carnet reprend là)', async () => {
    const b = bench();
    await b.alerts.observe(b.source(game({ mintedLifetime: 9 })));
    await b.alerts.observe(b.source(game({ mintedLifetime: 10 })));
    const pending = b.alerts.store.getState().pending;
    expect(pending?.announce.id).toBe('meesh:10');
    expect(pending?.propose.id).toBe('meesh:1');
    expect(pending?.propose.title).toBe('Ma première Meesh');
  });

  test('pendant les dix premières minutes d’une session, l’étape passive ATTEND — et se présente ensuite', async () => {
    const b = bench({ sessionStartedAt: T0 });
    await b.alerts.observe(b.source(game({ streak: 6 })));
    expect(await b.alerts.observe(b.source(game({ streak: 7 })))).toBe('wait');
    expect(pendingId(b)).toBeNull();
    b.clock.now = T0 + 11 * 60_000;
    expect(await b.alerts.observe(b.source(game({ streak: 7 })))).toBe('alert');
    expect(pendingId(b)).toBe('flame:7');
  });

  test('push déjà envoyé (notifiée) ou présentée sur un autre appareil : rien ici, et l’étape ne reste pas en embuscade', async () => {
    const b = bench();
    await b.alerts.observe(b.source(game({ streak: 6 })));
    const notified = game({ streak: 7 }, { photo: photo({ moments: [{ stepId: 'flame:7', detectedAt: null, presentedAt: null, notifiedAt: '2026-10-22T10:00:00Z', keptAt: null }] }) });
    expect(await b.alerts.observe(b.source(notified))).toBe('none');
    expect(pendingId(b)).toBeNull();
    expect(await b.alerts.observe(b.source(game({ streak: 7 })))).toBe('none');
  });

  test('immortalisée sur un autre appareil (`keptAt`) : jamais proposée', async () => {
    const b = bench();
    await b.alerts.observe(b.source(game({ mintedLifetime: 0 })));
    const kept = game({ mintedLifetime: 1 }, { photo: photo({ moments: [{ stepId: 'meesh:1', detectedAt: null, presentedAt: null, notifiedAt: null, keptAt: '2026-10-22T10:00:00Z' }] }) });
    expect(await b.alerts.observe(b.source(kept))).toBe('none');
  });

  test('réglage « jamais » : aucune surface, mais la situation avance (le carnet garde tout)', async () => {
    const b = bench();
    await b.alerts.observe(b.source(game({ streak: 6 })));
    expect(await b.alerts.observe(b.source(game({ streak: 7 }, { photo: photo({ invitations: 'never' }) })))).toBe('none');
    expect(pendingId(b)).toBeNull();
    expect(b.alerts.badge('u1')).toBe(false);
  });

  test('la ligne de base SERVIE l’emporte : une étape franchie avant elle ne s’annonce pas, même sur un appareil neuf', async () => {
    const b = bench();
    const served = photo({ baseline: { rank: 'murmure', division: 5, levelRecord: 1, prestige: 0, minted: 0, treasuryTier: null, flameRecord: 7 } });
    await b.alerts.observe(b.source(game({ streak: 6 }, { photo: served })));
    expect(await b.alerts.observe(b.source(game({ streak: 7 }, { photo: served })))).toBe('none');
  });

  test('file de un : une seconde étape attend que la première soit traitée, puis se présente', async () => {
    const b = bench();
    await b.alerts.observe(b.source(game({ streak: 6, mintedLifetime: 0 })));
    await b.alerts.observe(b.source(game({ streak: 7, mintedLifetime: 0 })));
    expect(await b.alerts.observe(b.source(game({ streak: 7, mintedLifetime: 1 })))).toBe('busy');
    b.alerts.later();
    b.clock.now = T0 + 5 * HOUR;
    expect(await b.alerts.observe(b.source(game({ streak: 7, mintedLifetime: 1 })))).toBe('alert');
    expect(pendingId(b)).toBe('meesh:1');
  });
});

describe('une étape née d’un GESTE (remise par la célébration)', () => {
  const kept = (ids: readonly string[]) => ids;

  test('la Flamme franchie pendant que l’écran est ouvert : la carte de fin de célébration, surface « gesture »', async () => {
    const b = bench();
    await b.alerts.adopt({ userId: 'u1', game: game({ streak: 6 }) });
    expect(await b.alerts.celebrate(b.source(game({ streak: 7 })), [flameMoment(7)])).toBe('alert');
    expect(b.alerts.store.getState().pending?.surface).toBe('gesture');
  });

  test('un geste ne connaît pas le délai de grâce de la session', async () => {
    const b = bench({ sessionStartedAt: T0 });
    await b.alerts.adopt({ userId: 'u1', game: game({ streak: 6 }) });
    expect(await b.alerts.celebrate(b.source(game({ streak: 7 })), [flameMoment(7)])).toBe('alert');
  });

  test('le même moment ne se repropose pas dans la séance, ni après « Plus tard »', async () => {
    const b = bench();
    await b.alerts.adopt({ userId: 'u1', game: game({ streak: 6 }) });
    await b.alerts.celebrate(b.source(game({ streak: 7 })), [flameMoment(7)]);
    b.alerts.later();
    expect(await b.alerts.celebrate(b.source(game({ streak: 7 })), [flameMoment(7)])).toBe('none');
  });

  test('un moment que le carnet connaît (gardé ou en attente) ne se repropose pas', async () => {
    const b = bench();
    await b.alerts.adopt({ userId: 'u1', game: game({ mintedLifetime: 9 }) });
    expect(await b.alerts.celebrate(b.source(game({ mintedLifetime: 10 }), { known: kept(['meesh:1']) }), [meeshMoment({ number: 10 })])).toBe('none');
  });

  test('le plafond du jour vaut aussi pour les gestes : une seconde célébration le même jour se termine sans carte, l’étape va au carnet', async () => {
    const b = bench();
    await b.alerts.adopt({ userId: 'u1', game: game({ streak: 6, mintedLifetime: 0 }) });
    await b.alerts.celebrate(b.source(game({ streak: 7, mintedLifetime: 0 })), [flameMoment(7)]);
    const pending = b.alerts.store.getState().pending;
    if (pending === null) throw new Error('invitation attendue');
    b.alerts.displayed(pending);
    b.alerts.consume();
    expect(await b.alerts.celebrate(b.source(game({ streak: 7, mintedLifetime: 1 })), [meeshMoment({ number: 1 })])).toBe('none');
    expect(pendingId(b)).toBeNull();
  });

  test('la réalisation du jour (D6) n’entre que si aucune étape de piste n’attend : seule, elle se propose ; avec une étape de piste, elle cède', async () => {
    const b = bench();
    await b.alerts.adopt({ userId: 'u1', game: game({ streak: 6 }) });
    const day = dayMoment('2026-10-22');
    if (day === null) throw new Error('journée lisible');
    expect(await b.alerts.celebrate(b.source(game({ streak: 7 })), [flameMoment(7), day])).toBe('alert');
    expect(pendingId(b)).toBe('flame:7');
    b.alerts.later();
    b.clock.now = T0 + 5 * HOUR;
    const b2 = bench();
    await b2.alerts.adopt({ userId: 'u1', game: game({ streak: 7 }) });
    expect(await b2.alerts.celebrate(b2.source(game({ streak: 7 })), [day])).toBe('alert');
    expect(pendingId(b2)).toBe('day:2026-10-22');
  });
});

describe('l’accusé, le rythme et la pastille', () => {
  test('afficher l’invitation accuse toutes les étapes atteintes ET l’étape proposée, une fois', async () => {
    const b = bench();
    await b.alerts.observe(b.source(game({ mintedLifetime: 9 })));
    await b.alerts.observe(b.source(game({ mintedLifetime: 10 })));
    const pending = b.alerts.store.getState().pending;
    if (pending === null) throw new Error('invitation attendue');
    b.alerts.displayed(pending);
    b.alerts.displayed(pending);
    expect(b.acked).toEqual([['meesh:10', 'meesh:1']]);
  });

  test('après une invitation montrée, l’écart minimal de la politique rend la suivante silencieuse ; passé l’écart, elle revient', async () => {
    const b = bench();
    await b.alerts.observe(b.source(game({ streak: 6, mintedLifetime: 0 })));
    await b.alerts.observe(b.source(game({ streak: 7, mintedLifetime: 0 })));
    const first = b.alerts.store.getState().pending;
    if (first === null) throw new Error('invitation attendue');
    b.alerts.displayed(first);
    b.alerts.later();
    b.clock.now = T0 + HOUR;
    expect(await b.alerts.observe(b.source(game({ streak: 7, mintedLifetime: 1 })))).toBe('none');
    expect(pendingId(b)).toBeNull();
  });

  test('la pastille s’allume pour une étape nouvelle, et s’éteint à la visite du carnet — même avec douze étapes ouvertes', async () => {
    const b = bench();
    await b.alerts.observe(b.source(game({ streak: 6 })));
    expect(b.alerts.badge('u1')).toBe(false);
    await b.alerts.observe(b.source(game({ streak: 7 })));
    const pending = b.alerts.store.getState().pending;
    if (pending === null) throw new Error('invitation attendue');
    b.alerts.displayed(pending);
    expect(b.alerts.badge('u1')).toBe(true);
    expect(b.alerts.store.getState().noticed).toEqual(['flame:7']);
    b.alerts.carnetVisited('u1');
    expect(b.alerts.badge('u1')).toBe(false);
    expect(b.alerts.store.getState().noticed).toEqual([]);
  });

  test('la mémoire survit à une nouvelle instance (même stockage) : ligne de base, rythme et pastille', async () => {
    const b = bench();
    await b.alerts.observe(b.source(game({ streak: 6 })));
    await b.alerts.observe(b.source(game({ streak: 7 })));
    const pending = b.alerts.store.getState().pending;
    if (pending === null) throw new Error('invitation attendue');
    b.alerts.displayed(pending);
    const again = createPhotoAlerts({ storage: b.storage, now: () => T0 + 1, sessionStartedAt: null, acknowledge: () => undefined });
    expect(await again.observe(b.source(game({ streak: 7 })))).toBe('none');
    expect(again.badge('u1')).toBe(true);
  });

  test('un stockage qui refuse n’empêche rien : la séance tient en mémoire', async () => {
    const refusing: SafeStorage = {
      getItem: () => {
        throw new Error('refusé');
      },
      setItem: () => {
        throw new Error('refusé');
      },
      removeItem: () => undefined,
    };
    const alerts = createPhotoAlerts({ storage: refusing, now: () => T0, sessionStartedAt: null, acknowledge: () => undefined });
    const src = (block: GameBlock): PhotoAlertSource => ({ userId: 'u1', game: block, kept: async () => ({ kept: [], known: [] }) });
    expect(await alerts.observe(src(game({ streak: 6 })))).toBe('baseline');
    expect(await alerts.observe(src(game({ streak: 7 })))).toBe('alert');
  });
});

describe('« Plus tard » sur une réalisation du jour ne garde que la plus récente', () => {
  test('la journée d’avant quitte l’attente, la nouvelle y entre ; une étape de piste ne touche pas aux journées', async () => {
    const removed: string[] = [];
    const deferred: string[] = [];
    const entries = [
      { id: 'day:2026-10-20', momentId: 'day:2026-10-20', status: 'pending' as const },
      { id: 'meesh:1', momentId: 'meesh:1', status: 'kept' as const },
    ];
    const notebook = {
      list: async () => entries as unknown as readonly import('./notebook').NotebookEntry[],
      remove: async (id: string) => (removed.push(id), true),
      defer: async (moment: PhotoMoment) => (deferred.push(moment.id), true),
    };
    const day = dayMoment('2026-10-22');
    if (day === null) throw new Error('journée lisible');
    await deferLater(notebook, day);
    expect(removed).toEqual(['day:2026-10-20']);
    expect(deferred).toEqual(['day:2026-10-22']);
    await deferLater(notebook, flameMoment(7));
    expect(removed).toEqual(['day:2026-10-20']);
  });
});

describe('le bon moment', () => {
  test('jamais hors d’un hub, pendant un appel ou une saisie', () => {
    expect(photoAlertContextFree({ routeHub: true, callLive: false, typing: false })).toBe(true);
    expect(photoAlertContextFree({ routeHub: false, callLive: false, typing: false })).toBe(false);
    expect(photoAlertContextFree({ routeHub: true, callLive: true, typing: false })).toBe(false);
    expect(photoAlertContextFree({ routeHub: true, callLive: false, typing: true })).toBe(false);
  });
});
