/**
 * LA CONVERSATION LA PLUS RÉCEMMENT ACTIVE, PARMI UN ENSEMBLE BORNÉ (#19835).
 *
 * Depuis #9026, « récent » et « actif » désignent le RANG d'une conversation —
 * max(`lastMessageAt`, `lastActivityAt`) — et non son dernier message : une
 * réaction, un appel, une épingle remontent la ligne pour tout le monde
 * (`listRankFromColumns`, `packages/shared/utils/conversation-list-rank.ts`).
 * Un `max` de deux colonnes ne s'écrit pas en `orderBy` Prisma, et c'est ce qui
 * a laissé cinq surfaces trier sur `lastMessageAt` alors que leur propre
 * commentaire disait « la plus récemment active » : la divergence était INERTE
 * tant que `lastActivityAt` n'était jamais écrite (jusqu'à #19800).
 *
 * `routes/conversations/utils/list-rank.ts` paie ce prix pour la LISTE paginée,
 * avec sa fenêtre, son curseur et sa borne. Les surfaces ci-dessous n'ont besoin
 * ni de l'une ni des autres : elles veulent LA plus récemment active (ou les K
 * premières) d'un ensemble que leur `where` borne déjà — un tête-à-tête à
 * rouvrir, la destination d'un appel manqué, le groupe exact d'un appel, où
 * poser la copie vocale d'un talkie.
 *
 * ─── La preuve, au grain K ──────────────────────────────────────────────────
 *
 * Deux lectures suffisent, et ce n'est pas une heuristique :
 *
 *   top-K par RANG  ⊆  top-K(`lastMessageAt`)  ∪  top-K(`lastActivityAt`)
 *
 * Soit W la gagnante par (rang desc, `id` desc), et supposons rang(W) =
 * `lastMessageAt`(W) (le cas symétrique se lit en échangeant les colonnes).
 * Une ligne X qui la précède dans le flux `lastMessageAt` porte soit
 * `lastMessageAt`(X) > rang(W) — donc rang(X) ≥ `lastMessageAt`(X) > rang(W),
 * et W n'était pas la gagnante —, soit l'égalité avec `id`(X) > `id`(W) — donc
 * rang(X) = rang(W) et X gagne le départage, même conclusion. W est donc EN
 * TÊTE de son flux, et K lignes par flux suffisent pour les K premières du rang.
 *
 * ─── Ce que la preuve EXIGE ─────────────────────────────────────────────────
 *
 * - **Les deux flux**, toujours : lire le seul `lastMessageAt` rate toute ligne
 *   REMONTÉE, lire le seul `lastActivityAt` rate toute ligne qui n'en a pas (la
 *   colonne est ABSENTE de la quasi-totalité des documents — aucun chemin de
 *   création ne l'écrit, `conversationActivity.ts` est son unique écrivain).
 * - **`take` ≥ K sur CHAQUE flux** : un flux qui lit moins que K ne peut pas
 *   rendre les K premières du rang (cf. #19836, où une fenêtre trop étroite
 *   faisait disparaître une conversation de toutes les pages).
 * - **Le départage sur `id` DANS les deux ordres ET dans le comparateur** :
 *   l'ordre des ex aequo rendu par MongoDB n'est pas spécifié, donc sans lui
 *   deux lectures d'une même requête peuvent ne pas s'accorder, et le choix
 *   servi varie d'un appel à l'autre (#19881, le même défaut sur la borne du
 *   curseur de la liste).
 *
 * Le comparateur ne SOUSTRAIT pas deux rangs : deux lignes sans message ni
 * activité donneraient `NaN`, et une conversation dans cet état est une forme
 * réelle (aucun chemin de création n'écrit les deux colonnes).
 */
import { listRankFromColumns } from '@meeshy/shared/utils/conversation-list-rank';

/**
 * Ce qu'une lecture doit rendre pour qu'on puisse la classer : les deux colonnes
 * du rang, et l'identité qui départage.
 *
 * **Les trois champs sont REQUIS, et c'est le seul garde-fou qu'un témoin ne
 * peut pas porter.** Un `select` qui oublie `lastActivityAt` rend un rang
 * réduit au dernier message — exactement le défaut qu'on corrige — et aucun
 * double de test ne le verrait (un double rend ce qu'on lui dit, quel que soit
 * le `select`). Déclarés requis, c'est le COMPILATEUR qui refuse la lecture
 * incomplète : le type que Prisma dérive d'un `select` partiel n'est pas
 * assignable. Les appelants qui lisent par `select` répandent `RANK_SELECT`.
 */
export type RankedConversationRow = {
  readonly id: string;
  readonly lastMessageAt: Date | null;
  readonly lastActivityAt: Date | null;
};

/** Les colonnes sans lesquelles le rang ne se calcule pas — à répandre dans tout `select` d'une lecture classée. */
export const RANK_SELECT = { id: true, lastMessageAt: true, lastActivityAt: true } as const;

/**
 * L'un des deux ordres de lecture — la colonne du flux, puis `id` qui départage
 * les égalités. Le tuple est MUTABLE à dessein : l'ordre d'une lecture Prisma
 * est un `OrderByInput[]` mutable, et un tuple `readonly` n'y est pas
 * assignable. Ce qui garantit qu'aucun appelant ne mute celui d'un autre est
 * que `rankStreamOrders()` construit des littéraux NEUFS à chaque appel.
 */
export type RankStreamOrder =
  | [{ lastMessageAt: 'desc' }, { id: 'desc' }]
  | [{ lastActivityAt: 'desc' }, { id: 'desc' }];

/** Les deux flux dont l'union contient le top-K du rang. */
export const rankStreamOrders = (): RankStreamOrder[] => [
  [{ lastMessageAt: 'desc' }, { id: 'desc' }],
  [{ lastActivityAt: 'desc' }, { id: 'desc' }],
];

const rankMillis = (row: RankedConversationRow): number =>
  listRankFromColumns(row)?.getTime() ?? Number.NEGATIVE_INFINITY;

/** `a` passe-t-elle avant `b` ? Le rang décide ; à rang égal, `id` desc — le même départage que les deux ordres de lecture. */
export const outranks = (a: RankedConversationRow, b: RankedConversationRow): boolean => {
  const [left, right] = [rankMillis(a), rankMillis(b)];
  return left === right ? a.id > b.id : left > right;
};

/**
 * La ligne de plus haut RANG parmi celles que la lecture sélectionne.
 * `readTop(orderBy)` lit la PREMIÈRE ligne dans l'ordre demandé (`findFirst`) ;
 * `null` quand rien n'apparie.
 */
export async function highestRankedConversation<T extends RankedConversationRow>(
  readTop: (orderBy: RankStreamOrder) => Promise<T | null>,
): Promise<T | null> {
  const tops = await Promise.all(rankStreamOrders().map(readTop));
  return tops.reduce<T | null>(
    (best, row) => (row !== null && (best === null || outranks(row, best)) ? row : best),
    null,
  );
}

/**
 * Les `take` lignes de plus haut rang, du plus récemment actif au plus ancien.
 * `readTop(orderBy)` lit `take` lignes dans l'ordre demandé (`findMany`) ; les
 * deux flux se recouvrent, l'union se dédoublonne par `id`.
 */
export async function highestRankedConversations<T extends RankedConversationRow>(
  readTop: (orderBy: RankStreamOrder) => Promise<readonly T[]>,
  take: number,
): Promise<readonly T[]> {
  const streams = await Promise.all(rankStreamOrders().map(readTop));
  const byId = new Map(streams.flat().map((row) => [row.id, row] as const));
  return [...byId.values()].sort((a, b) => (outranks(a, b) ? -1 : 1)).slice(0, take);
}
