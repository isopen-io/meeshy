/**
 * Garde W9 Step 1 — plus aucun fichier de production de `apps/web` n'importe
 * l'un des CINQ composers legacy que cette tâche retire.
 *
 * Modèle : `__tests__/lib/composer-door-single-source.test.ts` (marche `fs`,
 * mêmes exclusions).
 *
 * Formulée comme un ENSEMBLE ÉNUMÉRÉ de cinq noms de module, chacun compté
 * séparément — jamais un motif large du type « plus aucun composer hérité »,
 * qui serait vert pour la mauvaise raison le jour où les modules disparaissent
 * (piège n°1 du plan, §F). Un import est reconnu par son SPÉCIFICATEUR (le
 * dernier segment du chemin dans un `from '...'`), pas par une sous-chaîne du
 * fichier — ce qui distingue proprement `PostComposer` d'`AudioPostComposer`
 * sans dépendre d'un `\b` regex fragile sur des noms concaténés.
 *
 * État attendu AVANT le Step 4 (retrait des cinq fichiers + des cinq paires
 * du barrel) : ROUGE — `components/v2/index.ts` réexporte encore les cinq
 * modules, et il est lui-même un fichier de production. Ce rouge est le RED
 * de ce lot : la suppression des fichiers et des exports du barrel (Step 4)
 * est la ligne de production qui le fait passer au vert.
 */
import * as fs from 'fs';
import * as path from 'path';

const WEB_ROOT = path.join(__dirname, '../../..');

const RETIRED_MODULES = [
  'PostComposer',
  'StatusComposer',
  'AudioPostComposer',
  'RepostModal',
  'PostEditor',
] as const;

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
  '__tests__',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.[jt]sx?$/.test(filePath);
}

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), files);
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    const ext = path.extname(entry.name);
    if (!SOURCE_EXTENSIONS.has(ext)) continue;
    if (entry.name.endsWith('.d.ts')) continue;
    if (isTestFile(fullPath)) continue;

    files.push(fullPath);
  }
  return files;
}

function importedModuleNames(source: string): string[] {
  const specifiers: string[] = [];
  const importRegex = /from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source)) !== null) {
    specifiers.push(match[1]);
  }
  return specifiers.map((specifier) => specifier.split('/').pop() ?? specifier);
}

function productionFilesImporting(moduleName: string): string[] {
  return walk(WEB_ROOT)
    .filter((file) => importedModuleNames(fs.readFileSync(file, 'utf8')).includes(moduleName))
    .map((file) => path.relative(WEB_ROOT, file))
    .sort();
}

describe("Garde W9 Step 1 — aucun fichier de production n'importe plus les cinq composers legacy", () => {
  it.each(RETIRED_MODULES)('%s : zéro importeur de production', (moduleName) => {
    expect(productionFilesImporting(moduleName)).toEqual([]);
  });
});
