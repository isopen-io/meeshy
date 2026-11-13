/**
 * LE CERCLE D'UNE POSITION PARTAGÉE (#17966 ⊂ #17013) — chaque lecteur apprend de quel
 * cercle (Ami, Proche, Sang) vient l'émetteur POUR LUI, tiré du verdict qui lui ouvre le
 * partage, sur le direct comme au rattrapage. Une montée ou une baisse de cercle à
 * précision égale ressert la position ; qui n'a pas d'accès n'apprend aucun cercle.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import {
  captureSharedLocationAccess,
  refreshSharedLocationBetween,
  sharedLocationSnapshotFor,
} from '../../../../services/sharedLocation/sharedLocationRelay';
import { AMI, BLOQUEUR, CONNAISSANCE, demarrer, EMETTEUR, monde, PROCHE, SANG } from '../../../helpers/shared-location-relay-world';

describe('le cercle — chaque lecteur apprend de quel cercle vient la personne, et lui seul (#17966)', () => {
  it('l\'Ami, le Proche et le Sang reçoivent chacun SON cercle, sur le direct comme au rattrapage', async () => {
    const m = monde();
    await demarrer(m);

    expect(m.vers(AMI).map((e) => e.data.circle)).toEqual(['FRIEND']);
    expect(m.vers(PROCHE).map((e) => e.data.circle)).toEqual(['CLOSE']);
    expect(m.vers(SANG).map((e) => e.data.circle)).toEqual(['BLOOD']);
    expect((await sharedLocationSnapshotFor(m.deps, PROCHE, {})).items.map((item) => item.circle)).toEqual(['CLOSE']);
  });

  it('une montée Ami → Proche à précision égale ressert la position avec le nouveau cercle, au seul lecteur qui monte', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    const avant = await captureSharedLocationAccess(m.deps, { userA: EMETTEUR, userB: AMI });
    await m.lier(EMETTEUR, AMI, 'CLOSE');
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: AMI, before: avant });

    expect(m.vers(AMI).map((e) => [e.event, e.data.circle, e.data.precision, e.data.latitude])).toEqual([[SERVER_EVENTS.SHARED_LOCATION_CHANGED, 'CLOSE', 'exact', 48.8566]]);
    expect(m.emissions.filter((e) => e.room !== ROOMS.user(AMI))).toEqual([]);
  });

  it('une baisse Sang → Proche à précision égale redescend le cercle sans rien ouvrir de plus', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    const avant = await captureSharedLocationAccess(m.deps, { userA: EMETTEUR, userB: SANG });
    await m.lier(EMETTEUR, SANG, 'CLOSE');
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: SANG, before: avant });

    expect(m.vers(SANG).map((e) => [e.data.circle, e.data.precision, e.data.latitude])).toEqual([['CLOSE', 'city', 48.85]]);
  });

  it('un lien qui ne bouge pas ne ressert rien', async () => {
    const m = monde();
    await demarrer(m);
    m.emissions.length = 0;

    const avant = await captureSharedLocationAccess(m.deps, { userA: EMETTEUR, userB: PROCHE });
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: PROCHE, before: avant });

    expect(m.vers(PROCHE)).toEqual([]);
  });

  it('une Connaissance ou un bloqueur n\'apprennent aucun cercle, ni par le direct ni par le rattrapage', async () => {
    const m = monde();
    await demarrer(m);
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: CONNAISSANCE });

    expect(m.vers(CONNAISSANCE)).toEqual([]);
    expect(m.vers(BLOQUEUR)).toEqual([]);
    expect((await sharedLocationSnapshotFor(m.deps, BLOQUEUR, {})).items).toEqual([]);
  });
});
