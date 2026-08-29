import type { FastifyInstance } from 'fastify';
import { Prisma } from '@meeshy/shared/prisma/client';
import type { CursorKey, SyncCursor } from './cursor';
import { encodeSyncCursor } from './cursor';
import type { SyncIdentity } from './identity';
import { resolveSyncMembership } from './membership';
import { trimToByteBudget, SYNC_MAX_PAGE_BYTES, MAX_ITEMS_PER_COLLECTION } from './budget';
import { makeSyncCollectionSchema, type SyncCollectionResult } from './schema-shared';

/**
 * Collection `conversations` de `/sync` (issue #4171, critère 1) — même forme
 * que `messages` : `added`/`modified` par watermark `createdAt`/`updatedAt`,
 * RLS fail-closed par appartenance, budget d'octets partagé, keyset
 * `(updatedAt, id)`.
 *
 * `historyFloor` (`routes/sync/membership.ts`) ne s'applique PAS ici, par
 * choix documenté : le plancher d'un lien sans historique retient le contenu
 * des vieux MESSAGES, jamais l'existence de la conversation elle-même (titre,
 * avatar, effectif) — un participant qui vient de rejoindre voit la
 * conversation en entier, seuls ses vieux messages lui restent fermés.
 */

/**
 * Ce qu'un client doit recevoir pour afficher une entrée de liste de
 * conversations sans second appel : les champs de rendu de base (titre,
 * avatar, effectif, dernière activité) et le régime d'écriture/chiffrement
 * dont dépend l'UI du composer. Le contenu du dernier message n'est PAS
 * dupliqué ici — la collection `messages` du même appel `/sync` le porte déjà
 * (voir la note de partage du budget, `routes/sync/budget.ts`).
 */
export const syncConversationSelect = Prisma.validator<Prisma.ConversationSelect>()({
  id: true,
  identifier: true,
  type: true,
  title: true,
  description: true,
  avatar: true,
  banner: true,
  communityId: true,
  isActive: true,
  closedAt: true,
  memberCount: true,
  lastMessageAt: true,
  defaultWriteRole: true,
  isAnnouncementChannel: true,
  slowModeSeconds: true,
  encryptionMode: true,
  encryptionProtocol: true,
  autoTranslateEnabled: true,
  createdAt: true,
  updatedAt: true,
});

type SyncConversation = Prisma.ConversationGetPayload<{ select: typeof syncConversationSelect }>;

/** Clés relevées mécaniquement depuis `syncConversationSelect` — aucune ligne
 *  de plus, aucune de moins. */
const syncConversationSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    identifier: { type: 'string' },
    type: { type: 'string' },
    title: { type: 'string', nullable: true },
    description: { type: 'string', nullable: true },
    avatar: { type: 'string', nullable: true },
    banner: { type: 'string', nullable: true },
    communityId: { type: 'string', nullable: true },
    isActive: { type: 'boolean' },
    closedAt: { type: 'string', format: 'date-time', nullable: true },
    memberCount: { type: 'integer' },
    lastMessageAt: { type: 'string', format: 'date-time' },
    defaultWriteRole: { type: 'string' },
    isAnnouncementChannel: { type: 'boolean' },
    slowModeSeconds: { type: 'integer' },
    encryptionMode: { type: 'string', nullable: true },
    encryptionProtocol: { type: 'string', nullable: true },
    autoTranslateEnabled: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const syncConversationCollectionSchema = makeSyncCollectionSchema(syncConversationSchema);

/**
 * Le stream `deleted` de `conversations` — et il ne signifie PAS « la ligne
 * `Conversation` a été supprimée » (elle ne l'est, en pratique, jamais : les
 * écrivains du dépôt CLÔTURENT via `closedAt`, ils ne suppriment pas la
 * ligne). Il signifie « CETTE conversation vient de quitter la LISTE du
 * lecteur » — parce qu'il l'a quittée, en a été banni, ou l'a effacée pour
 * lui — exactement le geste qu'un client doit traduire par « retirer
 * l'entrée de ma liste locale ».
 *
 * D'où une requête DISTINCTE de `resolveSyncMembership` : celle-ci filtre
 * `isActive: true` (« où suis-je encore ? ») quand ce stream veut l'INVERSE —
 * les lignes `Participant` du lecteur qui viennent de porter `leftAt`,
 * `bannedAt` ou `deletedForMe`, trois raisons de départ INDÉPENDANTES qui
 * n'ont pas de colonne `updatedAt` commune à trier. La pagination reste donc
 * volontairement simple (tri en mémoire par le plus tardif des trois, borné
 * par `cap`) : un compte quitte rarement des milliers de conversations à la
 * même fenêtre de rattrapage, contrairement aux messages.
 */
async function syncConversationDepartures(opts: {
  prisma: FastifyInstance['prisma'];
  identity: SyncIdentity;
  sinceDate: Date;
  scope?: string;
  cap: number;
  cursor?: CursorKey;
}): Promise<{ tombstones: Array<{ id: string; conversationId: string; deletedAt: Date }>; truncated: boolean; nextKey: CursorKey | undefined }> {
  const { prisma, identity, sinceDate, scope, cap, cursor } = opts;
  const floor = cursor ? new Date(cursor.u) : sinceDate;

  // Trois colonnes indépendantes peuvent porter le départ ; chacune a besoin de
  // SON propre couple (`gt`) / (`eq` + tiebreak `id`) — même patron que le
  // keyset `(updatedAt, id)` des messages, répété trois fois plutôt que
  // factorisé sur une colonne calculée que Mongo n'a pas. Sans le tiebreak, un
  // lot qui bannit N participants à la MÊME milliseconde (une action de
  // modération groupée) ferait sauter tout ce qui suit le premier de la page —
  // exactement le trou qu'un tri sur `updatedAt` seul ferait sur les messages.
  const rows = await prisma.participant.findMany({
    where: {
      ...(identity.kind === 'anonymous' ? { id: identity.participantId } : { userId: identity.userId }),
      ...(scope ? { conversationId: scope } : {}),
      OR: [
        { leftAt: { gt: floor } },
        { bannedAt: { gt: floor } },
        { deletedForMe: { gt: floor } },
        ...(cursor
          ? [
              { leftAt: floor, id: { gt: cursor.i } },
              { bannedAt: floor, id: { gt: cursor.i } },
              { deletedForMe: floor, id: { gt: cursor.i } },
            ]
          : []),
      ],
    },
    select: { id: true, conversationId: true, leftAt: true, bannedAt: true, deletedForMe: true },
    // Aucun tri composite DB n'est possible sur trois colonnes nullables
    // indépendantes (le keyset de `messages` trie SUR la colonne qu'il filtre ;
    // ici la clé de tri — le plus tardif des trois — est CALCULÉE). Le tri et
    // la coupe à `cap` se font donc en mémoire, après lecture. Cette borne
    // défensive protège seulement contre un compte pathologique : à la
    // différence des messages, le nombre de conversations qu'un compte a pu
    // quitter est borné par son historique d'appartenance, pas par le trafic —
    // aucun témoin de ce lot n'a mesuré le besoin d'une pagination exacte ici.
    take: MAX_ITEMS_PER_COLLECTION * 10,
  });

  const withDepartedAt = rows
    .map((row) => {
      const dates = [row.leftAt, row.bannedAt, row.deletedForMe].filter((d): d is Date => d !== null);
      const departedAt = dates.reduce((latest, d) => (d > latest ? d : latest), dates[0] as Date);
      return { id: row.conversationId, conversationId: row.conversationId, deletedAt: departedAt, cursorId: row.id };
    })
    .sort((a, b) => a.deletedAt.getTime() - b.deletedAt.getTime() || a.cursorId.localeCompare(b.cursorId));

  const truncated = withDepartedAt.length > cap;
  const page = truncated ? withDepartedAt.slice(0, cap) : withDepartedAt;
  const last = page[page.length - 1];

  return {
    tombstones: page.map(({ id, conversationId, deletedAt }) => ({ id, conversationId, deletedAt })),
    truncated,
    nextKey: last ? { u: last.deletedAt.toISOString(), i: last.cursorId } : cursor,
  };
}

export async function syncConversations(opts: {
  prisma: FastifyInstance['prisma'];
  identity: SyncIdentity;
  sinceDate: Date;
  cap: number;
  scope?: string;
  cursor?: SyncCursor;
}): Promise<SyncCollectionResult<Record<string, unknown>>> {
  const { prisma, identity, sinceDate, cap, scope, cursor } = opts;

  const membership = await resolveSyncMembership({ prisma, identity, scope });

  // Même quand l'appelant n'appartient plus à AUCUNE conversation active, ses
  // départs récents restent à annoncer — un client qui vient de tout quitter
  // doit encore recevoir les tombstones qui vident sa liste locale.
  const departures = await syncConversationDepartures({
    prisma, identity, sinceDate, scope, cap, cursor: cursor?.d,
  });

  if (membership.conversationIds.length === 0) {
    // Aucune conversation active — soit l'appelant n'en a AUCUNE, soit toutes
    // ont dû être retirées faute de plancher lisible (`droppedCount > 0`,
    // même posture que `syncMessages`). Le flux `deleted`, lui, reste
    // interrogé : un compte qui vient de tout quitter doit encore recevoir
    // les tombstones qui vident sa liste locale.
    const truncated = membership.droppedCount > 0 || departures.truncated;
    const nextKey: Record<string, CursorKey> = {};
    if (cursor?.c) nextKey.c = cursor.c; // rien de neuf sur `changed` : la position entrante est conservée
    if (departures.nextKey) nextKey.d = departures.nextKey;
    return {
      added: [],
      modified: [],
      deleted: departures.tombstones,
      truncated,
      nextCursor: truncated ? encodeSyncCursor(nextKey) : null,
    };
  }
  const { conversationIds } = membership;

  const changedRows = await prisma.conversation.findMany({
    where: {
      id: { in: [...conversationIds] },
      ...(cursor?.c
        ? {
            OR: [
              { updatedAt: { gt: new Date(cursor.c.u) } },
              { updatedAt: new Date(cursor.c.u), id: { gt: cursor.c.i } },
            ],
          }
        : { updatedAt: { gt: sinceDate } }),
    },
    select: syncConversationSelect,
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    take: cap + 1,
  });
  const capTruncated = changedRows.length > cap;
  const cappedRows = capTruncated ? changedRows.slice(0, cap) : changedRows;

  const budgeted = trimToByteBudget(cappedRows, SYNC_MAX_PAGE_BYTES);
  const changedPage = budgeted.page;
  const changedTruncated = capTruncated || budgeted.truncated;

  const added = changedPage.filter((c) => c.createdAt > sinceDate) as unknown as Record<string, unknown>[];
  const modified = changedPage.filter((c) => c.createdAt <= sinceDate) as unknown as Record<string, unknown>[];

  const lastChanged = changedPage[changedPage.length - 1] as SyncConversation | undefined;
  const cKey: CursorKey | undefined = lastChanged
    ? { u: lastChanged.updatedAt.toISOString(), i: lastChanged.id }
    : cursor?.c;

  const truncated = changedTruncated || membership.droppedCount > 0 || departures.truncated;

  const nextKey: Record<string, CursorKey> = {};
  if (cKey) nextKey.c = cKey;
  if (departures.nextKey) nextKey.d = departures.nextKey;
  const nextCursor = truncated ? encodeSyncCursor(nextKey) : null;

  return { added, modified, deleted: departures.tombstones, truncated, nextCursor };
}
