import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isVoiceCloningAgeAdmitted, judgeDeclaredBirthDate, parseBirthDateDay } from '@meeshy/shared/utils/age';
import { ConsentValidationService } from './ConsentValidationService';

type VoiceOwnerId = string | null | undefined;

/**
 * La SEULE question à poser avant d'envoyer `generateVoiceClone: true` au translator (#17309) :
 * chaque personne dont la voix peut être clonée a-t-elle consenti ET 18 ans révolus ?
 * `ConsentValidationService.canUseVoiceCloning` porte la loi ; ce site la pose à toutes les voix
 * en jeu (des `User.id`), et échoue FERMÉ : identité absente, compte introuvable ou lecture en
 * échec ⇒ pas de clone.
 */
export async function voiceCloningAllowedFor(
  prisma: PrismaClient,
  voiceOwnerUserIds: readonly VoiceOwnerId[],
): Promise<boolean> {
  const owners = [...new Set(voiceOwnerUserIds)];
  if (owners.length === 0 || owners.some((owner) => !owner)) return false;
  try {
    const consents = new ConsentValidationService(prisma);
    const verdicts = await Promise.all(
      owners.map(async (owner) => (await consents.getConsentStatus(owner as string)).canUseVoiceCloning),
    );
    return verdicts.every(Boolean);
  } catch {
    return false;
  }
}

/** Un clone demandé (ou laissé au défaut historique « oui ») n'est servi que si toutes les voix y ont droit. */
export async function gatedVoiceClone(
  prisma: PrismaClient,
  params: { readonly requested: boolean | undefined; readonly voiceOwnerUserIds: readonly VoiceOwnerId[] },
): Promise<boolean> {
  if (params.requested === false) return false;
  return voiceCloningAllowedFor(prisma, params.voiceOwnerUserIds);
}

/**
 * `Message.senderId` désigne un `Participant`, jamais un `User` : la voix d'un message appartient
 * au compte derrière ce participant. Un participant sans compte (invité de lien) ou introuvable
 * rend `null`, que `voiceCloningAllowedFor` refuse.
 */
export async function userIdOfParticipant(prisma: PrismaClient, participantId: VoiceOwnerId): Promise<string | null> {
  if (!participantId) return null;
  try {
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      select: { userId: true },
    });
    return participant?.userId ?? null;
  } catch {
    return null;
  }
}

/**
 * La date de naissance qui décide d'un octroi de clonage (#17309, #9927) : celle déjà posée prime ;
 * sinon celle que la requête déclare, écrite UNE fois et seulement si `PUT /me/birth-date` l'admettrait.
 * Sans date retenue, le clonage n'est pas admis.
 */
export function consentBirthDate(
  existingBirthDate: Date | null,
  declaredBirthDateText: string | undefined,
  now: Date,
): { readonly birthDateToWrite: Date | null; readonly cloningAgeAdmitted: boolean } {
  const declared = declaredBirthDateText ? parseBirthDateDay(declaredBirthDateText) : null;
  const birthDateToWrite = declared && !existingBirthDate && judgeDeclaredBirthDate(declared, now) === 'admitted' ? declared : null;
  return { birthDateToWrite, cloningAgeAdmitted: isVoiceCloningAgeAdmitted(existingBirthDate ?? birthDateToWrite, now) };
}
