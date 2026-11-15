import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

import { stripComments } from './response-schema-sweep';

/**
 * Le balayage MIROIR — un champ `required` d'un schéma de réponse est-il
 * réellement POSÉ par son producteur ? (#4863)
 *
 * `response-schema-sweep`, `response-payload-mismatch` et
 * `response-schema-closure-guard` répondent tous les trois à la même
 * question, dans le même sens : *« ce qui PART est-il ⊆ ce qui est
 * DÉCLARÉ ? »*. Un champ **absent** du corps envoyé satisfait cette inclusion
 * trivialement — les trois restent verts sur un schéma qui déclare un champ
 * `required` que PLUS AUCUN producteur ne pose.
 *
 * C'est exactement la forme de #4688 : `validationErrorResponseSchema`
 * déclare `success` (le format de réponse du dépôt l'exige), et
 * `schemaValidationErrorResponse` a vécu sans jamais le poser — sans qu'aucun
 * des trois cliquets existants ne rougisse, puisqu'il n'y avait rien à
 * SUPPRIMER, donc rien à signaler.
 *
 * ## Le discriminant : `required`, jamais l'ensemble des `properties`
 *
 * Toute clé optionnelle non posée est légitime (`pagination` sur une route
 * qui ne pagine pas toujours, `violations` sur une erreur qui n'en porte pas
 * toujours) — l'outil ne peut donc conclure QUE sur ce qu'AJV distingue
 * explicitement comme obligatoire. `required` dans ces schémas est déclaratif
 * (`fast-json-stringify` ne REFUSE pas un objet qui en manque, il sérialise
 * sans elle) : c'est ce qui rend le défaut silencieux, et ce qui borne cet
 * outil à ce qui se PROUVE plutôt qu'à ce qui se suppose.
 *
 * ## Ce que l'outil sait faire
 *
 * Il réutilise exactement la mécanique de `response-payload-mismatch` :
 * apparier un bloc `response:` aux `sendSuccess(reply, …)` qui le SUIVENT,
 * lire la charge d'un littéral ou d'une variable locale simple, se taire sur
 * tout jeu OUVERT (spread, reste de déstructuration, mutation). Il ajoute une
 * seule chose : au lieu de comparer le jeu ENVOYÉ au jeu DÉCLARÉ, il compare
 * le jeu `required` (sous `data: { …, required: […] }`) au jeu ENVOYÉ, et ne
 * retient QUE les noms qui sont aussi dans `properties` — un `required` sans
 * `properties` correspondante est le défaut de l'autre sens, pas du sien.
 *
 * ## Ce qu'il ne sait TOUJOURS pas — mêmes limites que `response-payload-mismatch`,
 * pour les mêmes raisons, chiffrées séparément
 *
 * - **Il ne résout que ce que le handler DÉCLARE lui-même** — littéral ou
 *   variable locale simple. Un appel de fonction, un import, un paramètre
 *   laissent la charge inconnue : silence, jamais une supposition.
 * - **Il ne lit que `sendSuccess(reply, …)`**, sous `services/gateway/src/routes`.
 *   Les schémas de `packages/shared` référencés par NOM (`response: { 200: {
 *   ...someSchema } }`, un spread) lui échappent — c'est un schéma OUVERT,
 *   donc silencieux par construction (règle déjà appliquée par le balayage
 *   frère). Une charge PAR ENVELOPPE D'ERREUR (`sendError`, statuts 4xx/5xx),
 *   qui n'a pas de `data:` et n'est jamais un `sendSuccess`, est HORS
 *   PÉRIMÈTRE de ce balayage — voir le témoin dédié ci-dessous pour le SEUL
 *   cas de cette famille que #4863 nomme explicitement.
 * - **Il ne descend que sous `data: { …, required: […] }`** — un `required`
 *   posé ailleurs qu'à ce niveau (à la racine d'un schéma sans enveloppe, ou
 *   imbriqué plus profond) ne peut pas être attribué à un `sendSuccess`
 *   textuellement : silence.
 *
 * **Mesuré sur `routes/` au moment de #4863** : 248 occurrences de
 * `required\s*:\s*\[` dans `services/gateway/src/routes/**`, dont **ZÉRO** à
 * l'intérieur d'un bloc `response:` — toutes qualifient des schémas de
 * REQUÊTE (`body`/`params`), hors du périmètre de cet outil, qui ne lit que
 * le côté RÉPONSE. `FROZEN_REQUIRED_GAPS` part donc VIDE, comme les trois
 * cliquets frères au même instant : ce n'est pas une conclusion (« la classe
 * est éteinte »), c'est le résultat mesuré du filtre — un `required` de
 * requête n'est pas un défaut de PRODUCTEUR, il est vérifié par AJV avant que
 * le handler ne s'exécute, et les schémas `required` de `packages/shared`
 * (35 occurrences, dont une majorité elles aussi côté requête) restent hors
 * de portée d'un balayage qui ne lit que `services/gateway/src/routes` — la
 * même limite que `response-payload-mismatch`, mesurée séparément ici parce
 * qu'elle porte sur un ensemble de schémas différent.
 */

export type RequiredFieldGap = {
  readonly file: string;
  readonly line: number;
  readonly field: string;
  readonly statusCode: string;
};

/** Fin (exclusive) de l'objet littéral ouvert à `openIndex`. */
function matchBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length;
}

/** Fin (exclusive) du tableau littéral ouvert à `openIndex`. */
function matchBracket(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '[') depth++;
    else if (source[i] === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length;
}

const SPREAD = '...SPREAD';

type ObjectEntry = {
  readonly key: string | null;
  readonly spread: boolean;
  readonly valueStart: number;
};

const KEYED = /^(?:([A-Za-z_$][\w$]*)|'([^']*)'|"([^"]*)"|(\d+))\s*:/;

/** Les entrées de PREMIER niveau d'un objet littéral — cf. `response-payload-mismatch.ts`. */
function topLevelEntries(source: string, openIndex: number): readonly ObjectEntry[] {
  const bodyStart = openIndex + 1;
  const body = source.slice(bodyStart, matchBrace(source, openIndex));
  const parts: { readonly text: string; readonly offset: number }[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ',' && depth === 0) {
      parts.push({ text: body.slice(start, i), offset: bodyStart + start });
      start = i + 1;
    }
  }
  parts.push({ text: body.slice(start), offset: bodyStart + start });

  return parts.flatMap(({ text, offset }): readonly ObjectEntry[] => {
    const lead = text.length - text.trimStart().length;
    const trimmed = text.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('...')) return [{ key: null, spread: true, valueStart: offset + lead }];

    const keyed = KEYED.exec(trimmed);
    if (keyed) {
      const key = keyed[1] ?? keyed[2] ?? keyed[3] ?? keyed[4];
      const afterColon = offset + lead + keyed[0].length;
      const rest = trimmed.slice(keyed[0].length);
      return [{ key, spread: false, valueStart: afterColon + (rest.length - rest.trimStart().length) }];
    }

    const short = /^([A-Za-z_$][\w$]*)$/.exec(trimmed);
    return short ? [{ key: short[1], spread: false, valueStart: offset + lead }] : [];
  });
}

function topLevelKeys(source: string, openIndex: number): readonly string[] {
  return topLevelEntries(source, openIndex).flatMap((entry) =>
    entry.spread ? [SPREAD] : entry.key ? [entry.key] : []
  );
}

/**
 * Les propriétés que le bloc `data:` d'un schéma de réponse déclare.
 *
 * Descend par ENTRÉES (comme `requiredDataKeys` ci-dessous), pas par une
 * regex à ordre fixe : `response-payload-mismatch.ts` suppose `properties`
 * immédiatement après `data: {` (ou après `type: 'object',`), ce qui rate le
 * `required` posé AVANT `properties` — l'ordre JSON Schema le plus courant
 * (`type`, `required`, `properties`). Cette copie locale n'a pas cette
 * contrainte : elle cherche l'entrée `properties` où qu'elle soit dans
 * l'objet `data`.
 */
function declaredDataKeys(code: string, responseOpen: number, responseEnd: number): readonly string[] | null {
  const block = code.slice(responseOpen, responseEnd);
  const match = /\bdata\s*:\s*\{/.exec(block);
  if (!match) return null;

  const dataOpen = responseOpen + block.indexOf('{', match.index + match[0].length - 1);
  const propsEntry = topLevelEntries(code, dataOpen).find((entry) => entry.key === 'properties');
  if (!propsEntry || code[propsEntry.valueStart] !== '{') return null;

  const keys = topLevelKeys(code, propsEntry.valueStart);
  return keys.length > 0 ? keys : null;
}

type RequiredNames = {
  readonly names: readonly string[];
  /** Position absolue du mot-clé `data:` — pour attribuer le code de statut. */
  readonly at: number;
};

/** Le tableau `required` du bloc `data:` d'un schéma de réponse, s'il existe. */
function requiredDataKeys(code: string, responseOpen: number, responseEnd: number): RequiredNames | null {
  const block = code.slice(responseOpen, responseEnd);
  const match = /\bdata\s*:\s*\{/.exec(block);
  if (!match) return null;

  const dataOpen = responseOpen + block.indexOf('{', match.index + match[0].length - 1);
  const requiredEntry = topLevelEntries(code, dataOpen).find((entry) => entry.key === 'required');
  if (!requiredEntry || code[requiredEntry.valueStart] !== '[') return null;

  const close = matchBracket(code, requiredEntry.valueStart);
  const names = [...code.slice(requiredEntry.valueStart + 1, close).matchAll(/'([^']*)'|"([^"]*)"/g)]
    .map((m) => m[1] ?? m[2])
    .filter((name): name is string => Boolean(name));

  return names.length > 0 ? { names, at: responseOpen + match.index } : null;
}

/** Le code de statut dont relève la position donnée, au sein d'un `response:` — cf. `response-schema-sweep.ts`. */
function statusCodeAt(source: string, rangeStart: number, position: number): string {
  const re = /(\d{3})\s*:\s*\{/g;
  const window = source.slice(rangeStart, position);
  let last = 'unknown';
  let m: RegExpExecArray | null;
  while ((m = re.exec(window)) !== null) {
    const open = rangeStart + m.index + m[0].length - 1;
    if (matchBrace(source, open) > position) last = m[1];
  }
  return last;
}

type SentPayload = {
  readonly keys: readonly string[];
  readonly open: boolean;
};

function escapeIdent(ident: string): string {
  return ident.replace(/\$/g, '\\$');
}

/** Ce que le handler a mis dans `ident` — cf. `response-payload-mismatch.ts`. */
function resolveLocalPayload(code: string, ident: string, from: number, to: number): SentPayload | null {
  const name = escapeIdent(ident);
  const literal = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*(?::[^=;{]*)?=\\s*`, 'g');
  const rest = new RegExp(`\\b(?:const|let|var)\\s*\\{[^{}]*\\.\\.\\.\\s*${name}\\s*\\}\\s*(?::[^=;]*)?=`, 'g');
  const region = code.slice(from, to);

  const lastOf = (pattern: RegExp): RegExpExecArray | null => {
    let last: RegExpExecArray | null = null;
    let hit: RegExpExecArray | null;
    while ((hit = pattern.exec(region)) !== null) last = hit;
    return last;
  };

  const fromLiteral = lastOf(literal);
  const fromRest = lastOf(rest);
  const winner = (fromLiteral?.index ?? -1) > (fromRest?.index ?? -1) ? fromLiteral : fromRest;
  if (!winner) return null;

  const declaredAt = from + winner.index;
  if (winner === fromRest) return { keys: [], open: true };

  const valueStart = declaredAt + winner[0].length;
  if (code[valueStart] !== '{') return null;

  const mutated = new RegExp(`\\b${name}\\s*(?:\\.[\\w$]+\\s*=[^=]|\\[[^\\]]*\\]\\s*=[^=]|=[^=>])`).test(
    code.slice(valueStart, to)
  );

  return { keys: topLevelKeys(code, valueStart), open: mutated };
}

function sentPayload(code: string, argStart: number, regionStart: number): SentPayload | null {
  if (code[argStart] === '{') return { keys: topLevelKeys(code, argStart), open: false };
  if (!carriesPayload(code, argStart)) return null;

  const ident = /^[A-Za-z_$][\w$]*(?=\s*[,)])/.exec(code.slice(argStart, argStart + 120))?.[0];
  return ident ? resolveLocalPayload(code, ident, regionStart, argStart) : null;
}

const NO_PAYLOAD = /^(?:undefined|null|void\s+0)\s*[,)]/;

function carriesPayload(code: string, argStart: number): boolean {
  return !NO_PAYLOAD.test(code.slice(argStart, argStart + 16));
}

function lineOf(code: string, index: number): number {
  return code.slice(0, index).split('\n').length;
}

/** Les champs `required` déclarés ET absents du corps envoyé, dans un fichier. */
export function scanFileForRequiredGaps(source: string, file: string): readonly RequiredFieldGap[] {
  const code = stripComments(source);
  const found: RequiredFieldGap[] = [];

  const responses = /response\s*:\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = responses.exec(code)) !== null) {
    const responseOpen = code.indexOf('{', match.index);
    const responseEnd = matchBrace(code, responseOpen);

    // Même bornage que `response-payload-mismatch` : le handler s'étend
    // jusqu'à la route SUIVANTE, pas jusqu'au prochain bloc `response:`.
    const suivants = [/response\s*:\s*\{/g, /fastify\s*\.\s*(?:get|post|put|patch|delete|options|head)\s*\(/g]
      .map((re) => {
        re.lastIndex = responseEnd;
        const m = re.exec(code);
        return m ? m.index : code.length;
      });
    const handlerEnd = Math.min(...suivants);

    const required = requiredDataKeys(code, responseOpen, responseEnd);
    if (!required) continue;

    const declared = declaredDataKeys(code, responseOpen, responseEnd);
    // Un `required` que le schéma ne DÉCLARE même pas dans `properties` est
    // le défaut de l'autre sens (`response-payload-mismatch`) : on ne se
    // prononce que sur ce qui est à la fois déclaré ET requis.
    const provable = required.names.filter((name) => declared?.includes(name));
    if (provable.length === 0) continue;

    const statusCode = statusCodeAt(code, responseOpen, required.at);

    const sends = /sendSuccess\s*\(\s*reply\s*,\s*/g;
    sends.lastIndex = responseEnd;
    const calls: number[] = [];
    let send: RegExpExecArray | null;
    while ((send = sends.exec(code)) !== null && send.index < handlerEnd) {
      calls.push(send.index + send[0].length);
    }

    for (const argStart of calls) {
      if (!carriesPayload(code, argStart)) continue;

      const sent = sentPayload(code, argStart, responseEnd);
      // Un jeu OUVERT (spread, reste de déstructuration, mutation) ou
      // IRRÉSOLU (appel, import, paramètre) peut apporter le champ requis :
      // on ne conclut jamais dessus, on se tait.
      if (!sent || sent.open) continue;

      const literal = sent.keys.filter((key) => key !== SPREAD);
      for (const field of provable) {
        if (!literal.includes(field)) {
          found.push({ file, line: lineOf(code, argStart), field, statusCode });
        }
      }
    }
  }

  return found;
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

/** Tous les champs `required` manquants du répertoire de routes. */
export function sweepRequiredFieldGaps(routesDir: string): readonly RequiredFieldGap[] {
  return walk(routesDir).flatMap((full) =>
    scanFileForRequiredGaps(readFileSync(full, 'utf8'), relative(routesDir, full))
  );
}
