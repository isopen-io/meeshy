/**
 * L'ÉCHÉANCE PAR DESTINATAIRE, TENUE PAR LA PASSERELLE (#18205). Le partage serveur a UN
 * terme (1 h ou 8 h) ; chaque personne peut avoir une échéance plus proche, que l'appareil
 * envoie (`recipients[].expiresInSeconds`). Passé SON échéance, un lecteur ne reçoit plus
 * rien — ni point, ni rattrapage, ni remontée de cercle — sans que l'appareil de l'émetteur
 * ait à tourner, et l'heure qu'on lui sert est la SIENNE, jamais le terme du partage (qui
 * trahirait qu'un autre voit plus longtemps).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  refreshSharedLocationBetween,
  sharedLocationSnapshotFor,
  startSharedLocation,
  updateSharedLocation,
} from '../../../../services/sharedLocation/sharedLocationRelay';
import { AMI, EMETTEUR, HEURE, monde, PARIS, PLUS_LOIN, PROCHE, SANG, T0 } from '../../../helpers/shared-location-relay-world';

const HUIT_HEURES = 8 * HEURE;
const iso = (ms: number): string => new Date(ms).toISOString();

const demarrerAvecEcheances = (m: ReturnType<typeof monde>) =>
  startSharedLocation(m.deps, EMETTEUR, {
    recipients: [
      { userId: AMI, precision: 'exact', expiresInSeconds: 3600 },
      { userId: PROCHE, precision: 'exact' },
      { userId: SANG, precision: 'city', expiresInSeconds: 2 * 3600 },
    ],
    durationMinutes: 480,
    position: PARIS,
  });

describe('chaque personne reçoit SON échéance, jamais le terme du partage', () => {
  it('l\'Ami à 1 h lit 1 h, le Proche sans échéance lit le terme de 8 h, le Sang lit 2 h', async () => {
    const m = monde();
    const ack = await demarrerAvecEcheances(m);

    expect(ack).toEqual({ success: true, data: { expiresAt: iso(T0 + HUIT_HEURES) } });
    expect(m.vers(AMI).map((e) => e.data.expiresAt)).toEqual([iso(T0 + HEURE)]);
    expect(m.vers(PROCHE).map((e) => e.data.expiresAt)).toEqual([iso(T0 + HUIT_HEURES)]);
    expect(m.vers(SANG).map((e) => e.data.expiresAt)).toEqual([iso(T0 + 2 * HEURE)]);
    expect(JSON.stringify(m.vers(AMI))).not.toContain(iso(T0 + HUIT_HEURES));
  });

  it('le rattrapage sert la même échéance que le direct', async () => {
    const m = monde();
    await demarrerAvecEcheances(m);
    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items.map((item) => item.expiresAt)).toEqual([iso(T0 + HEURE)]);
  });

  it('une échéance plus lointaine que le terme est ramenée au terme', async () => {
    const m = monde();
    await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI, precision: 'exact', expiresInSeconds: 8 * 3600 }], durationMinutes: 60, position: PARIS });
    expect(m.vers(AMI).map((e) => e.data.expiresAt)).toEqual([iso(T0 + HEURE)]);
  });

  it('un ancien client sans échéance : chacun garde le terme du partage, comme avant', async () => {
    const m = monde();
    await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI, precision: 'exact' }, { userId: PROCHE }], durationMinutes: 480, position: PARIS });
    expect(m.vers(AMI).map((e) => e.data.expiresAt)).toEqual([iso(T0 + HUIT_HEURES)]);
    expect(m.vers(PROCHE).map((e) => e.data.expiresAt)).toEqual([iso(T0 + HUIT_HEURES)]);
  });

  it('une échéance illisible (nulle, négative, fractionnaire, au-delà de 8 h) refuse le partage', async () => {
    for (const expiresInSeconds of [0, -5, 1.5, 8 * 3600 + 1, '3600']) {
      const m = monde();
      const ack = await startSharedLocation(m.deps, EMETTEUR, { recipients: [{ userId: AMI, expiresInSeconds }], durationMinutes: 60, position: PARIS });
      expect(ack).toMatchObject({ success: false });
      expect(m.emissions).toEqual([]);
    }
  });
});

describe('passé son échéance, un lecteur ne reçoit plus rien, sans action de l\'émetteur', () => {
  it('le rattrapage ne le sert plus, alors que le partage court encore pour les autres', async () => {
    const m = monde();
    await demarrerAvecEcheances(m);
    m.avancer(HEURE + 1);

    expect((await sharedLocationSnapshotFor(m.deps, AMI, {})).items).toEqual([]);
    expect((await sharedLocationSnapshotFor(m.deps, PROCHE, {})).items).toHaveLength(1);
  });

  it('une position suivante ne part plus chez lui ; il reçoit la fin, et rien à côté', async () => {
    const m = monde();
    await demarrerAvecEcheances(m);
    m.avancer(HEURE + 1);
    m.emissions.length = 0;

    await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);

    expect(m.vers(AMI).map((e) => [e.event, e.data])).toEqual([[SERVER_EVENTS.SHARED_LOCATION_ENDED, { userId: EMETTEUR }]]);
    expect(m.vers(PROCHE).map((e) => [e.event, e.data.latitude])).toEqual([[SERVER_EVENTS.SHARED_LOCATION_CHANGED, 48.8738]]);
  });

  it('une remontée de cercle après son échéance ne fait pas revenir la position', async () => {
    const m = monde();
    await demarrerAvecEcheances(m);
    m.avancer(HEURE + 1);
    m.emissions.length = 0;

    await m.lier(EMETTEUR, AMI, 'CLOSE');
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: AMI });

    expect(m.vers(AMI).filter((e) => e.event === SERVER_EVENTS.SHARED_LOCATION_CHANGED)).toEqual([]);
  });

  it('avant son échéance, une remontée fait revenir le détail conservé, avec SON échéance', async () => {
    const m = monde();
    await demarrerAvecEcheances(m);
    m.emissions.length = 0;

    await m.lier(EMETTEUR, SANG, 'CLOSE');
    await refreshSharedLocationBetween(m.deps, { userA: EMETTEUR, userB: SANG });

    expect(m.vers(SANG).map((e) => [e.data.circle, e.data.expiresAt])).toEqual([['CLOSE', iso(T0 + 2 * HEURE)]]);
  });

  it('une mise à jour garde l\'échéance de chacun', async () => {
    const m = monde();
    await demarrerAvecEcheances(m);
    m.avancer(10 * 60_000);
    m.emissions.length = 0;

    await updateSharedLocation(m.deps, EMETTEUR, PLUS_LOIN);
    expect(m.vers(AMI).map((e) => e.data.expiresAt)).toEqual([iso(T0 + HEURE)]);
  });
});
