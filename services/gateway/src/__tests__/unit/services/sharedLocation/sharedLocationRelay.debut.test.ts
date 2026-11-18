/**
 * LE DÉBUT DU PARTAGE, SERVI AU DESTINATAIRE (#19458). La carte d'une personne dit
 * « Partage pour 1 h » à côté de « encore 42 min » : la durée choisie ne se déduit pas de
 * `expiresAt - updatedAt` (le temps restant). La passerelle sert donc `startedAt`, le début
 * du partage en cours, redit à chaque remplacement ; le lecteur calcule SA fenêtre
 * (`expiresAt - startedAt`), jamais le terme des autres. Un état rangé avant ce lot ne le
 * sert pas : le client masque alors le libellé.
 *
 * UN FLOUTÉ N'A PAS D'HORLOGE FINE (#19682) : comme `updatedAt`, le début servi à un lecteur
 * qui n'a pas la précision exacte tombe sur le quart d'heure. Seul le lecteur exact lit
 * l'instant du « Partager » ; une montée vers l'exact le fait remonter, une baisse le recoupe.
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

describe('chaque destinataire reçoit le début du partage, à la finesse de sa précision', () => {
  it('le lecteur exact lit l\'instant du « Partager » ; le Proche et le Sang floutés, son quart d\'heure', async () => {
    const m = monde();
    m.avancer(14 * MINUTE + 17_321);
    await demarrer(m);

    expect(changes(m, AMI).map((e) => e.data.startedAt)).toEqual([iso(T0 + 14 * MINUTE + 17_321)]);
    expect(changes(m, PROCHE).map((e) => e.data.startedAt)).toEqual([iso(T0)]);
    expect(changes(m, SANG).map((e) => [e.data.startedAt, e.data.expiresAt])).toEqual([[iso(T0), iso(T0 + 14 * MINUTE + 17_321 + 30 * MINUTE)]]);
  });

  it('un début pile sur le quart d\'heure reste le même pour un flouté', async () => {
    const m = monde();
    m.avancer(45 * MINUTE);
    await demarrer(m);
    expect(changes(m, PROCHE).map((e) => e.data.startedAt)).toEqual([iso(T0 + 45 * MINUTE)]);
  });

  it('le rattrapage sert le même début que le direct, arrondi pour le flouté, exact pour l\'exact', async () => {
    const m = monde();
    m.avancer(7 * MINUTE + 3_000);
    await demarrer(m, 480);
    m.avancer(20 * MINUTE);
    const [floute] = (await sharedLocationSnapshotFor(m.deps, PROCHE, {})).items;
    expect(floute).toMatchObject({ startedAt: iso(T0), expiresAt: iso(T0 + 7 * MINUTE + 3_000 + 8 * HEURE) });
    const [exact] = (await sharedLocationSnapshotFor(m.deps, AMI, {})).items;
    expect(exact?.startedAt).toBe(iso(T0 + 7 * MINUTE + 3_000));
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

  it('une montée vers l\'exact fait remonter l\'instant gardé, une baisse le recoupe, sans nouvel envoi de position', async () => {
    const m = monde();
    m.avancer(11 * MINUTE + 5_000);
    await demarrer(m);
    const debut = iso(T0 + 11 * MINUTE + 5_000);
    const liste = (precision: 'exact' | 'city') =>
      startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI, precision: 'exact' }, { userId: PROCHE, precision }], durationMinutes: 60 });

    await liste('exact');
    expect(changes(m, PROCHE).at(-1)?.data.startedAt).toBe(debut);
    expect((await sharedLocationSnapshotFor(m.deps, PROCHE, {})).items[0]?.startedAt).toBe(debut);

    await liste('city');
    expect(changes(m, PROCHE).at(-1)?.data.startedAt).toBe(iso(T0));
    expect((await sharedLocationSnapshotFor(m.deps, PROCHE, {})).items[0]?.startedAt).toBe(iso(T0));
  });

  it('aucune charge d\'un flouté ne porte un début plus fin que le quart d\'heure, ni au direct, ni aux mises à jour', async () => {
    const m = monde();
    m.avancer(9 * MINUTE + 41_007);
    await demarrer(m);
    m.avancer(3 * MINUTE);
    await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);
    const servis = [...changes(m, PROCHE), ...changes(m, SANG)].map((e) => Date.parse(String(e.data.startedAt)));
    expect(servis.length).toBeGreaterThan(0);
    expect(servis.every((ms) => ms % (15 * MINUTE) === 0)).toBe(true);
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
