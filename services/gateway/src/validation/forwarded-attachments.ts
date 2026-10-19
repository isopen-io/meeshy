import { z } from 'zod';
import { MAX_ATTACHMENTS_PER_MESSAGE } from '@meeshy/shared/types/attachment';
import { OBJECT_ID_REGEX } from '@meeshy/shared/utils/object-id';

/**
 * #9914 — les pièces de `forwardedFromId` à recopier, déclarées UNE fois pour
 * les trois transports d'envoi (REST, socket texte, socket pièces jointes) :
 * un champ absent d'un schéma `z.object` y serait strippé en silence, et ce
 * transport recopierait tout le lot sous le nom d'une seule pièce.
 *
 * Identifiants Mongo (une chaîne malformée lèverait P2023 dans la requête de
 * copie), au moins un, et jamais plus qu'un message n'en porte. L'appartenance
 * au message source se juge à l'admission (`forwardAdmission.ts`).
 */
export const FORWARDED_ATTACHMENT_IDS_SHAPE = {
  forwardedAttachmentIds: z
    .array(z.string().regex(OBJECT_ID_REGEX, 'Invalid attachment id'))
    .min(1)
    .max(MAX_ATTACHMENTS_PER_MESSAGE)
    .optional(),
};

/**
 * Les références de transfert d'un envoi socket validé, recopiées en BLOC :
 * les deux chemins socket ne peuvent plus en oublier une — c'est l'omission de
 * `forwardedAttachmentIds` sur un seul d'entre eux qui ferait recopier tout le
 * lot sous le nom d'une pièce.
 */
export const forwardReferencesOf = (validated: {
  readonly forwardedFromId?: string;
  readonly forwardedFromConversationId?: string;
  readonly forwardedAttachmentIds?: readonly string[];
}) => ({
  forwardedFromId: validated.forwardedFromId,
  forwardedFromConversationId: validated.forwardedFromConversationId,
  forwardedAttachmentIds: validated.forwardedAttachmentIds,
});
