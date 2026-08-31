/**
 * Projection SWIFT du catalogue d'API (#4282) — GÉNÉRATRICE, jamais tapée.
 *
 * Elle consomme les `entries` de `buildApiEndpointsCatalog()`, c'est-à-dire
 * exactement ce que la projection TypeScript consomme. C'est le point du lot :
 * si iOS re-dérivait son propre nommage depuis le manifeste, « un chemin d'API
 * s'écrit à un seul endroit » deviendrait « un chemin s'écrit une fois par
 * surface, avec un nom par surface » — deux règles justes le jour où on les
 * écrit, divergentes au premier changement de segment.
 *
 * Ce fichier ne connaît donc AUCUN chemin particulier, ni aucun nom : il ne
 * décide que de la SYNTAXE Swift.
 *
 * ## Un fichier par namespace, jamais une énumération unique
 *
 * 440 chemins dans un seul `switch` seraient un problème de compilation avant
 * d'être un problème de lecture. Un `enum` par namespace conformant à
 * `MeeshyEndpoint` découpe selon le SERVEUR — pas selon une tranche arbitraire
 * — et le budget 800–1100 lignes se tient de lui-même.
 *
 * ## Ce que ce fichier NE génère PAS
 *
 * `authKind` et `retryPolicy` sont des décisions CLIENT (quel jeton attacher,
 * quoi réessayer). Le manifeste porte `securityLevel: 'inconnu'` par refus
 * délibéré de deviner (#4276) ; en dériver une valeur la propagerait, inventée,
 * à une surface de plus. Ces politiques s'écrivent donc À LA MAIN, en
 * redéfinition dans le fichier du domaine concerné — et deviennent au passage
 * vérifiées par le compilateur, là où elles vivaient dans trois `hasPrefix`
 * d'`APIClient` qui comparaient des chaînes.
 */

import type { CatalogEntry } from './build-catalog.js';

export interface SwiftEndpointFile {
  readonly fileName: string;
  readonly source: string;
}

/**
 * Les mots que Swift refuse comme identifiant nu. Un nom dérivé d'un segment
 * d'URL peut tomber dessus (`/posts/for`, `/admin/import`) — les accents graves
 * les rendent utilisables sans renommer, donc sans faire diverger le nom iOS du
 * nom TypeScript.
 */
const SWIFT_KEYWORDS: ReadonlySet<string> = new Set([
  'as', 'associatedtype', 'break', 'case', 'catch', 'class', 'continue', 'default',
  'defer', 'deinit', 'do', 'else', 'enum', 'extension', 'fallthrough', 'false',
  'fileprivate', 'for', 'func', 'guard', 'if', 'import', 'in', 'init', 'inout',
  'internal', 'is', 'let', 'nil', 'open', 'operator', 'private', 'protocol',
  'public', 'repeat', 'rethrows', 'return', 'self', 'static', 'struct', 'subscript',
  'super', 'switch', 'throw', 'throws', 'true', 'try', 'typealias', 'var', 'where',
  'while',
]);

function escaped(identifier: string): string {
  return SWIFT_KEYWORDS.has(identifier) ? `\`${identifier}\`` : identifier;
}

function enumName(namespace: string): string {
  return `${namespace.charAt(0).toUpperCase()}${namespace.slice(1)}Endpoint`;
}

/** Le chemin BRUT devient une chaîne interpolée Swift : `:id` → `\(id)`, `*` → `\(wildcard)`. */
function swiftPathLiteral(rawPath: string): string {
  const body = rawPath
    .split('/')
    .map((segment) => {
      if (segment === '*') return '\\(wildcard)';
      if (segment.startsWith(':')) return `\\(${segment.slice(1)})`;
      return segment;
    })
    .join('/');
  return `"${body}"`;
}

function caseDeclaration(entry: CatalogEntry): string {
  const name = escaped(entry.key);
  if (entry.paramNames.length === 0) return `    case ${name}`;
  const params = entry.paramNames.map((param) => `${param}: String`).join(', ');
  return `    case ${name}(${params})`;
}

function caseBranch(entry: CatalogEntry): string {
  const name = escaped(entry.key);
  const literal = swiftPathLiteral(entry.rawPath);
  if (entry.paramNames.length === 0) return `        case .${name}: return ${literal}`;
  const binds = entry.paramNames.map((param) => `let ${param}`).join(', ');
  return `        case .${name}(${binds}): return ${literal}`;
}

const HEADER = [
  '// GÉNÉRÉ — ne pas éditer à la main.',
  '//',
  '// Source : services/gateway/route-manifest.json, via la MÊME dérivation que le',
  '// catalogue TypeScript (packages/shared/api/build-catalog.ts). Régénérer après',
  '// tout changement de route :',
  '//',
  '//   cd packages/shared && npm run api-endpoints:generate',
  '//',
  "// Les politiques d'authentification et de réessai ne sont PAS ici : ce sont des",
  '// décisions client, écrites à la main en redéfinition de `MeeshyEndpoint`.',
  '',
  'import Foundation',
  '',
].join('\n');

/**
 * Rend un fichier Swift par namespace, triés par nom de fichier — la sortie ne
 * dépend jamais de l'ordre des entrées, sans quoi chaque régénération
 * produirait un diff et le cliquet serait ingouvernable.
 */
export function renderSwiftEndpoints(
  entries: readonly CatalogEntry[]
): readonly SwiftEndpointFile[] {
  const byNamespace = new Map<string, CatalogEntry[]>();
  for (const entry of entries) {
    const bucket = byNamespace.get(entry.namespace) ?? [];
    bucket.push(entry);
    byNamespace.set(entry.namespace, bucket);
  }

  return [...byNamespace.entries()]
    .map(([namespace, bucket]) => {
      const sorted = [...bucket].sort((left, right) => left.key.localeCompare(right.key));
      const name = enumName(namespace);
      const source = [
        HEADER,
        `public enum ${name}: MeeshyEndpoint, Sendable {`,
        ...sorted.map(caseDeclaration),
        '',
        '    public var path: String {',
        '        switch self {',
        ...sorted.map(caseBranch),
        '        }',
        '    }',
        '}',
        '',
      ].join('\n');
      return { fileName: `${name}.swift`, source };
    })
    .sort((left, right) => left.fileName.localeCompare(right.fileName));
}
