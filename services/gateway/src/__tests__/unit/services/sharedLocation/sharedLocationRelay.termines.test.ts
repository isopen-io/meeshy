/**
 * « PAS SUR LA CARTE » — LES PARTAGES TERMINÉS (#19202). La carte de tous mes proches dit
 * « Yuki · Partage terminé il y a 1 h » : un partage qui me visait, que l'émetteur a arrêté,
 * remplacé sans moi, ou qui a atteint son terme ou MON échéance, reste dit terminé un jour
 * durant. Qui, quand, son cercle — jamais une position. L'heure d'un lecteur flouté tombe sur
 * le quart d'heure, comme celle de ses points. La loi est relue à chaque lecture : rien sous
 * Ami, rien à un bloqueur, rien à qui ne l'a jamais reçu.
 *
 * @jest-environment node
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import {
  endSharedLocationOfAccount,
  sharedLocationEndedFor,
  startSharedLocation,
  stopSharedLocation,
} from '../../../../services/sharedLocation/sharedLocationRelay';
import { AMI, BLOQUEUR, CONNAISSANCE, demarrer, EMETTEUR, HEURE, monde, NON_CHOISI, PARIS, PROCHE, SANG, T0 } from '../../../helpers/shared-location-relay-world';

const KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const MINUTE = 60_000;
const JOUR = 24 * HEURE;
const iso = (ms: number): string => new Date(ms).toISOString();
afterEach(() => {
  delete process.env.SECRETS_AT_REST_KEY;
});

describe('un partage arrêté reste dit terminé à ceux qu\'il servait', () => {
  it('l\'Ami en exact lit l\'heure de l\'arrêt et son cercle, et rien d\'autre', async () => {
    const m = monde();
    await demarrer(m);
    m.avancer(7 * MINUTE + 13_000);
    await stopSharedLocation(m.deps, EMETTEUR);
    m.avancer(HEURE);

    const ended = await sharedLocationEndedFor(m.deps, AMI);

    expect(ended).toEqual([{ userId: EMETTEUR, endedAt: iso(T0 + 7 * MINUTE + 13_000), circle: 'FRIEND' }]);
  });

  it('le Proche en quartier et le Sang en ville lisent une heure au quart d\'heure, jamais à la seconde', async () => {
    const m = monde();
    await demarrer(m);
    m.avancer(7 * MINUTE + 13_000);
    await stopSharedLocation(m.deps, EMETTEUR);

    expect(await sharedLocationEndedFor(m.deps, PROCHE)).toEqual([{ userId: EMETTEUR, endedAt: iso(T0), circle: 'CLOSE' }]);
    expect(await sharedLocationEndedFor(m.deps, SANG)).toEqual([{ userId: EMETTEUR, endedAt: iso(T0), circle: 'BLOOD' }]);
  });

  it('une Connaissance choisie, un bloqueur choisi et un Ami non choisi n\'apprennent rien', async () => {
    const m = monde();
    await demarrer(m);
    await stopSharedLocation(m.deps, EMETTEUR);

    for (const lecteur of [CONNAISSANCE, BLOQUEUR, NON_CHOISI, EMETTEUR]) {
      expect(await sharedLocationEndedFor(m.deps, lecteur)).toEqual([]);
    }
  });

  it('aucune coordonnée n\'est servie, ni gardée à côté', async () => {
    process.env.SECRETS_AT_REST_KEY = KEY;
    const m = monde();
    await demarrer(m);
    await stopSharedLocation(m.deps, EMETTEUR);

    expect(JSON.stringify(await sharedLocationEndedFor(m.deps, AMI))).not.toMatch(/latitude|longitude|precision|radius|48\.8|2\.35/);
    const gardes = [...m.cache.entries].filter(([key]) => key.startsWith('shared-location-ends:'));
    expect(gardes).toHaveLength(1);
    expect(gardes[0]![1].value.startsWith('v1:')).toBe(true);
    expect(gardes[0]![1].value).not.toMatch(/48\.8|2\.35|6300000/);
  });
});

describe('un partage en cours n\'est pas terminé ; un partage échu l\'est', () => {
  it('pendant le partage, rien n\'est dit terminé', async () => {
    const m = monde();
    await demarrer(m);
    expect(await sharedLocationEndedFor(m.deps, AMI)).toEqual([]);
  });

  it('au terme, sans aucun geste de l\'émetteur, le partage est dit terminé à son terme', async () => {
    const m = monde();
    await demarrer(m);
    m.avancer(HEURE + MINUTE);

    expect(await sharedLocationEndedFor(m.deps, AMI)).toEqual([{ userId: EMETTEUR, endedAt: iso(T0 + HEURE), circle: 'FRIEND' }]);
  });

  it('MON échéance passée, le partage m\'est dit terminé alors qu\'il court pour les autres', async () => {
    const m = monde();
    await startSharedLocation(m.deps, EMETTEUR, {
      recipients: [{ userId: AMI, precision: 'exact', expiresInSeconds: 1800 }, { userId: PROCHE, precision: 'exact' }],
      durationMinutes: 60,
      position: PARIS,
    });
    m.avancer(31 * MINUTE);

    expect(await sharedLocationEndedFor(m.deps, AMI)).toEqual([{ userId: EMETTEUR, endedAt: iso(T0 + 30 * MINUTE), circle: 'FRIEND' }]);
    expect(await sharedLocationEndedFor(m.deps, PROCHE)).toEqual([]);
  });

  it('remplacé sans moi : terminé pour moi à l\'instant du remplacement, pas pour celui qui reste', async () => {
    const m = monde();
    await demarrer(m);
    m.avancer(10 * MINUTE);
    await demarrer(m, [{ userId: AMI, precision: 'exact' }]);

    expect(await sharedLocationEndedFor(m.deps, PROCHE)).toEqual([{ userId: EMETTEUR, endedAt: iso(T0), circle: 'CLOSE' }]);
    expect(await sharedLocationEndedFor(m.deps, AMI)).toEqual([]);
  });

  it('un nouveau partage qui me vise efface le « terminé » d\'avant', async () => {
    const m = monde();
    await demarrer(m);
    await stopSharedLocation(m.deps, EMETTEUR);
    m.avancer(MINUTE);
    await demarrer(m);

    expect(await sharedLocationEndedFor(m.deps, AMI)).toEqual([]);
  });

  it('un jour après la fin, plus rien n\'est dit', async () => {
    const m = monde();
    await demarrer(m);
    await stopSharedLocation(m.deps, EMETTEUR);
    m.avancer(JOUR + MINUTE);

    expect(await sharedLocationEndedFor(m.deps, AMI)).toEqual([]);
  });
});

describe('la loi relue à chaque lecture, et le compte qui part', () => {
  it('descendu sous Ami après la fin, je n\'apprends plus rien', async () => {
    const m = monde();
    await demarrer(m);
    await stopSharedLocation(m.deps, EMETTEUR);
    await m.lier(EMETTEUR, AMI, 'ACQUAINTANCE');

    expect(await sharedLocationEndedFor(m.deps, AMI)).toEqual([]);
  });

  it('l\'émetteur purgé : rien n\'est dit, et sa trace part avec lui', async () => {
    const m = monde();
    await demarrer(m);
    await endSharedLocationOfAccount(m.deps, EMETTEUR, { forget: true });
    await m.ecrireCompte(EMETTEUR, { deletedAt: new Date(T0) });

    expect(await sharedLocationEndedFor(m.deps, AMI)).toEqual([]);
    expect([...m.cache.entries.keys()].filter((key) => key.startsWith('shared-location-ends:'))).toEqual([]);
  });
});
