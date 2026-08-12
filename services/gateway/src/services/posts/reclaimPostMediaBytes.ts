import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'reclaimPostMediaBytes' });

/**
 * Les OCTETS d'un média de post suivent la destruction de sa ligne.
 *
 * La question que les cycles 92 à 95 ont posée à la famille message —
 * *qui, côté serveur, fait respecter cette promesse, et la pose-t-on au
 * DERNIER maillon, celui qui rend les octets ?* — n'avait jamais été posée à
 * la famille post. La réponse était : personne.
 *
 * Le balayage du contenu éphémère détruit bien les LIGNES `PostMedia` de ce
 * qu'il purge (« this closes the unbounded DB-row leak »), en laissant
 * explicitement la récupération des fichiers à un suivi — celui-ci. Résultat
 * jusqu'ici : chaque fichier dont la ligne disparaissait devenait
 * **irrécupérable et éternel**. Irrécupérable parce que plus aucune ligne ne
 * porte son chemin : après la purge, aucun balayage, aucune maintenance,
 * aucune requête ne sait plus qu'il existe. `MaintenanceService` ne ramasse
 * que les `MessageAttachment` orphelins, jamais les `PostMedia` ;
 * `OrphanMediaCleanupService` ne connaît que sa propre boîte d'envoi, remplie
 * par les uploads en échec. Et éternel au sens fort : l'URL publique d'un
 * média (`/api/v1/attachments/file/<chemin>`) est servie SANS
 * authentification — une URL-capacité que seul l'`unlink` révoque. Le contenu
 * détruit restait donc téléchargeable pour toujours par qui avait vu passer
 * son lien.
 *
 * C'est le jumeau exact de ce que `ExpiredMessagesCleanupService._burn` fait
 * déjà pour les pièces jointes de message via `deleteAttachment`.
 *
 * ─── CE QUE CE MODULE NE DÉTRUIT PAS, ET POURQUOI ───────────────────────────
 *
 * `Sound` SURVIT au post dont il est né — c'est la règle que la capture de son
 * répète à chaque site (« Les usages meurent avec le post ; le Sound, lui,
 * SURVIT »). L'audio, lui, est COPIÉ dans son propre dossier par
 * `SoundCaptureService`, donc il ne partage aucun octet. Mais `coverUrl` est
 * **dénormalisé** à la capture depuis `PostMedia.thumbnailUrl ?? fileUrl` : il
 * pointe le fichier du post source. Effacer cet octet laisserait le son sans
 * visuel pour toujours, dans un sélecteur qu'il n'y a plus aucun moyen de
 * réparer. D'où la seule garde de ce module : un fichier encore référencé par
 * un `Sound` vivant n'est pas récupéré.
 *
 * ─── POURQUOI LES ÉCHECS SE TRAITENT DANS LES DEUX SENS ─────────────────────
 *
 * Une REQUÊTE en échec REJETTE, comme ses voisins `deactivatePostTrackingLinks`
 * et `releasePosts` dans la même passe et pour la même raison : détruire les
 * lignes après avoir échoué à savoir quels fichiers leur appartiennent
 * laisserait ces fichiers hors de portée de tout chemin futur. L'appelant
 * renonce, la passe suivante rejoue tout.
 *
 * ─── COÛT DE LA GARDE ───────────────────────────────────────────────────────
 *
 * La requête de garde porte sur `Sound.fileUrl` — indexé — et sur
 * `Sound.coverUrl`, qui ne l'est pas : ce second membre balaie la collection
 * des sons. Une fois par passe horaire du balayage, et une fois par édition
 * retirant un média — jamais sur un chemin de lecture. Ajouter un index sur
 * `coverUrl` ne vaudrait pas la migration MongoDB manuelle que ce dépôt ne
 * joue nulle part (cf. `expiresAt_ephemeral_partial`, toujours non appliqué) ;
 * à reconsidérer si la bibliothèque de sons grandit d'un ordre de grandeur.
 *
 * Un FICHIER en échec, lui, est absorbé. Rejeter sur un `unlink` récalcitrant
 * — un droit manquant, un volume démonté — bloquerait la MÊME fournée à chaque
 * passe, indéfiniment : non pas lente, bloquée. C'est le piège que la borne de
 * fournée du balayage documente déjà. L'octet manqué est journalisé.
 */

/** La seule chose dont ce chemin a besoin d'un stockage de médias. */
export interface PostMediaByteRemover {
  /** Idempotent par contrat `MediaStorage` : un fichier absent n'est pas une erreur. */
  delete(fileUrl: string): Promise<void>;
}

/**
 * Le seul délégué Prisma touché. `Pick` plutôt que `PrismaClient` entier, pour
 * la raison écrite dans `postVisibility.ts` : un appelant qui ne porte qu'une
 * tranche du client doit pouvoir la passer sans assertion.
 */
export type ReclaimMediaPrisma = Pick<PrismaClient, 'sound'>;

/** Les deux seules colonnes d'une ligne `PostMedia` qui désignent des octets. */
export interface PostMediaFileRow {
  readonly fileUrl: string | null;
  readonly thumbnailUrl?: string | null;
}

/**
 * Efface les octets de ces lignes, sauf ceux qu'un `Sound` vivant référence.
 *
 * Prend les LIGNES, jamais un périmètre à requêter lui-même, et les DEUX
 * appelants l'exigent pour des raisons opposées :
 *
 * - le **balayage** doit les lire AVANT de supprimer les commentaires, sans
 *   quoi le `onDelete: SetNull` de `PostMedia.commentId` les lui cache ;
 * - l'**édition** doit les lire AVANT sa transaction, et n'effacer qu'APRÈS
 *   le commit — effacer avant détruirait les fichiers d'une transaction qui
 *   finit par échouer.
 *
 * Un module qui requêterait pour son compte servirait mal les deux.
 *
 * @returns le nombre de fichiers effectivement effacés (vignettes comprises).
 */
export async function reclaimMediaRowBytes(
  prisma: ReclaimMediaPrisma,
  storage: PostMediaByteRemover,
  rows: readonly PostMediaFileRow[],
): Promise<number> {
  // Un même chemin peut revenir deux fois — une vignette partagée, une ligne
  // dupliquée par un incident d'upload. Le `Set` évite le second `unlink`,
  // qui serait sans effet mais compterait pour un succès.
  const urls = [
    ...new Set(
      rows.flatMap((row) => [row.fileUrl, row.thumbnailUrl]).filter((url): url is string => !!url),
    ),
  ];
  if (urls.length === 0) return 0;

  const referencing = await prisma.sound.findMany({
    where: { OR: [{ fileUrl: { in: urls } }, { coverUrl: { in: urls } }] },
    select: { fileUrl: true, coverUrl: true },
  });
  const stillReferenced = new Set(
    referencing.flatMap((sound) => [sound.fileUrl, sound.coverUrl]).filter((url): url is string => !!url),
  );

  const targets = urls.filter((url) => !stillReferenced.has(url));
  if (targets.length === 0) return 0;

  const outcomes = await Promise.allSettled(targets.map((url) => storage.delete(url)));
  const reclaimed = outcomes.filter((outcome) => outcome.status === 'fulfilled').length;

  const failed = outcomes.length - reclaimed;
  if (failed > 0) {
    log.warn('post media bytes: some files resisted reclamation', { failed, reclaimed });
  }

  return reclaimed;
}
