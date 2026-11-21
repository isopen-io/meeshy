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
 *  - {@link uploaderIdentityOf} / {@link resolveUploaderIdentity} ÉCRIVENT
 *    l'identité de compte (`userId ?? id`, la convention que le dépôt applique
 *    partout où une identité de participant sert de clé de compte) ;
 *  - {@link ownsAsUploader} RECONNAÎT les lignes héritées, écrites avant
 *    l'unification et que rien ne réécrit.
 */

/**
 * L'identité de compte d'un participant chargé.
 *
 * Le repli (participant absent) est le comportement d'AVANT l'unification, et
 * c'est délibéré : une ligne écrite ainsi reste reconnue par
 * {@link ownsAsUploader}, alors qu'échouer ferait naître une pièce sans
 * déposant — bien pire que l'ancien défaut.
 */
export function uploaderIdentityOf(
  participant: { readonly userId?: string | null } | null | undefined,
  fallbackParticipantId: string
): string {
  return participant?.userId ?? fallbackParticipantId;
}

/** La même, quand seul l'identifiant du participant est en main. */
export async function resolveUploaderIdentity(
  prisma: UploaderIdentityPrisma,
  participantId: string
): Promise<string> {
  try {
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      select: { userId: true },
    });
    return uploaderIdentityOf(participant, participantId);
  } catch (error: unknown) {
    logger.warn('uploader identity lookup failed — falling back to the participant id', { participantId, error });
    return participantId;
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
