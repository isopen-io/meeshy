import type { FastifyInstance } from 'fastify';
import { Prisma } from '@meeshy/shared/prisma/client';
import { conversationParticipantSchema } from '@meeshy/shared/types/api-schemas';
import { serializeConversationParticipant } from '@meeshy/shared/utils/participant-helpers';
import type { UnifiedAuthContext } from '../../middleware/auth';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import { presenceFor, viewerFromAuthContext } from '../users/presence-gate';
import type { CursorKey, SyncCursor } from './cursor';
import { encodeSyncCursor } from './cursor';
import type { SyncIdentity } from './identity';
import { resolveSyncMembership } from './membership';
import { trimToByteBudget, SYNC_MAX_PAGE_BYTES } from './budget';
import { makeSyncCollectionSchema, type SyncCollectionResult } from './schema-shared';
import { selectForFields, restrictFields, type ColumnPlan, type FieldSet } from '../../utils/sparse-fieldset';

/**
 * Collection `participants` de `/sync` (issue #4171, critère 1) — le ROSTER
 * des conversations du lecteur (qui y est, pas seulement lui), pour que le
 * trombinoscope se rattrape sans un appel par conversation.
 *
 * ## `Participant` n'a NI `createdAt` NI `updatedAt` — `modified` est vide par construction
 *
 * Contrairement à `Message`/`Reaction`/`Conversation`, le modèle `Participant`
 * (schema.prisma, INTERDIT à ce lot) ne porte aucune horloge de ligne. `joinedAt`
 * est la seule date fiable, et elle ne bouge jamais après l'écriture — elle
 * joue le rôle de `createdAt` pour `added`, mais il n'existe RIEN pour détecter
 * qu'un rang, un pseudo ou une permission a changé depuis `since`. La FORME de
 * la collection reste complète (comme les trois autres), mais `modified` y est
 * structurellement vide — documenté, repris en suivi (`restant`) plutôt que
 * masqué : ajouter un `updatedAt` à `Participant` est un changement de schéma,
 * hors де ce lot.
 *
 * ## La présence d'un TIERS traverse la loi, jamais le rang Prisma brut
 *
 * Cette collection sert le profil d'AUTRUI (les autres participants de mes
 * conversations) — la règle du dépôt est absolue ici (`services/gateway/CLAUDE.md`
 * § « Toute porte qui sort un profil de TIERS filtre sa présence ») :
 * `isOnline`/`lastActiveAt` ne sortent qu'à travers `PresenceVisibilityService`,
 * jamais depuis la colonne. `serializeConversationParticipant` est la fabrique
 * canonique (même celle que `GET /conversations/:id/participants`) : elle ferme
 * la fuite PAR CONSTRUCTION — sans `options.presence` fourni, elle sert
 * `isOnline:false`/`lastActiveAt:null`, jamais la colonne.
 */

export const syncParticipantSelect = Prisma.validator<Prisma.ParticipantSelect>()({
  id: true,
  conversationId: true,
  userId: true,
  type: true,
  displayName: true,
  avatar: true,
  role: true,
  language: true,
  isActive: true,
  isOnline: true,
  lastActiveAt: true,
  joinedAt: true,
  permissions: true,
  user: {
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      displayName: true,
      avatar: true,
      role: true,
      systemLanguage: true,
      regionalLanguage: true,
      customDestinationLanguage: true,
      createdAt: true,
      updatedAt: true,
    },
  },
});

type SyncParticipantRow = Prisma.ParticipantGetPayload<{ select: typeof syncParticipantSelect }>;

/**
 * Ce que `?fields=participants.…` peut nommer (#4173) — et pourquoi cette liste
 * ne peut PAS être relevée sur le `select`.
 *
 * La ligne servie par cette collection est FABRIQUÉE
 * (`serializeConversationParticipant`) : ses clés ne sont pas les colonnes de
 * `Participant`. `username` vient de `user.username` avec repli sur
 * `displayName` ; `role` est le rôle PLATEFORME (`user.role`) quand
 * `conversationRole` est le rang dans la conversation (`Participant.role`) — la
 * fabrique existe précisément parce que confondre les deux avait servi
 * `member` là où le contrat promet `USER`. Le vocabulaire est donc celui du
 * FIL, et le plan ci-dessous traduit chaque clé en colonnes.
 */
export const SYNC_PARTICIPANT_SERVED_FIELDS = [
  'id',
  'participantId',
  'conversationId',
  'userId',
  'type',
  'username',
  'firstName',
  'lastName',
  'displayName',
  'avatar',
  'role',
  'conversationRole',
  'joinedAt',
  'isOnline',
  'lastActiveAt',
  'systemLanguage',
  'regionalLanguage',
  'customDestinationLanguage',
  'autoTranslateEnabled',
  'isActive',
  'createdAt',
  'updatedAt',
  'isAnonymous',
  'canSendMessages',
  'canSendFiles',
  'canSendImages',
  'permissions',
] as const;

/**
 * Le coût en colonnes de chaque clé servie.
 *
 * Trois familles s'y lisent, et la troisième est celle qui justifie la carte :
 *
 * - les clés qui portent le nom de leur colonne (`type`, `displayName`,
 *   `avatar`, `isActive`, `lastActiveAt`…) sont absentes de la carte — elles se
 *   produisent elles-mêmes ;
 * - les clés qui viennent de la JOINTURE `user` la nomment, et la nommer une
 *   fois suffit : demander `username` et `systemLanguage` ensemble n'ouvre la
 *   relation qu'une fois, n'en demander aucune ne l'ouvre pas ;
 * - `autoTranslateEnabled` ne coûte AUCUNE colonne — la fabrique l'écrit en
 *   dur. Le tableau vide est ce qui le déclare, plutôt que de laisser croire à
 *   une colonne qui n'existe pas.
 *
 * `isOnline` / `lastActiveAt` sont bien PROJETABLES : leur omission ne peut que
 * MASQUER (la fabrique sert `false` / `null` sans colonne), jamais révéler. La
 * loi de présence, elle, reste hors de portée du paramètre — elle s'exécute
 * inconditionnellement plus bas.
 */
export const syncParticipantPlan: ColumnPlan<typeof syncParticipantSelect> = {
  full: syncParticipantSelect,
  // `id` + `joinedAt` portent le keyset (`joinedAt` est la SEULE horloge de
  // `Participant`) ; `conversationId` route la ligne ; `userId` est la CIBLE que
  // la loi de présence interroge — une garde ne dépend pas d'un paramètre
  // d'appelant.
  pinned: ['id', 'conversationId', 'userId', 'joinedAt'],
  columns: {
    participantId: ['id'],
    username: ['user', 'displayName'],
    firstName: ['user', 'displayName'],
    lastName: ['user'],
    avatar: ['avatar', 'user'],
    role: ['user'],
    conversationRole: ['role'],
    systemLanguage: ['user', 'language'],
    regionalLanguage: ['user', 'language'],
    customDestinationLanguage: ['user', 'language'],
    createdAt: ['user', 'joinedAt'],
    updatedAt: ['user', 'joinedAt'],
    isAnonymous: ['type'],
    canSendMessages: ['permissions'],
    canSendFiles: ['permissions'],
    canSendImages: ['permissions'],
    permissions: ['user'],
    autoTranslateEnabled: [],
  },
};

/** `id` et `conversationId` — sans le second, une ligne de roster ne dit pas de
 *  quelle conversation elle parle, et un roster multi-conversations devient
 *  illisible. */
const SYNC_PARTICIPANT_SERVED_PINNED = ['id', 'conversationId'] as const;

/**
 * `conversationParticipantSchema` (déclare exactement ce que
 * `serializeConversationParticipant` produit) plus `conversationId`, le seul
 * champ que ce lot ajoute par-dessus — un ROSTER multi-conversations doit dire
 * à quelle conversation appartient chaque ligne, ce qu'un appel scoppé à une
 * seule conversation n'a pas besoin de répéter.
 */
const syncParticipantSchema = {
  type: 'object',
  properties: {
    ...conversationParticipantSchema.properties,
    conversationId: { type: 'string' },
  },
} as const;

export const syncParticipantCollectionSchema = makeSyncCollectionSchema(syncParticipantSchema);

/** Même borne défensive que `conversations.ts` — pas de tri composite DB
 *  possible sur deux colonnes nullables indépendantes. */
const MAX_ITEMS_PER_COLLECTION_SAFETY = 10_000;

/**
 * Départs du ROSTER (pas de la liste personnelle — voir `conversations.ts`
 * pour son pendant « je quitte MA liste ») : `leftAt`/`bannedAt` d'un
 * participant, quel qu'il soit, dans une conversation du lecteur.
 * `deletedForMe` n'entre PAS ici — c'est une préférence personnelle de CELUI
 * qui l'a posée sur SA propre visibilité de conversation, sans rapport avec
 * le roster que les AUTRES participants voient.
 */
async function syncParticipantDepartures(opts: {
  prisma: FastifyInstance['prisma'];
  conversationIds: readonly string[];
  sinceDate: Date;
  cap: number;
  cursor?: CursorKey;
}): Promise<{ tombstones: Array<{ id: string; conversationId: string; deletedAt: Date }>; truncated: boolean; nextKey: CursorKey | undefined }> {
  const { prisma, conversationIds, sinceDate, cap, cursor } = opts;
  const floor = cursor ? new Date(cursor.u) : sinceDate;

  const rows = await prisma.participant.findMany({
    where: {
      conversationId: { in: [...conversationIds] },
      OR: [
        { leftAt: { gt: floor } },
        { bannedAt: { gt: floor } },
        ...(cursor ? [{ leftAt: floor, id: { gt: cursor.i } }, { bannedAt: floor, id: { gt: cursor.i } }] : []),
      ],
    },
    select: { id: true, conversationId: true, leftAt: true, bannedAt: true },
    take: MAX_ITEMS_PER_COLLECTION_SAFETY,
  });

  const withDepartedAt = rows
    .map((row) => {
      const dates = [row.leftAt, row.bannedAt].filter((d): d is Date => d !== null);
      const departedAt = dates.reduce((latest, d) => (d > latest ? d : latest), dates[0] as Date);
      return { id: row.id, conversationId: row.conversationId, deletedAt: departedAt };
    })
    .sort((a, b) => a.deletedAt.getTime() - b.deletedAt.getTime() || a.id.localeCompare(b.id));

  const truncated = withDepartedAt.length > cap;
  const page = truncated ? withDepartedAt.slice(0, cap) : withDepartedAt;
  const last = page[page.length - 1];

  return { tombstones: page, truncated, nextKey: last ? { u: last.deletedAt.toISOString(), i: last.id } : cursor };
}

export async function syncParticipants(opts: {
  prisma: FastifyInstance['prisma'];
  identity: SyncIdentity;
  authContext: Pick<UnifiedAuthContext, 'type' | 'userId' | 'registeredUser'>;
  sinceDate: Date;
  cap: number;
  scope?: string;
  cursor?: SyncCursor;
  /** `?fields=participants.…` déjà analysé — `null` ⇒ le profil par défaut. */
  fields?: FieldSet;
}): Promise<SyncCollectionResult<Record<string, unknown>>> {
  const { prisma, identity, authContext, sinceDate, cap, scope, cursor } = opts;
  const fields = opts.fields ?? null;

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
  const { conversationIds } = membership;

  const departures = await syncParticipantDepartures({
    prisma, conversationIds, sinceDate, cap, cursor: cursor?.d,
  });

  // Roster ACTUEL — `joinedAt` joue le rôle de `createdAt`, seule horloge que
  // `Participant` porte (voir le docblock ci-dessus). `isActive: true` : un
  // participant parti est annoncé par `departures`, pas ici.
  const changedRows = await prisma.participant.findMany({
    where: {
      conversationId: { in: [...conversationIds] },
      isActive: true,
      ...(cursor?.c
        ? {
            OR: [
              { joinedAt: { gt: new Date(cursor.c.u) } },
              { joinedAt: new Date(cursor.c.u), id: { gt: cursor.c.i } },
            ],
          }
        : { joinedAt: { gt: sinceDate } }),
    },
    select: selectForFields(syncParticipantPlan, fields),
    orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
    take: cap + 1,
  });
  const capTruncated = changedRows.length > cap;
  const cappedRows = capTruncated ? changedRows.slice(0, cap) : changedRows;

  const budgeted = trimToByteBudget(cappedRows, SYNC_MAX_PAGE_BYTES);
  const deliveredRows = budgeted.page;
  const truncated = capTruncated || budgeted.truncated || membership.droppedCount > 0 || departures.truncated;

  // La présence d'un TIERS ne se sert JAMAIS depuis la colonne brute — elle
  // traverse la loi (`services/gateway/CLAUDE.md` § présence). Un viewer
  // anonyme (aucun `User.id`) masque tout : `viewerFromAuthContext` rend
  // `null` pour toute session sans compte, et `presenceFor` applique alors
  // le repli fail-closed de la loi à chaque cible.
  const viewer = viewerFromAuthContext(authContext);
  const targetUserIds = [...new Set(deliveredRows.map((r) => r.userId).filter((id): id is string => !!id))];
  const visibilityByUserId = await getPresenceVisibilityService(prisma).resolveForTargets(viewer, targetUserIds);

  const serialize = (row: SyncParticipantRow): Record<string, unknown> => {
    // `presenceFor` rend déjà exactement la forme que `SerializeParticipantOptions.presence`
    // attend (`{showOnline, showLastSeenTimestamp}`) — même patron que
    // `routes/conversations/participants.ts`, aucune reconstruction locale.
    const served = serializeConversationParticipant(row, {
      presence: presenceFor(viewer, visibilityByUserId, row.userId),
    });
    // La restriction s'applique APRÈS la fabrique — c'est elle qui produit les
    // clés du fil, et la projection porte sur ces clés-là, pas sur les colonnes.
    return restrictFields(
      { ...served, conversationId: row.conversationId },
      fields,
      SYNC_PARTICIPANT_SERVED_PINNED,
    );
  };

  // `joinedAt` étant la SEULE horloge de ligne, tout ce qui a joint après
  // `since` est un AJOUT — il n'existe aucun candidat `modified`.
  const added = deliveredRows.map(serialize);
  const modified: Record<string, unknown>[] = [];

  const lastDelivered = deliveredRows[deliveredRows.length - 1];
  const cKey: CursorKey | undefined = lastDelivered
    ? { u: (lastDelivered.joinedAt as Date).toISOString(), i: lastDelivered.id }
    : cursor?.c;

  const nextKey: Record<string, CursorKey> = {};
  if (cKey) nextKey.c = cKey;
  if (departures.nextKey) nextKey.d = departures.nextKey;
  const nextCursor = truncated ? encodeSyncCursor(nextKey) : null;

  return { added, modified, deleted: departures.tombstones, truncated, nextCursor };
}
