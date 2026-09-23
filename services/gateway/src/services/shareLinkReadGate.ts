/**
 * LA PORTE de lecture d'une participation entrée par LIEN DE PARTAGE — un lien
 * ÉCHU la ferme.
 *
 * Le lien répond à DEUX questions sur la même ligne, et elles restent séparées
 * (doc-comment de `messages-list.ts`) : la PORTE, ici, et le PLANCHER de
 * lecture, rendu par `historyFloor.ts` — qui dit de lui-même qu'il ne refuse
 * pas un lien expiré. La porte vivait INLINE dans `GET /conversations/:id/messages`,
 * seule surface à la tenir : la liste des favoris de message (#7377) servait
 * donc encore le message vivant d'une conversation dont le fil refusait la
 * lecture (403 `SHARE_LINK_EXPIRED`). Une porte qu'une seule surface tient est
 * une porte qu'on contourne par la surface voisine — elle vit donc ici, et le
 * fil l'appelle comme les autres.
 *
 * La règle est celle du fil, à l'identique : seule la date d'expiration ferme ;
 * un lien INTROUVABLE (supprimé depuis la jointure) ne ferme rien — c'est un
 * autre chemin qui retire l'accès des invités d'un lien retiré (#3734).
 * `maxUses` n'y entre pas (#4827) : il compte des ADMISSIONS, pas un droit de
 * lire.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { logger } from '../utils/logger';

/** Ce qu'il faut d'une ligne `ConversationShareLink` pour trancher. `null` = introuvable. */
export type ShareLinkExpiry = { readonly expiresAt?: Date | string | null } | null | undefined;

export function shareLinkHasExpired(link: ShareLinkExpiry, now: Date = new Date()): boolean {
  if (!link?.expiresAt) return false;
  return new Date(link.expiresAt).getTime() < now.getTime();
}

/** Une participation telle que les lecteurs multi-conversations la chargent. */
export type LinkedParticipation = {
  readonly conversationId: string;
  readonly shareLinkId?: string | null;
};

/**
 * Forme ENSEMBLISTE pour les lectures qui traversent PLUSIEURS conversations
 * (la liste des favoris) : les conversations dont la porte est fermée, en UNE
 * lecture des seuls liens concernés.
 *
 * Fail-CLOSED : une lecture de liens qui échoue ferme toutes les conversations
 * dont un lien décidait — une porte illisible est une porte fermée, comme un
 * plancher illisible (`loadHistoryFloorsOrFail`). Les participations sans lien
 * ne dépendent de rien ici, et restent ouvertes quoi qu'il arrive.
 */
export async function loadExpiredShareLinkConversationIds(
  prisma: Pick<PrismaClient, 'conversationShareLink'>,
  participations: readonly LinkedParticipation[],
  now: Date = new Date(),
): Promise<ReadonlySet<string>> {
  const linked = participations.filter(
    (participation): participation is LinkedParticipation & { readonly shareLinkId: string } =>
      typeof participation.shareLinkId === 'string' && participation.shareLinkId.length > 0,
  );
  if (linked.length === 0) return new Set();

  try {
    const links = await prisma.conversationShareLink.findMany({
      where: { id: { in: [...new Set(linked.map((participation) => participation.shareLinkId))] } },
      select: { id: true, expiresAt: true },
    });
    const expired = new Set(links.filter((link) => shareLinkHasExpired(link, now)).map((link) => link.id));
    return new Set(linked.filter((participation) => expired.has(participation.shareLinkId)).map((p) => p.conversationId));
  } catch (error) {
    logger.warn('[share-link-gate] lookup failed, closing every conversation a link decides', {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Set(linked.map((participation) => participation.conversationId));
  }
}
