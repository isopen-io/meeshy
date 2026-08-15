import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { logger } from '../../utils/logger';
import {
  applyPersonalHistoryHiding,
  loadPersonalHistoryHidingByUser,
  NO_PERSONAL_HIDING,
} from '../../services/personalHistoryFilter';

/**
 * L'aperçu de ligne de liste POUSSÉ, rendu au masquage personnel de chaque
 * lecteur.
 *
 * `resolveVisibleLastMessage` fait déjà ce travail pour les surfaces de LECTURE
 * (`GET /conversations`, la recherche de conversations). Le fan-out temps réel
 * en était l'angle mort exact : `emitConversationPreviewUpdate` recalcule UN
 * dernier message global (`deletedAt: null` — la pierre tombale du « supprimer
 * pour tous », et rien d'autre) puis le pousse tel quel dans la room
 * personnelle de chaque participant. Le masquage personnel vit dans deux autres
 * tables, qu'aucun `deletedAt` ne croise.
 *
 * Conséquence, à la lettre : un lecteur qui a fait « supprimer pour moi » sur le
 * dernier message voyait ce message REVENIR dans sa ligne de liste à la
 * mutation suivante de la conversation — une édition d'un autre message, une
 * suppression, une traduction qui atterrit. Sa liste réaffichait ce qu'il venait
 * d'en retirer, et le REST lui donnait raison au refetch suivant : les deux
 * moitiés du même produit se contredisaient selon le canal. Même classe pour
 * `clearHistoryBefore` — « effacer l'historique » sur un appareil, puis la ligne
 * qui ressuscite le dernier message d'avant l'effacement.
 *
 * ## Deux temps, parce que la question chaude n'est pas la question complète
 *
 * L'appelant tourne sur le chemin le plus fréquenté du service (chaque
 * traduction qui atterrit le déclenche). La question chaude est étroite — « CE
 * message-ci est-il masqué pour l'un d'eux ? » — et se pose en deux lectures
 * indexées qui ne portent que sur lui :
 *
 *   1. la sonde : `userId IN (…) AND messageId = <l'aperçu>` sur la clé unique
 *      `userId_messageId`, plus les seuls seuils d'effacement POSTÉRIEURS à ce
 *      message. Un lecteur qui n'a rien masqué n'apparaît dans ni l'une ni
 *      l'autre, et la fonction s'arrête là — c'est le cas de l'écrasante
 *      majorité des diffusions ;
 *   2. le repli, payé par les seuls lecteurs concernés : leur masquage COMPLET
 *      (`loadPersonalHistoryHidingByUser`) puis un `findFirst` chacun. Le
 *      masquage complet n'est pas un luxe — masquer les trois derniers messages
 *      est un geste ordinaire, et un repli calculé sur le seul message sondé
 *      rendrait le suivant, masqué lui aussi.
 *
 * C'est la même économie en deux temps que `resolveVisibleLastMessage` énonce
 * pour la liste REST, restatée par LECTEUR au lieu de par conversation.
 *
 * ## Repli OUVERT
 *
 * Ne lève jamais : une sonde en échec rend une carte vide, donc l'aperçu global
 * pour tout le monde — exactement l'état d'avant ce module. Même arbitrage que
 * `loadPersonalHistoryHiding` (« serving unfiltered »), et il vaut a fortiori
 * ici : l'appelant est lui-même un canal best-effort, et faire disparaître la
 * ligne de liste de toute une conversation parce qu'une table de préférences
 * est illisible serait un dégât bien plus grand que l'aperçu qu'on rate.
 */

export interface PersonalPreviewOverridePrisma {
  readonly message: {
    findFirst(args: unknown): Promise<unknown>;
  };
  readonly userMessageDeletion: {
    findMany(args: unknown): Promise<Array<{ userId: string }>>;
  };
  readonly userConversationPreferences: {
    findMany(args: unknown): Promise<Array<{ userId: string }>>;
  };
}

export interface PersonalPreviewOverrideParams {
  readonly conversationId: string;
  /** L'aperçu global recalculé par l'appelant. `null` = plus rien à masquer. */
  readonly latest: { readonly id: string; readonly createdAt: Date } | null;
  /** Les participants INSCRITS : eux seuls possèdent une ligne dans les deux tables. */
  readonly userIds: readonly string[];
  /** La projection de l'appelant, pour que le remplaçant ait exactement sa forme. */
  readonly select: Record<string, unknown>;
}

/**
 * Rend `userId -> son propre dernier message visible`, et NE CONTIENT QUE les
 * lecteurs pour qui l'aperçu global est masqué. Une valeur `null` dit « aucun
 * aperçu à montrer » (historique entièrement effacé), ce qu'un appelant doit
 * distinguer de l'absence de clé — d'où `Map.has`, jamais `Map.get() ?? …`.
 */
export async function resolvePersonalPreviewOverrides<M>(
  prisma: PersonalPreviewOverridePrisma,
  params: PersonalPreviewOverrideParams,
): Promise<Map<string, M | null>> {
  const { conversationId, latest, userIds, select } = params;
  const overrides = new Map<string, M | null>();
  if (!latest || userIds.length === 0) return overrides;

  const ids = [...new Set(userIds)];

  try {
    const [deletions, cutoffs] = await Promise.all([
      prisma.userMessageDeletion.findMany({
        where: { messageId: latest.id, userId: { in: ids } },
        select: { userId: true },
      }),
      prisma.userConversationPreferences.findMany({
        // `applyPersonalHistoryHiding` rend visible un message écrit À
        // l'instant du seuil (`createdAt: { gte: cutoff }`), donc masqué ⟺
        // `createdAt < clearHistoryBefore` ⟺ `clearHistoryBefore > createdAt`.
        // La borne est stricte des deux côtés : la même, énoncée à l'envers.
        where: {
          conversationId,
          userId: { in: ids },
          clearHistoryBefore: { gt: latest.createdAt },
        },
        select: { userId: true },
      }),
    ]);

    const affected = [...new Set([...deletions, ...cutoffs].map((row) => row.userId))];
    if (affected.length === 0) return overrides;

    const hidingByUser = await loadPersonalHistoryHidingByUser(prisma as unknown as PrismaClient, {
      userIds: affected,
      conversationId,
    });

    await Promise.all(
      affected.map(async (userId) => {
        const hiding = hidingByUser.get(userId) ?? NO_PERSONAL_HIDING;
        const replacement = (await prisma.message.findFirst({
          where: applyPersonalHistoryHiding({ conversationId, deletedAt: null }, hiding),
          orderBy: { createdAt: 'desc' },
          select,
        })) as M | null;
        overrides.set(userId, replacement ?? null);
      }),
    );

    return overrides;
  } catch (error) {
    // Rapporté ICI et pas au `onError` de l'appelant : la diffusion n'a pas
    // échoué, elle a dégradé. La remonter comme un échec ferait consigner une
    // erreur d'aperçu à une édition qui a bel et bien servi le sien.
    logger.warn('[personalPreviewOverride] hiding probe failed, pushing the global preview', {
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return new Map();
  }
}
