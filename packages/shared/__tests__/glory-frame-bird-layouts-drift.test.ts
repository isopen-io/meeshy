/**
 * Le contrat LIVRÉ égale le relevé VALIDÉ au pixel (#10277). La garde d'empiètement de la CI
 * (`docs/product/cadres-de-gloire/generateur/lib/overlap.mjs --check`) re-mesure le relevé
 * `controle/mises-en-page-<collection>.json`, jamais `packages/shared/design/glory-frames/<collection>.json` ;
 * le témoin géométrique sans navigateur tolère qu'une part du dessin tombe dans la fenêtre. Sans ce témoin, un relevé
 * rejoué sans `glory-frames:bird-layouts`, ou une ancre éditée à la main dans le contrat, laisse les deux gardes
 * vertes avec des oiseaux qui empiètent sur la photo.
 */
import { describe, expect, it } from 'vitest';
import { birdLayoutDrift, gloryBirdLayoutSlugs, readCollectionBirdLayouts, withDeclaredBirds } from '../scripts/apply-glory-bird-layouts';
import { jsonText } from '../scripts/generate-glory-frames';

const slugs = gloryBirdLayoutSlugs();

describe('chaque contrat versionné porte, à l’octet, les mises en page de son relevé', () => {
  it('lit toutes les collections du registre (sinon ce témoin ne prouverait rien)', () => {
    expect(slugs.length).toBeGreaterThanOrEqual(11);
  });

  it.each(slugs)('%s : poser le relevé sur le contrat ne change rien', (slug) => {
    const { text, document, records } = readCollectionBirdLayouts(slug);
    expect(birdLayoutDrift(document, records)).toEqual([]);
    expect(jsonText(withDeclaredBirds(document, records))).toBe(text);
  });
});

describe('le témoin rougit sur une dérive entre le contrat et le relevé', () => {
  const { document, records } = readCollectionBirdLayouts('savane');
  const frame = document.frames.find((f) => f.id === 'savane.ambassadeur-5') ?? document.frames[0];
  const id = frame?.id ?? '';

  type Anchor = { readonly box: readonly number[] };
  type Birds = { readonly default: string; readonly layouts: Readonly<Record<string, Readonly<Record<string, Anchor>>>> };

  it('une ancre déplacée à la main dans le contrat, le relevé intact', () => {
    const birds = frame?.formats.story.birds as Birds;
    const layout = birds.layouts[birds.default] ?? {};
    const [key, anchor] = Object.entries(layout)[0] ?? ['', { box: [0, 0, 0, 0] }];
    const [x, y, w, h] = anchor.box;
    const moved = { ...anchor, box: [(x ?? 0) + 48, (y ?? 0) - 79, w, h] };
    const story = { ...frame?.formats.story, birds: { ...birds, layouts: { ...birds.layouts, [birds.default]: { ...layout, [key]: moved } } } };
    const mutated = { ...document, frames: document.frames.map((f) => (f.id === id ? { ...f, formats: { ...f.formats, story } } : f)) };
    expect(birdLayoutDrift(mutated, records)).toEqual([id]);
  });

  it('un relevé re-mesuré sans `glory-frames:bird-layouts`, le contrat intact', () => {
    const name = id.replace('.', '-');
    const remeasured = records.map((record) => {
      if (record.frame !== name) return record;
      const entry = record.layouts[record.default];
      if (entry === undefined) return record;
      const birds = entry.birds.map((bird, i) => (i === 0 ? { ...bird, box: [bird.box[0] + 48, bird.box[1] - 79, bird.box[2], bird.box[3]] as typeof bird.box } : bird));
      return { ...record, layouts: { ...record.layouts, [record.default]: { ...entry, birds } } };
    });
    expect(birdLayoutDrift(document, remeasured)).toEqual([id]);
  });
});
