/**
 * Garde de contrat LWS-10 (WL-105) :
 *
 *   « Aucune requête réseau nouvelle : garde — la peau ne monte aucun
 *   `useQuery`. »
 *
 * La peau (`components/conversations/lentille/**`, `hooks/lentille/**`)
 * consomme des données déjà résolues par ses appelants (props, stores
 * Zustand, providers LWS-2bis) — jamais son propre réseau. Un `useQuery`/
 * `useInfiniteQuery`/`useMutation` (`@tanstack/react-query`) qui s'y
 * glisserait romprait le critère d'acceptation « drapeau OFF ⇒ coût nul » :
 * une requête montée dans un module chargé en `next/dynamic` s'exécute dès
 * que le drapeau s'active, indépendamment du reste du pipeline de données
 * du parent.
 *
 * ARMÉE (contrairement à la garde `behaviour-matrix`, désarmée jusqu'à la
 * Porte V1) : ce périmètre est ENTIÈREMENT possédé par LWS-10 (WL-100..105)
 * et clos à ce commit — aucune vague future n'ajoute de fichier ici sans
 * repasser par ce garde.
 */
import * as fs from 'fs';
import * as path from 'path';

const SKIN_ROOTS = [
  path.join(__dirname, '../../components/conversations/lentille'),
  path.join(__dirname, '../../hooks/lentille'),
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const EXCLUDED_DIRS = new Set(['node_modules', '__tests__']);

// Motifs d'USAGE réel — un appel de fonction ou un import depuis
// `@tanstack/react-query` — jamais une simple mention en prose (ce fichier
// lui-même documente l'ABSENCE de `useQuery` dans ses commentaires d'en-tête
// de composant ; un motif sur le mot nu ferait un faux positif sur cette
// documentation légitime).
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

describe('Garde LWS-10 — aucun useQuery/useMutation dans la peau Lentille', () => {
  it('la peau existe bien (garde anti-silence, leçon 257 : une suite qui ne charge aucun fichier ne prouve rien)', () => {
    const files = SKIN_ROOTS.flatMap((root) => walk(root));
    expect(files.length).toBeGreaterThan(0);
  });

  it('aucun fichier de components/conversations/lentille/** ou hooks/lentille/** ne référence useQuery/useInfiniteQuery/useMutation/QueryClient', () => {
    const files = SKIN_ROOTS.flatMap((root) => walk(root));
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
