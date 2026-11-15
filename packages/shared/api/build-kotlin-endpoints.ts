/**
 * Projection KOTLIN du catalogue d'API (#11817) — GÉNÉRATRICE, jamais tapée.
 *
 * Jumelle de `build-swift-endpoints.ts`, bâtie sur la MÊME chaîne : elle consomme
 * les `entries` de `buildApiEndpointsCatalog()`, donc exactement ce que consomment
 * les projections TypeScript et Swift. Le nommage est décidé UNE fois, dans
 * `build-catalog.ts` ; ce fichier ne connaît aucun chemin particulier et ne décide
 * que de la SYNTAXE Kotlin.
 *
 * ## Des `const val`, parce que Retrofit les lit dans une annotation
 *
 * `@GET(ApiRoutes…)` exige une constante de compilation. Une fonction de chemin
 * (`fun byId(id: String)`) est donc exclue : les paramètres restent les
 * emplacements `{id}` que Retrofit résout lui-même avec `@Path`. Le joker `*`
 * devient `{wildcard}`.
 *
 * ## Des chemins RELATIFS au préfixe d'API
 *
 * Le client Android pose `/api/v1/` dans l'URL de base : une route versionnée
 * s'écrit donc sans lui (`auth/login`). Les routes hors `/api/v1` (`/health`,
 * `/api/conversations/...`) gardent leur chemin complet SANS barre initiale —
 * elles ne se résolvent pas contre la base versionnée et ne sont pas des
 * annotations Retrofit ordinaires.
 *
 * ## Un objet par namespace
 *
 * 700 constantes dans un seul objet seraient un problème de compilation avant
 * d'être un problème de lecture ; le découpage suit le SERVEUR, comme la
 * projection Swift.
 */

import type { CatalogEntry } from './build-catalog.js';

export interface KotlinEndpointFile {
  readonly fileName: string;
  readonly source: string;
}

const API_V1_PREFIX = '/api/v1';

const KOTLIN_HARD_KEYWORDS: ReadonlySet<string> = new Set([
  'as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun', 'if', 'in',
  'interface', 'is', 'null', 'object', 'package', 'return', 'super', 'this', 'throw',
  'true', 'try', 'typealias', 'typeof', 'val', 'var', 'when', 'while',
]);

/** Un identifiant qui serait un mot réservé, ou qui commencerait par un chiffre, reste utilisable. */
export function kotlinIdentifier(identifier: string): string {
  const safe = /^[0-9]/.test(identifier) ? `_${identifier}` : identifier;
  return KOTLIN_HARD_KEYWORDS.has(safe) ? `\`${safe}\`` : safe;
}

function objectName(namespace: string): string {
  return `ApiRoutes${namespace.charAt(0).toUpperCase()}${namespace.slice(1)}`;
}

/** `byConversationIdMessages` → `BY_CONVERSATION_ID_MESSAGES`. */
export function constantName(key: string): string {
  return kotlinIdentifier(key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase());
}

/** Le chemin BRUT du manifeste, relatif au préfixe versionné, `:id` → `{id}`, `*` → `{wildcard}`. */
export function kotlinRoutePath(rawPath: string): string {
  const relative =
    rawPath === API_V1_PREFIX
      ? ''
      : rawPath.startsWith(`${API_V1_PREFIX}/`)
        ? rawPath.slice(API_V1_PREFIX.length + 1)
        : rawPath.replace(/^\//, '');
  return relative
    .split('/')
    .map((segment) => {
      if (segment === '*') return '{wildcard}';
      if (segment.startsWith(':')) return `{${segment.slice(1)}}`;
      return segment;
    })
    .join('/')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$');
}

const HEADER = [
  '// GÉNÉRÉ — ne pas éditer à la main.',
  '//',
  '// Source : services/gateway/route-manifest.json, via la MÊME dérivation que le',
  '// catalogue TypeScript (packages/shared/api/build-catalog.ts). Régénérer après',
  '// tout changement de route :',
  '//',
  '//   cd packages/shared && npm run android-endpoints:generate',
  '//',
  "// Les chemins sont relatifs au préfixe d'API (/api/v1/) ; les emplacements {nom}",
  '// sont résolus par @Path. Les routes hors /api/v1 gardent leur chemin complet.',
  '',
  'package me.meeshy.sdk.net.routes',
  '',
].join('\n');

function constantDeclaration(entry: CatalogEntry): string {
  return `    public const val ${constantName(entry.key)}: String = "${kotlinRoutePath(entry.rawPath)}"`;
}

function assertNoCollision(namespace: string, bucket: readonly CatalogEntry[]): void {
  const seen = new Map<string, string>();
  for (const entry of bucket) {
    const name = constantName(entry.key);
    const previous = seen.get(name);
    if (previous !== undefined && previous !== entry.rawPath) {
      throw new Error(
        `Collision Kotlin dans ${namespace} : ${previous} et ${entry.rawPath} dérivent ${name}.`
      );
    }
    seen.set(name, entry.rawPath);
  }
}

/**
 * Rend un fichier Kotlin par namespace, triés par nom — la sortie ne dépend
 * jamais de l'ordre des entrées.
 */
export function renderKotlinEndpoints(
  entries: readonly CatalogEntry[]
): readonly KotlinEndpointFile[] {
  const byNamespace = new Map<string, CatalogEntry[]>();
  for (const entry of entries) {
    const bucket = byNamespace.get(entry.namespace) ?? [];
    bucket.push(entry);
    byNamespace.set(entry.namespace, bucket);
  }

  return [...byNamespace.entries()]
    .map(([namespace, bucket]) => {
      assertNoCollision(namespace, bucket);
      const sorted = [...bucket].sort((left, right) => left.key.localeCompare(right.key));
      const name = objectName(namespace);
      const source = [
        HEADER,
        `public object ${name} {`,
        ...sorted.map(constantDeclaration),
        '}',
        '',
      ].join('\n');
      return { fileName: `${name}.kt`, source };
    })
    .sort((left, right) => left.fileName.localeCompare(right.fileName));
}
