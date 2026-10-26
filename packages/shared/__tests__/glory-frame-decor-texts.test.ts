import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePackIndex } from '../types/content-pack-index';
import { bakedGloryDecorTextsInContract, gloryDecorTextViolations } from '../types/glory-frame-decor';
import { parseGloryFrameContract } from '../types/glory-frames';
import { GLORY_FRAMES_DIR, PACK_ASSETS_DIR, REGISTRY_FILE, readGloryFrameSources } from '../scripts/generate-glory-frames';

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;

const sources = readGloryFrameSources();
const frames = [...sources.collections.values()].flatMap((collection) => collection.frames);
const gaps = readJson(join(GLORY_FRAMES_DIR, 'known-gaps.json')) as { readonly bakedDecorTexts: { readonly frames: readonly string[] } };

describe('les textes de décor des cadres versionnés sont triés (#10256)', () => {
  it('chacun est traduit dans les sept langues, déclaré neutre ou vivant — et le contrat porte le tri de la table', () => {
    expect(gloryDecorTextViolations({ frames, table: sources.decorTexts, catalogue: sources.decorStrings })).toEqual([]);
  });

  it('les textes neutres encore portés en emplacement attendent le réexport qui les cuit (cliquet, que le réexport vide)', () => {
    const waiting = [...new Set(bakedGloryDecorTextsInContract(frames, sources.decorTexts).map((slot) => slot.split('#')[0]))];
    expect(waiting).toEqual(gaps.bakedDecorTexts.frames);
  });

  it('les chaînes servies d’un pack portent chaque texte de décor traduit de son contrat, dans chaque langue servie', () => {
    const { entries } = parsePackIndex(readJson(REGISTRY_FILE));
    const unserved = entries.flatMap((entry) => {
      const contract = parseGloryFrameContract(readJson(join(PACK_ASSETS_DIR, entry.contract.src)))?.contract.frames ?? [];
      const keys = contract.flatMap((frame) => Object.values(frame.formats.story.text).flatMap((slot) => (slot.i18n === undefined ? [] : [slot.i18n])));
      return Object.entries(entry.strings).flatMap(([language, ref]) => {
        const table = ref === undefined ? {} : (readJson(join(PACK_ASSETS_DIR, ref.src)) as Record<string, string>);
        return keys.filter((key) => table[key] === undefined).map((key) => `${entry.slug}/${language} : ${key}`);
      });
    });
    expect(unserved).toEqual([]);
  });
});
