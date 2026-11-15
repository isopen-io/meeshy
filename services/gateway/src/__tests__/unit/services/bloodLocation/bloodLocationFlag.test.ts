/**
 * Le DRAPEAU de la position du Sang (#13937) : éteint par défaut, allumé seulement
 * pour la liste blanche des comptes de test. Aucun système de drapeau serveur n'existait
 * (seuls des `ENABLE_*` d'environnement) : celui-ci en est la forme minimale.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { bloodLocationEnabledFor } from '../../../../services/bloodLocation/bloodLocationFlag';

const COMPTE = '6400000000000000000000a1';
const AUTRE = '6400000000000000000000a2';

describe('bloodLocationEnabledFor', () => {
  it('est éteint sans configuration', () => {
    expect(bloodLocationEnabledFor(COMPTE, {})).toBe(false);
  });

  it('allumé sans liste blanche reste éteint : on ne sort jamais ouvert à tous par oubli', () => {
    expect(bloodLocationEnabledFor(COMPTE, { BLOOD_LOCATION_ENABLED: 'true' })).toBe(false);
  });

  it('allumé, il ne l\'est que pour la liste blanche', () => {
    const env = { BLOOD_LOCATION_ENABLED: 'true', BLOOD_LOCATION_ALLOWLIST: ` ${COMPTE} , 6400000000000000000000ff` };
    expect(bloodLocationEnabledFor(COMPTE, env)).toBe(true);
    expect(bloodLocationEnabledFor(AUTRE, env)).toBe(false);
  });

  it('`*` ouvre à tous les comptes, drapeau allumé seulement', () => {
    expect(bloodLocationEnabledFor(AUTRE, { BLOOD_LOCATION_ENABLED: 'true', BLOOD_LOCATION_ALLOWLIST: '*' })).toBe(true);
    expect(bloodLocationEnabledFor(AUTRE, { BLOOD_LOCATION_ENABLED: 'false', BLOOD_LOCATION_ALLOWLIST: '*' })).toBe(false);
  });

  it('une identité absente est refusée', () => {
    expect(bloodLocationEnabledFor('', { BLOOD_LOCATION_ENABLED: 'true', BLOOD_LOCATION_ALLOWLIST: '*' })).toBe(false);
  });
});
