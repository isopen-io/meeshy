import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  BRAND_MARKS,
  BRAND_PLACES,
  FRAME_ARRANGEMENTS,
  FRAME_BORDERS,
  FRAME_BUCKETS,
  FRAME_FONTS,
  FRAME_MOODS,
  FRAME_ORNAMENTS,
  FRAME_PATTERNS,
  NAME_SHOWS,
  NAME_STYLES,
  INDEX_FILE,
  OUTPUT_DIR,
  REPO_ROOT,
  SLOT_SHAPES,
  SLOT_TILTS,
  SLOT_TONES,
  TEXT_EFFECTS,
  TEXT_SIZES,
  TITLE_SOURCES,
  expandFiles,
  generatedFilesOnDisk,
  moodFileName,
  readMoodFiles,
  renderSwift,
  swiftCase,
} from '../scripts/generate-call-frames-swift';

const WEB_SPEC = join(REPO_ROOT, 'apps/web/src/lib/calls/frames/frame-spec.ts');
const SWIFT_SPEC = join(REPO_ROOT, 'apps/ios/Meeshy/Features/Main/Models/CallFrames/CallFrameSpec.swift');

const webList = (source: string, name: string): readonly string[] => {
  const match = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`).exec(source);
  if (match?.[1] === undefined) throw new Error(`${name} introuvable dans frame-spec.ts`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((found) => found[1] ?? '');
};

const swiftCases = (source: string, typeName: string): readonly string[] => {
  const match = new RegExp(`enum ${typeName}: String[^{]*\\{([\\s\\S]*?)\\n\\}`).exec(source);
  if (match?.[1] === undefined) throw new Error(`${typeName} introuvable dans CallFrameSpec.swift`);
  return [...match[1].matchAll(/^\s+case (\w+)(?: = "([^"]+)")?$/gm)].map((found) => found[2] ?? found[1] ?? '');
};

const motifFile = (mood: string, variants: Record<string, unknown>): unknown => ({
  mood,
  motifs: [
    {
      id: `${mood}.essai`,
      mood,
      name: 'Essai « 1 »',
      base: {
        layout: { arrangement: 'grid', margin: 0.05, gap: 0.02, top: 0.1, bottom: 0 },
        slot: { shape: 'rect', tilt: 'none', tone: 'color' },
        background: { kind: 'solid', color: '#000' },
        ornaments: [],
        brand: { mark: 'logo', place: 'bottom', color: '#ffffff', size: 'm' },
        names: { show: 'none', style: 'caption', font: 'elegant', color: '#ffffff' },
        title: { source: 'none', font: 'elegant', color: '#ffffff', place: 'top', size: 'm', effect: 'none' },
      },
      variants,
    },
  ],
});

describe('le catalogue Swift des cadres de capture', () => {
  it('chaque fichier committé est à jour du JSON partagé', () => {
    renderSwift(readMoodFiles()).forEach((file) => {
      expect(readFileSync(join(OUTPUT_DIR, file.name), 'utf8'), file.name).toBe(file.content);
    });
  });

  it('aucun fichier généré périmé ne traîne, aucun ne manque', () => {
    expect(generatedFilesOnDisk()).toEqual(renderSwift(readMoodFiles()).map((file) => file.name).sort());
  });

  it('un index et un fichier par ambiance, chacun sous le budget de 1 200 lignes', () => {
    const files = renderSwift(readMoodFiles());
    expect(files.map((file) => file.name)).toEqual([INDEX_FILE, ...FRAME_MOODS.map(moodFileName)]);
    const oversized = files.filter((file) => file.content.split(/\r?\n/).length > 1200).map((file) => file.name);
    expect(oversized).toEqual([]);
  });

  it('le rendu est déterministe', () => {
    expect(renderSwift(readMoodFiles())).toEqual(renderSwift(readMoodFiles()));
  });

  it('les vocabulaires du générateur sont ceux de frame-spec.ts, dans le même ordre', () => {
    const source = readFileSync(WEB_SPEC, 'utf8');
    const lists: Record<string, readonly string[]> = {
      FRAME_MOODS, FRAME_BUCKETS, FRAME_ARRANGEMENTS, SLOT_SHAPES, SLOT_TONES, SLOT_TILTS, FRAME_PATTERNS, FRAME_BORDERS, FRAME_ORNAMENTS,
      FRAME_FONTS, BRAND_MARKS, BRAND_PLACES, TEXT_SIZES, NAME_SHOWS, NAME_STYLES, TITLE_SOURCES, TEXT_EFFECTS,
    };
    Object.entries(lists).forEach(([name, list]) => expect(list, name).toEqual(webList(source, name)));
  });

  it('les énumérations Swift portent les valeurs brutes du vocabulaire', () => {
    const swift = readFileSync(SWIFT_SPEC, 'utf8');
    const pairs: ReadonlyArray<readonly [string, readonly string[]]> = [
      ['CallFrameMood', FRAME_MOODS], ['CallFrameBucket', FRAME_BUCKETS], ['CallFrameArrangement', FRAME_ARRANGEMENTS],
      ['CallFrameSlotShape', SLOT_SHAPES], ['CallFrameTone', SLOT_TONES], ['CallFrameTilt', SLOT_TILTS],
      ['CallFramePatternKind', FRAME_PATTERNS], ['CallFrameBorderKind', FRAME_BORDERS], ['CallFrameOrnamentKind', FRAME_ORNAMENTS],
      ['CallFrameBrandMark', BRAND_MARKS], ['CallFrameBrandPlace', BRAND_PLACES], ['CallFrameTextSize', TEXT_SIZES],
      ['CallFrameNameShow', NAME_SHOWS], ['CallFrameNameStyle', NAME_STYLES], ['CallFrameTitleSource', TITLE_SOURCES],
      ['CallFrameTextEffect', TEXT_EFFECTS],
    ];
    pairs.forEach(([typeName, list]) => expect(swiftCases(swift, typeName), typeName).toEqual(list));
  });

  it('un motif se déplie en un cadre par variante, la variante surchargeant la base clé par clé', () => {
    const frames = expandFiles([
      motifFile('jovial', { groupe: {}, duo: { layout: { arrangement: 'split', margin: 0.05, gap: 0.02, top: 0.1, bottom: 0.1 } } }),
      motifFile('signature', { comite: {} }),
    ]);
    expect(frames.map((frame) => frame.id)).toEqual(['signature.essai.comite', 'jovial.essai.duo', 'jovial.essai.groupe']);
    expect((frames[1]?.look.layout as { arrangement: string }).arrangement).toBe('split');
    expect((frames[2]?.look.layout as { arrangement: string }).arrangement).toBe('grid');
  });

  it('un motif d’une autre ambiance que son fichier est écarté, comme sur le web', () => {
    const file = motifFile('elegant', { duo: {} }) as { mood: string; motifs: Array<Record<string, unknown>> };
    const stray = { ...file, motifs: [{ ...file.motifs[0], mood: 'jovial' }] };
    expect(expandFiles([stray])).toEqual([]);
  });

  it('les littéraux Swift échappent les guillemets et qualifient les .none optionnels', () => {
    const swift = renderSwift([motifFile('elegant', { duo: {} })]).map((file) => file.content).join('\n');
    expect(swift).toContain('name: "Essai « 1 »"');
    expect(swift).toContain('effect: CallFrameTextEffect.none');
    expect(swift).toContain('margin: 0.05, gap: 0.02, top: 0.1, bottom: 0.0');
    expect(swift).toContain('background: .solid(color: "#000")');
  });

  it('une valeur hors vocabulaire fait échouer la génération en nommant le chemin', () => {
    const file = motifFile('elegant', { duo: { slot: { shape: 'triangle', tilt: 'none', tone: 'color' } } });
    expect(() => renderSwift([file])).toThrow(/elegant\.essai\.duo\.slot\.shape/);
  });

  it('les noms Swift des valeurs à tiret sont en camelCase', () => {
    expect(['hors-norme', 'top-left', 'as-is', 'bottom-right'].map(swiftCase)).toEqual(['horsNorme', 'topLeft', 'asIs', 'bottomRight']);
    expect(moodFileName('hors-norme')).toBe('CallFrameCatalogue+HorsNorme.swift');
  });
});
