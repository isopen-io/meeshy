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
 * **Écriture ou filtre.** `{ champ: null }` dans un `data` est une ÉCRITURE
 * légitime — c'est même la moitié « discipline d'écriture » du remède. Seule la
 * même forme dans un `where` est une LECTURE qui rate la moitié de la
 * population. Un `grep` ne peut pas les séparer : il faut connaître la clé
 * englobante, donc tenir une pile des cadres `{` ET `[`. `select`, `include` et
 * `_count` portent eux aussi des `where` imbriqués, et ceux-là comptent.
 *
 * **Deux graphies de la même égalité.** `{ champ: null }` et
 * `{ champ: { equals: null } }` sont le même filtre ; la seconde est vivante
 * dans ce dépôt (`PostFeedService`, `ServerKeyVault`) et un balayage qui ne
 * cherche que la première mesure une graphie, pas une propriété (règle du
 * cycle 105).
 *
 * **Un `where` NOMMÉ est un `where`.** Le discriminant d'origine exigeait un
 * cadre objet portant la clé littérale `where` — il ne voyait donc AUCUN
 * fragment construit ailleurs puis répandu, et c'était écrit comme une limite
 * assumée. Elle a coûté un site vivant : `visibleNotificationsWhere`, le
 * prédicat partagé des SEPT lectures de notifications, rend un
 * `Prisma.NotificationWhereInput` dont l'`OR` ne dit pas l'absence. Une
 * ANNOTATION `Prisma.<Modèle>WhereInput` — type de retour d'une fonction, ou
 * type d'une constante — déclare un `where` aussi sûrement que la clé, et
 * ouvre donc un cadre de lecture.
 *
 * **SŒURS d'un même `OR`, et pas « quelque part dans le bloc ».** La forme JUSTE
 * est une ALTERNATIVE : `OR: [{ champ: null }, { champ: { isSet: false } }]`.
 * La première version de ce balayage cherchait `isSet: false` n'importe où dans
 * le `where` englobant — elle BÉNISSAIT donc
 * `AND: [{ champ: null }, { champ: { isSet: false } }]`, une conjonction
 * impossible qui n'apparie AUCUN document : le défaut #19690 en pire, certifié
 * correct par le cliquet censé l'interdire (audit adversarial du cycle 180,
 * constat F). Et la phrase « se compose par `AND` quand le `where` porte déjà un
 * `OR` » — vraie des PRÉDICATS COMPLETS — invite précisément cette faute quand
 * on l'applique aux deux BRANCHES. L'absence n'est donc dite « à côté » que si
 * elle l'est dans le MÊME tableau `OR`.
 */
import { readFileSync } from 'fs';
import { relative } from 'path';
import { walk } from './file-size-sweep';

export type EqualityNullSite = {
  readonly file: string;
  readonly line: number;
  readonly field: string;
  /** La graphie rencontrée — les deux disent la même égalité. */
  readonly spelling: 'null' | 'equals';
  /** `true` seulement si l'absence est dite dans le MÊME tableau `OR` — la forme juste. */
  readonly absenceSaidInSameOr: boolean;
};

export type EqualityNullSweep = {
  /** Les fichiers de production effectivement LUS — la non-vacuité de l'instrument. */
  readonly filesScanned: number;
  readonly sites: readonly EqualityNullSite[];
};

const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Les clés d'objet sous lesquelles un `{ champ: null }` est une ÉCRITURE, jamais un filtre. */
const PAYLOAD_KEYS = new Set(['data', 'create', 'update', 'set']);

type Frame = { readonly kind: '{' | '['; readonly key: string; readonly start: number };

const keyBefore = (source: string, index: number): string =>
  source.slice(Math.max(0, index - 80), index).match(/([\w$]+)\s*:\s*$/)?.[1] ?? '';

/**
 * Le cadre ouvre-t-il un `where` NOMMÉ ? Une annotation
 * `Prisma.<Modèle>WhereInput` qui précède immédiatement l'accolade — type de
 * retour (`): Prisma.XWhereInput {` puis `return {`) ou type de constante
 * (`const x: Prisma.XWhereInput = {`) — le déclare. La fenêtre est volontairement
 * courte : ce qui est annoté plus haut dans la fonction ne gouverne pas ce
 * littéral-ci.
 */
const WHERE_INPUT_ANNOTATION = /Prisma\.\w*WhereInput(?:\s*\[\s*\])?\s*(?:\{|=\s*$|>\s*$|\)[^)]*\{\s*(?:\/\/[^\n]*)?\s*(?:return\s*)?$|\s*\{?\s*(?:\/\/[^\n]*\n)?\s*return\s*$)/;

const opensNamedWhere = (source: string, index: number): boolean =>
  WHERE_INPUT_ANNOTATION.test(source.slice(Math.max(0, index - 400), index));

const blockEndOf = (source: string, start: number, open: '{' | '[', close: '}' | ']'): number => {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === open) depth += 1;
    else if (source[i] === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return source.length;
};

/**
 * Le champ que ce `: null` filtre. `{ champ: null }` le porte juste avant ; la
 * graphie `{ champ: { equals: null } }` le porte sur l'objet ENGLOBANT.
 */
const filteredField = (source: string, colonIndex: number, stack: readonly Frame[]): { field: string; spelling: 'null' | 'equals' } | null => {
  const written = source.slice(Math.max(0, colonIndex - 60), colonIndex).match(/([\w$]+)\s*$/)?.[1];
  if (!written) return null;
  if (written !== 'equals' && written !== 'is') return { field: written, spelling: 'null' };
  const holder = stack[stack.length - 1];
  return holder && holder.kind === '{' && holder.key ? { field: holder.key, spelling: 'equals' } : null;
};

/** Les `{ champ: null }` et `{ champ: { equals: null } }` POSÉS EN FILTRE dans un fichier. */
export function equalityNullFiltersIn(file: string, source: string, fields: ReadonlySet<string>): EqualityNullSite[] {
  const text = withoutComments(source);
  const stack: Frame[] = [];
  const sites: EqualityNullSite[] = [];

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '{' || char === '[') {
      const key = keyBefore(text, i);
      stack.push({ kind: char, key: key === '' && char === '{' && opensNamedWhere(text, i) ? 'where' : key, start: i });
      continue;
    }
    if (char === '}' || char === ']') {
      stack.pop();
      continue;
    }
    if (char !== ':' || !/^\s*null\b/.test(text.slice(i + 1))) continue;

    const filtered = filteredField(text, i, stack);
    if (!filtered || !fields.has(filtered.field)) continue;

    // Le cadre qui porte la clé littérale `where`, sans traverser une charge
    // d'écriture : sinon `update({ where, data: { champ: null } })` serait un filtre.
    let underWhere = false;
    for (let depth = stack.length - 1; depth >= 0; depth -= 1) {
      if (stack[depth].kind === '{' && stack[depth].key === 'where') {
        underWhere = true;
        break;
      }
      if (PAYLOAD_KEYS.has(stack[depth].key)) break;
    }
    if (!underWhere) continue;

    // L'absence n'est dite « à côté » que dans le MÊME tableau `OR` : le cadre
    // objet qui porte l'occurrence doit être une BRANCHE de ce tableau.
    const holderIndex = filtered.spelling === 'equals' ? stack.length - 2 : stack.length - 1;
    const parent = holderIndex > 0 ? stack[holderIndex - 1] : undefined;
    const orBranches = parent && parent.kind === '[' && parent.key === 'OR'
      ? text.slice(parent.start, blockEndOf(text, parent.start, '[', ']') + 1)
      : null;

    sites.push({
      file,
      line: text.slice(0, i).split('\n').length,
      field: filtered.field,
      spelling: filtered.spelling,
      absenceSaidInSameOr: orBranches !== null
        && new RegExp(`${filtered.field}\\s*:\\s*\\{\\s*isSet\\s*:\\s*false`).test(orBranches),
    });
  }
  return sites;
}

/** Le même balayage sur toutes les sources de PRODUCTION d'une racine. */
export function sweepEqualityNullFilters(root: string, fields: ReadonlySet<string>): EqualityNullSweep {
  const files = walk(root).filter((file) => file.endsWith('.ts') && !file.includes('__tests__') && !file.endsWith('.test.ts'));
  return {
    filesScanned: files.length,
    sites: files.flatMap((file) => equalityNullFiltersIn(relative(root, file), readFileSync(file, 'utf8'), fields)),
  };
}
