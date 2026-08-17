/**
 * Garde de contrat R-134 (MÊME patron que `lentille-no-usequery-in-skin.test.ts`
 * (WL-105) et `focal-no-usequery-in-skin.test.ts` (WF-113)) : « la peau
 * Rivière ne monte aucun `useQuery`. »
 *
 * `components/conversations/riviere/**` consomme des données déjà résolues
 * par ses appelants (props — `RiverThread.contents: ReadonlyMap<string,
 * RiverBubbleContent>`) — jamais son propre réseau.
 */
import * as fs from 'fs';
import * as path from 'path';

const SKIN_ROOT = path.join(__dirname, '../../components/conversations/riviere');

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

describe('Garde R-134 — aucun useQuery/useMutation dans la peau Rivière', () => {
  it('la peau existe bien (garde anti-silence, leçon 257)', () => {
    const files = walk(SKIN_ROOT);
    expect(files.length).toBeGreaterThan(0);
  });

  it('aucun fichier de components/conversations/riviere/** ne référence useQuery/useInfiniteQuery/useMutation/QueryClient', () => {
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
