import { describe, expect, test } from 'bun:test';

import { achievementStep, storedGloryAssets, succesCatalogPorts } from '@/test-support/glory-session-catalog';

import { browserPhotoEnv, fontFamilyFrom, paletteFrom } from './env';
import { loadGloryCatalog } from './glory/frame-catalog';

const succesSessionCatalog = () => loadGloryCatalog(succesCatalogPorts);

/**
 * L'ENVIRONNEMENT DU NAVIGATEUR (#9382) — le peu de colle entre l'écran et le
 * navigateur (caméra, canvas, partage, IndexedDB). La couleur et la police de
 * l'image se LISENT dans la charte (jetons du document), elles ne s'écrivent
 * pas ici.
 */
describe('paletteFrom', () => {
  test('chaque couleur de l’image vient d’un jeton de la charte', () => {
    const tokens: Record<string, string> = {
      '--ios-indigo-950': 'A',
      '--ios-indigo-600': 'B',
      '--ios-on-brand': 'C',
      '--ios-indigo-200': 'D',
    };
    expect(paletteFrom((name) => tokens[name] ?? '')).toEqual({ top: 'A', bottom: 'B', ink: 'C', inkSoft: 'D', scrim: 'A' });
  });

  test('un jeton absent ne casse pas la peinture : la couleur courante du canvas', () => {
    expect(paletteFrom(() => '').top).toBe('currentColor');
  });
});

describe('fontFamilyFrom', () => {
  test('la police native de la charte, avec un repli système', () => {
    expect(fontFamilyFrom((name) => (name === '--font-native' ? 'Inter' : ''))).toBe('Inter, system-ui, sans-serif');
  });

  test('sans jeton : le système', () => {
    expect(fontFamilyFrom(() => '')).toBe('system-ui, sans-serif');
  });
});

/**
 * LA RARETÉ TRAVERSE L'ENVIRONNEMENT (#10168) : `glory` et `gloryOffer`
 * remettent l'étape entière à la scène, rareté comprise — un environnement
 * qui la perdrait repeindrait tout haut fait dans le neutre.
 */
describe('browserPhotoEnv — le cadre d’un haut fait', () => {
  const texts = { kicker: 'Haut fait', title: 'Premier contenu', date: '25 octobre 2026', message: null, 'plate.1': null };
  const env = () => browserPhotoEnv({ catalog: succesSessionCatalog, assets: storedGloryAssets() });

  test('l’image d’une étape rare se compose dans le cadre rare ; sans rareté, dans le neutre', async () => {
    const rare = await env().glory?.({ step: achievementStep('rare'), texts, scale: 0.5 });
    expect(rare?.frame.id).toBe('succes.rare');
    rare?.close();
    const plain = await env().glory?.({ step: achievementStep(), texts, scale: 0.5 });
    expect(plain?.frame.id).toBe('succes.neutre');
    plain?.close();
  });

  test('la bande d’une étape épique présélectionne le cadre épique', async () => {
    expect((await env().gloryOffer?.(achievementStep('epic')))?.preselected).toEqual({ pack: 'succes', frameId: 'succes.epic' });
  });
});
