/**
 * Le balayage jumeau de `negated-filter-on-absent-field-guard` (#8309), pris par
 * l'autre bout : celui-là garde la NÉGATION (`NOT`, qui écarte le document sans
 * la clé), celui-ci garde l'ÉGALITÉ (`{ champ: null }`, qui ne RETIENT pas le
 * document sans la clé).
 *
 * Les deux moitiés viennent de la même sémantique MongoDB et la seconde est
 * celle que ce dépôt a payée quatre fois en production (`utils/prisma-unset.ts`
 * les énumère) — plus une cinquième au cycle 180 (la séance « Ensemble » inerte
 * pour la population entière, #19690) et une sixième au cycle 181 (le coffre de
 * clés chargeant ZÉRO clé de conversation à chaque démarrage, #19755).
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
 * dans ce dépôt (`PostFeedService`) et un balayage qui ne cherche que la
 * première mesure une graphie, pas une propriété (règle du cycle 105).
 *
 * **TROIS façons d'être un `where`, et aucune n'est le mot `where`.** Le
 * discriminant d'origine exigeait un cadre objet portant la clé littérale
 * `where`. Il ne voyait donc aucun fragment construit ailleurs puis répandu, et
 * c'était écrit comme une limite assumée — qui a coûté un site vivant
 * (`visibleNotificationsWhere`, le prédicat partagé des SEPT lectures de
 * notifications). Un cadre est désormais un `where` quand :
 *
 *   1. il porte la clé littérale `where` ;
 *   2. il est ANNOTÉ `Prisma.<Modèle>WhereInput` (type de retour, type de
 *      constante, ou `satisfies`) ;
 *   3. il est la valeur d'une constante RÉPANDUE dans un `where` du même
 *      fichier — ce qui ne demande aucune annotation.
 *
 * La troisième est la seule qui tienne sous un nettoyage. L'audit adversarial du
 * cycle 181 l'a mesuré de bout en bout : avec la seule règle 2, **retirer
 * l'annotation d'un fragment extrait réinstalle le défaut #19755 sans qu'aucun
 * gate ne rougisse** (`tsc --noEmit` EXIT=0, cliquet VERT), au prix d'une ligne
 * qu'un lot de nettoyage propose spontanément. Une règle qui dépend d'une
 * annotation redondante garde ce que personne n'a encore simplifié.
 *
 * **Un fragment PARTAGÉ se résout sur le CORPUS, pas sur son fichier.** Le
 * balayage d'un fichier ne peut pas savoir qu'un `where` défini chez lui est
 * répandu dans un `where` trois répertoires plus loin. `sweepEqualityNullFilters`
 * relève donc d'abord les identifiants répandus sous un `where` dans TOUT le
 * corpus, puis rejoue chaque fichier avec cet ensemble.
 *
 * Le prix assumé est une COLLISION DE NOMS : une constante nommée comme un
 * fragment de `where` d'un autre fichier, et utilisée ici en charge d'écriture,
 * serait relevée à tort. C'est la direction sûre pour un cliquet — un faux
 * positif fait regarder, un faux négatif absout — et l'inventaire des sites nus
 * étant VIDE, aucune collision n'est vivante aujourd'hui.
 *
 * **Ce qui reste hors de portée est PUBLIÉ** (`unresolvedFragments`) : un
 * identifiant répandu sous un `where` qu'AUCUN fichier de production ne déclare
 * — il vient d'un paquet, ou d'une forme de déclaration que le balayage ne lit
 * pas. Une limite publiée mais non mesurée protège le site qu'elle cache (leçon
 * du cycle 181) ; publiée AVEC sa liste, elle devient un inventaire.
 *
 * **SŒURS d'un même `OR`, et c'est une propriété de STRUCTURE.** La forme JUSTE
 * est une ALTERNATIVE : `OR: [{ champ: null }, { champ: { isSet: false } }]`.
 * Deux versions de ce balayage s'y sont trompées, et toujours de la même façon —
 * en cherchant un TEXTE :
 *
 *   - la première cherchait `isSet: false` n'importe où dans le `where`
 *     englobant : elle BÉNISSAIT `AND: [{ champ: null }, { champ: { isSet: false } }]`,
 *     une conjonction IMPOSSIBLE qui n'apparie AUCUN document (cycle 180,
 *     constat F) ;
 *   - la seconde a remonté le test au seul tableau `OR`, sans changer sa
 *     nature : elle bénissait encore
 *     `OR: [{ champ: null }, { NOT: { champ: { isSet: false } } }]` — dont la
 *     seconde branche dit « la clé EST posée », donc l'union exclut exactement
 *     les documents absents, soit #19690 réinstallé et certifié correct
 *     (cycle 181, constat A).
 *
 * L'absence n'est donc dite « à côté » que si une BRANCHE de premier niveau du
 * même tableau `OR` est EXACTEMENT le prédicat d'absence — ce que `unsetOrNull`
 * produit. Toute enveloppe (`NOT`, `AND`, un second prédicat dans la même
 * branche) change le sens et n'est pas reconnue. **Un cliquet qui cherche la
 * forme JUSTE par ses mots finit par bénir sa négation ; il faut chercher sa
 * structure.**
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
  /** `true` seulement si une BRANCHE du même `OR` est exactement le prédicat d'absence. */
  readonly absenceSaidInSameOr: boolean;
};

export type EqualityNullSweep = {
  /** Les fichiers de production effectivement LUS — la non-vacuité de l'instrument. */
  readonly filesScanned: number;
  readonly sites: readonly EqualityNullSite[];
  /**
   * Les fragments que le balayage ne sait PAS suivre : un identifiant répandu
   * dans un `where` de ce fichier et défini dans un AUTRE. Publié plutôt que
   * tu : c'est la taille de l'angle mort, pas sa négation.
   */
  readonly unresolvedFragments: readonly string[];
};

const blankKeepingLines = (texte: string): string => texte.replace(/[^\n]/g, ' ');

/**
 * Dépouille commentaires et littéraux de chaîne **sans déplacer une seule
 * ligne** (#19799, audit du cycle 181).
 *
 * Deux défauts, tous deux mesurés :
 *
 *  · un bloc `/* … *\/` remplacé par la chaîne VIDE emporte ses retours à la
 *    ligne, et tout ce qui suit remonte d'autant : le site
 *    `routes/communities/addable-user.ts:19` était NOMMÉ `:8`, onze lignes de
 *    doc-comment plus haut. Un cliquet dont la valeur est de NOMMER fichier,
 *    ligne, colonne et graphie n'a pas le droit de se tromper sur le plus
 *    actionnable des quatre — à `:8` il n'y a rien, et la conclusion naturelle du
 *    lecteur est que le cliquet s'est trompé de SITE ;
 *  · le CONTENU d'un littéral de chaîne n'est pas du code. Un libellé, un message
 *    de journal ou une fixture qui CITE `champ: { isSet: false }` est dépouillé
 *    comme un commentaire, pour la même raison.
 *
 *    **Ce dépouillement est une CEINTURE, pas la garde** — mesuré : c'est
 *    l'ancrage `^…$` d'`isAbsencePredicate` sur la BRANCHE qui refuse déjà une
 *    citation, une branche `{ label: "…" }` n'étant pas un prédicat d'absence
 *    canonique. Lui attribuer cette fermeture serait une affirmation fausse de
 *    plus dans un doc-comment. Ce qu'il porte vraiment : il met le filtre hors
 *    d'atteinte de toute recherche TEXTUELLE future posée sur la même source.
 *
 *    Et il est SÛR pour une raison précise, qui tient à son motif et non au
 *    hasard : les deux premières alternatives exigent la quote fermante **sur la
 *    même ligne** (`[^'\\\n]`), si bien qu'une quote orpheline — le `/['"]/` d'un
 *    littéral de regex — n'ouvre pas de chaîne et ne désynchronise rien. Mesuré
 *    sur les 1722 fichiers de production : 0 site gagné, 0 site perdu.
 *
 * Le bloc est donc remplacé par ses PROPRES retours à la ligne, et le contenu
 * d'une chaîne par des espaces, ses `\n` gardés.
 */
const withoutComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, ''))
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, (chaine) =>
      `${chaine[0]}${blankKeepingLines(chaine.slice(1, -1))}${chaine[chaine.length - 1]}`);

/** Ce qui suit un `...` sans nommer de fragment cherchable. */
const SPREAD_KEYWORDS = new Set(['new', 'this', 'await', 'typeof', 'void']);

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
 * Le cadre ouvre-t-il un `where` ANNOTÉ ? Une annotation
 * `Prisma.<Modèle>WhereInput` qui précède immédiatement l'accolade — type de
 * retour, type de constante — le déclare ; `satisfies` la pose APRÈS, et se lit
 * donc sur la suite. La fenêtre est volontairement courte : ce qui est annoté
 * plus haut dans la fonction ne gouverne pas ce littéral-ci.
 */
const WHERE_INPUT_BEFORE = /Prisma\.\w*WhereInput(?:\s*\[\s*\])?\s*(?:\{|=\s*$|>\s*$|\)[^)]*\{\s*(?:return\s*)?$|\s*\{?\s*return\s*$)/;
const WHERE_INPUT_AFTER = /^\s*satisfies\s+Prisma\.\w*WhereInput/;

/** Le nom de la constante dont ce littéral est la valeur, s'il y en a une. */
const CONSTANT_BEFORE = /(?:const|let|var)\s+([\w$]+)\s*(?::[^=]*)?=\s*$/;

const annotatedWhere = (source: string, index: number): boolean =>
  WHERE_INPUT_BEFORE.test(source.slice(Math.max(0, index - 400), index))
  || WHERE_INPUT_AFTER.test(source.slice(blockEndOf(source, index, '{', '}') + 1, blockEndOf(source, index, '{', '}') + 80));

const constantNameOf = (source: string, index: number): string | null =>
  source.slice(Math.max(0, index - 200), index).match(CONSTANT_BEFORE)?.[1] ?? null;

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

/** Les ÉLÉMENTS de premier niveau d'un tableau littéral, bornes comprises. */
const topLevelElements = (array: string): string[] => {
  const inner = array.slice(1, -1);
  const elements: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i += 1) {
    const char = inner[i];
    if (char === '{' || char === '[' || char === '(') depth += 1;
    else if (char === '}' || char === ']' || char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      elements.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  elements.push(inner.slice(start));
  return elements.map((element) => element.trim()).filter((element) => element.length > 0);
};

/**
 * Cette BRANCHE est-elle exactement le prédicat d'absence de ce champ ?
 *
 * « Exactement » est la condition qui compte : `{ NOT: { champ: { isSet: false } } }`
 * contient le même texte et dit l'INVERSE, et une branche qui ajoute une
 * seconde condition n'est plus l'alternative que `unsetOrNull` compose.
 */
const isAbsencePredicate = (branch: string, field: string): boolean =>
  new RegExp(`^\\{\\s*${field}\\s*:\\s*\\{\\s*isSet\\s*:\\s*false\\s*,?\\s*\\}\\s*,?\\s*\\}$`).test(branch);

type Pass = {
  readonly sites: EqualityNullSite[];
  /** Les identifiants RÉPANDUS sous un `where` — les fragments nommés de ce fichier. */
  readonly spreadIntoWhere: Set<string>;
};

const onePass = (text: string, fields: ReadonlySet<string>, whereFragments: ReadonlySet<string>): Pass => {
  const stack: Frame[] = [];
  const sites: EqualityNullSite[] = [];
  const spreadIntoWhere = new Set<string>();

  const underWhere = (): boolean => {
    for (let depth = stack.length - 1; depth >= 0; depth -= 1) {
      if (stack[depth].kind === '{' && stack[depth].key === 'where') return true;
      if (PAYLOAD_KEYS.has(stack[depth].key)) return false;
    }
    return false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '{' || char === '[') {
      const written = keyBefore(text, i);
      const named = written === '' && char === '{'
        && (annotatedWhere(text, i) || whereFragments.has(constantNameOf(text, i) ?? ''));
      stack.push({ kind: char, key: named ? 'where' : written, start: i });
      continue;
    }
    if (char === '}' || char === ']') {
      stack.pop();
      continue;
    }

    // `...FRAGMENT` sous un `where` : la constante qu'il nomme EST un `where`,
    // qu'elle porte une annotation ou non.
    if (char === '.' && text.startsWith('...', i)) {
      // `...helper(…)` est un APPEL, pas un fragment : son corps vit dans la
      // fonction nommée, et les deux helpers du dépôt (`unsetOrNull`,
      // `differsOrUnset`) SONT la forme juste. Seul `...IDENT` nu désigne un
      // littéral dont on peut chercher la définition.
      // Un FRAGMENT est un identifiant NU : ni appel (`...helper(…)`), ni accès
      // de membre (`...this.x`), ni mot-clé (`...new Set(…)`). Les trois autres
      // formes désignent une valeur dont le littéral n'est pas cherchable.
      const after = text.slice(i + 3).match(/^\s*([\w$]+)\s*([.(])?/);
      const bare = after?.[1];
      if (bare && after?.[2] === undefined && !SPREAD_KEYWORDS.has(bare) && underWhere()) spreadIntoWhere.add(bare);
      continue;
    }

    if (char !== ':' || !/^\s*null\b/.test(text.slice(i + 1))) continue;

    const filtered = filteredField(text, i, stack);
    if (!filtered || !fields.has(filtered.field)) continue;
    if (!underWhere()) continue;

    // L'absence n'est dite « à côté » que dans le MÊME tableau `OR`, et par une
    // BRANCHE qui est exactement le prédicat d'absence.
    const holderIndex = filtered.spelling === 'equals' ? stack.length - 2 : stack.length - 1;
    const parent = holderIndex > 0 ? stack[holderIndex - 1] : undefined;
    const sisters = parent && parent.kind === '[' && parent.key === 'OR'
      ? topLevelElements(text.slice(parent.start, blockEndOf(text, parent.start, '[', ']') + 1))
      : [];

    sites.push({
      file: '',
      line: text.slice(0, i).split('\n').length,
      field: filtered.field,
      spelling: filtered.spelling,
      absenceSaidInSameOr: sisters.some((branch) => isAbsencePredicate(branch, filtered.field)),
    });
  }

  return { sites, spreadIntoWhere };
};

/** Les `{ champ: null }` et `{ champ: { equals: null } }` POSÉS EN FILTRE dans un fichier. */
export function equalityNullFiltersIn(file: string, source: string, fields: ReadonlySet<string>): EqualityNullSite[] {
  return scanFile(file, source, fields, new Set()).sites;
}

/**
 * Le balayage d'un fichier, en DEUX passes : la première relève les fragments
 * répandus dans un `where` littéral, la seconde traite leurs définitions comme
 * des `where`. Deux passes suffisent à la forme vivante (un fragment répandu
 * dans un `where`) ; un fragment répandu dans un fragment répandu demanderait un
 * point fixe, et sort avec les non résolus.
 */
function scanFile(file: string, source: string, fields: ReadonlySet<string>, shared: ReadonlySet<string>): {
  readonly sites: EqualityNullSite[];
  readonly spread: Set<string>;
  readonly declared: Set<string>;
} {
  const text = withoutComments(source);
  const first = onePass(text, fields, shared);
  const names = new Set([...shared, ...first.spreadIntoWhere]);
  const second = onePass(text, fields, names);
  const declared = new Set(
    [...text.matchAll(/(?:const|let|var|function)\s+([\w$]+)/g)].map((match) => match[1])
  );
  return { sites: second.sites.map((site) => ({ ...site, file })), spread: first.spreadIntoWhere, declared };
}

/**
 * Le même balayage sur toutes les sources de PRODUCTION d'une racine, en DEUX
 * tours de corpus : le premier relève les identifiants répandus sous un `where`
 * où que ce soit, le second rejoue chaque fichier en les traitant comme des
 * `where`. Sans ce second tour, un fragment partagé n'est gardé que dans le
 * fichier qui le RÉPAND, jamais dans celui qui le DÉFINIT.
 */
export function sweepEqualityNullFilters(root: string, fields: ReadonlySet<string>): EqualityNullSweep {
  const files = walk(root).filter((file) => file.endsWith('.ts') && !file.includes('__tests__') && !file.endsWith('.test.ts'));
  const sources = files.map((file) => ({ name: relative(root, file), text: readFileSync(file, 'utf8') }));

  const premier = sources.map((one) => scanFile(one.name, one.text, fields, new Set()));
  const repandus = new Set(premier.flatMap((one) => [...one.spread]));
  const declares = new Set(premier.flatMap((one) => [...one.declared]));

  const second = sources.map((one) => scanFile(one.name, one.text, fields, repandus));
  return {
    filesScanned: files.length,
    sites: second.flatMap((one) => one.sites),
    unresolvedFragments: [...repandus].filter((name) => !declares.has(name)).sort(),
  };
}
