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
 * ─── CE QUE CE BALAYAGE NE VOIT PAS, MESURÉ ──────────────────────────────────
 *
 * Il ne relève qu'une égalité écrite **EN LIGNE, sous une clé littérale
 * `where:`**. « Inventaire VIDE » ne veut donc jamais dire « aucune égalité
 * nue » — c'est la leçon 261 appliquée à cet instrument, et les quatre formes
 * qui lui échappent sont des FIXTURES de ses cliquets, pas une phrase :
 *
 *   const LIVING = { deactivatedAt: null };  where: { id, ...LIVING }   // non vu
 *   const living = { … };  where: { user: { is: living } }              // non vu
 *   export const livingWhere = () => ({ deactivatedAt: null });         // non vu
 *   where: flag ? { deactivatedAt: null } : { id }                      // non vu
 *
 * La deuxième n'est pas théorique : `services/community-online-count.ts` l'écrit,
 * et c'est l'un des sites de `USABLE_ACCOUNT_WHERE` (#19799). Il ne lit pas non
 * plus `packages/shared` ni `scripts/`, et un nom de champ QUOTÉ
 * (`{ 'u.deletedAt': null }`, une agrégation brute) lui échappe — ce dernier à
 * bon droit : MongoDB brut apparie la clé manquante, la sémantique y est
 * l'INVERSE de celle que Prisma traduit.
 *
 * **SŒURS d'un même `OR`, et pas « quelque part dans le bloc ».** La forme JUSTE
 * est une ALTERNATIVE : `OR: [{ champ: null }, { champ: { isSet: false } }]`.
 * La première version de ce balayage cherchait `isSet: false` n'importe où dans
 * le `where` englobant — elle BÉNISSAIT donc
 * `AND: [{ champ: null }, { champ: { isSet: false } }]`, une conjonction
 * impossible qui n'apparie AUCUN document : le défaut #19690 en pire, certifié
 * correct par le cliquet censé l'interdire (audit adversarial du cycle 180,
 * constat F).
 *
 * La seconde version exigeait la bonne `OR` et l'éprouvait par un `RegExp` sur le
 * TEXTE ENTIER du tableau : elle bénissait donc la même conjonction IMBRIQUÉE
 * dans une branche, et une absence seulement CITÉE dans un littéral de chaîne
 * (audit du cycle 181, constat C3 — le constat F rejoué un cran plus bas). La
 * branche est maintenant exigée CANONIQUE, à la profondeur 0 du tableau, et les
 * littéraux de chaîne sont dépouillés comme les commentaires. Et la phrase « se compose par `AND` quand le `where` porte déjà un
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

/**
 * Dépouille les commentaires **sans déplacer une seule ligne**.
 *
 * Un bloc `/* … *\/` remplacé par la chaîne vide emporte ses retours à la ligne,
 * et tout ce qui suit remonte d'autant : le site `addable-user.ts:19` était
 * NOMMÉ `:8` par ce balayage (#19799), parce que le doc-comment au-dessus de lui
 * compte onze lignes. Un cliquet dont la valeur est de NOMMER fichier, ligne,
 * colonne et graphie n'a pas le droit de se tromper sur le champ le plus
 * actionnable des quatre — il envoie lire le mauvais endroit, et quelqu'un y
 * conclura que le cliquet s'est trompé de site.
 *
 * Le bloc est donc remplacé par ses PROPRES retours à la ligne ; un `//` garde
 * déjà le sien, le motif ne consommant pas la fin de ligne.
 */
const blankKeepingLines = (texte: string): string => texte.replace(/[^\n]/g, ' ');

const withoutComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, ''))
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    // Le CONTENU d'un littéral de chaîne n'est pas du code : un libellé, un
    // message de journal ou une fixture qui CITE `champ: { isSet: false }`
    // bénissait un filtre nu posé à côté (audit du cycle 181, constat C3). Même
    // raison que les commentaires, et les retours à la ligne restent en place
    // pour que la ligne rapportée soit celle du FICHIER.
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, (chaine) =>
      `${chaine[0]}${blankKeepingLines(chaine.slice(1, -1))}${chaine[chaine.length - 1]}`);

/** Les clés d'objet sous lesquelles un `{ champ: null }` est une ÉCRITURE, jamais un filtre. */
const PAYLOAD_KEYS = new Set(['data', 'create', 'update', 'set']);

type Frame = { readonly kind: '{' | '['; readonly key: string; readonly start: number };

const keyBefore = (source: string, index: number): string =>
  source.slice(Math.max(0, index - 80), index).match(/([\w$]+)\s*:\s*$/)?.[1] ?? '';

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

/**
 * Les branches de PREMIER NIVEAU d'un tableau `OR`, découpées à la profondeur 0.
 * Une sous-structure d'une autre branche n'en est pas une.
 */
const topLevelBranches = (interieur: string): readonly string[] => {
  const branches: string[] = [];
  let depth = 0;
  let debut = 0;
  for (let i = 0; i < interieur.length; i += 1) {
    const char = interieur[i];
    if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') depth -= 1;
    else if (char === ',' && depth === 0) {
      branches.push(interieur.slice(debut, i));
      debut = i + 1;
    }
  }
  branches.push(interieur.slice(debut));
  return branches.map((branche) => branche.trim()).filter((branche) => branche.length > 0);
};

/**
 * La branche qui DIT l'absence, et rien d'autre : `{ champ: { isSet: false } }`.
 *
 * La forme est exigée CANONIQUE, et c'est le constat C3 de l'audit du cycle 181.
 * La version d'avant testait un `RegExp` sur le TEXTE ENTIER du tableau `OR` :
 * elle bénissait donc
 * `OR: [{ c: null }, { AND: [{ c: { isSet: false } }, { c: { not: null } }] }]`,
 * dont la seconde branche est IMPOSSIBLE — le `OR` vaut `c: null`, soit le défaut
 * exact que ce cliquet garde, certifié correct par lui. C'est le constat F du
 * cycle 180 rejoué un cran plus bas : il ne suffit pas d'exiger la MÊME `OR`, il
 * faut exiger la branche ELLE-MÊME.
 */
const isAbsenceBranch = (branche: string, field: string): boolean =>
  new RegExp(`^\\{\\s*${field}\\s*:\\s*\\{\\s*isSet\\s*:\\s*false\\s*\\}\\s*,?\\s*\\}$`).test(branche);

/** Les `{ champ: null }` et `{ champ: { equals: null } }` POSÉS EN FILTRE dans un fichier. */
export function equalityNullFiltersIn(file: string, source: string, fields: ReadonlySet<string>): EqualityNullSite[] {
  const text = withoutComments(source);
  const stack: Frame[] = [];
  const sites: EqualityNullSite[] = [];

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '{' || char === '[') {
      stack.push({ kind: char, key: keyBefore(text, i), start: i });
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
      ? topLevelBranches(text.slice(parent.start + 1, blockEndOf(text, parent.start, '[', ']')))
      : null;

    sites.push({
      file,
      line: text.slice(0, i).split('\n').length,
      field: filtered.field,
      spelling: filtered.spelling,
      absenceSaidInSameOr: orBranches !== null && orBranches.some((branche) => isAbsenceBranch(branche, filtered.field)),
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
