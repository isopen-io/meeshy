import type { FastifyInstance } from 'fastify';
import { Prisma } from '@meeshy/shared/prisma/client';
import { attachmentMediaSelect } from '../../services/attachments/attachmentIncludes';
import { messageSenderUserSelect } from '../conversations/utils/message-sender-select';
import { serializeAttachmentForSocket } from '../../socketio/serializeAttachmentForSocket';
import { transformTranslationsToArray, type MessageTranslationJSON } from '../../utils/translation-transformer';
import { messageAttachmentSchema, messageTranslationSchema } from '@meeshy/shared/types/api-schemas';
import { logger } from '../../utils/logger';
import { loadPersonalHistoryHidingByConversation } from '../../services/personalHistoryFilter';
import type { CursorKey, SyncCursor } from './cursor';
import { encodeSyncCursor } from './cursor';
import type { SyncIdentity } from './identity';
import { resolveSyncMembership } from './membership';
import { trimToByteBudget, SYNC_MAX_PAGE_BYTES } from './budget';
import { makeSyncCollectionSchema, type SyncCollectionResult } from './schema-shared';
import { selectForFields, restrictFields, type ColumnPlan, type FieldSet } from '../../utils/sparse-fieldset';

/**
 * Collection `messages` de `/sync` — extrait tel quel de `routes/sync.ts`
 * (issue #4171, critère 5g). Seule l'appartenance + plancher d'historique a
 * bougé (déléguée à `resolveSyncMembership`, § `routes/sync/membership.ts`) ;
 * le reste — select rendable, sérialisation, budget d'octets, keyset,
 * masquage personnel — est INCHANGÉ.
 */

type DeletedRef = { id: string; conversationId: string; deletedAt: Date };

/**
 * Ce que le client DOIT recevoir pour pouvoir écrire une ligne rendable dans sa
 * base locale.
 *
 * Le select de `/sync` s'est longtemps limité à six champs (`id`,
 * `conversationId`, `senderId`, `content`, `createdAt`, `updatedAt`). Un client
 * qui appliquerait `added`/`modified` sur cette base écrirait des lignes qu'il
 * ne peut pas afficher : sans `translations` ni `originalLanguage`, la
 * résolution du Prisme Linguistique n'a RIEN à résoudre et le message
 * s'affiche dans la langue de l'expéditeur ; sans `attachments`, la bulle perd
 * sa pièce jointe ; sans `clientMessageId`, la réconciliation optimiste ne peut
 * pas apparier sa ligne et duplique la bulle.
 *
 * Cette liste est le contrat, et le témoin de forme l'oppose au select réel :
 * une projection amaigrie pour économiser de la bande passante doit d'abord
 * faire rougir un test plutôt que rendre le rattrapage inapplicable en silence.
 */
export const SYNC_MESSAGE_RENDERABLE_KEYS = [
  'id',
  'conversationId',
  'senderId',
  'content',
  'clientMessageId',
  'originalLanguage',
  'translations',
  'messageType',
  'metadata',
  'isEdited',
  'editedAt',
  'replyToId',
  'reactionSummary',
  'reactionCount',
  'attachments',
  'sender',
  'createdAt',
  'updatedAt',
] as const;

/**
 * Projection du stream `changed`. `Prisma.validator` fait échouer le BUILD sur
 * un nom de champ périmé, là où un objet nu échouerait à l'exécution.
 *
 * `attachments` et le bloc `user` de l'expéditeur reprennent les formes
 * canoniques du dépôt (`attachmentMediaSelect`, `messageSenderUserSelect`)
 * plutôt que d'en recopier une variante — c'est exactement la dérive que
 * `attachmentIncludes.ts` documente en tête de fichier.
 */
export const syncMessageSelect = Prisma.validator<Prisma.MessageSelect>()({
  id: true,
  conversationId: true,
  senderId: true,
  content: true,
  clientMessageId: true,
  originalLanguage: true,
  translations: true,
  messageType: true,
  messageSource: true,
  metadata: true,
  isEdited: true,
  editedAt: true,
  replyToId: true,
  reactionSummary: true,
  reactionCount: true,
  validatedMentions: true,
  createdAt: true,
  updatedAt: true,
  attachments: { select: attachmentMediaSelect },
  sender: {
    select: {
      id: true,
      userId: true,
      displayName: true,
      avatar: true,
      type: true,
      role: true,
      language: true,
      user: { select: messageSenderUserSelect },
    },
  },
});

type SyncMessage = Prisma.MessageGetPayload<{ select: typeof syncMessageSelect }>;

/**
 * Ce que `?fields=messages.…` peut nommer (#4173).
 *
 * Le vocabulaire est FERMÉ et se lit MÉCANIQUEMENT depuis `syncMessageSelect` :
 * une clé ajoutée au select devient demandable le même jour, et aucune clé
 * demandable ne peut désigner une colonne que le select ne déclare pas — c'est
 * ce que `selectForFields` garantit en PROJETANT le littéral plutôt qu'en
 * recomposant un `select` neuf.
 */
export const SYNC_MESSAGE_SERVED_FIELDS = Object.keys(syncMessageSelect) as readonly string[];

/**
 * Les colonnes ÉPINGLÉES de `messages`, et ce que chacune tient.
 *
 * Aucune n'est là pour le confort du client : ce sont les quatre colonnes dont
 * la MÉCANIQUE de la page dépend, et qu'un `?fields=` ne peut donc pas retirer
 * sans casser le rattrapage lui-même.
 *
 * - `id` + `updatedAt` — la position keyset `(updatedAt, id)` d'où repart le
 *   curseur. Sans elles, `nextCursor` désignerait une position que la page n'a
 *   pas ; le rattrapage ne progresserait plus.
 * - `createdAt` — le partage `added` / `modified`, décidé ligne à ligne par
 *   comparaison au watermark. Une ligne sans elle tomberait toujours du même
 *   côté.
 * - `conversationId` — le masquage PERSONNEL (`clear-history`,
 *   `delete-for-me`) se résout par conversation. Une garde qui dépendrait d'un
 *   paramètre d'appelant n'en serait plus une : l'omettre lèverait le masquage.
 */
const SYNC_MESSAGE_PINNED = ['id', 'conversationId', 'createdAt', 'updatedAt'] as const;

export const syncMessagePlan: ColumnPlan<typeof syncMessageSelect> = {
  full: syncMessageSelect,
  pinned: [...SYNC_MESSAGE_PINNED],
};

/**
 * Ce qui survit à la projection dans la ligne SERVIE.
 *
 * `id` et `conversationId` seulement — deux clés de ROUTAGE, sans lesquelles le
 * client ne sait ni quelle bulle il écrit ni dans quel fil. Les deux horloges
 * épinglées au `select` n'y figurent pas : elles servent la MÉCANIQUE de la
 * page (keyset, partage added/modified), pas le client, et les servir sans
 * qu'il les demande serait rendre la projection décorative sur les deux champs
 * les plus fréquents d'une ligne de rattrapage.
 */
const SYNC_MESSAGE_SERVED_PINNED = ['id', 'conversationId'] as const;

/**
 * Ce que la ligne Prisma devient sur le fil.
 *
 * Deux champs du `select` ne portent PAS, en base, la forme que les clients
 * décodent — et aucun des deux n'est une particularité de `/sync` : ce sont les
 * deux transformations que tout transport de message applique déjà, ici
 * réemployées plutôt que recopiées.
 *
 * 1. **`translations` est une CARTE en base** (`Json?`, « map: langue →
 *    données ») et un TABLEAU dans le contrat. `transformTranslationsToArray`
 *    est le sérialiseur du dépôt pour ce passage — le même que la liste de
 *    messages, l'édition, la suppression et le chemin ZMQ.
 *
 * 2. **`attachments[].reactions` est la relation BRUTE** (`{emoji,
 *    participantId}`) que `attachmentMediaSelect` charge, quand le contrat de
 *    fil est `reactionSummary` + `currentUserReactions`.
 *    `serializeAttachmentForSocket` miroite exactement ce select et fait
 *    l'agrégation.
 *
 * `readerParticipantId` est l'id du lecteur DANS CETTE conversation, et pas un
 * id global : `Participant` est une ligne par conversation.
 */
function serializeSyncMessage(
  message: SyncMessage,
  readerParticipantId: string | undefined,
): Record<string, unknown> {
  // `translations` et `attachments` sont des colonnes PROJETABLES depuis
  // #4173 : une projection qui ne les nomme pas les laisse absentes de la
  // ligne. Les deux transformations ne s'appliquent donc qu'à ce qui est là —
  // et un champ absent reste ABSENT de la charge, jamais reconstruit en tableau
  // vide, qui affirmerait « ce message n'a ni traduction ni pièce jointe ».
  const brut = message as Partial<SyncMessage>;
  return {
    ...message,
    ...(brut.translations === undefined
      ? {}
      : {
          translations: transformTranslationsToArray(
            message.id,
            brut.translations as unknown as Record<string, MessageTranslationJSON> | null,
          ),
        }),
    ...(brut.attachments === undefined
      ? {}
      : {
          attachments: brut.attachments.map((attachment) =>
            serializeAttachmentForSocket(
              attachment as unknown as Record<string, unknown>,
              readerParticipantId,
            ),
          ),
        }),
  };
}

/**
 * Le message tel qu'il part — composé depuis les schémas canoniques du dépôt,
 * jamais depuis une variante recopiée. Les clés sont relevées mécaniquement
 * depuis `syncMessageSelect` ; seules les FEUILLES reprennent les schémas
 * partagés.
 */
const syncMessageSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    conversationId: { type: 'string' },
    senderId: { type: 'string', nullable: true },
    content: { type: 'string' },
    clientMessageId: { type: 'string', nullable: true },
    originalLanguage: { type: 'string' },
    translations: { type: 'array', items: messageTranslationSchema },
    messageType: { type: 'string' },
    messageSource: { type: 'string' },
    // `additionalProperties: true` — sans lui, fast-json-stringify vide le
    // contenu de l'objet en SILENCE (même piège que `messageSchema.metadata`).
    metadata: { type: 'object', nullable: true, additionalProperties: true },
    isEdited: { type: 'boolean' },
    editedAt: { type: 'string', format: 'date-time', nullable: true },
    replyToId: { type: 'string', nullable: true },
    reactionSummary: { type: 'object', nullable: true, additionalProperties: true },
    reactionCount: { type: 'integer' },
    validatedMentions: { type: 'array', items: { type: 'string' } },
    attachments: { type: 'array', items: messageAttachmentSchema },
    sender: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        userId: { type: 'string', nullable: true },
        displayName: { type: 'string', nullable: true },
        avatar: { type: 'string', nullable: true },
        type: { type: 'string' },
        role: { type: 'string', nullable: true },
        language: { type: 'string', nullable: true },
        user: {
          type: 'object',
          nullable: true,
          properties: {
            id: { type: 'string' },
            username: { type: 'string' },
            displayName: { type: 'string', nullable: true },
            avatar: { type: 'string', nullable: true },
          },
        },
      },
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const syncMessageCollectionSchema = makeSyncCollectionSchema(syncMessageSchema);

/**
 * Le stream des disparitions PERSONNELLES — `UserMessageDeletion`, c'est-à-dire
 * « supprimer pour moi ».
 *
 * Pourquoi un TROISIÈME stream et pas un `where` de plus. Le stream `changed`
 * applique déjà le masquage : un message masqué en est simplement RETIRÉ. Or un
 * retrait ne dit rien. Le client qui détient déjà la bulle ne re-lit pas la
 * fenêtre où elle n'apparaît plus ; il ne la re-lit jamais, et la bulle reste.
 *
 * Deux détails que le tri et la pagination rendent non négociables :
 *
 * - **La table interrogée n'est pas `Message`.** Un `delete-for-me` n'écrit QUE
 *   la ligne `UserMessageDeletion` ; `Message.updatedAt` ne bouge pas.
 * - **L'id SERVI et l'id du CURSEUR sont deux ids différents.** Le client
 *   indexe par message, donc la tombstone porte `messageId`. Le keyset, lui,
 *   ordonne les lignes de `UserMessageDeletion` et doit donc départager par
 *   l'id de CETTE table.
 */
async function syncHiddenTombstones(opts: {
  prisma: FastifyInstance['prisma'];
  userId: string;
  sinceDate: Date;
  conversationIds: readonly string[];
  cap: number;
  cursor?: CursorKey;
}): Promise<{ tombstones: DeletedRef[]; truncated: boolean; nextKey: CursorKey | undefined }> {
  const { prisma, userId, sinceDate, conversationIds, cap, cursor } = opts;

  try {
    const rows = await prisma.userMessageDeletion.findMany({
      where: {
        userId,
        message: { conversationId: { in: [...conversationIds] } },
        ...(cursor
          ? {
              OR: [
                { deletedAt: { gt: new Date(cursor.u) } },
                { deletedAt: new Date(cursor.u), id: { gt: cursor.i } },
              ],
            }
          : { deletedAt: { gt: sinceDate } }),
      },
      select: {
        id: true,
        deletedAt: true,
        messageId: true,
        message: { select: { conversationId: true } },
      },
      orderBy: [{ deletedAt: 'asc' }, { id: 'asc' }],
      take: cap + 1,
    });

    const truncated = rows.length > cap;
    const page = truncated ? rows.slice(0, cap) : rows;
    const last = page[page.length - 1];

    return {
      tombstones: page.map((row) => ({
        id: row.messageId,
        conversationId: row.message.conversationId,
        deletedAt: row.deletedAt,
      })),
      truncated,
      nextKey: last ? { u: last.deletedAt.toISOString(), i: last.id } : cursor,
    };
  } catch (error) {
    // Même posture que les tombstones de la liste de conversations : servir le
    // rattrapage reste le produit, en retirer une bulle est une courtoisie. On
    // ne fait donc PAS échouer `/sync` — on rend « je ne peux pas affirmer
    // l'exhaustivité » (`truncated`), et le curseur reste où il était pour que
    // la reprise ne saute rien.
    logger.warn('[sync] personal hiding tombstones unavailable, page announced truncated', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { tombstones: [], truncated: true, nextKey: cursor };
  }
}

export async function syncMessages(opts: {
  prisma: FastifyInstance['prisma'];
  identity: SyncIdentity;
  sinceDate: Date;
  cap: number;
  scope?: string;
  cursor?: SyncCursor;
  /** `?fields=messages.…` déjà analysé — `null` ⇒ le profil par défaut, RENDABLE. */
  fields?: FieldSet;
}): Promise<SyncCollectionResult<Record<string, unknown>>> {
  const { prisma, identity, sinceDate, cap, scope, cursor } = opts;
  const fields = opts.fields ?? null;

  // Appartenance + plancher d'historique : § `routes/sync/membership.ts`. Les
  // deux cas d'absence de couverture (aucune conversation du tout ; toutes
  // retirées faute de plancher lisible) se distinguent par `droppedCount`,
  // exactement comme avant l'extraction — voir son docblock.
  const membership = await resolveSyncMembership({ prisma, identity, scope });
  if (membership.conversationIds.length === 0) {
    return {
      added: [],
      modified: [],
      deleted: [],
      truncated: membership.droppedCount > 0,
      nextCursor: membership.droppedCount > 0 ? encodeSyncCursor(cursor ?? {}) : null,
    };
  }
  const { conversationIds, historyFloor, memberships } = membership;

  // CHANGED — non supprimés modifiés depuis `since`. Keyset `(updatedAt, id)` :
  // à la 1re page on part du floor `since` ; ensuite on reprend STRICTEMENT après
  // la position du cursor (le tiebreaker `id` évite trou/doublon sur updatedAt égal).
  const changedRows = await prisma.message.findMany({
    where: {
      conversationId: { in: [...conversationIds] },
      deletedAt: null,
      ...historyFloor,
      ...(cursor?.c
        ? {
            OR: [
              { updatedAt: { gt: new Date(cursor.c.u) } },
              { updatedAt: new Date(cursor.c.u), id: { gt: cursor.c.i } },
            ],
          }
        : { updatedAt: { gt: sinceDate } }),
    },
    select: selectForFields(syncMessagePlan, fields),
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    take: cap + 1,
  });
  const capTruncated = changedRows.length > cap;
  const cappedRows = capTruncated ? changedRows.slice(0, cap) : changedRows;

  // Le POIDS est le second critère d'arrêt de la page, et il s'applique ICI :
  // après le plafond de lignes (dont `cap + 1` est la sonde), avant le masquage
  // personnel.
  const budgeted = trimToByteBudget(cappedRows, SYNC_MAX_PAGE_BYTES);
  const changedPage = budgeted.page;
  const changedTruncated = capTruncated || budgeted.truncated;

  // Le masquage personnel s'applique APRÈS le keyset, jamais dedans.
  const hidingByConversation = await loadPersonalHistoryHidingByConversation(prisma, {
    userId: identity.kind === 'user' ? identity.userId : null,
    conversationIds,
  });
  const visible = hidingByConversation.size === 0
    ? changedPage
    : changedPage.filter((m) => {
        const hiding = hidingByConversation.get(m.conversationId);
        if (!hiding) return true;
        if (hiding.hiddenMessageIds.includes(m.id)) return false;
        return hiding.clearHistoryBefore === null || m.createdAt >= hiding.clearHistoryBefore;
      });

  // La sérialisation s'applique APRÈS le masquage et APRÈS le budget, sur les
  // seules lignes réellement LIVRÉES.
  const readerParticipantIdByConversation = new Map(
    memberships.map((m) => [m.conversationId, m.id] as const),
  );
  // La restriction s'applique APRÈS la sérialisation, et sur la MÊME liste qui
  // a gouverné le `select` : le `select` décide de ce qu'on LIT, celle-ci de ce
  // qu'on SERT. Les deux passes sont nécessaires — une colonne épinglée est lue
  // sans être forcément demandée, et seule cette seconde passe l'empêche
  // d'élargir la réponse au-delà de ce que l'appelant a nommé.
  const serialize = (m: SyncMessage): Record<string, unknown> =>
    restrictFields(
      serializeSyncMessage(m, readerParticipantIdByConversation.get(m.conversationId)),
      fields,
      SYNC_MESSAGE_SERVED_PINNED,
    );

  // added = créé après `since` ; modified = pré-existant mais modifié.
  const added = visible.filter((m) => m.createdAt > sinceDate).map(serialize);
  const modified = visible.filter((m) => m.createdAt <= sinceDate).map(serialize);

  // DELETED — tombstones supprimés depuis `since`. Même keyset `(deletedAt, id)`
  // avec cap+1. Ce stream n'est PAS soumis au budget d'octets : sa ligne est
  // faite de trois scalaires de taille fixe, donc le plafond de LIGNES y est
  // déjà un plafond de poids.
  const deletedRows = await prisma.message.findMany({
    where: {
      conversationId: { in: [...conversationIds] },
      ...historyFloor,
      ...(cursor?.d
        ? {
            OR: [
              { deletedAt: { gt: new Date(cursor.d.u) } },
              { deletedAt: new Date(cursor.d.u), id: { gt: cursor.d.i } },
            ],
          }
        : { deletedAt: { gt: sinceDate } }),
    },
    select: { id: true, conversationId: true, deletedAt: true },
    orderBy: [{ deletedAt: 'asc' }, { id: 'asc' }],
    take: cap + 1,
  });
  const deletedTruncated = deletedRows.length > cap;
  const deletedPage = deletedTruncated ? deletedRows.slice(0, cap) : deletedRows;
  const globalTombstones: DeletedRef[] = deletedPage.map((d) => ({
    id: d.id,
    conversationId: d.conversationId,
    deletedAt: d.deletedAt as Date,
  }));

  // HIDDEN — disparitions PERSONNELLES. Servies dans le MÊME tableau que les
  // suppressions globales.
  const hidden = identity.kind === 'user'
    ? await syncHiddenTombstones({
        prisma,
        userId: identity.userId,
        sinceDate,
        conversationIds,
        cap,
        cursor: cursor?.h,
      })
    : { tombstones: [] as DeletedRef[], truncated: false, nextKey: cursor?.h };

  // Un message peut être masqué pour moi PUIS supprimé pour tous : il sort des
  // deux streams. Dédupliquer par message évite d'annoncer deux fois la même
  // disparition, la première rencontrée (la plus ancienne après tri) gagnant.
  const seenDeleted = new Set<string>();
  const deleted: DeletedRef[] = [...globalTombstones, ...hidden.tombstones]
    .sort((a, b) => a.deletedAt.getTime() - b.deletedAt.getTime() || a.id.localeCompare(b.id))
    .filter((ref) => {
      if (seenDeleted.has(ref.id)) return false;
      seenDeleted.add(ref.id);
      return true;
    });

  const truncated = changedTruncated || deletedTruncated || hidden.truncated || membership.droppedCount > 0;

  // Report par stream : on avance la clé si cette page a livré des items, sinon
  // on conserve la clé entrante.
  const lastChanged = changedPage[changedPage.length - 1];
  const lastDeleted = deletedPage[deletedPage.length - 1];
  const cKey: CursorKey | undefined = lastChanged
    ? { u: lastChanged.updatedAt.toISOString(), i: lastChanged.id }
    : cursor?.c;
  const dKey: CursorKey | undefined = lastDeleted
    ? { u: (lastDeleted.deletedAt as Date).toISOString(), i: lastDeleted.id }
    : cursor?.d;
  const nextKey: Record<string, CursorKey> = {};
  if (cKey) nextKey.c = cKey;
  if (dKey) nextKey.d = dKey;
  if (hidden.nextKey) nextKey.h = hidden.nextKey;
  const nextCursor = truncated ? encodeSyncCursor(nextKey) : null;

  return { added, modified, deleted, truncated, nextCursor };
}
