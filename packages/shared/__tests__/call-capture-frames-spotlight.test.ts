import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ASSET_SOURCE_RELATIVE_DIR,
  FRAME_MOODS,
  IOS_ASSETS_RELATIVE_DIR,
  REPO_ROOT,
  SOURCE_DIR,
  assetFilesIn,
  referencedAssets,
  OUTPUT_DIR,
  SPOTLIGHT_FILE,
  SPOTLIGHT_MAX_FEATURED,
  expandFiles,
  readMoodFiles,
  readSpotlight,
  renderSpotlightSwift,
  spotlightOf,
} from '../scripts/generate-call-frames-swift';

const look = {
  layout: { arrangement: 'grid', margin: 0.05, gap: 0.02, top: 0.1, bottom: 0 },
  slot: { shape: 'rect', tilt: 'none', tone: 'color' },
  background: { kind: 'solid', color: '#000' },
  ornaments: [],
  names: { show: 'none', style: 'caption', font: 'elegant', color: '#ffffff' },
  title: { source: 'none', font: 'elegant', color: '#ffffff', place: 'top', size: 'm' },
};

const moodFile = (mood: string, ...motifs: readonly string[]): unknown => ({
  mood,
  motifs: motifs.map((motif) => ({ id: `${mood}.${motif}`, mood, name: motif, base: look, variants: { duo: {} } })),
});

const catalogue = expandFiles([moodFile('jovial', 'fete', 'ballons', 'grimaces'), moodFile('morbide', 'tombe', 'crypte')]);

const spotlight = (...moods: readonly unknown[]): unknown => ({ moods });

describe('les ambiances ouvertes par défaut et leurs cadres vedettes (#12683)', () => {
  it('le fichier committé est à jour du JSON partagé', () => {
    const file = renderSpotlightSwift(readSpotlight(), expandFiles(readMoodFiles()));
    expect(readFileSync(join(OUTPUT_DIR, file.name), 'utf8')).toBe(file.content);
    expect(file.name).toBe(SPOTLIGHT_FILE);
  });

  it('sept ambiances par défaut, chacune avec trois à cinq cadres vedettes de son propre fichier', () => {
    const served = spotlightOf(readSpotlight(), expandFiles(readMoodFiles()));
    expect(served.map((entry) => entry.mood)).toEqual(['signature', 'jovial', 'feerique', 'futuriste', 'hors-norme', 'glauque', 'morbide']);
    served.forEach((entry) => {
      expect(entry.featured.length, entry.mood).toBeGreaterThanOrEqual(3);
      expect(entry.featured.length, entry.mood).toBeLessThanOrEqual(5);
      entry.featured.forEach((motif) => expect(motif.startsWith(`${entry.mood}.`), motif).toBe(true));
    });
  });

  it('les ambiances ouvertes par défaut sont des ambiances du catalogue', () => {
    spotlightOf(readSpotlight(), expandFiles(readMoodFiles())).forEach((entry) => {
      expect(FRAME_MOODS).toContain(entry.mood);
    });
  });

  it('rend un littéral Swift par ambiance, dans l’ordre du fichier', () => {
    const file = renderSpotlightSwift(spotlight({ mood: 'morbide', featured: ['morbide.tombe'] }, { mood: 'jovial', featured: ['jovial.fete', 'jovial.ballons'] }), catalogue);
    expect(file.content).toContain('CallFrameSpotlight(mood: .morbide, featured: ["morbide.tombe"])');
    expect(file.content).toContain('CallFrameSpotlight(mood: .jovial, featured: ["jovial.fete", "jovial.ballons"])');
    expect(file.content.indexOf('.morbide')).toBeLessThan(file.content.indexOf('.jovial'));
  });

  it('une ambiance à tiret prend son nom Swift en camelCase', () => {
    const horsNorme = expandFiles([moodFile('hors-norme', 'pop-art')]);
    const file = renderSpotlightSwift(spotlight({ mood: 'hors-norme', featured: ['hors-norme.pop-art'] }), horsNorme);
    expect(file.content).toContain('CallFrameSpotlight(mood: .horsNorme, featured: ["hors-norme.pop-art"])');
  });

  it('refuse un motif inconnu, en nommant le chemin', () => {
    expect(() => spotlightOf(spotlight({ mood: 'jovial', featured: ['jovial.absent'] }), catalogue)).toThrow(/moods\[0\]\.featured\[0\]/);
  });

  it('refuse un motif d’une autre ambiance', () => {
    expect(() => spotlightOf(spotlight({ mood: 'jovial', featured: ['morbide.tombe'] }), catalogue)).toThrow(/moods\[0\]\.featured\[0\]/);
  });

  it('refuse une ambiance inconnue ou déclarée deux fois', () => {
    expect(() => spotlightOf(spotlight({ mood: 'inconnue', featured: ['jovial.fete'] }), catalogue)).toThrow(/moods\[0\]\.mood/);
    expect(() => spotlightOf(spotlight({ mood: 'jovial', featured: ['jovial.fete'] }, { mood: 'jovial', featured: ['jovial.ballons'] }), catalogue)).toThrow(/moods\[1\]\.mood/);
  });

  it('refuse un cadre vedette en double, une liste vide ou trop longue', () => {
    expect(() => spotlightOf(spotlight({ mood: 'jovial', featured: ['jovial.fete', 'jovial.fete'] }), catalogue)).toThrow(/moods\[0\]\.featured\[1\]/);
    expect(() => spotlightOf(spotlight({ mood: 'jovial', featured: [] }), catalogue)).toThrow(/moods\[0\]\.featured/);
    const tooMany = Array.from({ length: SPOTLIGHT_MAX_FEATURED + 1 }, () => 'jovial.fete');
    expect(() => spotlightOf(spotlight({ mood: 'jovial', featured: tooMany }), catalogue)).toThrow(/moods\[0\]\.featured/);
  });
});

describe('les illustrations des cadres (#12683)', () => {
  const sourceAssets = join(SOURCE_DIR, ASSET_SOURCE_RELATIVE_DIR);
  const iosAssets = join(REPO_ROOT, IOS_ASSETS_RELATIVE_DIR);

  it('chaque illustration référencée existe dans le dossier partagé', () => {
    referencedAssets(readMoodFiles()).forEach((name) => expect(existsSync(join(sourceAssets, name)), name).toBe(true));
  });

  it('iOS embarque exactement les illustrations référencées, à l’octet près', () => {
    const referenced = referencedAssets(readMoodFiles());
    expect(assetFilesIn(iosAssets)).toEqual(referenced);
    referenced.forEach((name) => expect(readFileSync(join(iosAssets, name)).equals(readFileSync(join(sourceAssets, name))), name).toBe(true));
  });

  it('les illustrations d’une déclinaison sont référencées comme celles du cadre de base', () => {
    const relief = {
      mood: 'jovial',
      motifs: [{
        id: 'jovial.essai', mood: 'jovial', name: 'Essai', base: look, variants: { duo: {} },
        styles: [{ id: 'relief', name: 'Relief', look: { scene: [
          { id: 'matiere', kind: 'image', depth: 'back', src: 'assets/call-frames/jovial_essai_back.webp' },
          { id: 'moulure', kind: 'image', depth: 'front', src: 'assets/call-frames/jovial_essai_front.webp', slice: 0.2 },
        ] } }],
      }],
    };
    expect(referencedAssets([relief])).toEqual(['jovial_essai_back.webp', 'jovial_essai_front.webp']);
  });

  it('les cadres vedettes embarquent leurs illustrations « Relief »', () => {
    expect(referencedAssets(readMoodFiles()).length).toBeGreaterThan(0);
  });

  it('une illustration hors du dossier des cadres fait échouer la lecture', () => {
    const outside = {
      mood: 'jovial',
      motifs: [{ id: 'jovial.essai', mood: 'jovial', name: 'Essai', base: { ...look, scene: [{ id: 'fond', kind: 'image', depth: 'back', src: 'assets/ailleurs/fond.webp' }] }, variants: { duo: {} } }],
    };
    expect(() => referencedAssets([outside])).toThrow(/jovial\.essai\.duo\.scene/);
  });
});
