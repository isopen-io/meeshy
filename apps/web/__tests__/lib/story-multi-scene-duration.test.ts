/**
 * W2 — l'enchaînement multi-scènes commence par la DURÉE de chaque scène.
 *
 * `computeStoryDurationMs` ne regardait que `scenes[0]` (`story-transforms.ts`
 * ligne 350, `asObjectArray(effects.scenes)[0]`). Sur un document à plusieurs
 * scènes — le contrat en autorise 10 (`packages/shared/types/canvas-v3.ts`,
 * `.min(1).max(10)`) — la story durait donc le temps de sa PREMIÈRE scène et
 * passait à la story suivante : les scènes 2..n n'étaient jamais jouées.
 *
 * La règle par scène est celle d'iOS, sans une ligne inventée : une scène v3
 * projetée par `StoryEffects(rendering:sceneIndex:)`
 * (`CanvasV3Migration.swift:523`) EST une `StorySlide`, et la durée d'une slide
 * est `computedTotalDuration()` (`StoryModels.swift:1420`) — pin `timelineDuration`
 * d'abord, sinon les trois termes du contenu. `v1ViewOfScene` est le jumeau web
 * de cette projection ; W2 se contente de l'appliquer à CHAQUE scène au lieu de
 * la seule première, et la durée de la story devient la SOMME.
 *
 * L'oracle est le golden PARTAGÉ `story-3-slides.json` : ce qu'iOS peut écrire
 * est exactement ce que le web doit savoir minuter.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { computeStoryDurationMs, canvasV3SceneDurationsMs } from '@/lib/story-transforms';

const FIXTURES = join(__dirname, '../../../../packages/shared/fixtures/canvas-v3');

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')) as Record<string, unknown>;
}

describe('canvasV3SceneDurationsMs — une durée PAR scène (W2)', () => {
  it('gives the shared 3-slide golden one duration per scene, not a single one', () => {
    // Les trois scènes du golden sont statiques et sans texte long : chacune
    // vaut les 6 s de `StorySlide.defaultStaticDuration`.
    expect(canvasV3SceneDurationsMs(fixture('story-3-slides'))).toEqual([6000, 6000, 6000]);
  });

  it('measures each scene on its OWN content — a long background video only stretches its own scene', () => {
    const doc = {
      v: 3,
      scenes: [
        { id: 's1', objects: [{ id: 'm1', kind: 'media', payload: { isBackground: true, mediaType: 'video', duration: 14 } }] },
        { id: 's2', objects: [{ id: 't1', kind: 'text', payload: { text: 'court' } }] },
        // Pin d'auteur (« la timeline EST la story ») : autoritaire pour SA
        // scène seulement, jamais propagé aux voisines.
        { id: 's3', timelineDuration: 3.5, objects: [] },
      ],
    };
    expect(canvasV3SceneDurationsMs(doc)).toEqual([14000, 6000, 3500]);
  });

  it('returns no scene duration at all for a legacy (non-v3) blob — nothing to chain there', () => {
    expect(canvasV3SceneDurationsMs({ textObjects: [{ text: 'legacy' }] })).toEqual([]);
    expect(canvasV3SceneDurationsMs(undefined)).toEqual([]);
    // Un blob v3 sans scène (O3 — `scenes` absent tant qu'aucun objet visuel).
    expect(canvasV3SceneDurationsMs({ v: 3 })).toEqual([]);
  });
});

describe('computeStoryDurationMs — la story dure ses scènes CUMULÉES (W2)', () => {
  it('sums the three scenes of the shared golden instead of stopping at the first', () => {
    // AVANT W2 : 6000 — la story se coupait à la fin de la scène 1 et les
    // scènes 2 et 3 n'étaient jamais peintes.
    expect(computeStoryDurationMs(fixture('story-3-slides'))).toBe(18000);
  });

  it('leaves a single-scene document strictly unchanged — zéro régression sur tout l existant', () => {
    const oneScene = {
      v: 3,
      scenes: [{ id: 's1', objects: [{ id: 'm1', kind: 'media', payload: { isBackground: true, mediaType: 'video', duration: 14 } }] }],
    };
    expect(computeStoryDurationMs(oneScene)).toBe(14000);
  });

  it('keeps reading a v:4 document through the v3 projection (constat 12) across every scene', () => {
    const future = {
      v: 4,
      scenes: [
        { id: 's1', objects: [{ id: 'm1', kind: 'media', payload: { isBackground: true, mediaType: 'video', duration: 14 } }] },
        { id: 's2', objects: [] },
      ],
    };
    expect(canvasV3SceneDurationsMs(future)).toEqual([14000, 6000]);
    expect(computeStoryDurationMs(future)).toBe(20000);
  });
});
