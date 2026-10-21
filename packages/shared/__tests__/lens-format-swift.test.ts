import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  LENS_SWIFT_OUTPUT_DIR,
  LENS_SWIFT_RELATIVE_DIR,
  LENS_SWIFT_REPO_ROOT,
  generatedLensFilesOnDisk,
  renderLensSwift,
} from '../scripts/generate-lens-format-swift';
import {
  LENS_ANCHOR_TYPES,
  LENS_COSTS,
  LENS_DENSITIES,
  LENS_FACE_POINTS,
  LENS_FORBIDDEN_KEYS,
  LENS_FORBIDDEN_LAYER_KINDS,
  LENS_LAYER_KINDS,
  LENS_LIMITS,
  LENS_PARTICLE_PRESETS,
  LENS_SCHEMA_VERSION,
  LENS_SURFACES,
  LENS_TRIGGER_ACTIONS,
  LENS_TRIGGER_EVENTS,
} from '../types/lens-format';
import { GLORY_FRAME_FONTS } from '../types/glory-frame-format';
import { PACK_LANGUAGES } from '../types/content-pack';

const generated = renderLensSwift();
const swiftTest = join(LENS_SWIFT_REPO_ROOT, 'packages/MeeshySDK/Tests/MeeshySDKTests/Lens/LensFormatVectorsTests.swift');

describe('MeeshyLens v1 — le miroir Swift généré', () => {
  it('est identique aux fichiers committés, sans fichier périmé', () => {
    generated.forEach((file) => {
      expect(readFileSync(join(LENS_SWIFT_OUTPUT_DIR, file.name), 'utf8'), file.name).toBe(file.content);
    });
    expect(generatedLensFilesOnDisk()).toEqual(generated.map((file) => file.name).sort());
  });

  it('vit dans le SDK (SPM, sans pbxproj)', () => {
    expect(LENS_SWIFT_RELATIVE_DIR).toBe('packages/MeeshySDK/Sources/MeeshySDK/Lens');
  });

  it('chaque fichier généré reste sous le budget de 1 200 lignes', () => {
    generated.forEach((file) => expect(file.content.split('\n').length, file.name).toBeLessThanOrEqual(1200));
  });

  it('déclare chaque vocabulaire fermé et chaque borne du contrat TypeScript', () => {
    const text = generated.map((file) => file.content).join('\n');
    const vocabularies = [
      LENS_SURFACES, LENS_COSTS, LENS_LAYER_KINDS, LENS_ANCHOR_TYPES, LENS_FACE_POINTS, LENS_PARTICLE_PRESETS,
      LENS_DENSITIES, LENS_TRIGGER_EVENTS, LENS_TRIGGER_ACTIONS, LENS_FORBIDDEN_KEYS, LENS_FORBIDDEN_LAYER_KINDS,
      GLORY_FRAME_FONTS, PACK_LANGUAGES,
    ];
    vocabularies.flat().forEach((word) => expect(text, word).toContain(`"${word}"`));
    expect(text).toContain(`static let schemaVersion = ${LENS_SCHEMA_VERSION}`);
    Object.entries(LENS_LIMITS).forEach(([name, value]) => expect(text, name).toContain(`static let ${name} = ${value}`));
  });

  it('est du Swift pur : Foundation seul, aucune dépendance du SDK', () => {
    generated.forEach((file) => {
      expect(file.content, file.name).toContain('import Foundation');
      expect(file.content, file.name).not.toMatch(/import (MeeshySDK|SocketIO|GRDB|UIKit|SwiftUI)/);
      expect(file.content, file.name).toContain('GÉNÉRÉ — ne pas éditer');
    });
  });

  it('est rejoué par un test Swift qui lit le MÊME fichier de vecteurs', () => {
    expect(existsSync(swiftTest)).toBe(true);
    const source = readFileSync(swiftTest, 'utf8');
    expect(source).toContain('shared/fixtures/lens-v1/vectors.json');
    expect(source).toContain('LensFormat.parse');
  });
});
