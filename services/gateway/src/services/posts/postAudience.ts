import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { getCommunityCoMemberIds } from './communityVisibility';

/**
 * La seule surface Prisma qu'une admission touche. `Pick<PrismaClient, …>`
 * plutôt qu'une interface maison — même raison que dans `postMentions` : les
 * délégués générés portent des surcharges que rien de recopié à la main ne
 * satisfait.
 */
export type PostAudiencePrisma = Pick<PrismaClient, 'friendRequest' | 'communityMember'>;

export interface PostAudienceParams {
  prisma: PostAudiencePrisma;
  /** L'auteur du post — le sommet du graphe qui définit « ami » et « co-membre ». */
  authorId: string;
  /** `Post.visibility`. Une valeur inconnue est traitée comme `FRIENDS`, jamais comme publique. */
  visibility: string | null | undefined;
  /** `Post.visibilityUserIds` — liste blanche en `ONLY`, liste noire en `EXCEPT`. */
  visibilityUserIds?: readonly string[];
  /** Les utilisateurs dont on teste le droit de voir. Ordre préservé dans le résultat. */
  candidateUserIds: readonly string[];
}

/**
 * Qui, parmi `candidateUserIds`, a le droit de VOIR ce post.
 *
 * C'est l'INVERSE des énumérateurs d'audience du domaine social
 * (`SocialEventsHandler.getVisibilityFilteredRecipients`,
 * `createFriendContentNotificationsBatch`,
 * `createStoryCommentNotificationsBatch`). Eux répondent à « à qui pousser ? »
 * en dépliant le graphe de l'auteur ; l'ensemble qu'ils rendent EST leur
 * audience. Une mention pose la question dans l'autre sens : l'ensemble des
 * nommés est ARBITRAIRE — n'importe quel `@handle` du texte, ami ou non — et il
 * faut trancher, un par un, « celui-là a-t-il le droit ? ».
 *
 * D'où la différence qui justifie une fonction distincte plutôt qu'un appel aux
 * énumérateurs existants : pour `PUBLIC`, ils rendent `friendIds`. C'est un
 * choix de CIBLAGE (on ne pousse une publication qu'aux contacts), pas une
 * règle d'admission — un post public se LIT par n'importe qui. Réutiliser leur
 * réponse ici priverait de sa notification un inconnu légitimement nommé dans
 * un post public, le cas le plus courant de tous.
 *
 * Correspondance visibilité → admission :
 *
 * | `visibility` | qui est admis                                  |
 * |--------------|------------------------------------------------|
 * | `PUBLIC`     | tout le monde (aucune requête)                 |
 * | `FRIENDS`    | les amis de l'auteur                           |
 * | `EXCEPT`     | les amis de l'auteur, moins `visibilityUserIds` |
 * | `ONLY`       | exactement `visibilityUserIds`                  |
 * | `COMMUNITY`  | les co-membres de communauté de l'auteur        |
 * | `PRIVATE`    | personne                                        |
 * | inconnue     | comme `FRIENDS` — jamais comme publique         |
 *
 * **L'auteur est toujours admis**, y compris sur un `PRIVATE` : il possède le
 * post. Rien dans le graphe ne l'affirme (on n'est pas ami avec soi-même), donc
 * la règle est explicite.
 *
 * **En panne, on REFUSE.** Le graphe illisible n'admet personne, et
 * `getCommunityCoMemberIds` rend déjà `[]` sur exception — même politique. Cette
 * fonction garde une frontière de confidentialité : l'échec d'une notification
 * légitime est réparable (la mention est persistée, elle reste visible en
 * ouvrant le post), la fuite d'un extrait de post privé sur un écran verrouillé
 * ne l'est pas.
 */
export async function filterPostAudience(params: PostAudienceParams): Promise<string[]> {
  const { prisma, authorId, visibility, candidateUserIds } = params;

  if (candidateUserIds.length === 0) return [];

  // L'auteur ne passe par aucune règle de graphe : il voit son post quoi qu'il
  // arrive. Il est écarté des requêtes ci-dessous, puis réintroduit à sa place
  // d'origine par le filtre final.
  const others = candidateUserIds.filter((id) => id !== authorId);
  const admit = (allowed: (id: string) => boolean): string[] =>
    candidateUserIds.filter((id) => id === authorId || allowed(id));

  if (visibility === 'PUBLIC') return [...candidateUserIds];
  if (visibility === 'PRIVATE') return admit(() => false);

  const visibilityUserIdSet = new Set(params.visibilityUserIds ?? []);
  if (visibility === 'ONLY') return admit((id) => visibilityUserIdSet.has(id));

  if (visibility === 'COMMUNITY') {
    const coMemberIds = new Set(await getCommunityCoMemberIds(prisma, authorId));
    return admit((id) => coMemberIds.has(id));
  }

  // Restent `FRIENDS`, `EXCEPT`, et toute valeur inconnue — toutes adossées au
  // graphe ami. Une visibilité que ce code ne connaît pas retombe ICI et non
  // sur `PUBLIC` : un mode ajouté demain au schéma sans passer par cette table
  // restreint par défaut au lieu d'ouvrir en grand.
  if (others.length === 0) return admit(() => false);

  const friendIds = await loadFriendIdsAmong(prisma, authorId, others);
  if (!friendIds) return admit(() => false);

  return visibility === 'EXCEPT'
    ? admit((id) => friendIds.has(id) && !visibilityUserIdSet.has(id))
    : admit((id) => friendIds.has(id));
}

/**
 * Les amis de `authorId` PARMI `candidates` — l'intersection, jamais le graphe
 * entier. Un auteur à 5 000 contacts nommant une personne ne doit pas coûter
 * 5 000 lignes : la borne `in` fait faire l'intersection à la base.
 *
 * Rend `null` — et non `Set()` — quand la lecture échoue, pour que l'appelant
 * distingue « aucun ami parmi les candidats » de « on ne sait pas ». Les deux
 * mènent au refus, mais seul le second est une panne.
 */
async function loadFriendIdsAmong(
  prisma: PostAudiencePrisma,
  authorId: string,
  candidates: readonly string[]
): Promise<Set<string> | null> {
  try {
    const links = await prisma.friendRequest.findMany({
      where: {
        status: 'accepted',
        OR: [
          { senderId: authorId, receiverId: { in: [...candidates] } },
          { receiverId: authorId, senderId: { in: [...candidates] } },
        ],
      },
      select: { senderId: true, receiverId: true },
    });

    return new Set(
      links.map((link) => (link.senderId === authorId ? link.receiverId : link.senderId))
    );
  } catch {
    return null;
  }
}
