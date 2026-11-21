import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'releaseAgentRole' });

/**
 * SORTIR QUELQU'UN REND LE RÔLE D'AGENT QUI PARLAIT À SA PLACE (#20208).
 *
 * `AgentUserRole` est la ligne qui dit « l'agent parle à la place de X dans la
 * conversation C ». #20111 a fermé la LECTURE — `getControlledUsers` relit
 * `PARTICIPATION_VIVANTE`, fail-closed — et a laissé l'ÉCRITURE ouverte. Trois
 * faits mesurés en livrant celui-ci :
 *
 * - **aucun chemin de bannissement ne supprimait la ligne** : seuls
 *   `routes/admin/agent-reset.ts` et `jobs/obsolete-conversation-purge.ts` y
 *   touchaient ;
 * - **le DÉPART VOLONTAIRE non plus** — la jumelle, trouvée en posant au
 *   correctif la question que ce dépôt impose (« cette entité a-t-elle une
 *   jumelle ? ») au lieu de la poser trois cycles plus tard ;
 * - **la ligne ne se périme jamais** : `touchUserRoles` réécrit `lastUsedAt`
 *   chaque fois qu'elle SERT, donc `evictStaleRoles` ne la libère pas, et
 *   `evictRecentlyActiveUsers` n'agit que si la personne REVIENT — ce qu'un
 *   banni ne fait pas.
 *
 * ── CE QUE SEUL LE RETRAIT GAGNE, LA LECTURE ÉTANT DÉJÀ GARDÉE ──────────────
 *
 * La question mérite d'être posée, parce que « c'est déjà fermé en lecture »
 * est un argument pour ne rien faire :
 *
 * | | la garde de lecture (#20111) | le retrait (ici) |
 * |---|---|---|
 * | un sorti ne parle plus | **oui** | oui |
 * | les lignes DÉJÀ en base | **oui** | non — seuls les gestes futurs |
 * | le fil cesse d'être scanné pour rien (`hasRoles`) | non | **oui** |
 * | la place rendue au vivier (`TAILLE_MAX_VIVIER`) | non | **oui** |
 * | l'administration cesse de montrer un sorti comme « contrôlé » | non | **oui** |
 *
 * C'est la règle qu'`unsetOrNull` énonce déjà pour `LIVE_MESSAGE_MARK` :
 * **écrire la colonne rend les lectures exactes pour les lignes À VENIR, le
 * prédicat de lecture les rend exactes pour celles DÉJÀ EN BASE.** Les deux
 * moitiés ne se substituent pas l'une à l'autre.
 *
 * ── POURQUOI UN `delete` ET NON UN `releasedAt` ─────────────────────────────
 *
 * `AgentUserRole` porte un travail d'ANALYSE — `personaSummary`, `tone`,
 * `catchphrases`, 23 traits psychologiques — et le supprimer paraît le jeter.
 *
 * **Mesuré : il n'est pas jeté.** `AgentGlobalProfile` est une ligne PAR
 * UTILISATEUR (`userId @unique`), alimentée depuis le profil de ton à chaque
 * construction (`conversation-scanner` → `upsertGlobalProfile`), et
 * `getPotentialControlledUsers` la projette pour amorcer une élection NEUVE.
 * L'analyse survit ; seule la liaison à CETTE conversation part, et c'est
 * précisément ce qu'on retire. Un `releasedAt` aurait coûté une colonne, un
 * cliquet, et la relecture de tous les lecteurs — pour conserver ce qui est
 * déjà conservé ailleurs.
 *
 * Conséquence assumée : **un débannissement ne ressuscite pas le rôle.** La
 * personne redevient éligible à une élection, qui repartira de son profil
 * global. Elle ne récupère pas sa place par un geste de modération, et c'est le
 * bon sens d'erreur.
 *
 * ── CE QUE CE RETRAIT NE TOUCHE PAS, ET POURQUOI ────────────────────────────
 *
 * **`AgentConfig.manualUserIds` — l'épinglage d'un ADMINISTRATEUR — reste
 * intact**, et ce n'est pas un oubli :
 *
 * 1. il n'y a aucune fuite à fermer : #20111 le neutralise à la LECTURE,
 *    fail-closed, comme tout le reste ;
 * 2. bannir est un geste de MODÉRATION (plancher `MODERATOR`) et l'épinglage
 *    une instruction d'ADMINISTRATION. Retirer silencieusement un id de cette
 *    liste laisserait un modérateur réécrire la configuration d'un
 *    administrateur — une escalade de titre par effet de bord ;
 * 3. l'épinglage ne redevient effectif que si quelqu'un REND l'appartenance,
 *    c'est-à-dire par un second geste de modération délibéré.
 *
 * Reste un défaut d'AFFICHAGE : l'administration lit `manualUserIds` et montre
 * donc un banni comme « épinglé ». C'est un écart de surface, pas de pouvoir.
 *
 * ── BEST-EFFORT, ET CE QUI L'AUTORISE ──────────────────────────────────────
 *
 * Un échec ici ne fait pas échouer le geste qui compte — même arbitrage que la
 * fermeture du lien d'entrée, à quelques lignes de là dans
 * `participant-ban-core`. Ce qui rend ce choix légitime, et il faut le dire
 * plutôt que de le supposer : **la lecture d'aval est déjà fail-closed.** Un
 * rôle qui survit à un retrait raté ne fait plus parler personne ; il ne coûte
 * qu'un slot de vivier et un scan à vide. Sans #20111 en aval, ce best-effort
 * serait une faute.
 */
export async function releaseAgentRoleFor(params: {
  readonly prisma: PrismaClient;
  readonly conversationId: string;
  readonly userId: string | null | undefined;
}): Promise<number | null> {
  const { prisma, conversationId, userId } = params;

  // Un participant SANS compte (invité de lien) n'a pas de `User.id`, donc
  // aucun rôle possible. Et la requête ne doit PAS partir : chez Prisma,
  // `userId: undefined` est IGNORÉ, donc le `where` viserait TOUS les rôles de
  // la conversation (#14448 — un identifiant indéfini transforme un retrait
  // ciblé en suppression de masse).
  if (!userId) return 0;

  try {
    const { count } = await prisma.agentUserRole.deleteMany({ where: { conversationId, userId } });
    return count;
  } catch (error) {
    logger.error('agent role release failed', error as Error);
    return null;
  }
}
