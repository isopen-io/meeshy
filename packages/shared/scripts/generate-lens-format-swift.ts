/**
 * Régénère le miroir Swift du contrat MeeshyLens v1 (#11270) depuis
 * `packages/shared/types/lens-format.ts`.
 *
 * Usage (une commande, sans argument), depuis `packages/shared` :
 *
 *   bun run generate:lens-format
 *   # ou, équivalent : bun scripts/generate-lens-format-swift.ts
 *
 * Le miroir vit dans le SDK (`packages/MeeshySDK/Sources/MeeshySDK/Lens`, SPM : aucun
 * `project.pbxproj` à régénérer). Il porte deux choses : le VOCABULAIRE et les BORNES, déduits des
 * constantes du contrat (rien n'est recopié à la main), et le LECTEUR tolérant, dont le texte
 * est `lens-swift-parser.ts`. `__tests__/lens-format-swift.test.ts` exige que les fichiers
 * committés soient égaux à `renderLensSwift()` et qu'aucun fichier périmé ne traîne ;
 * `fixtures/lens-v1/vectors.json` est rejoué par vitest ET par ce Swift : il ne peut pas dériver du
 * contrat en silence. Modèle : `generate-call-frames-swift.ts`.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PACK_LANGUAGES } from '../types/content-pack.js';
import { GLORY_FRAME_FONTS } from '../types/glory-frame-format.js';
import {
  LENS_ANCHOR_TYPES,
  LENS_BARE_URL_SCHEMES,
  LENS_COSTS,
  LENS_DENSITIES,
  LENS_FACE_POINTS,
  LENS_FORBIDDEN_KEYS,
  LENS_FORBIDDEN_LAYER_KINDS,
  LENS_LAYER_KINDS,
  LENS_LIMITS,
  LENS_PARTICLE_PRESETS,
  LENS_PATTERNS,
  LENS_RANGES,
  LENS_SCHEMA_VERSION,
  LENS_SURFACES,
  LENS_TRIGGER_ACTIONS,
  LENS_TRIGGER_EVENTS,
} from '../types/lens-format.js';
import { DOCUMENT_FILE, JSON_VALUE_FILE, LAYERS_FILE, MODEL_FILE, SCAN_FILE } from './lens-swift-parser.js';

export const LENS_SWIFT_RELATIVE_DIR = 'packages/MeeshySDK/Sources/MeeshySDK/Lens';

const HERE = dirname(fileURLToPath(import.meta.url));
export const LENS_SWIFT_REPO_ROOT = resolve(HERE, '../../..');
export const LENS_SWIFT_OUTPUT_DIR = resolve(LENS_SWIFT_REPO_ROOT, LENS_SWIFT_RELATIVE_DIR);

/** Un fichier Swift généré : son nom (dans `LENS_SWIFT_RELATIVE_DIR`) et son texte. */
export type GeneratedLensFile = { readonly name: string; readonly content: string };

const HEADER = [
  '// GÉNÉRÉ — ne pas éditer; source: packages/shared/types/lens-format.ts',
  '// Régénérer : `cd packages/shared && bun run generate:lens-format`.',
  '// Fraîcheur gardée par packages/shared/__tests__/lens-format-swift.test.ts ;',
  '// comportement gardé par packages/shared/fixtures/lens-v1/vectors.json (vitest ET Swift).',
  '',
  '',
].join('\n');

const quote = (text: string): string => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** `top-of-head` → `topOfHead`, `Cinzel Decorative` → `cinzelDecorative`, `onTap` → `onTap`. */
export const lensCaseName = (raw: string): string =>
  raw.replace(/[-\s]+([A-Za-z0-9])/g, (_, letter: string) => letter.toUpperCase()).replace(/^[A-Z]/, (letter) => letter.toLowerCase());

const enumDeclaration = (name: string, doc: string, values: readonly string[]): string =>
  [
    `/// ${doc}`,
    `public enum ${name}: String, Sendable, CaseIterable {`,
    ...values.map((value) => `    case ${lensCaseName(value)} = ${quote(value)}`),
    '}',
    '',
  ].join('\n');

const stringArray = (name: string, doc: string, values: readonly string[], access = 'public '): string =>
  `    /// ${doc}\n    ${access}static let ${name}: [String] = [${values.map(quote).join(', ')}]`;

/** Le motif du contrat, ancré pour ICU : `^` → début de texte, `$` → fin de texte ABSOLUE (pas avant un saut de ligne final). */
const icuPattern = (pattern: RegExp): string => `#"${pattern.source.replace(/^\^/, '\\A').replace(/\$$/, '\\z')}"#`;

const swiftNumber = (value: number): string => String(value);

const limitLines = Object.entries(LENS_LIMITS).map(([name, value]) => `    public static let ${name} = ${value}`);

const rangeLines = Object.entries(LENS_RANGES).map(
  ([name, [min, max]]) => `    static let ${name}Range: ClosedRange<Double> = ${swiftNumber(min)}...${swiftNumber(max)}`,
);

const patternTuple = `    static let patterns = (\n${Object.entries(LENS_PATTERNS)
  .map(([name, pattern]) => `        ${name}: ${icuPattern(pattern)}`)
  .join(',\n')}\n    )`;

const vocabularyFile = (): GeneratedLensFile => ({
  name: 'LensFormat+Vocabulary.swift',
  content: HEADER + [
    'import Foundation',
    '',
    enumDeclaration('LensSurface', 'Là où une lens se peint : la capture, ou le direct (l\'appel).', LENS_SURFACES),
    enumDeclaration('LensCost', 'Le coût de rendu déclaré par la lens, pour la dégradation par palier.', LENS_COSTS),
    enumDeclaration('LensFacePoint', 'Les points nommés du visage ; chaque plateforme les fait correspondre à ses repères.', LENS_FACE_POINTS),
    enumDeclaration('LensParticlePreset', 'Les préréglages de particules.', LENS_PARTICLE_PRESETS),
    enumDeclaration('LensDensity', 'La densité des particules.', LENS_DENSITIES),
    enumDeclaration('LensTriggerEvent', 'Ce qui déclenche une action.', LENS_TRIGGER_EVENTS),
    enumDeclaration('LensTriggerAction', 'Ce qu\'un déclencheur fait à sa couche cible.', LENS_TRIGGER_ACTIONS),
    enumDeclaration('LensFont', 'Les polices des cadres : une liste fermée, jamais téléchargée par une lens.', GLORY_FRAME_FONTS),
    'extension LensFormat {',
    `    public static let schemaVersion = ${LENS_SCHEMA_VERSION}`,
    ...limitLines,
    stringArray('languages', 'Les sept langues du Prisme ; le français est la langue de repli.', PACK_LANGUAGES),
    stringArray('layerKinds', 'Les cinq primitives de la v1.', LENS_LAYER_KINDS),
    stringArray('anchorTypes', 'Les deux ancres : l\'écran, le visage.', LENS_ANCHOR_TYPES),
    stringArray('forbiddenKeys', 'Les clés qu\'aucun niveau d\'un document v1 ne porte.', LENS_FORBIDDEN_KEYS, ''),
    stringArray('forbiddenLayerKinds', 'Les genres de couche refusés (et non ignorés).', LENS_FORBIDDEN_LAYER_KINDS, ''),
    stringArray('bareUrlSchemes', 'Les schémas d\'URL qui s\'écrivent sans « :// ».', LENS_BARE_URL_SCHEMES, ''),
    ...rangeLines,
    patternTuple,
    '}',
    '',
  ].join('\n'),
});

const withHeader = (name: string, body: string): GeneratedLensFile => ({ name, content: HEADER + body });

/** Les fichiers Swift, purs et déterministes, dans l'ordre : valeur JSON, vocabulaire, modèle, document, couches, interdits. */
export function renderLensSwift(): readonly GeneratedLensFile[] {
  return [
    withHeader('LensJSONValue.swift', JSON_VALUE_FILE),
    vocabularyFile(),
    withHeader('LensDocument.swift', MODEL_FILE),
    withHeader('LensFormat.swift', DOCUMENT_FILE),
    withHeader('LensFormat+Layers.swift', LAYERS_FILE),
    withHeader('LensFormat+Scan.swift', SCAN_FILE),
  ];
}

/** Les fichiers générés présents sur disque : le dossier appartient tout entier au générateur. */
export function generatedLensFilesOnDisk(directory: string = LENS_SWIFT_OUTPUT_DIR): readonly string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => name.endsWith('.swift')).sort();
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const generated = renderLensSwift();
  mkdirSync(LENS_SWIFT_OUTPUT_DIR, { recursive: true });
  const expected = new Set(generated.map((file) => file.name));
  generatedLensFilesOnDisk().filter((name) => !expected.has(name)).forEach((name) => rmSync(join(LENS_SWIFT_OUTPUT_DIR, name)));
  generated.forEach((file) => writeFileSync(join(LENS_SWIFT_OUTPUT_DIR, file.name), file.content));
  process.stdout.write(`${LENS_SWIFT_RELATIVE_DIR} — ${generated.length} fichiers\n`);
}
