import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * Le RETRAIT d'un message, avec sa garde OPTIMISTE — et le site unique qui dit
 * ce qu'un perdant de course doit faire (#17079).
 *
 * ─── Ce que la garde ajoute à la lecture d'amont ─────────────────────────────
 *
 * Les deux transports lisent d'abord le message sous `deletedAt: null`, donc un
 * rejeu SÉQUENTIEL rend déjà « introuvable ». Mais deux requêtes CONCURRENTES
 * franchissent cette lecture toutes les deux, écrivent toutes les deux, et
 * appliquent toutes les deux les effets du retrait — dont
 * `conversationMessageStatsService.onMessageDeleted`, **un décompte NON
 * idempotent.** Les compteurs de `GET …/stats` dérivaient alors vers le bas de
 * la valeur d'un message (mots, caractères, type de contenu, compteurs par
 * auteur), définitivement ; `deletedAt` avançait d'une milliseconde, ce qui
 * déplace la borne des flux de tombstones ; et `message:deleted` partait deux
 * fois.
 *
 * **La forme était déjà dans le dépôt, et sur le chemin voisin.** La route
 * d'ÉDITION porte `where: { id, deletedAt: null }` à quatre sites, et le
 * commentaire de la route de suppression la CITE — pour expliquer qu'elle ferme
 * une course avec l'édition. Les deux transports de suppression ne l'avaient
 * ni l'un ni l'autre : c'est « une garde posée sur un chemin se lit comme posée
 * sur le SUJET » dans sa variante la plus discrète, celle où le chemin qui la
 * porte est cité par celui qui ne l'a pas.
 *
 * ─── Pourquoi un verdict, et pas une exception ───────────────────────────────
 *
 * `P2025` est la réponse de Prisma à « la ligne que tu décris n'existe plus ».
 * Laissée remonter, elle atterrit dans le `catch` de fin de route et rend 500 —
 * une panne, pour un appel dont le RÉSULTAT est acquis : le message est bien
 * supprimé, par quelqu'un d'autre, une milliseconde plus tôt. Le perdant de la
 * course apprend donc ce que le rejeu séquentiel apprend déjà — « introuvable »
 * — et n'applique AUCUN effet.
 *
 * Toute autre erreur est RELEVÉE : une base en défaut n'est pas une course
 * perdue, et la confondre avec elle ferait disparaître un retrait réellement
 * échoué sous un « quelqu'un d'autre l'a fait ».
 *
 * ─── Pourquoi l'appelant compose `data`, et ne le reçoit pas d'ici (#9899) ───
 *
 * Parce qu'écrire `translations: null` engage autre chose que cette écriture :
 * `Message.translations` porte les traductions du SERVEUR, `SharedTranslation`
 * les versions SCELLÉES que les appareils des membres se passent, et **vider la
 * première sans effacer la seconde laisse le texte d'un message retiré lisible
 * pour qui détient la clé** — les deux tables n'ayant aucune relation, aucune
 * cascade ne le rattrape. Le cliquet du dépôt exige donc que l'effacement
 * voisin soit appelé DANS le fichier qui écrit `translations: null`, « parce que
 * c'est le geste d'écriture qui se copie ».
 *
 * Il a rougi sur la première version de cette unité, qui portait le littéral —
 * et il avait raison : un appelant futur aurait hérité de la moitié du geste. La
 * réponse n'est pas d'effacer ICI (l'unité d'effets de chaque transport le fait
 * déjà juste après, et doubler l'effacement doublait un appel RÉSEAU au
 * translator, ce qu'un témoin de comptage du dépôt a immédiatement vu) : c'est
 * de laisser `data` à l'appelant, pour que le littéral vive là où son
 * effacement est appelé.
 *
 * Ce que cette unité garde est donc exactement ce qui manquait aux deux
 * transports, et rien de plus : **la garde optimiste, et l'interprétation de son
 * échec.** L'ATOMICITÉ reste acquise — un seul `update`, composé par l'appelant.
 */
export type SoftDeleteOutcome = 'deleted' | 'already-deleted';

const isMissingRecord = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2025';

export async function softDeleteMessage(
  prisma: Pick<PrismaClient, 'message'>,
  messageId: string,
  /**
   * Ce que le retrait écrit — composé par l'appelant, et dans UNE écriture : le
   * dépôt l'annonce déjà (« atomically clear translations and set deletedAt in
   * one write »), parce que deux écritures laisseraient une fenêtre où le
   * message est supprimé et ses traductions encore là, ou l'inverse.
   *
   * Le type est DÉRIVÉ de l'entrée Prisma plutôt qu'écrit à la main, et pas
   * seulement par goût : énoncer `translations: null` ici, même en position de
   * TYPE, faisait de ce fichier un « écrivain » aux yeux du cliquet de #9899 —
   * dont le balayage retire les commentaires mais pas les annotations. Le
   * dériver dit la même contrainte sans que ce fichier prétende écrire quoi que
   * ce soit.
   */
  data: Pick<Prisma.MessageUpdateInput, 'translations' | 'deletedAt'>,
): Promise<SoftDeleteOutcome> {
  try {
    await prisma.message.update({ where: { id: messageId, deletedAt: null }, data });
    return 'deleted';
  } catch (error) {
    if (isMissingRecord(error)) return 'already-deleted';
    throw error;
  }
}
