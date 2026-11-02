import { describe, expect, test } from 'bun:test';

import { achievementStep, storedGloryAssets, succesCatalogPorts } from '@/test-support/glory-session-catalog';

import { loadGloryCatalog } from './frame-catalog';
import { gloryFrameFor, gloryOfferFor } from './glory-scene';

const succesSessionCatalog = () => loadGloryCatalog(succesCatalogPorts);

/**
 * LA RARETÉ D'UN HAUT FAIT TRAVERSE LA SCÈNE JUSQU'AU CADRE (LS, #10168) — le
 * chemin de PRODUCTION, pas la loi : `gloryFrameFor` (le cadre que l'image
 * peint) et `gloryOfferFor` (la bande) remettent l'étape ENTIÈRE à la loi,
 * rareté comprise, sur un catalogue de session qui porte le pack `succes`
 * VERSIONNÉ. Une scène qui perdrait la rareté repeindrait tout haut fait en
 * `succes.neutre`, en silence : c'est ce que ces témoins retiennent.
 */

describe('le cadre que la scène peint pour un haut fait (#10168)', () => {
  test('une étape rare se peint dans le cadre rare, une épopée dans le cadre épique', async () => {
    expect((await gloryFrameFor(achievementStep('rare'), succesSessionCatalog))?.frame.id).toBe('succes.rare');
    expect((await gloryFrameFor(achievementStep('epic'), succesSessionCatalog))?.frame.id).toBe('succes.epic');
  });

  test('sans rareté servie, le neutre — jamais une rareté supposée', async () => {
    expect((await gloryFrameFor(achievementStep(), succesSessionCatalog))?.frame.id).toBe('succes.neutre');
    expect((await gloryFrameFor(achievementStep(null), succesSessionCatalog))?.frame.id).toBe('succes.neutre');
  });
});

describe('la bande qu’elle propose pour un haut fait (#10168)', () => {
  test('une étape rare propose et présélectionne le cadre rare', async () => {
    const offer = await gloryOfferFor(achievementStep('rare'), storedGloryAssets(), succesSessionCatalog);
    expect(offer?.tiles.map((tile) => tile.ref.frameId)).toEqual(['succes.rare']);
    expect(offer?.preselected).toEqual({ pack: 'succes', frameId: 'succes.rare' });
  });

  test('sans rareté servie, la bande ne propose que le neutre', async () => {
    const offer = await gloryOfferFor(achievementStep(), storedGloryAssets(), succesSessionCatalog);
    expect(offer?.preselected).toEqual({ pack: 'succes', frameId: 'succes.neutre' });
  });
});
