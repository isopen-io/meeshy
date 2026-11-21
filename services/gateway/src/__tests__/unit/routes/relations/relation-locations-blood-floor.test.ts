/**
 * La carte de tous mes proches (#19202) : le point Sang suit le drapeau ET le plancher de version
 * des routes de cercles. Sous le plancher, le champ `blood` manque — la carte reste servie, elle
 * n'est jamais refusée en bloc.
 *
 * @jest-environment node
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { relativesMapAdmitsBlood } from '../../../../routes/relations/locations';

const LECTEUR = '6300000000000000000000e1';
const ENV_KEYS = ['BLOOD_LOCATION_ENABLED', 'BLOOD_LOCATION_ALLOWLIST', 'MIN_APP_VERSION_IOS'] as const;
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  ENV_KEYS.forEach((key) => {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  });
});

const drapeau = (allowlist: string) => {
  process.env.BLOOD_LOCATION_ENABLED = 'true';
  process.env.BLOOD_LOCATION_ALLOWLIST = allowlist;
  process.env.MIN_APP_VERSION_IOS = '2.0.0';
};

describe('le point Sang de la carte', () => {
  it('drapeau allumé, application à jour : admis', () => {
    drapeau('*');
    expect(relativesMapAdmitsBlood(LECTEUR, { 'x-app-platform': 'ios', 'x-app-version': '2.1.0' })).toBe(true);
  });

  it('sous le plancher de version : refusé, quel que soit le drapeau', () => {
    drapeau('*');
    expect(relativesMapAdmitsBlood(LECTEUR, { 'x-app-platform': 'ios', 'x-app-version': '1.9.0' })).toBe(false);
  });

  it('hors drapeau : refusé, même à jour', () => {
    drapeau('6300000000000000000000f9');
    expect(relativesMapAdmitsBlood(LECTEUR, { 'x-app-platform': 'ios', 'x-app-version': '2.1.0' })).toBe(false);
  });
});
