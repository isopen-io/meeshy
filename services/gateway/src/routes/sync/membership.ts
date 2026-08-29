import type { FastifyInstance } from 'fastify';
import {
  HISTORY_FLOOR_PARTICIPANT_SELECT,
  historyFloorClause,
  loadHistoryFloorsOrFail,
} from '../../services/historyFloor';
import type { SyncIdentity } from './identity';

/**
 * RLS + plancher d'historique — partagés par les QUATRE collections de
 * `/sync`. Extrait de `syncMessages` (issue #4171, critère 5g) : c'était la
 * SEULE partie de la fonction messages-spécifique qui ne l'était pas —
 * appartenance par conversation, jamais par contenu.
 *
 * `conversationIds` est déjà purgé des conversations dont le plancher est
 * ILLISIBLE (`droppedCount > 0`) : les lire sans borne fuirait, les retirer en
 * silence ferait une page qui se déclare complète à tort (voir le docblock de
 * `SYNC_CHECKPOINT_LAG_MS`, `routes/sync/index.ts`). Chaque collection ajoute
 * donc `droppedCount > 0` à SON `truncated`, exactement comme `syncMessages`
 * le fait déjà pour `messages`.
 *
 * `historyFloor` ne s'applique QU'AUX collections qui exposent du CONTENU de
 * message (`messages`, `reactions` — une réaction référence un message). Le
 * plancher d'un lien sans historique retient le CONTENU écrit avant la
 * jointure, jamais l'EXISTENCE de la conversation ou son effectif : un
 * participant entré par un lien `allowViewHistory:false` voit la conversation
 * elle-même (titre, avatar, effectif) et son roster de participants au complet
 * — seuls les vieux MESSAGES (et les réactions qui s'y accrochent) lui restent
 * fermés. `conversations` et `participants` n'appliquent donc PAS ce plancher,
 * par choix documenté, pas par omission.
 */
export type SyncMembership = {
  /** Participation du lecteur — `id` est SON `Participant.id` par conversation, utile aux collections qui doivent reconnaître « le mien ». */
  readonly memberships: ReadonlyArray<{ readonly id: string; readonly conversationId: string }>;
  /** Conversations dont le plancher a pu être établi — celles à retirer en sont déjà exclues. */
  readonly conversationIds: readonly string[];
  /** Fragment Prisma à étaler dans un `where` de message (ou de sa relation) — `{}` si aucun plancher n'existe. */
  readonly historyFloor: Record<string, unknown>;
  /** > 0 ⇒ au moins une conversation a dû être retirée faute de plancher lisible : la page ne peut pas se déclarer complète. */
  readonly droppedCount: number;
};

export async function resolveSyncMembership(opts: {
  readonly prisma: FastifyInstance['prisma'];
  readonly identity: SyncIdentity;
  readonly scope?: string;
}): Promise<SyncMembership> {
  const { prisma, identity, scope } = opts;

  // RLS : uniquement les conversations où le demandeur est participant actif —
  // par `Participant.userId` pour un compte, par `Participant.id` pour une
  // session anonyme, dont c'est la SEULE clé (son `userId` est null). Le `scope`
  // reste une INTERSECTION dans les deux cas : il rétrécit l'appartenance, il ne
  // la remplace jamais.
  const memberships = await prisma.participant.findMany({
    where: identity.kind === 'anonymous'
      ? { id: identity.participantId, isActive: true, ...(scope ? { conversationId: scope } : {}) }
      : { userId: identity.userId, isActive: true, ...(scope ? { conversationId: scope } : {}) },
    select: {
      id: true,
      conversationId: true,
      ...HISTORY_FLOOR_PARTICIPANT_SELECT,
    },
  });
  if (memberships.length === 0) {
    return { memberships: [], conversationIds: [], historyFloor: {}, droppedCount: 0 };
  }

  // Ce que le lien d'entrée interdit de relire. La lecture est un CONTRÔLE
  // D'ACCÈS : quand elle échoue, les conversations concernées sortent de
  // l'ensemble plutôt que d'être servies sans borne (`loadHistoryFloorsOrFail`
  // retire une conversation ILLISIBLE plutôt que de la servir sans plancher).
  const { floors, unreadableConversationIds } = await loadHistoryFloorsOrFail(prisma, memberships);
  const dropped = new Set(unreadableConversationIds);
  const conversationIds = memberships
    .map((m) => m.conversationId)
    .filter((id) => !dropped.has(id));

  return {
    memberships: memberships.map((m) => ({ id: m.id, conversationId: m.conversationId })),
    conversationIds,
    historyFloor: historyFloorClause(conversationIds, floors),
    droppedCount: dropped.size,
  };
}
