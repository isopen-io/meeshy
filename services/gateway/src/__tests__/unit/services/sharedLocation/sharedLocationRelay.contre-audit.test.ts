/**
 * CONTRE-AUDIT DE LA TÊTE 7e7dde1c0c9 (#16987) — un compte qui part ne peut plus repartager,
 * et un point servi par un chemin qui a lu la loi AVANT une baisse ne survit jamais à la fin.
 *
 * E1/E2 : un socket encore ouvert d'un compte désactivé ou supprimé ne range plus de partage
 * (la révocation des sessions est best-effort), donc une réactivation ne le fait pas revenir.
 * M1 : le rejeu d'une montée et le rattrapage relisent la loi après avoir noté le lecteur servi.
 * M2 : un lecteur servi dont l'accès est fermé par un chemin qui ne rejoue rien (un rôle qui
 * redescend) reçoit la fin à la position suivante.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { SHARED_LOCATION_ERROR_CODES } from '@meeshy/shared/types/shared-location';
import {
  captureSharedLocationAccess,
  endSharedLocationOfAccount,
  refreshSharedLocationBetween,
  sharedLocationSnapshotFor,
  startSharedLocation,
  updateSharedLocation,
} from '../../../../services/sharedLocation/sharedLocationRelay';
import { AMI, demarrer, EMETTEUR, monde, PARIS, PLUS_LOIN, T0 } from '../../../helpers/shared-location-relay-world';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const MODO = '6300000000000000000000e5';
const ADMIN = '6300000000000000000000e6';

describe('un compte qui part ne repartage pas depuis un socket resté ouvert (E1, E2)', () => {
  it('désactivé : un nouveau démarrage est refusé sans rien ranger, et la réactivation ne fait rien revenir', async () => {
    const m = monde();
    await demarrer(m);
    await m.ecrireCompte(EMETTEUR, { isActive: false, deactivatedAt: new Date(T0) });
    await endSharedLocationOfAccount(m.deps, EMETTEUR, { forget: false });

    expect(await demarrer(m)).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.NOT_SHARING });
    expect(m.cache.etatsDe(EMETTEUR)).toEqual([]);

    await m.ecrireCompte(EMETTEUR, { isActive: true, deactivatedAt: null });
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items).toEqual([]);
  });

  it('supprimé : un démarrage arrivé après la purge et avant la coupure des sockets ne range rien', async () => {
    const m = monde();
    await m.ecrireCompte(EMETTEUR, { isActive: false, deletedAt: new Date(T0) });
    await endSharedLocationOfAccount(m.deps, EMETTEUR, { forget: true });

    expect(await demarrer(m)).toMatchObject({ success: false, code: SHARED_LOCATION_ERROR_CODES.NOT_SHARING });
    expect(m.cache.etatsDe(EMETTEUR)).toEqual([]);
    expect(m.cache.pointeurDe(EMETTEUR)).toBeNull();
  });
});

describe('un point lu avant une baisse ne survit pas à la fin (M1)', () => {
  it('le rejeu d\'une montée en vol pendant une nouvelle baisse finit par la fin, et le rattrapage ne rend rien', async () => {
    const m = monde();
    await demarrer(m);
    await m.lier(EMETTEUR, AMI, 'ACQUAINTANCE');
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: AMI });
    m.emissions.length = 0;

    await m.lier(EMETTEUR, AMI, 'FRIEND');
    m.suspendreProchaineLecture();
    const montee = refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: AMI });
    await tick();
    const avant = await captureSharedLocationAccess(m.deps, { userA: EMETTEUR, userB: AMI });
    await m.lier(EMETTEUR, AMI, 'ACQUAINTANCE');
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: AMI, before: avant });
    m.relacherLecture();
    await montee;

    expect(m.vers(AMI).at(-1)?.event).toBe(SERVER_EVENTS.SHARED_LOCATION_ENDED);
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items).toEqual([]);
  });

  it('un rattrapage en vol pendant une baisse ne rend pas la position que la baisse vient d\'effacer', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    m.suspendreProchaineLecture();
    const rattrapage = sharedLocationSnapshotFor(m.deps, AMI, {});
    await tick();
    const avant = await captureSharedLocationAccess(m.deps, { userA: EMETTEUR, userB: AMI });
    await m.lier(EMETTEUR, AMI, 'ACQUAINTANCE');
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: AMI, before: avant });
    m.relacherLecture();

    expect((await rattrapage).items).toEqual([]);
  });
});

describe('un accès fermé sans rejeu se referme à la position suivante (M2)', () => {
  it('un collègue de l\'équipe redevenu utilisateur ordinaire reçoit la fin, une fois', async () => {
    const m = monde({ users: [{ id: MODO, role: 'MODERATOR' }, { id: ADMIN, role: 'ADMIN' }] });
    await startSharedLocation(m.deps, ADMIN, { recipients: [{ userId: MODO, precision: 'exact' }], durationMinutes: 60, position: PARIS });
    expect(m.vers(MODO).map((e) => e.event)).toEqual([SERVER_EVENTS.SHARED_LOCATION_CHANGED]);

    await m.ecrireCompte(MODO, { role: 'USER' });
    await updateSharedLocation(m.deps, ADMIN, PLUS_LOIN);
    await updateSharedLocation(m.deps, ADMIN, PARIS);

    expect(m.vers(MODO).map((e) => e.event)).toEqual([SERVER_EVENTS.SHARED_LOCATION_CHANGED, SERVER_EVENTS.SHARED_LOCATION_ENDED]);
    expect((await sharedLocationSnapshotFor(m.deps, MODO, {})).items).toEqual([]);
  });
});
