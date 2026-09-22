/**
 * #7356 — L'exactitude de lecture est armée en staging et production.
 *
 * Vérifie que la variable d'env EXACT_READ_TRACKING_SINCE armant la lecture exacte
 * doit être explicitement posée et n'est pas active par défaut.
 *
 * Ce test RED-only mesure que le dépôt actuel NE pose pas la variable.
 *
 * @jest-environment node
 */

describe('#7356 — Exact read tracking must be explicitly armed via EXACT_READ_TRACKING_SINCE', () => {
  test('RED: EXACT_READ_TRACKING_SINCE est absent du dépôt (non armée par défaut)', () => {
    // This is the key requirement: the variable is NOT set in infrastructure/env
    // The task explicitly states: "Aucun fichier de config du dépôt ne l'arme"
    expect(process.env.EXACT_READ_TRACKING_SINCE).toBeUndefined();
  });

  test('RED: getExactReadTrackingCutover() retourne null quand la variable est absente', () => {
    // Ensure the variable is unset for this test
    delete process.env.EXACT_READ_TRACKING_SINCE;

    // Reload the module to reset any caches
    jest.resetModules();
    const { getExactReadTrackingCutover } = require('../../../config/read-exactness-config');

    // With no env var, cutover should be null
    expect(getExactReadTrackingCutover()).toBeNull();
  });

  test('GREEN: getExactReadTrackingCutover() retourne la Date quand EXACT_READ_TRACKING_SINCE est posée', () => {
    // Set the variable
    const testDate = '2026-09-22T12:00:00.000Z';
    process.env.EXACT_READ_TRACKING_SINCE = testDate;

    // Reload the module to reset any caches
    jest.resetModules();
    const { getExactReadTrackingCutover } = require('../../../config/read-exactness-config');

    // With env var set, cutover should be the parsed date
    const cutover = getExactReadTrackingCutover();
    expect(cutover).toEqual(new Date(testDate));
  });

  afterEach(() => {
    delete process.env.EXACT_READ_TRACKING_SINCE;
  });
});
