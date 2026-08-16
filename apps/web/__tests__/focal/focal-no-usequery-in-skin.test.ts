/**
 * Garde de contrat WF-113 (MÊME patron que `lentille-no-usequery-in-
 * skin.test.ts`, WL-105) : « la peau Focal ne monte aucun `useQuery`. »
 *
 * `components/conversations/focal/**` consomme des données déjà résolues
 * par ses appelants (props) — jamais son propre réseau. `hooks/lentille/**`
 * (dont les hooks WF-110/111 : `use-focal-perspective.ts`,
 * `use-reading-modes-flag.ts`, `resolve-reading-modes-flag.ts`) est DÉJÀ
 * couvert par la garde WL-105 existante (`lentille-no-usequery-in-
 * skin.test.ts` scanne tout `hooks/lentille/**`, RE-PREUVE faite : cette
 * suite reste verte après l'ajout de ces trois fichiers) — ce fichier ne
 * duplique donc que le périmètre `components/conversations/focal/**`, non
 * couvert par la garde WL-105 (portée `components/conversations/lentille/**`
 * uniquement).
 */
import * as fs from 'fs';
import * as path from 'path';

const SKIN_ROOT = path.join(__dirname, '../../components/conversations/focal');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const EXCLUDED_DIRS = new Set(['node_modules', '__tests__']);

const QUERY_HOOK_PATTERN =
  /\buse(?:Infinite)?Quer(?:y|ies)\s*\(|\buseMutation\s*\(|\bnew\s+QueryClient\b|from\s+['"]@tanstack\/react-query['"]/;

function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.[jt]sx?$/.test(filePath);
}

function walk(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), files);
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    if (isTestFile(fullPath)) continue;
    files.push(fullPath);
  }
  return files;
}

describe('Garde WF-113 — aucun useQuery/useMutation dans la peau Focal', () => {
  it('la peau existe bien (garde anti-silence, leçon 257)', () => {
    const files = walk(SKIN_ROOT);
    expect(files.length).toBeGreaterThan(0);
  });

  it('aucun fichier de components/conversations/focal/** ne référence useQuery/useInfiniteQuery/useMutation/QueryClient', () => {
    const files = walk(SKIN_ROOT);
    const offenders: Array<{ file: string; match: string }> = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const match = content.match(QUERY_HOOK_PATTERN);
      if (match) {
        offenders.push({ file: path.relative(path.join(__dirname, '../..'), file), match: match[0] });
      }
    }

    expect(offenders).toEqual([]);
  });
});
