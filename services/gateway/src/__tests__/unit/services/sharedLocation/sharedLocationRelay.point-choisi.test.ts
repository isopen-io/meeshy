/**
 * UN POINT CHOISI SUIT LE FANTÔME ET NE PERD AUCUNE COURSE (#20115). Un point choisi à la main
 * (`source: 'manual'`, #19557) n'a jamais de « position suivante » : à la sortie du fantôme, il
 * se sert de nouveau, au direct comme au rattrapage. Et aucun geste d'appareil en vol — une mise
 * à jour dont l'éventail est plus lent, un démarrage sans source qui prend le pointeur juste après
 * — ne sert la position réelle APRÈS le point choisi.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { SHARED_LOCATION_ERROR_CODES } from '@meeshy/shared/types/shared-location';
import {
  ownSharedLocationFor,
  reflectSharedLocationGhost,
  sharedLocationEndedFor,
  sharedLocationSnapshotFor,
  startSharedLocation,
  updateSharedLocation,
} from '../../../../services/sharedLocation/sharedLocationRelay';
import { readSharedLocation } from '../../../../services/sharedLocation/sharedLocationStore';
import { AMI, EMETTEUR, monde, PARIS, PLUS_LOIN, PROCHE, T0 } from '../../../helpers/shared-location-relay-world';

const MINUTE = 60_000;
const CHOISI = { latitude: 48.8606, longitude: 2.3376 } as const;
const tick = () => new Promise((resolve) => setImmediate(resolve));
const DESTINATAIRES = [{ userId: AMI, precision: 'exact' }, { userId: PROCHE, precision: 'city' }] as const;

type Monde = ReturnType<typeof monde>;

const partagerAppareil = (m: Monde, position: { readonly latitude: number; readonly longitude: number } = PARIS) =>
  startSharedLocation(m.deps, EMETTEUR, { recipients: DESTINATAIRES, durationMinutes: 60, position });
const choisirPoint = (m: Monde) =>
  startSharedLocation(m.deps, EMETTEUR, { recipients: DESTINATAIRES, durationMinutes: 60, position: CHOISI, source: 'manual' });

const changesVers = (m: Monde, userId: string) =>
  m.vers(userId).filter((e) => e.event === SERVER_EVENTS.SHARED_LOCATION_CHANGED).map((e) => e.data);
const dernierServi = (m: Monde, userId: string) => changesVers(m, userId).at(-1);

describe('à la sortie du fantôme, un point choisi se sert de nouveau (#20115, 1)', () => {
  const choisiPuisFantome = async () => {
    const m = monde();
    await choisirPoint(m);
    await m.ecrireCompte(EMETTEUR, { locationGhostAt: new Date(T0) });
    await reflectSharedLocationGhost(m.deps, EMETTEUR, 'entered');
    m.avancer(MINUTE);
    m.emissions.length = 0;
    await m.ecrireCompte(EMETTEUR, { locationGhostAt: null });
    await reflectSharedLocationGhost(m.deps, EMETTEUR, 'left');
    return m;
  };

  it('chaque destinataire ouvert reçoit le point, à sa précision, au direct', async () => {
    const m = await choisiPuisFantome();
    expect(changesVers(m, AMI)).toHaveLength(1);
    expect(dernierServi(m, AMI)).toMatchObject({ latitude: CHOISI.latitude, longitude: CHOISI.longitude, precision: 'exact' });
    expect(changesVers(m, PROCHE)).toHaveLength(1);
    expect(dernierServi(m, PROCHE)).toMatchObject({ precision: 'city' });
    expect(dernierServi(m, PROCHE)?.latitude).not.toBe(CHOISI.latitude);
  });

  it('le rattrapage le sert, et la fin n’est plus listée parmi les partages terminés', async () => {
    const m = await choisiPuisFantome();
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items.map((item) => item.latitude)).toEqual([CHOISI.latitude]);
    expect(await sharedLocationEndedFor(m.deps, AMI)).toEqual([]);
  });

  it('le point reste choisi : même position, même source, aucun relevé d’appareil n’y entre', async () => {
    const m = await choisiPuisFantome();
    expect(await readSharedLocation(m.deps.cache, EMETTEUR, m.deps.now())).toMatchObject({ source: 'manual', position: CHOISI });
    expect(await ownSharedLocationFor(m.deps, EMETTEUR)).toMatchObject({ source: 'manual' });
  });

  it('un point choisi PENDANT le fantôme se sert à la sortie', async () => {
    const m = monde();
    await m.ecrireCompte(EMETTEUR, { locationGhostAt: new Date(T0) });
    await choisirPoint(m);
    expect(m.emissions).toEqual([]);
    m.avancer(MINUTE);
    await m.ecrireCompte(EMETTEUR, { locationGhostAt: null });
    await reflectSharedLocationGhost(m.deps, EMETTEUR, 'left');
    expect(dernierServi(m, AMI)).toMatchObject({ latitude: CHOISI.latitude });
  });

  it('une position d’appareil, elle, attend toujours la suivante (inchangé)', async () => {
    const m = monde();
    await partagerAppareil(m);
    await m.ecrireCompte(EMETTEUR, { locationGhostAt: new Date(T0) });
    await reflectSharedLocationGhost(m.deps, EMETTEUR, 'entered');
    m.avancer(MINUTE);
    m.emissions.length = 0;
    await m.ecrireCompte(EMETTEUR, { locationGhostAt: null });
    await reflectSharedLocationGhost(m.deps, EMETTEUR, 'left');
    expect(m.emissions).toEqual([]);
  });
});

describe('aucune course ne sert la position réelle APRÈS un point choisi (#20115, 2)', () => {
  it('une mise à jour écrite juste avant le point choisi, dont l’éventail est plus lent, ne sert pas sa position après lui', async () => {
    const m = monde();
    await partagerAppareil(m);
    m.avancer(MINUTE);
    m.suspendreProchaineLecture();
    const miseAJour = updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);
    await tick();

    expect(await choisirPoint(m)).toMatchObject({ success: true });
    m.relacherLecture();
    await miseAJour;

    expect(dernierServi(m, AMI)).toMatchObject({ latitude: CHOISI.latitude, longitude: CHOISI.longitude });
    expect(changesVers(m, AMI).some((data) => data.latitude === PLUS_LOIN.latitude)).toBe(false);
  });

  it('un démarrage sans source qui prend le pointeur juste après un point choisi est refusé, et le point reste servi', async () => {
    const m = monde();
    await partagerAppareil(m);
    m.avancer(MINUTE);
    m.suspendreProchainePrise();
    const demarrageAppareil = partagerAppareil(m, PLUS_LOIN);
    await tick();
    await tick();

    expect(await choisirPoint(m)).toMatchObject({ success: true });
    m.relacherPrise();

    expect(await demarrageAppareil).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.FIXED_POINT });
    expect(await readSharedLocation(m.deps.cache, EMETTEUR, m.deps.now())).toMatchObject({ source: 'manual', position: CHOISI });
    expect(changesVers(m, AMI).some((data) => data.latitude === PLUS_LOIN.latitude)).toBe(false);
    expect(dernierServi(m, AMI)).toMatchObject({ latitude: CHOISI.latitude });
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items.map((item) => item.latitude)).toEqual([CHOISI.latitude]);
  });

  it('le point choisi n’est jamais remplacé, même un instant : un « device » explicite qui suit le refus gagne, sans résurrection', async () => {
    const m = monde();
    await partagerAppareil(m);
    m.avancer(MINUTE);
    m.suspendreProchainePrise();
    const demarrageAppareil = partagerAppareil(m, PLUS_LOIN);
    await tick();
    await tick();
    await choisirPoint(m);
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items.map((item) => item.latitude)).toEqual([CHOISI.latitude]);
    m.relacherPrise();
    expect(await demarrageAppareil).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.FIXED_POINT });

    const remplacement = await startSharedLocation(m.deps, EMETTEUR, { recipients: DESTINATAIRES, durationMinutes: 60, position: PLUS_LOIN, source: 'device' });

    expect(remplacement).toMatchObject({ success: true });
    expect(await ownSharedLocationFor(m.deps, EMETTEUR)).toMatchObject({ source: 'device' });
    expect(dernierServi(m, AMI)).toMatchObject({ latitude: PLUS_LOIN.latitude });
  });

  it('un démarrage sans source devancé par un autre partage d’APPAREIL relit et prend le pointeur', async () => {
    const m = monde();
    await partagerAppareil(m);
    m.avancer(MINUTE);
    m.suspendreProchainePrise();
    const lent = partagerAppareil(m, PLUS_LOIN);
    await tick();
    await tick();
    expect(await partagerAppareil(m)).toMatchObject({ success: true });
    m.relacherPrise();

    expect(await lent).toMatchObject({ success: true });
    expect(dernierServi(m, AMI)).toMatchObject({ latitude: PLUS_LOIN.latitude });
    expect((await readSharedLocation(m.deps.cache, EMETTEUR, m.deps.now()))?.position).toMatchObject({ latitude: PLUS_LOIN.latitude });
  });

  it('un démarrage qui DIT « device » remplace toujours le point choisi, même dans cette course', async () => {
    const m = monde();
    await partagerAppareil(m);
    m.avancer(MINUTE);
    m.suspendreProchainePrise();
    const demarrageAppareil = startSharedLocation(m.deps, EMETTEUR, { recipients: DESTINATAIRES, durationMinutes: 60, position: PLUS_LOIN, source: 'device' });
    await tick();
    await tick();

    await choisirPoint(m);
    m.relacherPrise();

    expect(await demarrageAppareil).toMatchObject({ success: true });
    expect(await ownSharedLocationFor(m.deps, EMETTEUR)).toMatchObject({ source: 'device' });
  });
});
