import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Le balayage `{ type: 'object' }` des schémas de RÉPONSE, outillé.
 *
 * Le cycle 86 a construit ce balayage et l'a laissé dans son journal ; le
 * cycle 87 l'installe dans le dépôt, parce qu'une règle mémorisée se
 * redécouvre à chaque cycle et une règle outillée tombe toute seule.
 *
 * Trois discriminations qu'un `grep` ne sait pas faire :
 *
 * 1. **Le bloc a-t-il `properties` / `additionalProperties` /
 *    `patternProperties` ?** Il faut résoudre l'objet littéral englobant en
 *    comptant les accolades. Sans l'une des trois, fast-json-stringify supprime
 *    toute clé.
 * 2. **Est-il sous `response:` ?** Un `{ type: 'object' }` sous `body` /
 *    `querystring` / `params` est permissif et non destructeur : AJV valide, il
 *    ne sérialise pas.
 * 3. **Le texte est-il du CODE ?** Un balayage qui ne dépouille pas les
 *    commentaires retrouve les commentaires des cycles précédents — qui
 *    EXPLIQUENT le défaut — au lieu des défauts.
 */

export type SchemaSite = {
  readonly file: string;
  readonly line: number;
  readonly field: string;
  readonly statusCode: string;
};

/** Remplace le contenu des commentaires par des espaces, en gardant les
 * positions de ligne intactes — le balayage rapporte des numéros de ligne. */
export function stripComments(source: string): string {
  const out = source.split('');
  let inLine = false;
  let inBlock = false;
  let inString: string | null = null;

  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];

    if (inLine) {
      if (c === '\n') inLine = false;
      else out[i] = ' ';
      continue;
    }
    if (inBlock) {
      if (c === '*' && next === '/') {
        out[i] = ' ';
        out[i + 1] = ' ';
        i++;
        inBlock = false;
      } else if (c !== '\n') {
        out[i] = ' ';
      }
      continue;
    }
    if (inString) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === inString) inString = null;
      continue;
    }
    if (c === '/' && next === '/') {
      out[i] = ' ';
      out[i + 1] = ' ';
      i++;
      inLine = true;
      continue;
    }
    if (c === '/' && next === '*') {
      out[i] = ' ';
      out[i + 1] = ' ';
      i++;
      inBlock = true;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') inString = c;
  }

  return out.join('');
}

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

/** Les intervalles couverts par une clé `response:`. */
function responseRanges(source: string): ReadonlyArray<readonly [number, number]> {
  const ranges: Array<readonly [number, number]> = [];
  const re = /\bresponse\s*:\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const open = source.indexOf('{', m.index);
    ranges.push([open, matchBrace(source, open)] as const);
  }
  return ranges;
}

/** Le code de statut dont relève la position donnée, au sein d'un `response:`. */
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

const DECLARED = /\b(properties|additionalProperties|patternProperties)\s*:/;

/** Les sites `{ type: 'object' }` NU d'un fichier, sous `response:` seulement. */
export function scanFile(source: string, file: string): ReadonlyArray<SchemaSite> {
  const code = stripComments(source);
  const ranges = responseRanges(code);
  if (ranges.length === 0) return [];

  const sites: SchemaSite[] = [];
  const re = /type\s*:\s*'object'/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(code)) !== null) {
    const range = ranges.find(([s, e]) => m!.index > s && m!.index < e);
    if (!range) continue;

    const open = code.lastIndexOf('{', m.index);
    if (open === -1) continue;
    const close = matchBrace(code, open);
    const body = code.slice(open, close);
    if (DECLARED.test(body)) continue;

    const before = code.slice(0, open);
    const field = /([A-Za-z_$][\w$]*)\s*:\s*$/.exec(before.trimEnd())?.[1]
      ?? /([A-Za-z_$][\w$]*)\s*:\s*\{\s*type:\s*'array',\s*items:\s*$/.exec(before)?.[1]
      ?? 'items';

    sites.push({
      file,
      line: code.slice(0, m.index).split('\n').length,
      field,
      statusCode: statusCodeAt(code, range[0], m.index),
    });
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

/** Tous les sites nus du répertoire de routes, chemins relatifs à `routesDir`. */
export function sweepRoutes(routesDir: string): ReadonlyArray<SchemaSite> {
  return walk(routesDir).flatMap((full) =>
    scanFile(readFileSync(full, 'utf8'), relative(routesDir, full))
  );
}
