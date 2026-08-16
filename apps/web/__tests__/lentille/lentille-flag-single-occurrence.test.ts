/**
 * Garde de contrat LWS-10 (workshop §5 V4, WL-100/WL-101) :
 *
 *   « hors de son résolveur et de ses tests, le nom du drapeau n'apparaît
 *   qu'UNE fois — au mux. Une seconde occurrence signifie que la logique a
 *   fui hors du point de branchement. »
 *
 * Le « résolveur » couvre les deux fichiers qui constituent le mécanisme de
 * décision lui-même (`hooks/lentille/resolve-lentille-flag.ts`, la loi pure ;
 * `hooks/use-feature-flags.ts`, l'UNIQUE DÉCIDEUR qui l'applique et expose la
 * clé `lentille_list`) — exclus par construction, sans quoi ce garde
 * s'alarmerait de sa propre définition. « Ses tests » couvre tout fichier
 * `*.test.ts(x)` / `*.spec.ts(x)` et tout ce qui vit sous un dossier
 * `__tests__/`.
 *
 * RESSERREMENT PROGRAMMÉ (documenté ici, choix explicite — voir
 * tasks/lentille-workshop-execution.md, protocole §2) : ce garde compte
 * `LENTILLE_FLAG_NAME` ('lentille_list') dans `apps/web` hors exclusions.
 *   - WL-100 (CE commit) : AUCUN site de mux n'existe encore ⇒ attendu 0.
 *   - WL-101 (commit suivant) : le mux de `ConversationList.tsx` introduit
 *     l'unique occurrence ⇒ attendu 1. Le seuil sera resserré DANS LE MÊME
 *     commit qui introduit cette occurrence — jamais laissé « ≤ 1 »
 *     indéfiniment, ce qui aurait dispensé le garde de jamais s'alarmer d'un
 *     deuxième site de mux ajouté par erreur.
 */
import * as fs from 'fs';
import * as path from 'path';
import { LENTILLE_FLAG_NAME } from '@/hooks/lentille/resolve-lentille-flag';

const WEB_ROOT = path.join(__dirname, '../..');

// Fichiers qui SONT le résolveur — exclus par construction (voir en-tête).
const RESOLVER_FILES = new Set([
  path.join(WEB_ROOT, 'hooks/lentille/resolve-lentille-flag.ts'),
  path.join(WEB_ROOT, 'hooks/use-feature-flags.ts'),
]);

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
    if (ext === '.d.ts') continue;
    if (isTestFile(fullPath)) continue;
    if (RESOLVER_FILES.has(fullPath)) continue;

    files.push(fullPath);
  }
  return files;
}

function countFlagNameOccurrences(): Array<{ file: string; count: number }> {
  const candidates = walk(WEB_ROOT);
  const hits: Array<{ file: string; count: number }> = [];

  for (const file of candidates) {
    const content = fs.readFileSync(file, 'utf8');
    const matches = content.match(new RegExp(LENTILLE_FLAG_NAME, 'g'));
    if (matches && matches.length > 0) {
      hits.push({ file: path.relative(WEB_ROOT, file), count: matches.length });
    }
  }

  return hits;
}

describe('Garde LWS-10 — une seule occurrence du nom du drapeau hors résolveur/tests', () => {
  it('LENTILLE_FLAG_NAME vaut bien "lentille_list" (sanity du garde lui-même)', () => {
    expect(LENTILLE_FLAG_NAME).toBe('lentille_list');
  });

  it('WL-100 : zéro occurrence hors résolveur/tests — le mux n\'existe pas encore', () => {
    const hits = countFlagNameOccurrences();
    const total = hits.reduce((sum, h) => sum + h.count, 0);

    if (total !== 0) {
      throw new Error(
        `Attendu 0 occurrence de '${LENTILLE_FLAG_NAME}' hors résolveur/tests à ce stade (WL-100).\n` +
          `Trouvé ${total} :\n` +
          hits.map(h => `  ${h.file}: ${h.count}`).join('\n')
      );
    }

    expect(total).toBe(0);
  });
});
