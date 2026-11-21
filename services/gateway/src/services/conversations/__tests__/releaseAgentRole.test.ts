/**
 * #20208 — SORTIR QUELQU'UN REND LE RÔLE D'AGENT QUI PARLAIT À SA PLACE.
 *
 * `AgentUserRole` est la ligne qui dit « l'agent parle à la place de X dans la
 * conversation C ». #20111 a fermé la LECTURE (`getControlledUsers` relit
 * `PARTICIPATION_VIVANTE`, fail-closed) ; l'ÉCRITURE restait ouverte :
 *
 * - aucun chemin de bannissement ne supprimait la ligne (mesuré : seuls
 *   `routes/admin/agent-reset.ts` et `jobs/obsolete-conversation-purge.ts` y
 *   touchaient) ;
 * - le DÉPART VOLONTAIRE non plus — la jumelle, trouvée en posant la question
 *   du dépôt (« cette entité a-t-elle une jumelle ? ») au moment du correctif ;
 * - et la ligne ne se périme jamais, `touchUserRoles` réécrivant `lastUsedAt`
 *   chaque fois qu'elle SERT.
 *
 * ## POURQUOI UN `delete` ET NON UN `releasedAt`
 *
 * La question n'est pas rhétorique : `AgentUserRole` porte un travail
 * d'ANALYSE — `personaSummary`, `tone`, `catchphrases`, 23 traits
 * psychologiques. Le supprimer paraît jeter ce travail.
 *
 * **Mesuré : il n'est pas jeté.** `AgentGlobalProfile` est une ligne PAR
 * UTILISATEUR (`userId @unique`), alimentée depuis le profil de ton à chaque
 * construction (`conversation-scanner.ts` → `upsertGlobalProfile`), et
 * `getPotentialControlledUsers` la projette pour amorcer une élection NEUVE.
 * L'analyse survit donc au `delete` ; seule la liaison à CETTE conversation
 * part — et c'est exactement ce qu'on veut retirer.
 *
 * Conséquence, et c'est le bon sens d'erreur : **un débannissement ne
 * ressuscite pas le rôle.** La personne redevient éligible à une élection, qui
 * repartira de son profil global. Elle ne récupère pas sa place par un geste de
 * modération.
 *
 * ## BEST-EFFORT, ET POURQUOI C'EST JUSTE ICI
 *
 * L'échec de ce retrait ne doit pas faire échouer le geste qui compte (le
 * bannissement, le départ) — même arbitrage que la fermeture du lien d'entrée,
 * à vingt lignes de là. Ce qui l'autorise, et qu'il faut dire : **la LECTURE
 * est déjà fail-closed depuis #20111.** Un rôle qui survit à un retrait raté ne
 * fait plus parler personne ; il ne coûte qu'un slot de vivier et un scan à
 * vide. Sans cette garde en aval, ce best-effort serait une faute.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { releaseAgentRoleFor } from '../releaseAgentRole';

const CONV = '507f1f77bcf86cd799439033';
const USER = '507f1f77bcf86cd799439044';

const prismaQuiSupprime = (count: number) => ({
  agentUserRole: { deleteMany: jest.fn<any>().mockResolvedValue({ count }) },
});

describe('#20208 — releaseAgentRoleFor', () => {
  it('supprime le rôle de CETTE personne dans CETTE conversation, et rien d’autre', async () => {
    const prisma = prismaQuiSupprime(1);

    const released = await releaseAgentRoleFor({ prisma: prisma as never, conversationId: CONV, userId: USER });

    expect(released).toBe(1);
    expect(prisma.agentUserRole.deleteMany).toHaveBeenCalledWith({
      where: { conversationId: CONV, userId: USER },
    });
  });

  /**
   * Le cas nominal, et de loin : la plupart des membres n'ont jamais été
   * animés. Un retrait qui ne trouve rien n'est pas un échec.
   */
  it('rend 0 quand la personne n’avait aucun rôle', async () => {
    const prisma = prismaQuiSupprime(0);

    await expect(releaseAgentRoleFor({ prisma: prisma as never, conversationId: CONV, userId: USER })).resolves.toBe(0);
  });

  /**
   * BEST-EFFORT : l'échec se journalise et rend `null` — « je n'ai pas pu
   * conclure » — mais il ne remonte pas, parce que l'appelant est en train
   * d'écrire un bannissement ou un départ, et que la lecture d'aval est
   * fail-closed.
   */
  it('n’échoue PAS le geste appelant quand la base refuse, et le dit par `null`', async () => {
    const prisma = {
      agentUserRole: { deleteMany: jest.fn<any>().mockRejectedValue(new Error('mongo down')) },
    };

    await expect(releaseAgentRoleFor({ prisma: prisma as never, conversationId: CONV, userId: USER })).resolves.toBeNull();
  });

  /**
   * Un participant SANS compte (invité de lien) n'a pas de `User.id`, donc
   * aucun rôle possible : la requête ne part pas. `userId: undefined` chez
   * Prisma viserait TOUS les rôles de la conversation — la suppression de
   * masse que ce témoin existe pour empêcher (#14448).
   */
  it('ne part PAS sans identifiant d’utilisateur — un `undefined` viserait TOUTE la conversation', async () => {
    const prisma = prismaQuiSupprime(3);

    const released = await releaseAgentRoleFor({ prisma: prisma as never, conversationId: CONV, userId: null });

    expect(released).toBe(0);
    expect(prisma.agentUserRole.deleteMany).not.toHaveBeenCalled();
  });
});
