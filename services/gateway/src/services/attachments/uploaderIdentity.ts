import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'uploaderIdentity' });

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

/** Ce que ce module demande à Prisma, et rien de plus. */
export type UploaderIdentityPrisma = Pick<PrismaClient, 'participant'>;

/**
 * **QUI a déposé une pièce jointe, dans UN seul espace de clés (#20113).**
 *
 * `MessageAttachment.uploadedBy` avait deux écrivains et deux espaces : les
 * quatre sites de téléversement (`UploadProcessor` ×2, `tus-handler` ×2) y
 * posent l'identité de COMPTE, les deux sites de copie (`copyAttachments`,
 * `MessageProcessor.copyForwardedAttachments`) y posaient un `Participant.id`.
 *
 * Ce n'était pas un détail interne : le champ est SERVI aux clients — le schéma
 * de la galerie le décrit « *Uploader id — gates the delete affordance* » — et
 * seul le serveur peut faire la jointure `Participant → User` qui lui donnerait
 * un sens. Le web comparait donc `uploadedBy` à l'identifiant du lecteur et
 * CACHAIT le bouton sur une copie transférée, que la route de suppression
 * accordait pourtant (#13608).
 *
 * `GlobalAchievements` avait déjà tranché la sémantique voulue sans le savoir :
 * il compte sur `uploadedBy` **plutôt que** sur `message.sender.userId`,
 * « (indexé) … deux `$lookup` imbriqués par pièce jointe ». Ce site lit donc
 * `uploadedBy` comme un identifiant d'utilisateur, et c'est ce que les
 * écrivains de téléversement y mettent : **les écrivains de copie étaient la
 * déviation, pas la norme.**
 *
 * Deux responsabilités vivent ici, et elles ne se confondent pas :
 *  - {@link uploaderStampOf} / {@link resolveUploaderStamp} ÉCRIVENT l'EMPREINTE
 *    du déposant — son identité de compte (`userId ?? id`, la convention que le
 *    dépôt applique partout où une identité de participant sert de clé de
 *    compte) ET son anonymat, les deux ensemble (#20142) ;
 *  - {@link ownsAsUploader} RECONNAÎT les lignes héritées, écrites avant
 *    l'unification et que rien ne réécrit.
 */

/**
 * **L'EMPREINTE du déposant : son identité ET son anonymat (#20142).**
 *
 * `uploadedBy` et `isAnonymous` répondent à LA MÊME question — *qui a fait
 * cette ligne ?* — et les quatre écrivains de téléversement les posent
 * ensemble, depuis le même contexte d'authentification. Les deux écrivains de
 * COPIE posaient `isAnonymous: false` sans condition, depuis
 * `copiedAttachmentFields`, qui **ne connaît pas le copieur**.
 *
 * Le coût : un invité qui transférait une pièce ne pouvait plus la supprimer.
 * La branche anonyme de `DELETE /attachments/:id` exige les DEUX
 * (`uploadedBy === userId && isAnonymous`), et le web OFFRE pourtant le bouton,
 * qui ne regarde que `uploadedBy` — donc une affordance qui échoue, pire qu'une
 * affordance absente.
 *
 * Les rendre ENSEMBLE est ce qui empêche la divergence de revenir : il n'y a
 * plus d'endroit où l'un se pose sans l'autre.
 *
 * **Le repli n'invente jamais d'anonymat.** Participant illisible ou absent ⇒
 * `{ uploadedBy: participantId, isAnonymous: false }`, exactement ce que le
 * code écrivait avant. Affirmer l'anonymat d'une ligne dont on n'a pas lu le
 * déposant OUVRIRAIT la branche anonyme du `DELETE` à quiconque porte cet
 * identifiant — un repli ne doit pas être plus permissif que la vérité.
 */
export type UploaderStamp = {
  readonly uploadedBy: string;
  readonly isAnonymous: boolean;
};

export function uploaderStampOf(
  participant: { readonly userId?: string | null } | null | undefined,
  fallbackParticipantId: string
): UploaderStamp {
  const userId = participant?.userId ?? null;
  if (userId !== null) return { uploadedBy: userId, isAnonymous: false };
  return {
    uploadedBy: fallbackParticipantId,
    // ANONYME seulement quand la ligne du participant a été LUE et dit que ce
    // participant n'a pas de compte. Un participant absent n'est pas un invité.
    isAnonymous: participant !== null && participant !== undefined,
  };
}

/** La même, quand seul l'identifiant du participant est en main. */
export async function resolveUploaderStamp(
  prisma: UploaderIdentityPrisma,
  participantId: string
): Promise<UploaderStamp> {
  try {
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      select: { userId: true },
    });
    return uploaderStampOf(participant, participantId);
  } catch (error: unknown) {
    logger.warn('uploader stamp lookup failed — falling back to the participant id, not anonymous', { participantId, error });
    return { uploadedBy: participantId, isAnonymous: false };
  }
}

/**
 * Le lecteur est-il le déposant de cette pièce ?
 *
 * Extraite de `routes/attachments/metadata.ts`, où #13608 l'avait écrite — et
 * où elle était restée PRIVÉE, sans autre appelant : la règle valait là où
 * quelqu'un l'avait récitée, et nulle part ailleurs.
 *
 * Depuis l'unification des écrivains, son second test ne sert plus qu'aux
 * lignes HÉRITÉES. Il ne peut pas partir pour autant : rien ne réécrit les
 * lignes déjà en base.
 *
 * Le `!= null` sur `participant.userId` et le refus en tête sur `userId` sont
 * un DURCISSEMENT par rapport à l'original (`participant?.userId === userId`),
 * pas un déplacement : sur l'arbre d'aujourd'hui aucun appelant ne passe une
 * identité nulle — tracé depuis `routes/attachments/metadata.ts` jusqu'à
 * `middleware/auth.ts`, la branche inscrite pose toujours un ObjectId — mais
 * la fonction est désormais PUBLIQUE, et le prochain appelant ne sera pas
 * gardé par cette trace.
 *
 * Elle reconnaît le propriétaire sous les deux identifiants, et **seulement
 * s'il s'agit de SON participant** : l'identifiant d'un participant d'autrui,
 * anonyme ou inconnu ne donne rien. Une lecture en échec refuse — fail-closed,
 * puisque le verdict ouvre l'accès.
 */
export async function ownsAsUploader(
  prisma: UploaderIdentityPrisma,
  uploadedBy: string | null | undefined,
  userId: string
): Promise<boolean> {
  // #20113 F6 — le refus explicite de l'APPELANT sans identité. Le `tsconfig`
  // du gateway porte `strictNullChecks: false` : la signature `userId: string`
  // accepte `null` et `undefined` sans erreur de compilation, et ce prédicat
  // OUVRE un accès. Il ne doit donc pas dépendre de ce qu'une comparaison
  // rendrait par chance.
  if (!userId) return false;
  if (!uploadedBy) return false;
  if (uploadedBy === userId) return true;
  if (!OBJECT_ID_PATTERN.test(uploadedBy)) return false;
  try {
    const participant = await prisma.participant.findUnique({
      where: { id: uploadedBy },
      select: { userId: true },
    });
    return participant?.userId != null && participant.userId === userId;
  } catch (error: unknown) {
    logger.warn('uploader participant lookup failed', { error });
    return false;
  }
}
