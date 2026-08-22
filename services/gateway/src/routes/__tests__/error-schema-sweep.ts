import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

import { stripComments } from './response-schema-sweep';

/**
 * Le balayage des schémas de réponse d'ERREUR.
 *
 * Le balayage frère (`response-schema-sweep`) garde contre une déclaration
 * ABSENTE — un `{ type: 'object' }` nu. Le cycle 91 a montré sa limite en
 * ouvrant un schéma qui portait bien des `properties` et TRONQUAIT quand même,
 * parce qu'elles avaient été écrites contre l'autre producteur, et a conclu
 * qu'un outil comparant les clés DÉCLARÉES aux clés CONSTRUITES serait
 * « différent, et beaucoup plus ambitieux ».
 *
 * Il l'est pour une charge utile de succès, dont le producteur change à chaque
 * route. Il ne l'est pas pour une ERREUR : `utils/response.ts:sendError` est le
 * producteur UNIQUE de toutes les erreurs de la passerelle, et il pose toujours
 * les mêmes clés :
 *
 *   { ...details, success: false, error, message, code, violations? }
 *
 * Le superset est donc CONNU, fixe, et vérifiable par lecture du schéma seul.
 * Une clé de l'enveloppe qu'un schéma d'erreur ne déclare pas est une clé que
 * fast-json-stringify supprime de la réponse SERVIE.
 *
 * `details` n'est pas une clé mais un ÉTALEMENT (cycle 89) : ses clés sont
 * propres à la route, donc hors enveloppe. Un schéma qui en déclare — le
 * `retryAfter` d'un 429, par exemple — les garde en plus du superset ; c'est la
 * règle du SUPERSET du cycle 91, et le balayage les rapporte comme `extras`
 * pour qu'une réparation ne les perde pas.
 */

/**
 * Les clés que `sendError` pose sur TOUTE erreur, et le type qu'il leur donne.
 *
 * Le type compte autant que la présence. `calls.ts` déclarait `error` en OBJET
 * `{ code, message, details }` sur ses dix-neuf schémas, quand `sendError` en
 * pose une CHAÎNE — le code d'erreur lui-même (`NOT_A_PARTICIPANT`). Mesuré au
 * sérialiseur, la réponse servie était :
 *
 *   { "success": false, "error": {} }
 *
 * Une clé déclarée du mauvais type n'est pas supprimée, elle est COERCÉE — et
 * une chaîne coercée en objet ne garde rien. C'est la troisième forme de la
 * famille, après la clé absente (cycle 89) et la clé écrite contre l'autre
 * producteur (cycle 91), et la seule qui se cache derrière une déclaration
 * d'apparence complète.
 */
export const ENVELOPE_TYPES: Readonly<Record<string, string>> = {
  success: 'boolean',
  error: 'string',
  message: 'string',
  code: 'string',
};

/** Les clés que `sendError` pose sur TOUTE erreur. */
export const ENVELOPE_KEYS: readonly string[] = Object.keys(ENVELOPE_TYPES);

export type ErrorSchemaSite = {
  readonly file: string;
  readonly statusCode: string;
  /** Les clés d'enveloppe que le schéma ne déclare pas — donc supprimées. */
  readonly missing: readonly string[];
  /** Les clés d'enveloppe déclarées d'un type que le producteur ne pose pas. */
  readonly mistyped: readonly string[];
  /** Les clés hors enveloppe déclarées par la route, à préserver. */
  readonly extras: readonly string[];
};

/** Index juste après le littéral de chaîne ouvert en `i`. */
function skipString(source: string, i: number): number {
  const quote = source[i];
  let j = i + 1;
  while (j < source.length) {
    if (source[j] === '\\') {
      j += 2;
      continue;
    }
    if (source[j] === quote) return j + 1;
    j++;
  }
  return source.length;
}

/**
 * Fin (inclusive) de l'objet littéral ouvert à `openIndex`.
 *
 * Conscient des chaînes : une `description` d'OpenAPI porte volontiers une
 * accolade, et un compteur naïf la prendrait pour de la structure.
 */
function matchBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    const c = source[i];
    if (c === '"' || c === "'" || c === '`') {
      i = skipString(source, i) - 1;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length;
}

/**
 * Les clés de premier niveau d'un objet littéral `properties: { … }`, avec le
 * `type` que chacune déclare (`''` si elle n'en déclare pas).
 */
function declaredProperties(schema: string): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  const m = /\bproperties\s*:\s*\{/.exec(schema);
  if (!m) return found;
  const open = schema.indexOf('{', m.index + m[0].length - 1);
  const close = matchBrace(schema, open);
  const body = schema.slice(open + 1, close);

  const keys: string[] = [];
  let depth = 0;
  let keyStart = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '"' || c === "'" || c === '`') {
      i = skipString(body, i) - 1;
      continue;
    }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (c === ',' && depth === 0) keyStart = i + 1;
    else if (c === ':' && depth === 0) {
      const key = body.slice(keyStart, i).trim().replace(/^['"]|['"]$/g, '');
      const isKey = /^[A-Za-z_$][\w$]*$/.test(key);
      if (isKey) keys.push(key);
      keyStart = i + 1;
      // Sauter la valeur, pour ne pas prendre un `:` imbriqué à plat.
      const rest = body.slice(i + 1);
      const openObj = /^\s*\{/.exec(rest);
      if (openObj) {
        const o = i + 1 + openObj[0].length - 1;
        const end = matchBrace(body, o);
        if (isKey) {
          // Le `type` de PREMIER niveau de la valeur — pas celui d'un
          // `items` ou d'une propriété imbriquée.
          const value = body.slice(o, end + 1);
          found.set(key, /^\{[^{]*?\btype\s*:\s*'([a-z]+)'/.exec(value)?.[1] ?? '');
        }
        i = end;
        keyStart = i + 1;
      } else if (isKey) {
        found.set(key, '');
      }
    }
  }
  return found;
}

/**
 * Les schémas d'erreur d'un fichier qui TRONQUENT l'enveloppe.
 *
 * Un schéma qui étale une constante partagée (`...errorResponseSchema`) est
 * réputé complet — c'est la constante elle-même qui est gardée, par un témoin
 * séparé qui la mesure au sérialiseur. Un `additionalProperties: true` laisse
 * tout passer et ne tronque donc rien.
 */
export function scanErrorSchemas(source: string, file: string): ReadonlyArray<ErrorSchemaSite> {
  const code = stripComments(source);
  const sites: ErrorSchemaSite[] = [];

  const responseRe = /\bresponse\s*:\s*\{/g;
  let rm: RegExpExecArray | null;
  while ((rm = responseRe.exec(code)) !== null) {
    const responseOpen = code.indexOf('{', rm.index);
    const responseClose = matchBrace(code, responseOpen);
    const responseBody = code.slice(responseOpen, responseClose);

    const statusRe = /(\d{3})\s*:\s*\{/g;
    let sm: RegExpExecArray | null;
    while ((sm = statusRe.exec(responseBody)) !== null) {
      const status = Number(sm[1]);
      if (status < 400) continue;

      const open = responseOpen + sm.index + sm[0].length - 1;
      const schema = code.slice(open, matchBrace(code, open) + 1);

      if (/\.\.\.\s*\w+/.test(schema)) continue;
      if (/additionalProperties\s*:\s*true/.test(schema)) continue;
      if (!/type\s*:\s*'object'/.test(schema)) continue;

      const declared = declaredProperties(schema);
      const missing = ENVELOPE_KEYS.filter((k) => !declared.has(k));
      const mistyped = ENVELOPE_KEYS.filter((k) => {
        const type = declared.get(k);
        return type !== undefined && type !== '' && type !== ENVELOPE_TYPES[k];
      });
      if (missing.length === 0 && mistyped.length === 0) continue;

      sites.push({
        file,
        statusCode: sm[1],
        missing,
        mistyped,
        extras: [...declared.keys()].filter((k) => !ENVELOPE_KEYS.includes(k)),
      });
    }
  }

  return sites;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') walk(full, acc);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

/** Tous les schémas d'erreur tronquants du répertoire de routes. */
export function sweepErrorSchemas(routesDir: string): ReadonlyArray<ErrorSchemaSite> {
  return walk(routesDir).flatMap((full) =>
    scanErrorSchemas(readFileSync(full, 'utf8'), relative(routesDir, full))
  );
}
