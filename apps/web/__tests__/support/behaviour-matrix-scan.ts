/**
 * Scanner en-process des jetons `behaviour-matrix:<id>` — extrait de
 * `apps/web/__tests__/focal/behaviour-matrix-parity.test.ts` (REV-4/B5) au
 * moment où `apps/web/__tests__/lentille/behaviour-matrix-parity.test.ts`
 * (V4bis/R4-1) en a eu besoin à l'identique : MÊME mécanique de scan pour
 * les deux familles d'id (F* et L*), donc UN SEUL endroit qui la porte —
 * pas un second scanner à faire diverger silencieusement de celui-ci.
 *
 * REV-4/B5 — l'INDEX des jetons, construit UNE fois, en process.
 *
 * Ce que faisait la version précédente (avant B5) : un `execSync('grep -rl
 * … apps/web')` PAR id couvert, soit N balayages récursifs complets, non
 * bornés. Le coût dépendait donc de ce que l'arbre de travail contenait AU
 * MOMENT du run — `.next/` d'un `next dev` ou `next build`, `coverage/`, un
 * `node_modules/` matérialisé plutôt que hissé à la racine : autant de
 * répertoires que la garde n'excluait pas et que le dépôt ne suit pas. D'où
 * le symptôme rapporté par REV-4 : ROUGE à froid (11 s, au-delà du
 * `testTimeout` par défaut de 5 s), VERT à chaud. Un témoin dont le verdict
 * dépend de l'état du cache disque ne prouve rien : il n'était pas plus
 * « lent » que non déterministe.
 *
 * Le remède ne touche NI au seuil, NI à ce que la garde attrape :
 *
 *   - le balayage est BORNÉ aux sources (`EXCLUDED_DIRS` ci-dessous) — ce qui
 *     est plus STRICT que `grep -rl`, qui acceptait qu'un jeton trouvé dans
 *     une sortie de build ou une dépendance satisfasse la garde ;
 *   - `__tests__/` reste INCLUS : les jetons réels y vivent presque tous,
 *     c'est le répertoire que la garde doit voir ;
 *   - une seule traversée sert TOUS les ids d'une famille (et tous les
 *     futurs), au lieu d'un balayage par id ;
 *   - plus de sous-processus : plus de dépendance au `grep` du système, à
 *     son dialecte d'expression régulière, ni à sa disponibilité.
 *
 * Chaque appelant doit garder son propre « témoin de discrimination » (le
 * scanner voit un jeton réel, et ne répond jamais « trouvé » pour un id qui
 * n'existe dans aucune matrice) — ce fichier ne le fait pas à leur place :
 * la preuve doit être rejouée par CHAQUE famille contre SON PROPRE id absent
 * (`F99`, `L99`, …), sans quoi remplacer ce module sans prouver qu'il voit
 * encore serait exactement la façon dont une garde meurt en silence.
 */
import { readdirSync, readFileSync } from 'fs';
import { extname, join, relative } from 'path';

export const EXCLUDED_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
]);

export const SOURCE_EXTENSIONS: ReadonlySet<string> = new Set(['.ts', '.tsx']);

export function walkSources(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      walkSources(join(dir, entry.name), files);
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(extname(entry.name))) continue;
    files.push(join(dir, entry.name));
  }
  return files;
}

/**
 * id de la matrice → fichiers (relatifs à `root`) qui posent son jeton
 * `behaviour-matrix:<id>`, pour tout `id` matchant `idPattern` (ex.
 * `/^F\d{2}$/`, `/^L\d{2}$/`). UNE seule traversée sert toutes les familles
 * qui partagent le même `root` — les appelants F* et L* de ce dépôt
 * scannent chacun `apps/web` en entier, donc chacun paie sa propre
 * traversée (pas de cache partagé entre familles : la simplicité prime tant
 * qu'aucun budget de temps ne le justifie).
 */
export function indexBehaviourTokens(
  root: string,
  idPattern: RegExp
): ReadonlyMap<string, readonly string[]> {
  const tokenPattern = /behaviour-matrix:([A-Z]\d{2})\b/g;
  const index = new Map<string, string[]>();
  for (const file of walkSources(root)) {
    const content = readFileSync(file, 'utf8');
    for (const match of content.matchAll(tokenPattern)) {
      const id = match[1];
      if (!idPattern.test(id)) continue;
      const bucket = index.get(id) ?? [];
      const rel = relative(root, file);
      if (!bucket.includes(rel)) bucket.push(rel);
      index.set(id, bucket);
    }
  }
  return index;
}
