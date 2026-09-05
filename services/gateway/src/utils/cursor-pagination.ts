/**
 * `?cursor=<opaque>&limit=<n≤100>` → `{ data, nextCursor }` — UNE loi, et sa
 * traduction en requête Prisma (#4175).
 *
 * ## Ce que cette loi remplace, et ce qu'elle empêche
 *
 * Sur les 86 `GET` qui rendent une liste, 43 paginent en `offset`. Deux
 * conséquences, et la seconde n'est pas un coût mais un DÉFAUT DE JUSTESSE :
 *
 * - le `count()` complet repayé à chaque page — c'est le COÛT ;
 * - une ligne insérée entre deux pages décale tous les rangs suivants, si bien
 *   que la page 2 saute une ligne jamais vue et re-sert la dernière déjà vue —
 *   c'est le BUG. Il ne se voit sur aucune collection figée : offset et curseur
 *   y rendent exactement la même chose.
 *
 * Le dépôt portait déjà quatre codecs de curseur, sur quatre sémantiques :
 *
 * | site | forme | ce qu'elle vaut |
 * |---|---|---|
 * | `routes/sync/cursor.ts` | base64url JSON versionné, une position PAR FLUX | la forme de référence — mais N collections dans UN jeton |
 * | `utils/keyset-cursor.ts` | base64url JSON `{createdAt,id}` | juste, mais l'ordre `(createdAt desc, id desc)` est ÉCRIT EN DUR |
 * | `routes/directory/friend-requests-core.ts` | l'horodatage ISO **en clair** | un identifiant lisible, et SANS départage des ex æquo |
 * | `routes/conversations/receipts.ts` | `base64url("offset:<n>")` | **un offset déguisé** — le défaut que le curseur existe pour supprimer |
 *
 * Une route qui écrit son propre codec peut trier autrement qu'elle ne reprend,
 * et le décalage ne se lit jamais en erreur : il se lit à l'écran, en lignes
 * manquantes. C'est pourquoi la loi tient ENSEMBLE les trois choses qu'une
 * pagination keyset ne doit jamais séparer — l'`orderBy`, la clause de reprise
 * et le jeton — et pourquoi `cursor-pagination-single-law-guard.test.ts` rougit
 * si un cinquième codec apparaît sous `routes/`.
 *
 * ## Pourquoi le jeton est OPAQUE
 *
 * « Opaque » ne veut pas dire chiffré : il veut dire **sans contrat**. Trois
 * propriétés le définissent, et chacune corrige une forme rencontrée dans le
 * dépôt :
 *
 * 1. **ce n'est pas un offset déguisé** — le jeton ne dépend que de la LIGNE
 *    qu'il ancre, jamais de ce qui la précède. La même ligne rend le même jeton
 *    qu'elle soit la 2e ou la 200e ;
 * 2. **ce n'est pas un identifiant lisible** — un client ne peut ni le
 *    fabriquer, ni le comprendre, ni s'en servir comme d'un `id` ou d'une date.
 *    Sa forme INTERNE n'est donc pas un contrat : elle peut changer d'une
 *    version à l'autre sans rien casser ;
 * 3. **il encode l'ORDRE DE TRI de la route** — un jeton frappé sous
 *    `(createdAt desc, id desc)` et rejoué contre une route qui trie autrement
 *    est REFUSÉ, jamais servi sous une clause de reprise que son ordre ne
 *    gouverne pas. C'est cette troisième propriété qui rend la loi partageable :
 *    sans elle, deux routes aux ordres différents s'échangeraient des jetons en
 *    silence, et chacune sauterait des lignes chez l'autre.
 *
 * Le jeton n'a AUCUNE valeur de sécurité et n'en a pas besoin : la clause de
 * reprise est toujours ET-isée avec le `where` de la route ({@link cursorQuery}),
 * donc un jeton forgé ne fait que déplacer une fenêtre à l'intérieur de ce que
 * l'appelant a déjà le droit de lire.
 *
 * ## Le jeton HISTORIQUE reste lisible
 *
 * `/notifications` sert déjà des curseurs `utils/keyset-cursor.ts` en
 * production : des clients sont EN TRAIN de défiler avec un jeton sans version
 * ni signature. Les refuser les renverrait tous à la page 1, c'est-à-dire leur
 * re-servirait des lignes déjà lues au moment même où l'on prétend supprimer les
 * doublons. Un jeton sans signature est donc accepté **quand ses clés sont
 * exactement les champs de l'ordre déclaré** — et refusé sinon, faute de quoi la
 * propriété 3 se perdrait par la porte de derrière.
 *
 * ## Ce que cette loi ne fait PAS
 *
 * Elle ne remplace pas `routes/sync/cursor.ts` : un jeton `/sync` porte une
 * position par FLUX (messages, conversations, réactions, participants) dans un
 * seul token, ce qu'une position unique n'exprime pas. Les deux règles sont
 * justes ; les fondre en trahirait une.
 *
 * Elle ne retire pas `offset` non plus. `offset` reste servi en alias déprécié
 * pendant la transition cliente (critère 4 de #4175) : `cursor` s'AJOUTE, et
 * quand les deux arrivent ensemble, **`cursor` gagne** — un rang et une ancre ne
 * peuvent pas décrire la même fenêtre, et l'ancre est celle qui ne saute pas de
 * ligne.
 */

import type { CursorPaginationMeta } from '@meeshy/shared/types';

export type SortDirection = 'asc' | 'desc';

/**
 * Le TYPE de la valeur triée — ce qui décide comment elle voyage dans le jeton
 * et comment elle revient dans la clause.
 *
 * Une date voyage en ISO 8601 (un `Date` ne survit pas à JSON) et redevient un
 * `Date` avant Prisma ; sans ce champ, la borne partirait en `{ lt: "2024-…" }`,
 * que Mongo compare comme une CHAÎNE — un filtre qui a l'air juste et ne l'est
 * pas.
 */
export type SortValueKind = 'date' | 'string' | 'number';

export type SortKey = {
  readonly field: string;
  readonly direction: SortDirection;
  readonly kind: SortValueKind;
};

/**
 * L'ordre TOTAL d'une route.
 *
 * « Total » n'est pas décoratif : la dernière clé DOIT être unique (l'`id`),
 * sinon deux lignes nées dans la même milliseconde s'échangent leur place d'une
 * lecture à l'autre et la pagination en saute une en re-servant l'autre. Un
 * ordre partiel est le second producteur de sauts de ligne, après l'offset.
 */
export type CursorSort = readonly SortKey[];

/** La position ancrée par un jeton : une valeur par clé de tri. */
export type CursorPosition = Readonly<Record<string, string | number>>;

export type KeysetWhere = { readonly OR: ReadonlyArray<Record<string, unknown>> };

const VERSION = 1;

/**
 * La signature d'un ordre — champ, sens ET type, dans l'ordre déclaré.
 *
 * Le TYPE en fait partie parce qu'il change la comparaison : passer un champ de
 * `date` à `string` ne change ni son nom ni son sens, et servirait pourtant une
 * borne comparée autrement. Un jeton en vol doit être refusé dans ce cas aussi.
 */
export function sortSignature(sort: CursorSort): string {
  return sort.map(({ field, direction, kind }) => `${field}:${direction}:${kind}`).join('|');
}

/** L'`orderBy` Prisma de cet ordre — dérivé, jamais recopié au site d'appel. */
export function orderByFor(sort: CursorSort): Array<Record<string, SortDirection>> {
  return sort.map(({ field, direction }) => ({ [field]: direction }));
}

const positionValue = (key: SortKey, raw: unknown): string | number | null => {
  if (key.kind === 'number') return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  if (key.kind === 'string') return raw;
  return Number.isNaN(new Date(raw).getTime()) ? null : raw;
};

const rowValue = (key: SortKey, raw: unknown): string | number | null => {
  if (raw instanceof Date) return key.kind === 'date' ? raw.toISOString() : null;
  return positionValue(key, raw);
};

/**
 * Le jeton opaque qui ancre `row` dans l'ordre `sort`.
 *
 * Jette si la ligne ne porte pas une clé de tri : un curseur amputé rendrait
 * une clause de reprise incomplète, donc une page qui saute des lignes — un
 * défaut silencieux, là où l'exception est immédiate et localisée.
 */
export function encodePageCursor(sort: CursorSort, row: Record<string, unknown>): string {
  const position: Record<string, string | number> = {};
  for (const key of sort) {
    const value = rowValue(key, row[key.field]);
    if (value === null) {
      throw new Error(`cursor-pagination: la ligne ne porte pas « ${key.field} » (${key.kind})`);
    }
    position[key.field] = value;
  }
  return Buffer.from(
    JSON.stringify({ v: VERSION, o: sortSignature(sort), k: position }),
    'utf8'
  ).toString('base64url');
}

/**
 * La position ancrée par `token`, ou `null`.
 *
 * `null` couvre TOUS les refus — jeton absent, illisible, d'une version
 * inconnue, frappé sous un AUTRE ordre, ou dont une clé manque, déborde ou n'a
 * pas le bon type. La fonction est TOTALE : elle ne jette jamais, parce que le
 * jeton est un paramètre d'appelant et qu'un 500 sur une entrée contrôlée par
 * l'appelant serait un défaut à lui seul.
 *
 * **Ce que veut dire `null` appartient à la route, pas à la loi.** Le dépôt en
 * connaît deux lectures, toutes deux justifiées : re-servir la première page
 * (`/notifications`, `PostFeedService` — le défilement continue, le lecteur ne
 * peut de toute façon pas réparer son jeton) ou refuser en 400 (`/sync` — un
 * client qui persiste son curseur doit APPRENDRE qu'il est périmé). La loi rend
 * la même valeur aux deux et les laisse décider.
 */
export function decodePageCursor(token: unknown, sort: CursorSort): CursorPosition | null {
  if (typeof token !== 'string' || token.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;

  const payload = parsed as Record<string, unknown>;
  const versionne = 'v' in payload;
  if (versionne && payload.v !== VERSION) return null;
  if (versionne && payload.o !== sortSignature(sort)) return null;

  // Le jeton HISTORIQUE (`utils/keyset-cursor.ts`) n'a ni `v` ni `o` : ses clés
  // SONT la position. Il n'est accepté que si elles coïncident exactement avec
  // les champs de l'ordre déclaré — la vérification d'ordre qu'il ne porte pas
  // est alors remplacée par la seule qu'on puisse encore faire.
  const brut = versionne ? payload.k : payload;
  if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) return null;

  const cles = brut as Record<string, unknown>;
  if (Object.keys(cles).length !== sort.length) return null;

  const position: Record<string, string | number> = {};
  for (const key of sort) {
    if (!Object.prototype.hasOwnProperty.call(cles, key.field)) return null;
    const value = positionValue(key, cles[key.field]);
    if (value === null) return null;
    position[key.field] = value;
  }
  return position;
}

const bound = (direction: SortDirection): 'lt' | 'gt' => (direction === 'desc' ? 'lt' : 'gt');

const prismaValue = (key: SortKey, value: string | number): Date | string | number =>
  key.kind === 'date' ? new Date(value as string) : value;

/**
 * « Strictement APRÈS cette position », dans l'ordre déclaré.
 *
 * Une branche par clé : la première avance sur la clé de tête, chacune des
 * suivantes fige les clés précédentes à l'ÉGALITÉ et avance sur la sienne. La
 * dernière branche est celle qui départage les ex æquo — sans elle, deux lignes
 * de même horodatage se sautent ou se re-servent indéfiniment.
 *
 * L'appelant DOIT trier par {@link orderByFor} sur le MÊME ordre. Il n'a pas à y
 * penser : {@link cursorQuery} rend les deux ensemble.
 */
export function keysetWhere(sort: CursorSort, position: CursorPosition): KeysetWhere {
  const branches = sort.map((key, rang) => {
    const branche: Record<string, unknown> = {};
    for (const precedente of sort.slice(0, rang)) {
      branche[precedente.field] = prismaValue(precedente, position[precedente.field]);
    }
    branche[key.field] = { [bound(key.direction)]: prismaValue(key, position[key.field]) };
    return branche;
  });
  return { OR: branches };
}

export type CursorQueryResult<W> = {
  /**
   * Le `where` de la route, ET-isé avec la clause de reprise quand un curseur
   * s'est lu — et rendu TEL QUEL (même référence) sinon.
   *
   * Le type reste `W` alors que le résultat est parfois `{ AND: [W, KeysetWhere] }`.
   * C'est assumé et sûr dans l'univers de types de Prisma, où `AND` est un membre
   * légal de tout `WhereInput` : la valeur rendue est bien un `W`. Le déclarer
   * en union obligerait chaque site d'appel à un cast, au moment précis où l'on
   * veut que Prisma dérive le type de la LIGNE.
   */
  readonly where: W;
  readonly orderBy: Array<Record<string, SortDirection>>;
  /** `limit + 1` — la ligne SONDE, qui DIT `hasMore` sans compter la table. */
  readonly take: number;
  /** Un curseur a-t-il été LU ? Un curseur illisible vaut « pas de curseur ». */
  readonly isCursorPage: boolean;
};

/**
 * Les arguments Prisma d'UNE page au curseur : l'ordre, la ligne sonde et la
 * clause de reprise, dérivés d'une seule déclaration.
 *
 * Le `where` de la route est ET-isé, jamais remplacé : c'est ce qui rend
 * impossible la faute qui coûte le plus cher — une page suivante qui « oublie »
 * la garde de visibilité et réélargit ce que la page 1 avait restreint.
 *
 * `limit` arrive DÉJÀ borné (schéma AJV `maximum: 100`, ou `validatePagination`).
 * La loi ne le re-borne pas : un plafond silencieux ici masquerait une route qui
 * n'a pas posé le sien.
 */
export function cursorQuery<W extends object>(opts: {
  readonly sort: CursorSort;
  readonly cursor: unknown;
  readonly limit: number;
  readonly where: W;
}): CursorQueryResult<W> {
  const position = decodePageCursor(opts.cursor, opts.sort);
  const orderBy = orderByFor(opts.sort);
  const take = opts.limit + 1;

  if (position === null) {
    return { where: opts.where, orderBy, take, isCursorPage: false };
  }
  return {
    where: { AND: [opts.where, keysetWhere(opts.sort, position)] } as unknown as W,
    orderBy,
    take,
    isCursorPage: true,
  };
}

export type CursorPageResult<T> = {
  readonly page: T[];
  readonly pagination: CursorPaginationMeta;
};

/**
 * La page SERVIE et sa pagination, depuis les `limit + 1` lignes lues.
 *
 * La ligne sonde est TRANCHÉE — elle a été lue pour répondre à « y en a-t-il
 * d'autres ? », jamais pour être servie — et le curseur suivant est frappé sur
 * la DERNIÈRE LIGNE SERVIE, jamais sur la sonde : l'ancrer sur la sonde ferait
 * sauter cette ligne-là à la page suivante.
 *
 * `nextCursor` est `null` dès qu'il n'y a plus de suite : un curseur rendu sur
 * une page finale invite le client à un aller-retour qui ne peut rien rapporter.
 *
 * `form: 'keyset'` DIT au client ce qu'il tient. Un `nextCursor` seul ne le dit
 * pas — un offset déguisé se relance par la même clé et saute pourtant des
 * lignes ; sans ce champ, la seule façon de savoir laquelle des deux on lit est
 * de lire le code de la route, donc de ne pas le savoir.
 */
export function cursorPage<T extends Record<string, unknown>>(opts: {
  readonly sort: CursorSort;
  readonly rows: readonly T[];
  readonly limit: number;
}): CursorPageResult<T> {
  const hasMore = opts.rows.length > opts.limit;
  const page = hasMore ? opts.rows.slice(0, opts.limit) : [...opts.rows];
  const derniere = page[page.length - 1];

  return {
    page,
    pagination: {
      limit: opts.limit,
      hasMore,
      nextCursor: hasMore && derniere ? encodePageCursor(opts.sort, derniere) : null,
      form: 'keyset',
    },
  };
}

/**
 * Le fragment de `querystring` que toute route curseurisée déclare — **sans
 * `default`**, et c'est la raison d'être de ce fragment partagé.
 *
 * Fastify active `useDefaults` d'AJV : un `default` dans un schéma de REQUÊTE
 * ÉCRIT la valeur dans `request.query` avant le handler. Un `default` sur
 * `cursor` rendrait donc le handler incapable de distinguer « absent » de
 * « fourni », c'est-à-dire lui ferait perdre la seule information dont il a
 * besoin pour choisir entre la première page et la reprise.
 */
export const cursorQueryProperty = {
  type: 'string',
  description:
    'Opaque cursor returned as pagination.nextCursor by the previous page. Takes precedence over offset, which is a deprecated alias.',
} as const;

/**
 * Le fragment de `pagination` que toute route curseurisée déclare en réponse.
 *
 * `fast-json-stringify` RETIRE toute clé qu'aucun schéma ne déclare : un
 * `nextCursor` calculé mais non déclaré est sérialisé puis jeté au dernier
 * mètre, et la route a l'air correcte de bout en bout. `total` et `offset`
 * restent déclarés — ils partent sur le chemin `offset`, et le schéma est
 * partagé par les deux formes.
 */
export const cursorPaginationSchema = {
  type: 'object',
  properties: {
    total: { type: 'number', description: 'Offset mode only — never counted under a cursor' },
    offset: { type: 'number', description: 'Offset mode only' },
    limit: { type: 'number' },
    hasMore: { type: 'boolean' },
    nextCursor: {
      type: ['string', 'null'],
      description: 'Pass back as ?cursor= to read the next page',
    },
    form: {
      type: 'string',
      enum: ['keyset', 'offset'],
      description: 'Which pagination the page was served with',
    },
  },
} as const;
