/**
 * Balayage : aucune route ne parse une pagination de querystring à la main.
 *
 * `validatePagination` (`utils/pagination.ts`) est la source UNIQUE du décodage
 * `offset`/`limit` d'une querystring. Elle borne les trois cas qu'un
 * `parseInt` inline laisse filer :
 *   - `?limit=abc` → `NaN` → `take: NaN` → `PrismaClientValidationError` → HTTP 500 ;
 *   - `?limit=-1`  → `take: -1` → Prisma rejette (`take` doit être ≥ 0) → HTTP 500 ;
 *   - `?limit=0`   → `take: 0` → page vide silencieuse ;
 * plus l'absence de plafond (`?limit=999999` touchait Mongo sans borne).
 *
 * Ces schémas de route déclarent `limit`/`offset` en `{ type: 'string' }` — donc
 * AUCUNE coercition AJV — si bien que la valeur brute atteint le gestionnaire.
 * La garde ne peut vivre qu'au site d'appel, et le site d'appel juste est le
 * SSOT, jamais un `parseInt` recopié.
 *
 * Ce balayage gèle l'inventaire des `parseInt(...)` / `Number(...)` bruts sur un
 * champ de pagination (`limit`/`offset`/`page`) dans les routes NON-admin, et il
 * doit rester VIDE. Quand il tombe, la réparation est de router par
 * `validatePagination`, jamais d'ajouter une ligne à un inventaire.
 *
 * `admin/` est exclu par PRÉFIXE, pas par liste de fichiers (règle de PR #3498 :
 * « le préfixe est le critère »). Deux raisons ÉCRITES :
 *   1. plusieurs routes admin paginent par PAGE (`page`/`skip`), un modèle que
 *      `validatePagination(offset, limit)` ne décrit pas ;
 *   2. plusieurs déclarent des querystrings Zod-coercées (numériques), où le
 *      `parseInt` opère sur une valeur déjà validée.
 * La dette admin restante — `admin/agent.ts` (page, NaN-unsafe car
 * `Math.max(1, parseInt('abc',10))` vaut `NaN`) et `admin/languages.ts`
 * (négatif non borné) — est NOMMÉE ici pour rester une dette VUE, à traiter par
 * un lot admin dédié (helper page-based).
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { stripComments } from './response-schema-sweep';

const PAGINATION_FIELD = /\b(limit|offset|page|pageSize)\b/;

/**
 * Extrait le premier argument d'un appel `fn(` ouvert à `openParen` (index du
 * `(`), jusqu'à la première virgule de profondeur 0 ou la parenthèse fermante.
 */
function firstArg(code: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < code.length; i++) {
    const ch = code[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return code.slice(openParen + 1, i);
    } else if (ch === ',' && depth === 1) {
      return code.slice(openParen + 1, i);
    }
  }
  return code.slice(openParen + 1);
}

/**
 * Les fragments `parseInt(...)` / `Number(...)` dont le PREMIER argument nomme un
 * champ de pagination. Rendus comme extrait normalisé (jamais un numéro de
 * ligne, qui dérive à la première édition — règle des balayages frères).
 */
export function sweepRawPaginationParses(source: string): ReadonlyArray<string> {
  const code = stripComments(source);
  const sites: string[] = [];
  const re = /\b(parseInt|Number)\s*\(/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(code)) !== null) {
    const openParen = m.index + m[0].length - 1;
    const arg = firstArg(code, openParen);
    if (PAGINATION_FIELD.test(arg)) {
      sites.push(`${m[1]}(${arg.trim().replace(/\s+/g, ' ')})`);
    }
  }

  return sites;
}

const ROUTES_DIR = join(__dirname, '..');

/** Fichiers `.ts` de production sous `routes/`, hors `__tests__/` et `admin/`. */
function nonAdminRouteFiles(dir: string, rel = ''): ReadonlyArray<string> {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'admin') continue;
      out.push(...nonAdminRouteFiles(join(dir, entry.name), relPath));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(relPath);
    }
  }
  return out;
}

/**
 * Le balayage du répertoire : chaque fichier NON-admin qui porte au moins un
 * parse de pagination brut, rendu `chemin → [fragments]`.
 */
export function sweepNonAdminRoutes(): ReadonlyArray<{ file: string; sites: ReadonlyArray<string> }> {
  return nonAdminRouteFiles(ROUTES_DIR)
    .map((file) => ({ file, sites: sweepRawPaginationParses(readFileSync(join(ROUTES_DIR, file), 'utf8')) }))
    .filter((entry) => entry.sites.length > 0);
}
