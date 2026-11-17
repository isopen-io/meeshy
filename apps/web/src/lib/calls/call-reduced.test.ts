import { describe, expect, test } from 'bun:test';

import { speakerColor } from './call-speaker-color';
import { reducedColorKey, reducedLabel } from './call-reduced';

/**
 * **CE QUE L'APPEL RÉDUIT DIT DE LUI** (P18.2, P18.3 ; #18223) — miroir de `CallReducedRule.label` et
 * `CallReducedRule.colorKey` (iOS, #18464), avec leurs vecteurs ; la clé de couleur est celle d'Android
 * `CallTileRim.peerAvatar` (#18449) : l'identifiant, sinon le nom, sur la même palette.
 */

describe('l’étiquette unique de l’appel réduit (P18.3)', () => {
  test('établi : « nom · durée »', () => {
    expect(reducedLabel({ title: 'Maman', duration: '04:12', connected: true, unknown: 'Inconnu' })).toBe('Maman · 04:12');
  });

  test('établi sans nom connu : la durée seule, comme la bulle', () => {
    expect(reducedLabel({ title: null, duration: '04:12', connected: true, unknown: 'Inconnu' })).toBe('04:12');
  });

  test('avant l’établissement : le nom seul, jamais une durée de « 00:00 »', () => {
    expect(reducedLabel({ title: 'Awa', duration: '00:00', connected: false, unknown: 'Inconnu' })).toBe('Awa');
    expect(reducedLabel({ title: null, duration: '00:00', connected: false, unknown: 'Inconnu' })).toBe('Inconnu');
  });
});

describe('la clé de la couleur de l’autre (P18.2)', () => {
  test('son identifiant d’abord', () => {
    expect(reducedColorKey({ peerId: 'u-awa', peerName: 'Awa' })).toBe('u-awa');
  });

  test('sans identifiant, son nom, sur la MÊME palette', () => {
    expect(reducedColorKey({ peerId: '', peerName: 'Awa' })).toBe('Awa');
    expect(reducedColorKey({ peerId: '  ', peerName: 'Awa' })).toBe('Awa');
    expect(reducedColorKey({ peerId: null, peerName: 'Awa' })).toBe('Awa');
    expect(reducedColorKey({ peerId: undefined, peerName: 'Awa' })).toBe('Awa');
    expect(speakerColor(reducedColorKey({ peerId: null, peerName: 'Awa' }) ?? '')).toBe(speakerColor('Awa'));
  });

  test('sans l’un ni l’autre, aucune couleur inventée', () => {
    expect(reducedColorKey({ peerId: null, peerName: null })).toBeNull();
    expect(reducedColorKey({ peerId: '', peerName: ' ' })).toBeNull();
  });
});
