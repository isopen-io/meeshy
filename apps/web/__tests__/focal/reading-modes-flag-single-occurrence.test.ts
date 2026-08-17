/**
 * Garde de contrat WF-110 (MÊME esprit que `lentille-flag-single-
 * occurrence.test.ts`, WL-101 — « le nom du drapeau ne fuit pas hors de son
 * point de résolution ») :
 *
 * ÉCART ASSUMÉ par rapport à WL-101 : le mux `lentille_list`
 * (`ConversationList.tsx`) appelle `isFeatureEnabled('lentille_list')` — il
 * écrit donc le NOM DU DRAPEAU en toutes lettres, une fois, à son point de
 * branchement. Le mux Focal (`ConversationMessages.tsx`) appelle
 * `useReadingModesFlag()` — le NOM DU HOOK, jamais la chaîne `'reading_modes'`
 * elle-même (`resolveReadingModesFlag`/`useReadingModesFlag` l'encapsulent
 * entièrement). Le compte attendu hors résolveur/tests est donc ZÉRO, pas UN
 * — un résultat PLUS STRICT que WL-101, pas une divergence de rigueur. Toute
 * occurrence future signifierait que la chaîne littérale a fui hors de son
 * point de résolution (ex. un second appelant qui reconstruit `'reading_modes'`
 * à la main plutôt que d'appeler le hook).
 */
import * as fs from 'fs';
import * as path from 'path';
import { READING_MODES_FLAG_NAME } from '@/hooks/lentille/resolve-reading-modes-flag';

const WEB_ROOT = path.join(__dirname, '../..');

const RESOLVER_FILES = new Set([
  path.join(WEB_ROOT, 'hooks/lentille/resolve-reading-modes-flag.ts'),
  path.join(WEB_ROOT, 'hooks/lentille/use-reading-modes-flag.ts'),
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
    const matches = content.match(new RegExp(READING_MODES_FLAG_NAME, 'g'));
    if (matches && matches.length > 0) {
      hits.push({ file: path.relative(WEB_ROOT, file), count: matches.length });
    }
  }

  return hits;
}

describe('Garde WF-110 — le nom du drapeau du fil ne fuit pas hors du résolveur/hook', () => {
  it('READING_MODES_FLAG_NAME vaut bien "reading_modes" (sanity du garde lui-même)', () => {
    expect(READING_MODES_FLAG_NAME).toBe('reading_modes');
  });

  it('ZÉRO occurrence de la chaîne littérale hors résolveur/tests (le mux appelle useReadingModesFlag(), jamais la chaîne)', () => {
    const hits = countFlagNameOccurrences();
    const total = hits.reduce((sum, h) => sum + h.count, 0);

    if (total !== 0) {
      throw new Error(
        `Attendu ZÉRO occurrence de '${READING_MODES_FLAG_NAME}' hors résolveur/tests.\n` +
          `Trouvé ${total} :\n${hits.map((h) => `  ${h.file}: ${h.count}`).join('\n')}`
      );
    }

    expect(total).toBe(0);
  });

  it('le mux (ConversationMessages.tsx) branche bien sur useReadingModesFlag()', () => {
    const conversationMessagesSource = fs.readFileSync(
      path.join(WEB_ROOT, 'components/conversations/ConversationMessages.tsx'),
      'utf8'
    );
    expect(conversationMessagesSource).toMatch(/useReadingModesFlag\s*\(\s*\)/);
  });
});
