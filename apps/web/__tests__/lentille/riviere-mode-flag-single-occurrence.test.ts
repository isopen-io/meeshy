/**
 * Garde de contrat R-134/R-135 (MÊME esprit que `lentille-flag-single-occurrence
 * .test.ts` (WL-101) et `reading-modes-flag-single-occurrence.test.ts`
 * (WF-110) : « le nom du drapeau ne fuit pas hors de son point de
 * résolution »).
 *
 * Ce garde compte les occurrences du nom LITTÉRAL du drapeau
 * (`RIVER_MODE_FLAG_NAME`, la chaîne `'riviere_mode'`), PAS les appels au hook
 * `useRiverModeFlag(` — un appelant qui se contente d'IMPORTER et d'INVOQUER
 * le hook n'a besoin d'écrire ce littéral nulle part (il vit UNIQUEMENT dans
 * `resolve-river-mode-flag.ts`, le nom du paramètre de requête/cookie).
 *
 * R-135 branche le PREMIER appelant réel : `LentillePeek.tsx` (défaut de sa
 * prop `isRiverFlagEnabled`, résolu par `useRiverModeFlag()`) — les TROIS
 * chemins d'entrée du menu de mode (⋮, aperçu, encoche) en héritent. Le
 * compte attendu reste ZÉRO malgré ce câblage réel : la CIBLE de ce garde
 * (fuite du NOM du drapeau) n'a pas bougé, seul son CONSOMMATEUR a changé.
 * `ConversationMessages.tsx` (mux du fil ouvert → `RiverThread`) reste lui
 * NON câblé — hors périmètre de R-135, voir le rapport de tâche.
 *
 * RE-PREUVE (§0) : `LentillePeek.tsx` et `ReadingModeMenu.tsx` portent chacun
 * un COMMENTAIRE en prose citant `riviere_mode` — retiré avant comptage
 * (même mécanique que `riviere-source-guard-r15.test.ts`) : documenter la loi
 * n'est pas la brancher, et documenter le VRAI nom d'un littéral qu'on
 * n'écrit pas en code n'en crée pas une occurrence.
 *
 * Ce témoin verrouille l'état RÉEL : si un futur lot fait fuiter le nom
 * LITTÉRAL `'riviere_mode'` hors du résolveur/hook (une clé de config
 * recopiée en dur, par exemple), il doit AUSSI mettre à jour ce garde —
 * jamais le laisser rougir en silence en croyant à une régression.
 */
import * as fs from 'fs';
import * as path from 'path';
import { RIVER_MODE_FLAG_NAME } from '@/hooks/lentille/resolve-river-mode-flag';

/** Retire les commentaires `//` et `/* ... *\/` avant le scan (documentation ≠ code). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const WEB_ROOT = path.join(__dirname, '../..');

const RESOLVER_FILES = new Set([
  path.join(WEB_ROOT, 'hooks/lentille/resolve-river-mode-flag.ts'),
  path.join(WEB_ROOT, 'hooks/lentille/use-river-mode-flag.ts'),
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
    const content = stripComments(fs.readFileSync(file, 'utf8'));
    const matches = content.match(new RegExp(RIVER_MODE_FLAG_NAME, 'g'));
    if (matches && matches.length > 0) {
      hits.push({ file: path.relative(WEB_ROOT, file), count: matches.length });
    }
  }

  return hits;
}

describe('Garde R-134 — le nom du drapeau riviere_mode ne fuit pas hors du résolveur/hook', () => {
  it('RIVER_MODE_FLAG_NAME vaut bien "riviere_mode" (sanity du garde lui-même)', () => {
    expect(RIVER_MODE_FLAG_NAME).toBe('riviere_mode');
  });

  it('ZÉRO occurrence de CODE hors résolveur/hook/tests — R-134 ne monte AUCUN appelant (le mux est R-135)', () => {
    const hits = countFlagNameOccurrences();
    const total = hits.reduce((sum, h) => sum + h.count, 0);

    if (total !== 0) {
      throw new Error(
        `Attendu ZÉRO occurrence de '${RIVER_MODE_FLAG_NAME}' hors résolveur/hook/tests (R-134 ne livre pas de mux).\n` +
          `Trouvé ${total} :\n${hits.map((h) => `  ${h.file}: ${h.count}`).join('\n')}`
      );
    }

    expect(total).toBe(0);
  });
});
