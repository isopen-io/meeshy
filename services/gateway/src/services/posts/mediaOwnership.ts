/**
 * Propriété d'un `PostMedia` — garde de revendication.
 *
 * Un média téléversé naît « en attente » (`postId: null`, `commentId: null`)
 * puis est rattaché par la publication qui le réclame. Tant que `PostMedia` n'a
 * porté AUCUN champ propriétaire, cette revendication ne vérifiait que
 * « personne ne l'a pris avant moi » : un tiers pouvait s'approprier le média
 * d'autrui en devinant son id — les ObjectId voisins ne diffèrent que d'un
 * compteur — et se le faire créditer.
 *
 * Ce module est le point unique de la garde, pour que les trois sites de
 * rattachement (`createPost`, `updatePost`, `createComment`) ne puissent pas
 * diverger. L'un d'eux n'avait d'ailleurs aucune garde du tout.
 */

const OBJECT_ID = /^[a-f0-9]{24}$/;

/**
 * Identité d'uploadeur exploitable, ou `null`.
 *
 * Le handler d'upload retombe sur la chaîne littérale `'anonymous'` quand il
 * ne sait pas décoder le jeton, et sur le jeton de session pour un participant
 * anonyme. Écrire l'une ou l'autre comme propriétaire créerait un compte
 * fourre-tout sous lequel N utilisateurs pourraient se revendiquer
 * mutuellement — strictement pire que `null`, qui n'autorise rien de plus que
 * l'état actuel.
 */
export function uploaderIdOrNull(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  return OBJECT_ID.test(raw) ? raw : null;
}

/**
 * Récupère l'uploadeur depuis le chemin de stockage — `année/mois/<userId>/fichier`.
 *
 * C'est la seule source qui reste pour un média EN ATTENTE créé avant le champ :
 * il n'est rattaché à aucun post ni commentaire d'où déduire un auteur. Or ce
 * sont précisément les médias vulnérables. Le handler d'upload écrit déjà
 * l'identité de l'uploadeur dans l'arborescence — elle n'avait simplement
 * jamais été portée en base.
 *
 * Rend `null` si le segment attendu n'est pas un ObjectId : mieux vaut laisser
 * la ligne sans propriétaire que lui en inventer un.
 */
export function uploaderIdFromFilePath(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  const segments = filePath.split('/').filter(Boolean);
  // Le nom de fichier ferme le chemin ; l'uploadeur est juste avant.
  if (segments.length < 2) return null;
  return uploaderIdOrNull(segments[segments.length - 2]);
}

/**
 * Contextes d'upload TUS qui produisent un `PostMedia` (par opposition aux
 * pièces jointes de message). Définition UNIQUE partagée par `onUploadCreate`
 * (rejet avant le premier octet) et `onUploadFinish` (choix de la table) —
 * le handler portait la liste en dur au seul site de finish.
 *
 * La définition elle-même vit désormais dans `@meeshy/shared/types/attachment`
 * (cycle composer W7bis) : le web en a besoin pour taguer ses uploads
 * (`attachmentTransport.ts`), et ce module la ré-exporte pour que ses propres
 * appelants (`tus-handler.ts`, ses tests) ne changent pas d'import.
 */
export { isPostMediaUploadContext } from '@meeshy/shared/types/attachment';

/**
 * Propriétaire d'un futur `PostMedia`, ou `null`.
 *
 * Une session ANONYME ne produit jamais de propriétaire — même si son jeton
 * matchait par hasard la forme d'un ObjectId, l'écrire ferait comparer un
 * jeton à un id utilisateur dans l'égalité stricte du claim : au mieux un
 * média irréclamable, au pire l'alias involontaire d'un vrai compte.
 */
export function postMediaUploaderOrNull(
  identity: { userId: string | null | undefined; isAnonymous: boolean }
): string | null {
  if (identity.isAnonymous) return null;
  return uploaderIdOrNull(identity.userId);
}

/**
 * Clause de revendication d'un média encore libre.
 *
 * **PHASE 2 — STRICTE (2026-07-31).** Le média doit appartenir à celui qui le
 * réclame. C'est cette égalité, et elle seule, qui ferme le trou : un tiers ne
 * peut plus s'approprier un média en attente en devinant son id.
 *
 * La phase 1 tolérait `uploaderId` absent ou nul, le temps du rattrapage —
 * resserrer avant aurait rendu tout média hérité impossible à rattacher, en
 * SILENCE (`updateMany` ignore ce qui ne matche pas). Le rattrapage a été
 * appliqué en production le 2026-07-31 : 665 des 666 médias ont un
 * propriétaire, et le seul restant est un instantané orphelin généré côté
 * serveur, que personne n'a vocation à rattacher. Le rendre non réclamable est
 * le comportement voulu.
 *
 * Un média sans propriétaire n'est donc plus réclamable par personne. Si ce cas
 * réapparaît, c'est que le handler d'upload a laissé passer un envoi sans
 * uploadeur identifiable — il le journalise déjà, et l'écart est signalé par
 * `describeClaimShortfall` au lieu d'être avalé.
 */
export function claimableMediaWhere(ownerId: string) {
  return {
    ...unclaimedMediaWhere(),
    uploaderId: ownerId,
  };
}

/**
 * « Libre » — la MOITIÉ de la clause ci-dessus qui ne parle pas de propriété.
 *
 * Deux verbes lisent cette définition et ne doivent JAMAIS en avoir deux :
 * la RÉCLAMATION (`claimableMediaWhere`, qui y ajoute le propriétaire) et le
 * BALAYAGE des médias abandonnés (`sweepPendingPostMedia`, qui n'a pas de
 * propriétaire à opposer — il détruit ce que personne n'a réclamé). Un
 * balayage qui redéfinirait « libre » pour son compte finirait par détruire
 * du réclamable, ou par épargner de l'irréclamable.
 *
 * « Libre » couvre les DEUX formes MongoDB : champ présent à `null` ET champ
 * absent du document. Prisma sur MongoDB ne matche PAS un champ absent avec
 * `null` — seul `isSet: false` le fait. Le handler TUS crée ses médias sans
 * poser `commentId` : la clause `commentId: null` seule a rendu TOUT média
 * fraîchement téléversé irréclamable en production (2026-07-31→08-01), chaque
 * publication perdant son image en silence. Le même oubli, du côté du
 * balayage, le rendrait AVEUGLE — il ne verrait aucun abandon, en silence.
 *
 * Un média déjà rattaché à un COMMENTAIRE n'est pas libre non plus.
 * `createPost` ne testait que `postId`, et un média de commentaire restait
 * donc capturable par un post — les deux champs sont pourtant exclusifs par
 * construction.
 */
export function unclaimedMediaWhere() {
  return {
    AND: [
      { OR: [{ postId: null }, { postId: { isSet: false } }] },
      { OR: [{ commentId: null }, { commentId: { isSet: false } }] },
    ],
  };
}

/**
 * Décrit un écart entre ce qui a été demandé et ce qui a été rattaché, ou
 * `null` si tout est passé.
 *
 * `updateMany` ignore en silence les ids qui ne matchent pas. Sans cette
 * comparaison, un média refusé — parce qu'il appartient à quelqu'un d'autre,
 * ou parce qu'il a déjà été réclamé — disparaît de la publication sans que
 * personne ne l'apprenne. C'est exactement le symptôme que la victime du vol
 * observait déjà, et il doit devenir visible avant, pas après.
 */
export function describeClaimShortfall(
  requestedIds: readonly string[],
  claimedCount: number,
): string | null {
  const requested = new Set(requestedIds).size;
  if (claimedCount >= requested) return null;
  return `${requested - claimedCount} média(s) sur ${requested} non rattaché(s) — déjà réclamé(s), ou appartenant à un autre uploadeur`;
}
