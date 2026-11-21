/**
 * LA LISTE SEULE (#19284 ⊂ #18580) : un retrait ou une échéance republie la liste par
 * `location:share-start` SANS position. La passerelle reprend la position COMPLÈTE qu'elle
 * garde, scellée, avec son HEURE (le point n'est pas rafraîchi), et la maille retenue de
 * chaque destinataire restant. L'appareil qui retire n'envoie donc jamais SA position : un
 * ordinateur resté à la maison ne remplace plus celle du téléphone.
 *
 * Une liste seule ne fait que retirer ou garder : elle n'ajoute personne (ajouter est un
 * geste qui envoie sa position). Sans partage en cours, il n'y a rien à reprendre.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { sharedLocationStartPayloadSchema } from '@meeshy/shared/types/shared-location';
import {
  refreshSharedLocationBetween,
  sharedLocationSnapshotFor,
  startSharedLocation,
  updateSharedLocation,
} from '../../../../services/sharedLocation/sharedLocationRelay';
import { setLocationGhost, type LocationGhostDb } from '../../../../services/sharedLocation/locationGhost';
import { sharedBatteryGrantsAmong } from '../../../../services/sharedLocation/sharedLocationBattery';
import { AMI, CONNAISSANCE, EMETTEUR, HEURE, monde, NON_CHOISI, PARIS, PLUS_LOIN, PROCHE, SANG, T0 } from '../../../helpers/shared-location-relay-world';

const MINUTE = 60_000;
const iso = (ms: number): string => new Date(ms).toISOString();

const demarrer = (m: ReturnType<typeof monde>) =>
  startSharedLocation(m.deps, EMETTEUR, {
    recipients: [
      { userId: AMI, precision: 'exact' },
      { userId: PROCHE, precision: 'neighborhood' },
      { userId: SANG, precision: 'exact' },
    ],
    durationMinutes: 60,
    position: PARIS,
  });

const changes = (m: ReturnType<typeof monde>, readerId: string) => m.vers(readerId).filter((e) => e.event === SERVER_EVENTS.SHARED_LOCATION_CHANGED);

describe('le contrat : la position devient facultative au démarrage', () => {
  it('une charge sans position se lit ; une position illisible reste refusée', () => {
    expect(sharedLocationStartPayloadSchema.safeParse({ recipients: [{ userId: AMI }], durationMinutes: 60 }).success).toBe(true);
    expect(sharedLocationStartPayloadSchema.safeParse({ recipients: [{ userId: AMI }], durationMinutes: 60, position: { latitude: 91, longitude: 0 } }).success).toBe(false);
    expect(sharedLocationStartPayloadSchema.safeParse({ recipients: [{ userId: AMI }], durationMinutes: 60, position: null }).success).toBe(false);
  });
});

describe('retirer une personne sans envoyer sa position', () => {
  it('le retiré reçoit la fin ; les restants ne reçoivent ni nouveau point ni nouvelle heure', async () => {
    const m = monde();
    await demarrer(m);
    m.avancer(10 * MINUTE);
    m.emissions.length = 0;

    const ack = await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI, precision: 'exact' }, { userId: PROCHE, precision: 'neighborhood' }], durationMinutes: 60 });

    expect(ack).toEqual({ success: true, data: { expiresAt: iso(T0 + HEURE), startedAt: iso(T0) } });
    expect(m.vers(SANG).map((e) => [e.event, e.data])).toEqual([[SERVER_EVENTS.SHARED_LOCATION_ENDED, { userId: EMETTEUR }]]);
    const servi = (await sharedLocationSnapshotFor(m.deps, AMI, {})).items;
    expect(servi.map((item) => [item.latitude, item.longitude, item.updatedAt])).toEqual([[PARIS.latitude, PARIS.longitude, iso(T0)]]);
  });

  it('un restant flouté garde SA maille et son heure arrondie : rien ne lui apprend un déplacement', async () => {
    const m = monde();
    await demarrer(m);
    await updateSharedLocation(m.deps, EMETTEUR, { latitude: PARIS.latitude + 0.004, longitude: PARIS.longitude + 0.004, accuracy: 5 });
    const avant = (await sharedLocationSnapshotFor(m.deps, PROCHE, {})).items;
    m.emissions.length = 0;

    await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: PROCHE, precision: 'neighborhood' }], durationMinutes: 60 });

    const apres = (await sharedLocationSnapshotFor(m.deps, PROCHE, {})).items;
    expect(apres.map(({ latitude, longitude, updatedAt, radiusMeters }) => ({ latitude, longitude, updatedAt, radiusMeters }))).toEqual(
      avant.map(({ latitude, longitude, updatedAt, radiusMeters }) => ({ latitude, longitude, updatedAt, radiusMeters })),
    );
    expect(JSON.stringify(m.vers(PROCHE))).not.toContain(String(PARIS.latitude + 0.004));
  });

  it('la position suivante de l\'appareil qui publie part de nouveau, à jour', async () => {
    const m = monde();
    await demarrer(m);
    await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI, precision: 'exact' }], durationMinutes: 60 });
    m.emissions.length = 0;

    expect(await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN)).toMatchObject({ success: true });
    expect(changes(m, AMI).map((e) => e.data.latitude)).toEqual([PLUS_LOIN.latitude]);
  });
});

describe('ce que la liste seule ne fait PAS', () => {
  it('elle n\'ajoute personne : une personne absente du partage servi est ignorée, les autres retraits prennent', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    const ack = await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI, precision: 'exact' }, { userId: NON_CHOISI, precision: 'exact' }], durationMinutes: 60 });

    expect(ack).toMatchObject({ success: true });
    expect(m.vers(NON_CHOISI)).toEqual([]);
    expect((await sharedLocationSnapshotFor(m.deps, NON_CHOISI, {})).items).toEqual([]);
    expect((await sharedLocationSnapshotFor(m.deps, SANG, {})).items).toEqual([]);
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items).toHaveLength(1);
  });

  it('elle ne fait pas revenir une personne dont l\'échéance est passée', async () => {
    const m = monde();
    await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI, expiresInSeconds: 600 }, { userId: PROCHE }], durationMinutes: 60, position: PARIS });
    m.avancer(11 * MINUTE);

    expect(await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI }, { userId: PROCHE }], durationMinutes: 60 })).toMatchObject({ success: true });

    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items).toEqual([]);
    expect((await sharedLocationSnapshotFor(m.deps, PROCHE, {})).items).toHaveLength(1);
  });

  it('une liste où personne n\'est encore servi vaut un arrêt : chacun reçoit la fin', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    expect(await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: NON_CHOISI }], durationMinutes: 60 })).toMatchObject({ success: false, code: 'SHARED_LOCATION_NOT_SHARING' });

    expect([AMI, PROCHE, SANG].map((id) => m.vers(id).map((e) => e.event))).toEqual([[SERVER_EVENTS.SHARED_LOCATION_ENDED], [SERVER_EVENTS.SHARED_LOCATION_ENDED], [SERVER_EVENTS.SHARED_LOCATION_ENDED]]);
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items).toEqual([]);
  });

  it('elle ne relève pas une précision : une personne réglée sur la ville ne reçoit jamais le point exact', async () => {
    const m = monde();
    await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI, precision: 'city' }, { userId: PROCHE }], durationMinutes: 60, position: PARIS });
    m.emissions.length = 0;

    await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI, precision: 'exact' }], durationMinutes: 60 });

    expect(m.vers(AMI).map((e) => e.data.precision)).toEqual(['city']);
    expect(JSON.stringify(m.vers(AMI))).not.toContain(String(PARIS.latitude));
  });

  it('elle ne prolonge ni le terme ni une échéance', async () => {
    const m = monde();
    await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI, expiresInSeconds: 600 }, { userId: PROCHE }], durationMinutes: 60, position: PARIS });
    m.avancer(5 * MINUTE);

    const ack = await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI }, { userId: PROCHE }], durationMinutes: 480 });

    expect(ack).toEqual({ success: true, data: { expiresAt: iso(T0 + HEURE), startedAt: iso(T0) } });
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items.map((item) => item.expiresAt)).toEqual([iso(T0 + 10 * MINUTE)]);
    m.avancer(6 * MINUTE);
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items).toEqual([]);
  });

  it('sans partage en cours, il n\'y a rien à reprendre : NOT_SHARING, rien ne part', async () => {
    const m = monde();
    const ack = await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI }], durationMinutes: 60 });
    expect(ack).toMatchObject({ success: false, code: 'SHARED_LOCATION_NOT_SHARING' });
    expect(m.emissions).toEqual([]);
  });

  it('un partage échu ne se reprend pas', async () => {
    const m = monde();
    await demarrer(m);
    m.avancer(HEURE + 1);
    const ack = await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI }], durationMinutes: 60 });
    expect(ack).toMatchObject({ success: false, code: 'SHARED_LOCATION_NOT_SHARING' });
  });
});

describe('un autre appareil agit pendant la liste seule', () => {
  it('un retrait fait par le téléphone entre la lecture et la prise n\'est pas défait', async () => {
    const m = monde();
    await demarrer(m);
    m.cache.suspendreProchaineEcriture('claim');
    const listeSeule = startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI, precision: 'exact' }, { userId: SANG, precision: 'exact' }], durationMinutes: 60 });
    await new Promise((resolve) => setImmediate(resolve));
    await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI, precision: 'exact' }], durationMinutes: 60, position: PLUS_LOIN });
    m.cache.relacher();
    await listeSeule;

    expect((await sharedLocationSnapshotFor(m.deps, SANG, {})).items).toEqual([]);
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items.map((item) => item.latitude)).toEqual([PLUS_LOIN.latitude]);
  });

  it('une position écrite par le téléphone pendant la liste seule ne recule pas', async () => {
    const m = monde();
    await demarrer(m);
    m.cache.suspendreProchaineEcriture('claim');
    const listeSeule = startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI, precision: 'exact' }], durationMinutes: 60 });
    await new Promise((resolve) => setImmediate(resolve));
    await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);
    m.cache.relacher();
    await listeSeule;

    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items.map((item) => item.latitude)).toEqual([PLUS_LOIN.latitude]);
    expect(changes(m, AMI).at(-1)?.data.latitude).toBe(PLUS_LOIN.latitude);
  });
});

describe('la troncature tient à travers la liste seule', () => {
  it('un lecteur sous Ami ne reçoit rien, et une remontée fait revenir le point conservé, pas un point neuf', async () => {
    const m = monde();
    await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: CONNAISSANCE, precision: 'exact' }, { userId: AMI, precision: 'exact' }], durationMinutes: 60, position: PARIS });
    await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: CONNAISSANCE, precision: 'exact' }], durationMinutes: 60 });
    expect(changes(m, CONNAISSANCE)).toEqual([]);

    await m.lier(EMETTEUR, CONNAISSANCE, 'FRIEND');
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: CONNAISSANCE });

    expect(changes(m, CONNAISSANCE).map((e) => [e.data.latitude, e.data.updatedAt])).toEqual([[PARIS.latitude, iso(T0)]]);
  });
});

describe('la liste seule garde ce que la session remplacée retenait (fusion avec #19203 et #19204)', () => {
  it('après la sortie du fantôme, une liste seule ne sert pas la position prise en fantôme', async () => {
    const m = monde();
    const regler = (ghost: boolean) =>
      setLocationGhost({ db: m.deps.prisma as unknown as LocationGhostDb, relay: m.deps, report: () => undefined }, EMETTEUR, ghost);
    await regler(true);
    await demarrer(m);
    m.avancer(MINUTE);
    await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);
    m.avancer(MINUTE);
    await regler(false);
    m.emissions.length = 0;

    const ack = await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI, precision: 'exact' }, { userId: PROCHE, precision: 'neighborhood' }], durationMinutes: 60 });

    expect(ack.success).toBe(true);
    expect(changes(m, AMI)).toEqual([]);
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items).toEqual([]);
    m.avancer(MINUTE);
    await updateSharedLocation(m.deps, EMETTEUR, PARIS);
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items.map((item) => item.latitude)).toEqual([PARIS.latitude]);
  });

  const avecBatterie = async (m: ReturnType<typeof monde>, shareBattery: boolean) => {
    await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI, precision: 'exact' }, { userId: PROCHE }], durationMinutes: 60, position: PARIS, shareBattery });
    m.avancer(MINUTE);
  };
  const accordes = async (m: ReturnType<typeof monde>) => [...((await sharedBatteryGrantsAmong(m.deps.cache, [EMETTEUR], m.deps.now())).get(EMETTEUR) ?? [])].sort();

  it('une liste seule sans la clé garde la batterie aux restants', async () => {
    const m = monde();
    await avecBatterie(m, true);

    await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI, precision: 'exact' }], durationMinutes: 60 });

    expect(await accordes(m)).toEqual([AMI]);
  });

  it('une liste seule peut retirer la batterie, jamais l\'ajouter', async () => {
    const retiree = monde();
    await avecBatterie(retiree, true);
    await startSharedLocation(retiree.deps, EMETTEUR, { recipients: [{ userId: AMI, precision: 'exact' }], durationMinutes: 60, shareBattery: false });
    expect(await accordes(retiree)).toEqual([]);

    const jamais = monde();
    await avecBatterie(jamais, false);
    await startSharedLocation(jamais.deps, EMETTEUR, { recipients: [{ userId: AMI, precision: 'exact' }], durationMinutes: 60, shareBattery: true });
    expect(await accordes(jamais)).toEqual([]);
  });
});

describe('une liste seule qui croise la sortie du fantôme (revue adversariale)', () => {
  it('une liste seule prise entre la lecture et la retenue de la sortie ne sert pas le point pris en fantôme', async () => {
    const m = monde();
    const db = m.deps.prisma as unknown as LocationGhostDb;
    await setLocationGhost({ db, relay: m.deps, report: () => undefined }, EMETTEUR, true);
    await demarrer(m);
    m.avancer(MINUTE);
    await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);
    m.avancer(MINUTE);
    let croisee = false;
    const relay = {
      ...m.deps,
      cache: new Proxy(m.deps.cache, {
        get: (target, prop) => {
          if (prop !== 'setIfCurrent' || croisee) return Reflect.get(target, prop);
          return async (...args: unknown[]) => {
            croisee = true;
            await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI, precision: 'exact' }], durationMinutes: 60 });
            return (Reflect.get(target, prop) as (...a: unknown[]) => unknown).apply(target, args);
          };
        },
      }),
    };
    m.emissions.length = 0;

    await setLocationGhost({ db, relay, report: () => undefined }, EMETTEUR, false);

    expect(croisee).toBe(true);
    expect(changes(m, AMI)).toEqual([]);
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items).toEqual([]);
  });
});
