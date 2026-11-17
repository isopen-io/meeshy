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

    expect(ack).toEqual({ success: true, data: { expiresAt: iso(T0 + 10 * MINUTE + HEURE) } });
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
  it('elle n\'ajoute personne : une personne absente du partage servi est refusée, rien ne part', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    const ack = await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI }, { userId: NON_CHOISI }], durationMinutes: 60 });

    expect(ack).toMatchObject({ success: false, code: 'SHARED_LOCATION_INVALID' });
    expect(m.emissions).toEqual([]);
    expect((await sharedLocationSnapshotFor(m.deps, NON_CHOISI, {})).items).toEqual([]);
    expect((await sharedLocationSnapshotFor(m.deps, SANG, {})).items).toHaveLength(1);
  });

  it('elle ne fait pas revenir une personne dont l\'échéance est passée', async () => {
    const m = monde();
    await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI, expiresInSeconds: 600 }, { userId: PROCHE }], durationMinutes: 60, position: PARIS });
    m.avancer(11 * MINUTE);

    const ack = await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI }, { userId: PROCHE }], durationMinutes: 60 });

    expect(ack).toMatchObject({ success: false, code: 'SHARED_LOCATION_INVALID' });
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
