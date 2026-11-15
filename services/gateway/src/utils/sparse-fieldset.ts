/**
 * `?fields=` / `?expand=` — UNE grammaire, et sa traduction en `select` Prisma (#4356).
 *
 * ## Ce que ce module remplace
 *
 * Quatre analyseurs coexistaient, sur TROIS sémantiques :
 *
 * | site | forme |
 * |---|---|
 * | `routes/directory/person.ts` | `expansionsDemandees` / `restreindre` |
 * | `routes/me/get-me.ts` | `parseFieldsParam` / `parseExpandParam` / `pickFields` |
 * | `routes/links/user.ts` | trois `new Set(...)` écrits en ligne dans le handler |
 * | `routes/me/preferences/preference-selection.ts` | `catégorie.clé`, vocabulaire FERMÉ, 400 sur l'inconnu |
 *
 * Les trois premiers portent la MÊME sémantique — une projection LAXISTE sur
 * les clés de PREMIER NIVEAU d'un objet servi — écrite trois fois, avec trois
 * bornes légèrement différentes. C'est elle que ce module tient.
 *
 * ## Ce que ce module ne fait PAS
 *
 * **La sélection de préférences n'est pas un cas particulier de cette
 * grammaire, c'est une AUTRE grammaire**, et elle reste chez elle :
 *
 * - son vocabulaire est FERMÉ (sept catégories, leurs clés connues) et un jeton
 *   inconnu y rend **400**, quand celui-ci l'ignore en silence. Les deux règles
 *   sont justes — sur un vocabulaire fermé, ignorer une faute de frappe sert
 *   une réponse partielle qui a l'air d'une vérité ; sur un vocabulaire ouvert,
 *   refuser casse un client plus récent que le serveur. Les fondre obligerait
 *   à en trahir une ;
 * - elle a DEUX niveaux (`catégorie.clé`) là où celle-ci en a un ;
 * - son second niveau nomme des clés **à l'intérieur d'une colonne JSON**, que
 *   Prisma ne sait pas projeter : sa réduction de requête s'arrête à la
 *   catégorie, et elle la fait déjà (`resolveCompleteCategories`).
 *
 * Le dépôt préfère deux règles honnêtes à une abstraction qui ment.
 *
 * ## `fields` et `expand` sont DEUX opérations, jamais une
 *
 * `fields` RESTREINT ce qui est déjà là ; `expand` NOMME des blocs optionnels
 * dont chacun a son propre producteur (une requête de plus, une jointure, une
 * garde qu'on pose ou non). Les fondre en une seule liste rendrait
 * `?fields=stats` capable de DÉCLENCHER un calcul — c'est-à-dire de faire
 * d'une projection un déclencheur d'effet.
 *
 * ## Les bornes, et pourquoi elles sont celles-là
 *
 * | cas | verdict | raison |
 * |---|---|---|
 * | paramètre absent / non-string | aucune restriction (`null`) | le chemin nominal ne se paie rien |
 * | liste VIDE (`?fields=`, `?fields=,,`) | aucune restriction | « zéro champ servi » serait une réponse vide qui a l'air d'une vérité |
 * | champ INCONNU | ignoré, jamais fabriqué | un `fields` qui ÉLARGIT est une porte : `?fields=email` rendrait décorative la garde posée à la source |
 * | jeton POINTÉ (`a.b`) | nom opaque, ignoré | la profondeur est la grammaire des préférences, fermée et stricte |
 * | doublon | dédupliqué | |
 *
 * ## La traduction en `select` : un SOUS-ENSEMBLE, jamais une reconstruction
 *
 * {@link selectForFields} ne compose aucun `select` neuf : il PROJETTE le
 * littéral complet sur les colonnes retenues. Deux propriétés en découlent, et
 * ce sont elles qui rendent le lot sûr :
 *
 * 1. sans `fields`, il rend le littéral complet **par identité de référence** —
 *    le comportement par défaut ne peut pas changer, il n'y a pas d'objet
 *    reconstruit dans lequel une colonne pourrait manquer ;
 * 2. avec `fields`, le résultat est toujours un sous-ensemble du littéral —
 *    aucune colonne que le plan ne déclare pas, aucune valeur réécrite.
 *
 * Un champ que le schéma DÉCLARE et que la requête ne CHARGE pas sort absent,
 * et le symptôme est un champ manquant, pas une erreur : le plan est donc
 * déclaré **à côté du `select` qu'il projette**, jamais au site d'appel.
 */

export type FieldSet = ReadonlySet<string> | null;

const tokens = (raw: unknown): readonly string[] =>
  typeof raw !== 'string'
    ? []
    : raw
        .split(',')
        .map((token) => token.trim())
        .filter((token) => token.length > 0);

/**
 * La liste de `?fields=`. `null` ⇒ AUCUNE restriction — c'est le cas d'un
 * paramètre absent comme celui d'une liste vide (voir le tableau des bornes).
 */
export function parseFieldList(raw: unknown): FieldSet {
  const list = tokens(raw);
  return list.length === 0 ? null : new Set(list);
}

/**
 * Les jetons de `?expand=` / `?include=` retenus, dans l'ordre de la DEMANDE.
 * Un jeton hors vocabulaire est ignoré, jamais refusé : la route ne connaît pas
 * d'avance ce qu'un client plus récent lui demandera, et un refus casserait ce
 * client là où l'ignorer le sert simplement sans le bloc en question.
 */
export function parseTokenList<T extends string>(raw: unknown, known: readonly T[]): readonly T[] {
  const vu = new Set<string>();
  const retenus: T[] = [];
  for (const token of tokens(raw)) {
    if (vu.has(token) || !(known as readonly string[]).includes(token)) continue;
    vu.add(token);
    retenus.push(token as T);
  }
  return retenus;
}

/** {@link parseTokenList} sous forme ensembliste, pour les sites qui n'interrogent que l'appartenance. */
export function parseTokenSet<T extends string>(raw: unknown, known: readonly T[]): ReadonlySet<T> {
  return new Set(parseTokenList(raw, known));
}

/** Une clé survivra-t-elle à la projection ? — pour DÉCIDER avant de calculer. */
export function isFieldServed(fields: FieldSet, key: string, pinned: readonly string[] = []): boolean {
  return fields === null || fields.has(key) || pinned.includes(key);
}

/**
 * Restreint les clés de PREMIER NIVEAU de `obj`.
 *
 * Sans liste, rend `obj` TEL QUEL — la MÊME référence, pas une copie : le
 * chemin nominal ne paie rien, et l'identité rend visible qu'il n'a pas bougé.
 * Les clés `pinned` survivent à toute liste (l'identifiant d'une ressource,
 * sans quoi la réponse ne dit plus de quoi elle parle).
 */
export function restrictFields<T extends Record<string, unknown>>(
  obj: T,
  fields: FieldSet,
  pinned: readonly string[] = [],
): T {
  if (fields === null) return obj;
  const gardes = new Set<string>([...pinned, ...fields]);
  const restreint: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(obj)) {
    if (gardes.has(cle)) restreint[cle] = valeur;
  }
  return restreint as T;
}

/**
 * Le plan d'une projection : ce que la route CHARGE, et ce que chaque clé
 * SERVIE coûte en colonnes.
 *
 * - `full` — le `select` complet, servi tel quel quand rien n'est demandé ;
 * - `pinned` — les colonnes chargées QUOI QU'IL ARRIVE : clé primaire, matière
 *   des gardes (une garde de confidentialité ne doit jamais dépendre d'un
 *   paramètre d'appelant), colonnes qu'un mappeur lit sans condition ;
 * - `columns` — clé SERVIE → colonnes qui la produisent. Une clé absente de la
 *   carte se produit elle-même si `full` la déclare ; une clé FABRIQUÉE (aucune
 *   colonne) se déclare avec un tableau vide.
 */
export type ColumnPlan<S extends Record<string, unknown>> = {
  readonly full: S;
  readonly pinned: readonly (keyof S & string)[];
  readonly columns?: Readonly<Record<string, readonly (keyof S & string)[]>>;
};

/**
 * Le `select` Prisma que `served` exige — une PROJECTION de `plan.full`.
 *
 * `served === null` ⇒ `plan.full`, par identité de référence.
 *
 * Le type rendu reste `S` alors que le résultat en est un sous-ensemble : c'est
 * assumé et borné. Prisma dérive de ce type celui de la LIGNE, et l'affaiblir
 * en `Partial<S>` rendrait indéfinis, au typage, les champs que les gardes en
 * aval exigent — au moment précis où `pinned` les GARANTIT à l'exécution. La
 * garantie est portée par `pinned`, pas par le type ; tout ce qui n'y est pas
 * doit être lu comme absent possible (`?? null`, `?.`), et l'est déjà puisque
 * la MÊME liste de champs filtre ensuite la réponse.
 */
export function selectForFields<S extends Record<string, unknown>>(plan: ColumnPlan<S>, served: FieldSet): S {
  if (served === null) return plan.full;

  const colonnes = new Set<string>(plan.pinned);
  for (const cle of served) {
    const source = plan.columns?.[cle];
    if (source !== undefined) {
      for (const colonne of source) colonnes.add(colonne);
      continue;
    }
    if (cle in plan.full) colonnes.add(cle);
  }

  const reduit: Record<string, unknown> = {};
  for (const [colonne, valeur] of Object.entries(plan.full)) {
    if (colonnes.has(colonne)) reduit[colonne] = valeur;
  }
  return reduit as S;
}

/* ===========================================================================
 * La SECONDE règle de l'inconnu — le vocabulaire FERMÉ (#4173)
 * =========================================================================== */

/**
 * ## Pourquoi une seconde règle, et pourquoi ICI
 *
 * Le doc-comment de tête tient une règle de l'inconnu — l'IGNORER — et dit
 * pourquoi elle est juste : « sur un vocabulaire ouvert, refuser casse un
 * client plus récent que le serveur ». Il dit aussi, dans la même phrase, que
 * l'autre règle est juste de son côté : « sur un vocabulaire FERMÉ, ignorer une
 * faute de frappe sert une réponse partielle qui a l'air d'une vérité ».
 *
 * #4173 apporte les deux ressources qui ont un vocabulaire FERMÉ
 * (`/conversations/{id}`, `/sync`), dont le critère 1 exige « 400 explicite
 * [sur] tout champ ou relation non déclaré ». La règle stricte rejoint donc la
 * LOI, et n'est pas réécrite dans deux routes — ce que
 * `sparse-fieldset-single-law-guard.test.ts` interdit précisément.
 *
 * **Ce n'est pas la même grammaire pour autant** : les deux règles cohabitent
 * dans ce module sous des NOMS différents, et une route déclare laquelle elle
 * applique. Les fondre en une seule fonction à drapeau en trahirait une —
 * `parseFieldList` reste le chemin des vocabulaires OUVERTS (les clés d'un
 * objet servi, qu'un client plus récent peut nommer avant le serveur).
 *
 * ## Ce que cette extension NE ramène PAS
 *
 * `routes/me/preferences/preference-selection.ts` reste dehors, et la troisième
 * raison de son doc-comment est la seule qui décide : son second niveau nomme
 * des clés **à l'intérieur d'une colonne JSON**, que Prisma ne sait pas
 * projeter — sa réduction s'arrête à la catégorie. Les deux premières raisons
 * (vocabulaire fermé, deux niveaux) sont désormais SERVIES ici ; la troisième
 * ne l'est pas, et ne peut pas l'être.
 *
 * ## Le refus se teste `=== false`, jamais `!resultat.ok`
 *
 * Le gateway compile en `strictNullChecks: false` (`tsconfig.json`), et sous ce
 * réglage TypeScript ne RÉTRÉCIT PAS une union discriminée par la TRUTHINESS
 * d'un littéral booléen : `if (!r.ok)` laisse `r` non narrowé, et la branche
 * d'erreur ne compile pas. `if (r.ok === false)` narrowe. Le dépôt écrit déjà
 * la même forme (`routes/me/preferences/unified-routes.ts:198`) ; la répéter
 * ici évite qu'on la redécouvre par un `tsc` rouge — que `ts-jest` ne montre
 * pas, puisqu'il ignore 2339.
 */
export type StrictFieldResult =
  | { readonly ok: true; readonly fields: FieldSet }
  | { readonly ok: false; readonly unknown: readonly string[] };

/**
 * {@link parseFieldList} sur un vocabulaire FERMÉ : un champ non déclaré est un
 * REFUS, jamais un silence.
 *
 * Le refus NOMME les jetons fautifs — tous, pas seulement le premier. Un client
 * qui reçoit « champ inconnu » sans savoir lequel ne peut pas se corriger, et
 * c'est la faute de frappe qu'on veut lui rendre lisible.
 *
 * L'ABSENCE et la liste VIDE gardent le sens qu'elles ont dans la règle laxiste
 * — aucune restriction. Fermer le vocabulaire ne change pas ce que veut dire ne
 * rien demander : « zéro champ servi » resterait une réponse vide qui a l'air
 * d'une vérité.
 */
export function parseStrictFieldList(raw: unknown, known: readonly string[]): StrictFieldResult {
  const list = tokens(raw);
  if (list.length === 0) return { ok: true, fields: null };
  const inconnus = [...new Set(list.filter((token) => !known.includes(token)))];
  if (inconnus.length > 0) return { ok: false, unknown: inconnus };
  return { ok: true, fields: new Set(list) };
}

export type StrictTokenResult<T extends string> =
  | { readonly ok: true; readonly tokens: readonly T[] }
  | { readonly ok: false; readonly unknown: readonly string[] };

/**
 * {@link parseTokenList} sur un vocabulaire FERMÉ — l'ordre de la DEMANDE est
 * conservé, comme chez son jumeau laxiste, et un jeton hors vocabulaire refuse
 * le lot entier plutôt que de servir une réponse amputée du bloc demandé.
 */
export function parseStrictTokenList<T extends string>(
  raw: unknown,
  known: readonly T[],
): StrictTokenResult<T> {
  const list = tokens(raw);
  const inconnus = [...new Set(list.filter((token) => !(known as readonly string[]).includes(token)))];
  if (inconnus.length > 0) return { ok: false, unknown: inconnus };
  return { ok: true, tokens: [...new Set(list)] as T[] };
}

/**
 * Pourquoi un refus PORTÉ : les trois formes qu'une demande peut rater ne se
 * réparent pas de la même façon, et un code unique obligerait le client à
 * deviner laquelle.
 */
export type ScopedFieldFailure =
  | { readonly kind: 'unscoped'; readonly tokens: readonly string[] }
  | { readonly kind: 'unknown-scope'; readonly tokens: readonly string[] }
  | { readonly kind: 'unknown-field'; readonly tokens: readonly string[] };

export type ScopedFieldResult<S extends string> =
  | { readonly ok: true; readonly byScope: ReadonlyMap<S, FieldSet> }
  | { readonly ok: false; readonly failure: ScopedFieldFailure };

/**
 * La MÊME grammaire à un niveau, appliquée PAR PORTÉE : `portée.champ`.
 *
 * Elle existe pour les ressources MULTIPLES — `/sync` sert quatre collections
 * dans une réponse, donc un `?fields=` plat ne dirait pas de laquelle il parle.
 * Le point n'introduit aucune profondeur nouvelle : à droite du séparateur, on
 * retrouve exactement la liste à UN niveau de {@link parseStrictFieldList},
 * dont chaque portée a la sienne.
 *
 * Un jeton SANS point est refusé (`unscoped`) plutôt qu'appliqué partout : « ce
 * champ, dans toutes les collections » serait une demande qu'aucun appelant ne
 * formule, et l'arbitrer silencieusement servirait une projection que personne
 * n'a voulue.
 *
 * Une portée ABSENTE de la carte rendue vaut « aucune restriction » pour elle —
 * jamais « aucun champ ». C'est la même distinction que `null` chez son jumeau
 * à un niveau, portée ici par l'absence de clé.
 */
export function parseScopedFieldList<S extends string>(
  raw: unknown,
  vocabulary: Readonly<Record<S, readonly string[]>>,
): ScopedFieldResult<S> {
  const list = tokens(raw);
  if (list.length === 0) return { ok: true, byScope: new Map() };

  const sansPortee: string[] = [];
  const porteesInconnues: string[] = [];
  const champsInconnus: string[] = [];
  const parPortee = new Map<S, Set<string>>();

  for (const token of list) {
    const separateur = token.indexOf('.');
    if (separateur === -1) {
      sansPortee.push(token);
      continue;
    }
    const portee = token.slice(0, separateur) as S;
    const champ = token.slice(separateur + 1);
    const connus = vocabulary[portee];
    if (connus === undefined) {
      porteesInconnues.push(portee);
      continue;
    }
    if (!connus.includes(champ)) {
      champsInconnus.push(token);
      continue;
    }
    const retenus = parPortee.get(portee) ?? new Set<string>();
    retenus.add(champ);
    parPortee.set(portee, retenus);
  }

  // L'ordre des trois refus est celui de la RÉPARATION : un jeton sans portée
  // ne peut même pas être rangé, une portée inconnue rend son second niveau
  // ininterprétable, un champ inconnu est la faute la plus fine.
  if (sansPortee.length > 0) return { ok: false, failure: { kind: 'unscoped', tokens: [...new Set(sansPortee)] } };
  if (porteesInconnues.length > 0) {
    return { ok: false, failure: { kind: 'unknown-scope', tokens: [...new Set(porteesInconnues)] } };
  }
  if (champsInconnus.length > 0) {
    return { ok: false, failure: { kind: 'unknown-field', tokens: [...new Set(champsInconnus)] } };
  }

  const byScope = new Map<S, FieldSet>();
  for (const [portee, champs] of parPortee) byScope.set(portee, champs);
  return { ok: true, byScope };
}
