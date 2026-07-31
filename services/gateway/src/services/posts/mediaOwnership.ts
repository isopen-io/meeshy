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
    postId: null,
    // Un média déjà rattaché à un COMMENTAIRE n'est pas libre. `createPost` ne
    // testait que `postId`, et un média de commentaire restait donc capturable
    // par un post — les deux champs sont pourtant exclusifs par construction.
    commentId: null,
    uploaderId: ownerId,
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
