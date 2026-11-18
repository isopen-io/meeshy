/**
 * LE DÉBUT DU PARTAGE, SERVI AU DESTINATAIRE (#19458). La carte d'une personne dit
 * « Partage pour 1 h » à côté de « encore 42 min » : la durée choisie ne se déduit pas de
 * `expiresAt - updatedAt` (le temps restant). La passerelle sert donc `startedAt`, le début
 * du partage en cours, redit à chaque remplacement ; le lecteur calcule SA fenêtre
 * (`expiresAt - startedAt`), jamais le terme des autres. Un état rangé avant ce lot ne le
 * sert pas : le client masque alors le libellé.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  captureSharedLocationAccess,
  refreshSharedLocationBetween,
  sharedLocationSnapshotFor,
  startSharedLocation,
  updateSharedLocation,
} from '../../../../services/sharedLocation/sharedLocationRelay';
import { readSharedLocation, storeSharedLocationIfCurrent } from '../../../../services/sharedLocation/sharedLocationStore';
import { AMI, EMETTEUR, HEURE, monde, PARIS, PLUS_LOIN, PROCHE, SANG, T0 } from '../../../helpers/shared-location-relay-world';

const iso = (ms: number): string => new Date(ms).toISOString();
const MINUTE = 60_000;

const demarrer = (m: ReturnType<typeof monde>, durationMinutes = 60) =>
  startSharedLocation(m.deps, EMETTEUR, {
    recipients: [
      { userId: AMI, precision: 'exact' },
      { userId: PROCHE, precision: 'city' },
      { userId: SANG, precision: 'neighborhood', expiresInSeconds: 1800 },
    ],
    durationMinutes,
    position: PARIS,
  });

const changes = (m: ReturnType<typeof monde>, userId: string) =>
  m.vers(userId).filter((e) => e.event === SERVER_EVENTS.SHARED_LOCATION_CHANGED);

describe('chaque destinataire reçoit le début du partage, quelle que soit sa précision', () => {
  it('le Proche flouté et le Sang à échéance propre lisent le même début, exact, et leur propre échéance', async () => {
    const m = monde();
    m.avancer(17_321);
    await demarrer(m);

    expect(changes(m, PROCHE).map((e) => e.data.startedAt)).toEqual([iso(T0 + 17_321)]);
    expect(changes(m, SANG).map((e) => [e.data.startedAt, e.data.expiresAt])).toEqual([[iso(T0 + 17_321), iso(T0 + 17_321 + 30 * MINUTE)]]);
    expect(changes(m, AMI).map((e) => e.data.startedAt)).toEqual([iso(T0 + 17_321)]);
  });

  it('le rattrapage sert le même début que le direct', async () => {
    const m = monde();
    await demarrer(m, 480);
    m.avancer(20 * MINUTE);
    const [item] = (await sharedLocationSnapshotFor(m.deps, PROCHE, {})).items;
    expect(item).toMatchObject({ startedAt: iso(T0), expiresAt: iso(T0 + 8 * HEURE) });
  });

  it('une nouvelle position garde le début ; seule l\'heure de mise à jour avance', async () => {
    const m = monde();
    await demarrer(m);
    m.avancer(10 * MINUTE);
    await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);

    const derniere = changes(m, AMI).at(-1)?.data;
    expect(derniere).toMatchObject({ startedAt: iso(T0), updatedAt: iso(T0 + 10 * MINUTE) });
  });

  it('un remplacement (prolongation) redit le nouveau début', async () => {
    const m = monde();
    await demarrer(m);
    m.avancer(40 * MINUTE);
    await demarrer(m, 480);

    expect(changes(m, PROCHE).map((e) => e.data.startedAt)).toEqual([iso(T0), iso(T0 + 40 * MINUTE)]);
    const [item] = (await sharedLocationSnapshotFor(m.deps, PROCHE, {})).items;
    expect(item?.startedAt).toBe(iso(T0 + 40 * MINUTE));
  });

  it('une remontée de cercle sert aussi le début', async () => {
    const m = monde();
    await demarrer(m);
    const avant = await captureSharedLocationAccess(m.deps, { userA: EMETTEUR, userB: PROCHE });
    await m.lier(EMETTEUR, PROCHE, 'BLOOD');
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: PROCHE, before: avant });
    expect(changes(m, PROCHE)).toHaveLength(2);
    expect(changes(m, PROCHE).at(-1)?.data.startedAt).toBe(iso(T0));
  });
});

describe('rien d\'autre ne part à côté, et un état antérieur ne fabrique rien', () => {
  it('la charge d\'un flouté ne porte que les champs déclarés', async () => {
    const m = monde();
    await demarrer(m);
    expect(Object.keys(changes(m, PROCHE)[0]?.data ?? {}).sort()).toEqual(
      ['circle', 'expiresAt', 'latitude', 'longitude', 'precision', 'radiusMeters', 'startedAt', 'updatedAt', 'userId'],
    );
  });

  it('un partage rangé avant ce lot (sans début) est servi sans début', async () => {
    const m = monde();
    await demarrer(m);
    const rangé = await readSharedLocation(m.deps.cache, EMETTEUR, m.deps.now());
    expect(rangé?.startedAt).toBe(iso(T0));
    const { startedAt: _retiré, ...ancien } = rangé!;
    await storeSharedLocationIfCurrent(m.deps.cache, EMETTEUR, ancien, m.deps.now());

    const [item] = (await sharedLocationSnapshotFor(m.deps, AMI, {})).items;
    expect(item).toBeDefined();
    expect(item).not.toHaveProperty('startedAt');

    m.avancer(MINUTE);
    await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);
    expect(changes(m, AMI).at(-1)?.data).not.toHaveProperty('startedAt');
  });
});
