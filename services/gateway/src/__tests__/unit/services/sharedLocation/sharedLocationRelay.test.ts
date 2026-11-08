/**
 * LE PARTAGE TEMPORAIRE DE POSITION À DES PERSONNES (#14109, #16980) — l'émetteur
 * envoie sa position COMPLÈTE, le serveur la garde scellée et la TRONQUE destinataire
 * par destinataire : rien hors des destinataires choisis, rien sous Ami, rien à un
 * bloqueur ; la précision que l'émetteur a donnée, sans rien de plus riche à côté.
 * Une baisse efface chez qui voyait ; une remontée fait revenir la dernière position.
 *
 * Le monde évalue chaque clause reçue (`messagingWorld`) : la loi est jugée sur les
 * lectures vraies, jamais sur un verdict injecté.
 *
 * @jest-environment node
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { relationPairKey } from '@meeshy/shared/types/relation';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { SHARED_LOCATION_ERROR_CODES } from '@meeshy/shared/types/shared-location';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  captureSharedLocationAccess,
  projectSharedLocation,
  refreshSharedLocationBetween,
  sharedLocationSnapshotFor,
  startSharedLocation,
  stopSharedLocation,
  updateSharedLocation,
  type SharedLocationRelayDeps,
} from '../../../../services/sharedLocation/sharedLocationRelay';
import { readSharedLocation } from '../../../../services/sharedLocation/sharedLocationStore';
import { ADULT_BIRTH, messagingWorld, type CircleLink } from '../../../helpers/messaging-circle-world';

const EMETTEUR = '6300000000000000000000e1';
const AMI = '6300000000000000000000f1';
const PROCHE = '6300000000000000000000c1';
const SANG = '6300000000000000000000b1';
const CONNAISSANCE = '6300000000000000000000a1';
const NON_CHOISI = '6300000000000000000000f2';
const BLOQUEUR = '6300000000000000000000d1';

const T0 = Date.parse('2026-11-08T12:00:00.000Z');
const HEURE = 3_600_000;
const PARIS = { latitude: 48.8566, longitude: 2.3522, accuracy: 4 } as const;
const PLUS_LOIN = { latitude: 48.8738, longitude: 2.295, accuracy: 12 } as const;

type Emission = { readonly room: string; readonly event: string; readonly data: Record<string, unknown> };

function cacheEnMemoire() {
  const entries = new Map<string, { value: string; ttl?: number }>();
  let pause: Promise<void> | null = null;
  let relacher = (): void => undefined;
  return {
    entries,
    /** Le prochain `set` attend `relacher()` : un geste en vol, rattrapé par un autre. */
    suspendreProchaineEcriture: () => {
      pause = new Promise<void>((resolve) => {
        relacher = resolve;
      });
    },
    relacher: () => relacher(),
    get: (key: string) => Promise.resolve(entries.get(key)?.value ?? null),
    set: async (key: string, value: string, ttl?: number) => {
      const attente = pause;
      pause = null;
      if (attente) await attente;
      entries.set(key, { value, ttl });
    },
    del: (key: string) => {
      entries.delete(key);
      return Promise.resolve();
    },
  };
}

const LIENS: readonly CircleLink[] = [
  [EMETTEUR, AMI, 'FRIEND'],
  [EMETTEUR, PROCHE, 'CLOSE'],
  [EMETTEUR, SANG, 'BLOOD'],
  [EMETTEUR, CONNAISSANCE, 'ACQUAINTANCE'],
  [EMETTEUR, NON_CHOISI, 'FRIEND'],
  [EMETTEUR, BLOQUEUR, 'CLOSE'],
];

function monde() {
  const world = messagingWorld({
    links: LIENS,
    users: [EMETTEUR, AMI, PROCHE, SANG, CONNAISSANCE, NON_CHOISI, BLOQUEUR].map((id) => ({
      id,
      birthDate: ADULT_BIRTH,
      ...(id === BLOQUEUR ? { blockedUserIds: [EMETTEUR] } : {}),
    })),
  });
  const emissions: Emission[] = [];
  const cache = cacheEnMemoire();
  let now = T0;
  const deps: SharedLocationRelayDeps = {
    prisma: world.prisma as unknown as PrismaClient,
    cache,
    io: { to: (room: string) => ({ emit: (event: string, data: Record<string, unknown>) => emissions.push({ room, event, data }) }) } as unknown as SharedLocationRelayDeps['io'],
    now: () => now,
  };
  return {
    deps,
    cache,
    emissions,
    avancer: (ms: number) => {
      now += ms;
    },
    vers: (userId: string) => emissions.filter((e) => e.room === ROOMS.user(userId)),
    lier: async (a: string, b: string, level: string) => {
      await world.prisma.userRelation.updateMany({ where: relationPairKey(a, b), data: { grantedByLow: level, grantedByHigh: level } });
    },
  };
}

const TOUS = [
  { userId: AMI, precision: 'exact' },
  { userId: PROCHE, precision: 'neighborhood' },
  { userId: SANG },
  { userId: CONNAISSANCE, precision: 'exact' },
  { userId: BLOQUEUR, precision: 'exact' },
] as const;

const demarrer = (m: ReturnType<typeof monde>, recipients: readonly object[] = TOUS, durationMinutes = 60) =>
  startSharedLocation(m.deps, EMETTEUR, { recipients, durationMinutes, position: PARIS });

const KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
afterEach(() => {
  delete process.env.SECRETS_AT_REST_KEY;
});

describe('la projection — la précision donnée, rien de plus riche à côté', () => {
  const state = {
    recipients: [],
    position: PARIS,
    updatedAt: new Date(T0).toISOString(),
    expiresAt: new Date(T0 + HEURE).toISOString(),
  };

  it('exacte : la position et la précision de l\'appareil, jamais sous 10 m', () => {
    expect(projectSharedLocation(EMETTEUR, state, 'exact')).toEqual({
      userId: EMETTEUR,
      latitude: 48.8566,
      longitude: 2.3522,
      precision: 'exact',
      radiusMeters: 10,
      updatedAt: state.updatedAt,
      expiresAt: state.expiresAt,
    });
  });

  it('quartier et ville : le centre de la maille et le rayon du flou, ni la position ni la précision réelles', () => {
    expect(projectSharedLocation(EMETTEUR, state, 'neighborhood')).toMatchObject({ latitude: 48.855, longitude: 2.355, precision: 'neighborhood', radiusMeters: 800 });
    expect(projectSharedLocation(EMETTEUR, state, 'city')).toMatchObject({ latitude: 48.85, longitude: 2.35, precision: 'city', radiusMeters: 8000 });
    expect(JSON.stringify(projectSharedLocation(EMETTEUR, state, 'city'))).not.toMatch(/8566|3522|accuracy|recipients/);
  });

  it('deux positions de la même maille livrent le même point : mille envois n\'en disent pas plus qu\'un', () => {
    const voisine = { ...state, position: { latitude: 48.8591, longitude: 2.3588 } };
    expect(projectSharedLocation(EMETTEUR, voisine, 'neighborhood')).toEqual(projectSharedLocation(EMETTEUR, state, 'neighborhood'));
  });

  it('`none` ne sert rien', () => {
    expect(projectSharedLocation(EMETTEUR, state, 'none')).toBeNull();
  });
});

describe('démarrer — chaque destinataire reçoit SA projection, et lui seul', () => {
  it('un Ami choisi en exact reçoit la position exacte, un Proche en quartier son quartier, un Sang sans choix la ville', async () => {
    const m = monde();
    const ack = await demarrer(m);

    expect(ack).toEqual({ success: true, data: { expiresAt: new Date(T0 + HEURE).toISOString() } });
    expect(m.vers(AMI).map((e) => [e.event, e.data.precision, e.data.latitude])).toEqual([[SERVER_EVENTS.SHARED_LOCATION_CHANGED, 'exact', 48.8566]]);
    expect(m.vers(PROCHE).map((e) => [e.data.precision, e.data.latitude])).toEqual([['neighborhood', 48.855]]);
    expect(m.vers(SANG).map((e) => [e.data.precision, e.data.latitude])).toEqual([['city', 48.85]]);
  });

  it('une Connaissance, un bloqueur et un Ami non choisi ne reçoivent rien, pas même un effacement', async () => {
    const m = monde();
    await demarrer(m);
    await stopSharedLocation(m.deps, EMETTEUR);

    expect(m.vers(CONNAISSANCE)).toEqual([]);
    expect(m.vers(BLOQUEUR)).toEqual([]);
    expect(m.vers(NON_CHOISI)).toEqual([]);
    expect(m.vers(EMETTEUR)).toEqual([]);
  });

  it('refuse une charge illisible sans rien ranger ni émettre', async () => {
    const m = monde();
    const ack = await startSharedLocation(m.deps, EMETTEUR, { recipients: TOUS, durationMinutes: 90, position: PARIS });
    expect(ack).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.INVALID });
    expect(m.cache.entries.size).toBe(0);
    expect(m.emissions).toEqual([]);
  });

  it('redémarrer sans un destinataire l\'efface chez lui, et chez lui seul', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;
    await demarrer(m, [{ userId: AMI, precision: 'exact' }]);

    expect(m.vers(PROCHE).map((e) => [e.event, e.data])).toEqual([[SERVER_EVENTS.SHARED_LOCATION_ENDED, { userId: EMETTEUR }]]);
    expect(m.vers(SANG).map((e) => e.event)).toEqual([SERVER_EVENTS.SHARED_LOCATION_ENDED]);
    expect(m.vers(AMI).map((e) => e.event)).toEqual([SERVER_EVENTS.SHARED_LOCATION_CHANGED]);
    expect(m.vers(CONNAISSANCE)).toEqual([]);
  });
});

describe('mettre à jour et arrêter', () => {
  it('une mise à jour part à la précision de chacun, sans changer le terme', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;
    m.avancer(60_000);
    const ack = await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);

    expect(ack).toEqual({ success: true, data: { expiresAt: new Date(T0 + HEURE).toISOString() } });
    expect(m.vers(AMI).map((e) => [e.data.latitude, e.data.radiusMeters, e.data.updatedAt])).toEqual([[48.8738, 12, new Date(T0 + 60_000).toISOString()]]);
    expect(m.vers(SANG).map((e) => [e.data.latitude, e.data.longitude])).toEqual([[48.85, 2.25]]);
  });

  it('une mise à jour sans partage en cours, ou après son terme, est refusée et ne part nulle part', async () => {
    const m = monde();
    expect(await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN)).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.NOT_SHARING });
    await demarrer(m);
    m.emissions.length = 0;
    m.avancer(HEURE + 1);
    expect(await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN)).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.NOT_SHARING });
    expect(m.emissions).toEqual([]);
  });

  it('arrêter efface le partage et le dit à ceux qui le voyaient, à eux seuls', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    expect(await stopSharedLocation(m.deps, EMETTEUR)).toEqual({ success: true });
    expect([...m.cache.entries.keys()].filter((key) => key.startsWith(`shared-location:${EMETTEUR}`))).toEqual([]);
    expect(m.emissions.map((e) => e.room).sort()).toEqual([AMI, PROCHE, SANG].map((id) => ROOMS.user(id)).sort());
    expect(new Set(m.emissions.map((e) => e.event))).toEqual(new Set([SERVER_EVENTS.SHARED_LOCATION_ENDED]));
  });
});

describe('le repos — la position complète est gardée SCELLÉE, jamais en clair', () => {
  it('la valeur rangée ne contient ni coordonnée ni destinataire, et vit jusqu\'au terme', async () => {
    process.env.SECRETS_AT_REST_KEY = KEY;
    const m = monde();
    await demarrer(m, TOUS, 480);

    const etats = [...m.cache.entries.entries()].filter(([key]) => key.startsWith(`shared-location:${EMETTEUR}:`));
    expect(etats).toHaveLength(1);
    const [[, entry]] = etats;
    expect(entry.value.startsWith('v1:')).toBe(true);
    expect(entry.value).not.toMatch(/48\.8|2\.35|6300000/);
    expect(entry.ttl).toBe(480 * 60);
    [...m.cache.entries.values()].forEach(({ value }) => expect(value).not.toMatch(/48\.8|2\.35|6300000/));
  });

  it('une valeur scellée pour un compte ne s\'ouvre pas sous la clé d\'un autre', async () => {
    process.env.SECRETS_AT_REST_KEY = KEY;
    const m = monde();
    await demarrer(m);
    const session = m.cache.entries.get(`shared-location-current:${EMETTEUR}`)!;
    const entry = m.cache.entries.get(`shared-location:${EMETTEUR}:${session.value}`)!;
    m.cache.entries.set(`shared-location-current:${PROCHE}`, session);
    m.cache.entries.set(`shared-location:${PROCHE}:${session.value}`, entry);

    expect(await readSharedLocation(m.cache, PROCHE, T0)).toBeNull();
    expect(await readSharedLocation(m.cache, EMETTEUR, T0)).not.toBeNull();
  });

  it('avec une clé de scellement, une valeur en clair glissée dans le cache vaut « rien »', async () => {
    const m = monde();
    await demarrer(m);
    process.env.SECRETS_AT_REST_KEY = KEY;

    expect(await readSharedLocation(m.cache, EMETTEUR, T0)).toBeNull();
  });

});

describe('le lien change — la troncature se recalcule sans nouvel envoi', () => {
  it('une baisse sous Ami efface chez qui voyait ; la remontée fait revenir la dernière position conservée', async () => {
    const m = monde();
    await demarrer(m);
    await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);
    m.emissions.length = 0;

    const avant = await captureSharedLocationAccess(m.deps, { userA: EMETTEUR, userB: AMI });
    await m.lier(EMETTEUR, AMI, 'ACQUAINTANCE');
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: AMI, before: avant });
    expect(m.vers(AMI).map((e) => [e.event, e.data])).toEqual([[SERVER_EVENTS.SHARED_LOCATION_ENDED, { userId: EMETTEUR }]]);
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items).toEqual([]);

    m.emissions.length = 0;
    await m.lier(EMETTEUR, AMI, 'FRIEND');
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: AMI });
    expect(m.vers(AMI).map((e) => [e.event, e.data.latitude, e.data.precision])).toEqual([[SERVER_EVENTS.SHARED_LOCATION_CHANGED, 48.8738, 'exact']]);
  });

  it('une Connaissance choisie qui monte à Ami reçoit la position à SA précision ; rien ne part à qui n\'a jamais vu', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    const avant = await captureSharedLocationAccess(m.deps, { userA: EMETTEUR, userB: NON_CHOISI });
    await m.lier(EMETTEUR, NON_CHOISI, 'ACQUAINTANCE');
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: NON_CHOISI, before: avant });
    expect(m.vers(NON_CHOISI)).toEqual([]);

    await m.lier(EMETTEUR, CONNAISSANCE, 'FRIEND');
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: CONNAISSANCE });
    expect(m.vers(CONNAISSANCE).map((e) => [e.data.precision, e.data.latitude])).toEqual([['exact', 48.8566]]);
  });
});

describe('le rattrapage — `GET /relations/locations` sert les partages tronqués au lecteur', () => {
  it('chaque lecteur retrouve la projection de son choix ; une Connaissance ou un non-choisi ne retrouvent rien', async () => {
    const m = monde();
    await demarrer(m);

    expect((await sharedLocationSnapshotFor(m.deps, PROCHE, {})).items).toEqual([expect.objectContaining({ userId: EMETTEUR, precision: 'neighborhood', latitude: 48.855 })]);
    expect((await sharedLocationSnapshotFor(m.deps, CONNAISSANCE, {})).items).toEqual([]);
    expect((await sharedLocationSnapshotFor(m.deps, NON_CHOISI, {})).items).toEqual([]);
    expect((await sharedLocationSnapshotFor(m.deps, BLOQUEUR, {})).items).toEqual([]);
  });

  it('l\'emprise filtre sur la position SERVIE, jamais sur la position réelle', async () => {
    const m = monde();
    await demarrer(m);
    const autourDuCentreDeVille = { minLongitude: 2.349, minLatitude: 48.849, maxLongitude: 2.351, maxLatitude: 48.851 };
    const autourDuPointReel = { minLongitude: 2.352, minLatitude: 48.856, maxLongitude: 2.353, maxLatitude: 48.857 };

    expect((await sharedLocationSnapshotFor(m.deps, SANG, { bbox: autourDuCentreDeVille })).items).toHaveLength(1);
    expect((await sharedLocationSnapshotFor(m.deps, SANG, { bbox: autourDuPointReel })).items).toEqual([]);
  });

  it('un partage échu n\'est plus servi', async () => {
    const m = monde();
    await demarrer(m);
    m.avancer(HEURE + 1);
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items).toEqual([]);
  });
});

describe('les gestes qui se croisent — un partage arrêté ne revient jamais tout seul', () => {
  it('une mise à jour en vol pendant l\'arrêt ne ressuscite pas le partage, et l\'arrêt a le dernier mot chez chacun', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    m.cache.suspendreProchaineEcriture();
    const enVol = updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);
    await new Promise((resolve) => setImmediate(resolve));
    expect(await stopSharedLocation(m.deps, EMETTEUR)).toEqual({ success: true });
    m.cache.relacher();

    expect(await enVol).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.NOT_SHARING });
    expect(await readSharedLocation(m.cache, EMETTEUR, T0)).toBeNull();
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items).toEqual([]);
    [AMI, PROCHE, SANG].forEach((id) => expect(m.vers(id).at(-1)?.event).toBe(SERVER_EVENTS.SHARED_LOCATION_ENDED));
  });

  it('un démarrage en vol pendant l\'arrêt ne survit pas ; un démarrage APRÈS l\'arrêt, si', async () => {
    const m = monde();
    await demarrer(m);

    m.cache.suspendreProchaineEcriture();
    const enVol = demarrer(m);
    await new Promise((resolve) => setImmediate(resolve));
    await stopSharedLocation(m.deps, EMETTEUR);
    m.cache.relacher();
    await enVol;
    expect(await readSharedLocation(m.cache, EMETTEUR, T0)).toBeNull();

    expect(await demarrer(m)).toMatchObject({ success: true });
    expect(await readSharedLocation(m.cache, EMETTEUR, T0)).not.toBeNull();
  });

  it('une mise à jour en vol pendant un NOUVEAU partage n\'y réécrit pas l\'ancienne liste : un destinataire retiré ne revoit rien', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    m.cache.suspendreProchaineEcriture();
    const enVol = updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);
    await new Promise((resolve) => setImmediate(resolve));
    expect(await demarrer(m, [{ userId: AMI, precision: 'exact' }])).toMatchObject({ success: true });
    m.cache.relacher();

    expect(await enVol).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.NOT_SHARING });
    expect((await readSharedLocation(m.cache, EMETTEUR, T0))?.recipients.map((r) => r.userId)).toEqual([AMI]);
    [PROCHE, SANG].forEach((id) => expect(m.vers(id).at(-1)?.event).toBe(SERVER_EVENTS.SHARED_LOCATION_ENDED));
    expect((await sharedLocationSnapshotFor(m.deps, PROCHE, {})).items).toEqual([]);
    expect(m.vers(AMI).at(-1)?.data).toMatchObject({ latitude: PARIS.latitude });
  });

  it('arrêter puis redémarrer pendant une mise à jour en vol laisse le nouveau partage intact', async () => {
    const m = monde();
    await demarrer(m);

    m.cache.suspendreProchaineEcriture();
    const enVol = updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);
    await new Promise((resolve) => setImmediate(resolve));
    await stopSharedLocation(m.deps, EMETTEUR);
    expect(await demarrer(m, [{ userId: AMI, precision: 'exact' }])).toMatchObject({ success: true });
    m.cache.relacher();

    expect(await enVol).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.NOT_SHARING });
    expect(await readSharedLocation(m.cache, EMETTEUR, T0)).toMatchObject({ position: PARIS, recipients: [{ userId: AMI }] });
  });
});

describe('ce qui ne change pas ne part pas — un lecteur flouté n\'apprend pas quand l\'appareil bouge', () => {
  it('une mise à jour dans la même maille ne part pas chez le lecteur flouté, mais part chez l\'exact', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;
    m.avancer(60_000);
    await updateSharedLocation(m.deps, EMETTEUR, { latitude: 48.8571, longitude: 2.3529, accuracy: 4 });

    expect(m.vers(SANG)).toEqual([]);
    expect(m.vers(PROCHE)).toEqual([]);
    expect(m.vers(AMI).map((e) => e.data.latitude)).toEqual([48.8571]);
  });
});
