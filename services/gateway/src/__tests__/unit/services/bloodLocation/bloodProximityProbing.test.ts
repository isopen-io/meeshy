/**
 * L'ALERTE DE PROXIMITÉ NE SERT PAS À LOCALISER (#13937, audit) : un Sang à qui l'autre n'a
 * ouvert que la proximité ne doit pas pouvoir quadriller une ville de points inventés pour
 * apprendre où il se trouve. Trois verrous, chacun prouvé par l'attaque qu'il arrête :
 *
 * - un point dont la vitesse depuis le point précédent est impossible n'entre pas dans la
 *   proximité, ni comme point évalué, ni comme « dernière position » de l'autre ;
 * - une paire n'est évaluée qu'une fois par fenêtre, qu'elle alerte ou non : un essai raté coûte ;
 * - un compte n'évalue qu'un nombre borné de paires par heure, et un compteur en panne n'évalue rien.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { eraseBloodLocationHistory, recordBloodLocation } from '../../../../services/bloodLocation/bloodLocationService';
import { ADULT_BIRTH, type CircleLink } from '../../../helpers/messaging-circle-world';
import {
  A_300_M,
  A_5_KM,
  HEURE,
  MINUTE,
  MOI,
  PARIS,
  SANG,
  T0,
  TOUT_PARTAGE,
  bloodLocationWorld,
  bloodWorldAvecConsentements,
} from '../../../helpers/blood-location-world';

const SECONDE = 1000;

/** Quarante points d'une grille de 2 à 20 km autour de Paris, aucun dans le rayon de 500 m. */
const grille = Array.from({ length: 40 }, (_, i) => ({
  latitude: PARIS.latitude + 0.02 * (1 + (i % 8)) * (i % 2 === 0 ? 1 : -1),
  longitude: PARIS.longitude + 0.03 * (1 + Math.floor(i / 8)) * (i % 3 === 0 ? 1 : -1),
  accuracy: 5,
}));

describe('un point téléporté ne sert pas la proximité', () => {
  it('quarante points téléportés à une seconde d\'écart puis un point à 300 m : aucune alerte, ni pour l\'un ni pour l\'autre', async () => {
    const w = bloodWorldAvecConsentements();
    w.poser(SANG, PARIS);

    for (const point of grille) {
      await recordBloodLocation(w.deps, MOI, point);
      w.avancer(SECONDE);
    }
    await expect(recordBloodLocation(w.deps, MOI, A_300_M)).resolves.toEqual({ recorded: true });

    expect(w.emissions).toEqual([]);
  });

  it('un point téléporté près de l\'autre ne devient pas sa « dernière position » quand l\'autre enregistre', async () => {
    const w = bloodWorldAvecConsentements();
    await recordBloodLocation(w.deps, MOI, A_5_KM);
    w.avancer(SECONDE);
    await recordBloodLocation(w.deps, MOI, A_300_M);
    w.avancer(SECONDE);

    w.poser(SANG, PARIS, w.horloge() - MINUTE);
    await recordBloodLocation(w.deps, SANG, PARIS);

    expect(w.emissions).toEqual([]);
  });

  it('un déplacement vraisemblable déclenche toujours l\'alerte', async () => {
    const w = bloodWorldAvecConsentements();
    w.poser(SANG, PARIS);
    await recordBloodLocation(w.deps, MOI, A_5_KM);
    w.avancer(20 * MINUTE);
    w.poser(SANG, PARIS);

    await recordBloodLocation(w.deps, MOI, A_300_M);

    expect(w.vers(MOI, SERVER_EVENTS.BLOOD_PROXIMITY).map((e) => e.data)).toEqual([{ userId: SANG, distanceMeters: 500 }]);
    expect(w.vers(SANG, SERVER_EVENTS.BLOOD_PROXIMITY).map((e) => e.data)).toEqual([{ userId: MOI, distanceMeters: 500 }]);
  });
});

const LYON = { latitude: 45.76, longitude: 4.83, accuracy: 5 };
const PRES_DE_PARIS = { latitude: 48.859, longitude: 2.3522, accuracy: 5 };

describe('la vitesse se juge depuis une ancre que l\'appelant ne fabrique pas (contre-audit)', () => {
  it('un point téléporté ne sert pas d\'ancre : le point voisin qui le suit d\'une seconde n\'est pas évalué', async () => {
    const w = bloodWorldAvecConsentements();
    w.poser(SANG, PARIS);
    await recordBloodLocation(w.deps, MOI, LYON);
    w.avancer(16 * MINUTE);
    w.poser(SANG, PARIS);
    await recordBloodLocation(w.deps, MOI, PRES_DE_PARIS);
    w.avancer(SECONDE);

    await recordBloodLocation(w.deps, MOI, A_300_M);

    expect(w.vers(MOI, SERVER_EVENTS.BLOOD_PROXIMITY)).toEqual([]);
  });

  it('effacer son historique puis poser un point ne l\'évalue pas : un point sans ancre n\'est jamais évalué', async () => {
    const w = bloodWorldAvecConsentements();
    w.poser(SANG, PARIS);
    await recordBloodLocation(w.deps, MOI, LYON);
    w.avancer(16 * MINUTE);
    w.poser(SANG, PARIS);
    await eraseBloodLocationHistory(w.deps, MOI);

    await recordBloodLocation(w.deps, MOI, A_300_M);

    expect(w.vers(MOI, SERVER_EVENTS.BLOOD_PROXIMITY)).toEqual([]);
  });
});

describe('un essai raté coûte : la paire n\'est évaluée qu\'une fois par quart d\'heure', () => {
  it('raté à 5 km, puis arrivé à 300 m deux minutes plus tard à une vitesse possible : rien avant le quart d\'heure, l\'alerte après', async () => {
    const w = bloodWorldAvecConsentements();
    w.poser(SANG, PARIS);
    await recordBloodLocation(w.deps, MOI, A_5_KM);
    w.avancer(20 * MINUTE);
    await recordBloodLocation(w.deps, MOI, A_5_KM);
    w.avancer(2 * MINUTE);

    await recordBloodLocation(w.deps, MOI, A_300_M);
    expect(w.emissions).toEqual([]);

    w.avancer(14 * MINUTE);
    await recordBloodLocation(w.deps, MOI, A_300_M);
    expect(w.vers(MOI, SERVER_EVENTS.BLOOD_PROXIMITY)).toHaveLength(1);
  });
});

describe('un compte n\'évalue que soixante paires par heure', () => {
  const sangs = Array.from({ length: 61 }, (_, i) => `640000000000000000${String(i).padStart(6, '0')}`);
  const [proche, ...lointains] = [sangs[60], ...sangs.slice(0, 60)];
  const monde = (seed: { counterDown?: boolean } = {}) =>
    bloodLocationWorld({
      links: sangs.map((id): CircleLink => [MOI, id, 'BLOOD']),
      users: [MOI, ...sangs].map((id) => ({ id, birthDate: ADULT_BIRTH })),
      consents: sangs.flatMap((id) => [[id, MOI, TOUT_PARTAGE] as const, [MOI, id, TOUT_PARTAGE] as const]),
      ...seed,
    });

  it('au-delà de soixante évaluations dans l\'heure, la soixante et unième paire n\'est pas évaluée ; l\'heure suivante, si', async () => {
    const w = monde();
    await recordBloodLocation(w.deps, MOI, PARIS);
    w.avancer(MINUTE);
    lointains.forEach((id) => w.poser(id, A_5_KM));
    await recordBloodLocation(w.deps, MOI, PARIS);
    expect(w.emissions).toEqual([]);

    w.avancer(MINUTE);
    w.poser(proche, A_300_M);
    w.avancer(MINUTE);
    await recordBloodLocation(w.deps, MOI, PARIS);
    expect(w.emissions).toEqual([]);

    w.avancer(HEURE - 2 * MINUTE + 30 * SECONDE);
    await recordBloodLocation(w.deps, MOI, PARIS);
    expect(w.vers(MOI, SERVER_EVENTS.BLOOD_PROXIMITY).map((e) => e.data.userId)).toEqual([proche]);
    expect(w.horloge()).toBeGreaterThanOrEqual(T0 + HEURE);
  });

  it('un compteur en panne : aucune évaluation, et l\'enregistrement réussit quand même', async () => {
    const w = monde({ counterDown: true });
    w.poser(proche, A_300_M);
    w.poser(MOI, PARIS, w.horloge() - MINUTE);
    await expect(recordBloodLocation(w.deps, MOI, PARIS)).resolves.toEqual({ recorded: true });
    expect(w.emissions).toEqual([]);
  });
});
