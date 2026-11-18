/**
 * Le balayage jumeau de `negated-filter-on-absent-field-guard` (#8309), pris par
 * l'autre bout : celui-là garde la NÉGATION (`NOT`, qui écarte le document sans
 * la clé), celui-ci garde l'ÉGALITÉ (`{ champ: null }`, qui ne RETIENT pas le
 * document sans la clé).
 *
 * Les deux moitiés viennent de la même sémantique MongoDB et la seconde est
 * celle que ce dépôt a payée quatre fois en production (`utils/prisma-unset.ts`
 * les énumère) — plus une cinquième au cycle 180 : la séance « Ensemble » inerte
 * pour la population entière (#19690).
 *
 * ─── CE QUE CE BALAYAGE DISTINGUE, ET POURQUOI IL LE FAUT ────────────────────
 *
 * `{ champ: null }` dans un `data` est une ÉCRITURE légitime — c'est même la
 * moitié « discipline d'écriture » du remède. Seule la même forme dans un
 * `where` est une LECTURE qui rate la moitié de la population. Un `grep` ne peut
 * pas les séparer : il faut connaître la clé englobante, donc tenir une pile des
 * clés d'objet. `select`, `include` et `_count` portent eux aussi des `where`
 * imbriqués, et ceux-là comptent.
 *
 * Il ne relève PAS un site dont le `where` englobant exprime l'absence à côté
 * (`{ champ: { isSet: false } }`, ce que rendent `unsetOrNull` et
 * `PARTICIPATION_VIVANTE`) : c'est la forme JUSTE, quelle que soit la façon de
 * l'obtenir — spread, `AND`, ou littéral écrit à la main.
 */
import { readFileSync } from 'fs';
import { relative } from 'path';
import { walk } from './file-size-sweep';

export type EqualityNullSite = {
  readonly file: string;
  readonly line: number;
  readonly field: string;
  /** `true` quand le `where` englobant dit l'absence à côté — la forme juste. */
  readonly absenceSaidToo: boolean;
};

const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Les clés d'objet sous lesquelles un `{ champ: null }` est une ÉCRITURE, jamais un filtre. */
const PAYLOAD_KEYS = new Set(['data', 'create', 'update', 'set']);

const enclosingKeyOf = (source: string, braceIndex: number): string => {
  const before = source.slice(Math.max(0, braceIndex - 80), braceIndex);
  return before.match(/([\w$]+)\s*:\s*$/)?.[1] ?? '';
};

const blockEndOf = (source: string, start: number): number => {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return source.length;
};

/** Les `{ champ: null }` POSÉS EN FILTRE dans un fichier, pour les champs demandés. */
export function equalityNullFiltersIn(file: string, source: string, fields: ReadonlySet<string>): EqualityNullSite[] {
  const text = withoutComments(source);
  const stack: Array<{ readonly key: string; readonly start: number }> = [];
  const sites: EqualityNullSite[] = [];

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '{') {
      stack.push({ key: enclosingKeyOf(text, i), start: i });
      continue;
    }
    if (char === '}') {
      stack.pop();
      continue;
    }
    if (char !== ':' || !/^\s*null\b/.test(text.slice(i + 1))) continue;

    const field = text.slice(Math.max(0, i - 60), i).match(/([\w$]+)\s*$/)?.[1];
    if (!field || !fields.has(field)) continue;

    let filter: { readonly key: string; readonly start: number } | null = null;
    for (let depth = stack.length - 1; depth >= 0; depth -= 1) {
      const frame = stack[depth];
      if (frame.key === 'where') {
        filter = frame;
        break;
      }
      if (PAYLOAD_KEYS.has(frame.key)) break;
    }
    if (!filter) continue;

    const block = text.slice(filter.start, blockEndOf(text, filter.start) + 1);
    sites.push({
      file,
      line: text.slice(0, i).split('\n').length,
      field,
      absenceSaidToo: new RegExp(`${field}\\s*:\\s*\\{\\s*isSet\\s*:\\s*false`).test(block),
    });
  }
  return sites;
}

/** Le même balayage sur toutes les sources de PRODUCTION d'une racine. */
export function sweepEqualityNullFilters(root: string, fields: ReadonlySet<string>): EqualityNullSite[] {
  return walk(root)
    .filter((file) => file.endsWith('.ts') && !file.includes('__tests__') && !file.endsWith('.test.ts'))
    .flatMap((file) => equalityNullFiltersIn(relative(root, file), readFileSync(file, 'utf8'), fields));
}
