import { canUserConsumePost, loadPostAcl, type PostAclPrisma, type PostVisibilityRecord } from '../../services/posts/postVisibility';
import { NOT_DELETED } from '../../services/posts/postIncludes';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';

/**
 * La porte d'audience des points d'entrée qui TOUCHENT un post sans le rendre :
 * favori, impression (unitaire et en lot), partage.
 *
 * Ce fichier n'écrit AUCUNE règle d'audience. Il n'en connaît qu'une adresse —
 * `canUserConsumePost` — et se contente de lui apporter la tranche ACL du post,
 * une fois pour un id, en UNE passe pour un lot. Toute règle qui s'écrirait ici
 * (une visibilité relue, un graphe redéplié) serait une seconde loi qui
 * dériverait de la première ; le dépôt a déjà payé ça trois fois
 * (`postVisibility.ts`, en-tête).
 *
 * POURQUOI LE VERDICT DE CONSOMMATION, et pas celui d'interaction. Les quatre
 * gestes gardés ici ne s'adressent pas à l'auteur du post : mettre en favori,
 * compter une apparition, frapper un lien de partage sont des actes de LECTEUR.
 * L'audience à leur appliquer est donc celle qui décide « ce lecteur voit-il ce
 * post ? » — amis ∪ contacts DM, plus la voie des RÉFÉRENCES —, exactement
 * celle que `recordView` et `recordMediaDownloads` appliquent déjà à leurs
 * jumeaux, et celle que `GET /posts/:id` sert. L'asymétrie « voir ⊇ interagir »
 * (décision 2026-07-08) place réagir et commenter de l'autre côté ; ces
 * quatre-là sont du côté voir.
 *
 * `canUserConsumePost` plutôt que le filtre `buildPostVisibilityOrFilter` posé
 * dans un `where` : le filtre ignore la branche des RÉFÉRENCES, si bien qu'un
 * lecteur NOMMÉ dans une story — à qui `GET /posts/:id` et le fil de
 * commentaires sont ouverts — se verrait refuser le favori de ce qu'il vient de
 * lire. Le verdict nommé est la forme complète de la même audience.
 */
export type PostConsumptionPrisma = PostAclPrisma;

/**
 * La tranche ACL, redéclarée ici parce que `postVisibility.ts` la garde privée.
 * Elle n'est PAS libre : `PostVisibilityRecord` exige ses cinq champs, donc en
 * oublier un ne désarme pas la garde en silence — le compilateur refuse l'appel
 * à `canUserConsumePost` juste en dessous. C'est le type qui tient l'invariant,
 * pas la vigilance du prochain lecteur.
 */
const POST_ACL_SLICE = {
  id: true,
  authorId: true,
  visibility: true,
  visibilityUserIds: true,
  expiresAt: true,
} as const;

/**
 * Ce lecteur a-t-il le droit de lire ce post ?
 *
 * `false` couvre indistinctement « absent », « supprimé » et « hors audience » —
 * les trois se répondent pareil, sans quoi la route redevient l'oracle
 * d'existence que ce lot ferme.
 */
export async function mayConsumePost(
  prisma: PostConsumptionPrisma,
  postId: string,
  userId: string,
): Promise<boolean> {
  // #4044 — un identifiant MALFORMÉ est le quatrième membre de la famille
  // décrite juste au-dessus, et c'était le seul à en sortir : Mongo n'ignore
  // pas une clé qui n'est pas un ObjectId, il LÈVE (`P2023`) avant qu'aucune
  // règle d'audience ne se prononce, et la route rend alors un 500 là où elle
  // devait rendre un 404. Répondre `false` ici ne relâche rien — un tel
  // identifiant ne peut désigner aucun document — et rend au module l'unique
  // porte de sortie qu'il déclare.
  if (!isValidObjectId(postId)) return false;
  const post = await loadPostAcl(prisma, postId);
  if (!post) return false;
  return canUserConsumePost(prisma, post, userId);
}

/**
 * Les ids de `postIds` que ce lecteur a le droit de lire.
 *
 * UNE passe de lecture pour tout le lot — `findMany` borné par les ids
 * DISTINCTS, jamais un `findFirst` par id : cinquante allers-retours séquentiels
 * sur un chemin appelé à chaque défilement seraient une lenteur, donc un bug.
 * Les verdicts partent ensuite d'un seul coup (`Promise.all`) : un post PUBLIC
 * ou dont on est l'auteur ne coûte aucune requête de plus, et les autres
 * s'interrogent en parallèle plutôt qu'en file.
 *
 * Un id absent de la réponse — inconnu, supprimé, ou refusé — sort de
 * l'ensemble par la même porte. C'est la propriété que le lot doit garantir :
 * rien dans ce qui suit ne doit pouvoir distinguer les trois.
 */
export async function filterConsumablePostIds(
  prisma: PostConsumptionPrisma,
  postIds: readonly string[],
  userId: string,
): Promise<ReadonlySet<string>> {
  // #4044 — le filtrage est ici, AVANT la requête, et c'est le cas le plus
  // grave des deux : le `findMany` ci-dessous est borné par `{ id: { in: [...] } }`,
  // donc UN identifiant malformé faisait lever la requête ENTIÈRE — cinquante
  // impressions de défilement perdues parce qu'une seule story était encore en
  // cours de publication. Un id écarté ici sort de l'ensemble par la même porte
  // qu'un id inconnu, supprimé ou refusé : c'est exactement la propriété que
  // l'en-tête de cette fonction demande de garantir.
  const distinctIds = [...new Set(postIds)].filter(isValidObjectId);
  if (distinctIds.length === 0) return new Set<string>();

  const posts = await prisma.post.findMany({
    where: { id: { in: distinctIds }, deletedAt: NOT_DELETED },
    select: POST_ACL_SLICE,
  });

  const verdicts = await Promise.all(
    posts.map(async (post: PostVisibilityRecord): Promise<readonly [string, boolean]> =>
      [post.id, await canUserConsumePost(prisma, post, userId)] as const),
  );

  return new Set(verdicts.filter(([, allowed]) => allowed).map(([id]) => id));
}
