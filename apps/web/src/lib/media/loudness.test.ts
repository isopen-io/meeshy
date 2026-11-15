import { describe, expect, test } from 'bun:test';

import { LOUDNESS_MAX_BOOST_DB, LOUDNESS_TARGET_LUFS, dbToLinear, loudnessGainDb, loudnessPlan } from './loudness';

/**
 * #12285 (web) — DEUX VOCAUX ENREGISTRÉS À DES NIVEAUX DIFFÉRENTS SE LISENT AU
 * MÊME VOLUME PERÇU. La passerelle mesure la sonie intégrée EBU R128 du fichier
 * stocké (`loudnessLufs`, #11259) ; la lecture applique `-16 - loudnessLufs` dB,
 * plafonné à +12 dB. Champ absent : gain nul, le comportement d'avant.
 */
describe('loudnessGainDb — la loi', () => {
  test('la cible est −16 LUFS, le plafond +12 dB', () => {
    expect(LOUDNESS_TARGET_LUFS).toBe(-16);
    expect(LOUDNESS_MAX_BOOST_DB).toBe(12);
  });

  test('un vocal faible (−24 LUFS) gagne 8 dB ; un vocal fort (−10 LUFS) en perd 6', () => {
    expect(loudnessGainDb(-24)).toBe(8);
    expect(loudnessGainDb(-10)).toBe(-6);
  });

  test('un vocal très faible (−40 LUFS) est plafonné à +12 dB', () => {
    expect(loudnessGainDb(-40)).toBe(12);
  });

  test('déjà à la cible, absent, null ou non fini : aucun gain', () => {
    expect(loudnessGainDb(-16)).toBe(0);
    expect(loudnessGainDb(undefined)).toBe(0);
    expect(loudnessGainDb(null)).toBe(0);
    expect(loudnessGainDb(Number.NaN)).toBe(0);
    expect(loudnessGainDb(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  test('dbToLinear : 0 dB ⇒ 1, −6 dB ⇒ ~0,5, +12 dB ⇒ ~3,98', () => {
    expect(dbToLinear(0)).toBe(1);
    expect(dbToLinear(-6)).toBeCloseTo(0.501, 3);
    expect(dbToLinear(12)).toBeCloseTo(3.981, 3);
  });
});

describe('loudnessPlan — ce que la lecture applique', () => {
  test('un vocal fort sur l’original : atténué par le volume de l’élément', () => {
    const plan = loudnessPlan({ lufs: -10, playsOriginal: true, boostable: false });
    expect(plan.kind).toBe('attenuate');
    expect(plan.kind === 'attenuate' ? plan.volume : 0).toBeCloseTo(0.501, 3);
  });

  test('un vocal faible sur l’original servi par la passerelle : amplifié (graphe audio + limiteur)', () => {
    const plan = loudnessPlan({ lufs: -24, playsOriginal: true, boostable: true });
    expect(plan.kind).toBe('boost');
    expect(plan.kind === 'boost' ? plan.gain : 0).toBeCloseTo(dbToLinear(8), 6);
  });

  test('un vocal faible sur une adresse qui ne garantit pas le CORS : rien, jamais un silence', () => {
    expect(loudnessPlan({ lufs: -24, playsOriginal: true, boostable: false })).toEqual({ kind: 'none' });
  });

  test('une piste TRADUITE n’est pas le fichier mesuré : rien', () => {
    expect(loudnessPlan({ lufs: -24, playsOriginal: false, boostable: true })).toEqual({ kind: 'none' });
    expect(loudnessPlan({ lufs: -10, playsOriginal: false, boostable: true })).toEqual({ kind: 'none' });
  });

  test('sans mesure : rien', () => {
    expect(loudnessPlan({ lufs: undefined, playsOriginal: true, boostable: true })).toEqual({ kind: 'none' });
  });
});
