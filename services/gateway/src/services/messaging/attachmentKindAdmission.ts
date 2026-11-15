/**
 * Ce qu'un participant a le droit de RATTACHER à un message, à l'envoi — la
 * route REST canonique et `message:send-with-attachments` convergent ici
 * (`MessagingService.handleMessage`, étape 3.8).
 *
 * Deux régimes, et un seul s'applique :
 *
 * - le lien de l'INVITÉ liste ses familles, ou sa conversation les plafonne
 *   (World Wide, #10001) : chaque pièce doit appartenir à une famille ouverte,
 *   lue sur le type ADMIS à l'upload — que la garde de `ContentSignature.ts` a
 *   prouvé sur le contenu entier. Ni `allowAnonymousFiles` ni l'instantané du
 *   join n'entrent (#10029) : un invité entré quand le lien fermait la porte des
 *   fichiers joint son `.txt`. Seul un refus EXPLICITE de l'hôte
 *   (`anonymousSession.rights`) reste souverain ;
 * - sinon, la règle de #5151 : le droit de chaque type, résolu depuis
 *   l'instantané et sa surcharge.
 *
 * Un compte n'a pas de lien d'invité : seul le second régime le concerne.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  GUEST_ATTACHMENT_REFUSAL_CODES,
  guestAttachmentKindOfMimeType,
  type GuestAttachmentKind,
} from '@meeshy/shared/types/guest-attachment-kinds';
import type { ParticipantPermissions } from '@meeshy/shared/types/participant';
import { guestAttachmentKindsOf } from '../attachments/ContentSignature';
import { attachmentSendRightForMimeType, type ParticipantRightsOverride } from '../participantRights';

const ATTACHMENT_RIGHT_NOT_PERMITTED = 'ATTACHMENT_RIGHT_NOT_PERMITTED';

export type AttachmentSendRefusal = {
  readonly code: typeof ATTACHMENT_RIGHT_NOT_PERMITTED | typeof GUEST_ATTACHMENT_REFUSAL_CODES.KIND_NOT_ALLOWED;
  readonly message: string;
};

const RIGHT_REFUSAL: AttachmentSendRefusal = {
  code: ATTACHMENT_RIGHT_NOT_PERMITTED,
  message: 'Vous n\'êtes pas autorisé à envoyer ce type de pièce jointe',
};

/**
 * Les familles ouvertes à l'invité de ce lien, ou `null` quand le lien ne
 * restreint pas par famille. Un lien disparu ne rouvre rien : la conversation
 * garde son plafond.
 */
export async function loadGuestAttachmentKinds(
  prisma: Pick<PrismaClient, 'conversationShareLink' | 'conversation'>,
  params: { readonly shareLinkId: string; readonly conversationId: string },
): Promise<readonly GuestAttachmentKind[] | null> {
  const link = await prisma.conversationShareLink.findUnique({
    where: { id: params.shareLinkId },
    select: { allowedAttachmentKinds: true, conversation: { select: { identifier: true } } },
  });
  if (link) return guestAttachmentKindsOf(link);
  const conversation = await prisma.conversation.findUnique({ where: { id: params.conversationId }, select: { identifier: true } });
  return guestAttachmentKindsOf({ conversation });
}

/**
 * Ce qu'un envoi fait PORTER à son message : les pièces rattachées, mais aussi
 * celles qu'un TRANSFERT (`forwardedFromId`) ou une DIFFUSION
 * (`copyAttachmentsFromMessageId`) recopie depuis sa source
 * (`MessageProcessor.handleAttachments`) avec l'expéditeur pour auteur. Une
 * garde qui ne lirait que `attachmentIds` laisserait un invité de World Wide
 * faire porter une image à son message en transférant celui d'un compte
 * (#10051). L'union est volontaire : quelle que soit la branche que la copie
 * prend, rien de ce qu'elle peut recopier n'échappe à la garde.
 */
export type CarriedAttachments = {
  readonly attachmentIds?: readonly string[];
  readonly forwardedFromId?: string;
  readonly copyAttachmentsFromMessageId?: string;
};

export function carriesAttachments(carried: CarriedAttachments): boolean {
  return Boolean(carried.attachmentIds?.length || carried.forwardedFromId || carried.copyAttachmentsFromMessageId);
}

export async function loadCarriedAttachmentMimeTypes(
  prisma: Pick<PrismaClient, 'messageAttachment'>,
  carried: CarriedAttachments,
): Promise<readonly (string | null)[]> {
  const sourceMessageIds = [carried.forwardedFromId, carried.copyAttachmentsFromMessageId]
    .filter((id): id is string => Boolean(id));
  const clauses = [
    ...(carried.attachmentIds?.length ? [{ id: { in: [...carried.attachmentIds] } }] : []),
    ...(sourceMessageIds.length ? [{ messageId: { in: sourceMessageIds } }] : []),
  ];
  if (clauses.length === 0) return [];
  const attachments = await prisma.messageAttachment.findMany({
    where: { OR: clauses },
    select: { mimeType: true },
  });
  return attachments.map((attachment) => attachment.mimeType);
}

/** Le refus, ou `null` quand chaque pièce peut être rattachée. */
export function attachmentSendRefusal(params: {
  readonly mimeTypes: readonly (string | null | undefined)[];
  readonly guestKinds: readonly GuestAttachmentKind[] | null;
  readonly senderRights: ParticipantPermissions | null;
  readonly hostOverride: ParticipantRightsOverride | null | undefined;
}): AttachmentSendRefusal | null {
  const { mimeTypes, guestKinds, senderRights, hostOverride } = params;
  if (guestKinds !== null) {
    const outsideKinds = mimeTypes.some((mimeType) => {
      const kind = guestAttachmentKindOfMimeType(mimeType);
      return !kind || !guestKinds.includes(kind);
    });
    if (outsideKinds) {
      return {
        code: GUEST_ATTACHMENT_REFUSAL_CODES.KIND_NOT_ALLOWED,
        message: `Les invités ne peuvent joindre ici que : ${guestKinds.join(', ') || 'aucune pièce jointe'}`,
      };
    }
    return mimeTypes.some((mimeType) => hostOverride?.[attachmentSendRightForMimeType(mimeType)] === false) ? RIGHT_REFUSAL : null;
  }
  if (!senderRights) return null;
  return mimeTypes.some((mimeType) => senderRights[attachmentSendRightForMimeType(mimeType)] === false) ? RIGHT_REFUSAL : null;
}
