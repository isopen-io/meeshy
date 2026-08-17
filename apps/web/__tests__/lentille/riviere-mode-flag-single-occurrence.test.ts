/**
 * Garde de contrat R-134 (MÊME esprit que `lentille-flag-single-occurrence
 * .test.ts` (WL-101) et `reading-modes-flag-single-occurrence.test.ts`
 * (WF-110) : « le nom du drapeau ne fuit pas hors de son point de
 * résolution »).
 *
 * PLUS STRICT ENCORE que les deux gardes sœurs sur le CODE : ce lot (R-134)
 * livre la peau Rivière et son drapeau, mais AUCUN site de mux — le dégrisage
 * du menu est R-135. Le compte de CODE attendu hors résolveur/hook/tests est
 * donc ZÉRO partout, y compris au mux du fil (`ConversationMessages.tsx`
 * appelle `useReadingModesFlag()`, jamais `useRiverModeFlag()` — pas encore).
 *
 * RE-PREUVE (§0) : `LentillePeek.tsx` et `ReadingModeMenu.tsx` (chantier B2/B3
 * concurrent, NE PAS TOUCHER) portent chacun déjà un COMMENTAIRE en prose
 * citant `riviere_mode` en prévision de son dégrisage — de la documentation
 * DATÉE, jamais du câblage. Les commentaires sont donc retirés avant comptage
 * (même mécanique que `riviere-source-guard-r15.test.ts`) : documenter la loi
 * à venir n'est pas la brancher.
 *
 * Ce témoin verrouille l'état RÉEL (zéro câblage) : si un futur lot (R-135)
 * branche effectivement `useRiverModeFlag()` quelque part, il doit AUSSI
 * mettre à jour ce garde (resserrer le seuil à 1, dans LE MÊME commit,
 * exactement comme WL-101 l'a documenté pour `lentille-flag-single-
 * occurrence.test.ts`) — jamais le laisser rougir en silence en croyant à une
 * régression.
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
