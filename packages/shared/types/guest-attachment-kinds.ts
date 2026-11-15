import { z } from 'zod';

import { GUEST_ATTACHMENT_KINDS } from './guest-attachment-kind-rules.js';

/**
 * Les SCHÉMAS des familles de pièces jointes d'un invité (#10001). Les règles,
 * les constantes et les codes vivent sans Zod dans
 * `guest-attachment-kind-rules.ts` (#10038), réexporté ici : tout import
 * existant de ce module reste valide.
 */
export * from './guest-attachment-kind-rules.js';

export const guestAttachmentKindSchema = z.enum(GUEST_ATTACHMENT_KINDS);

/** La forme servie dans les termes du lien : `null` = aucune restriction par famille. */
export const allowedAttachmentKindsSchema = z.array(guestAttachmentKindSchema).nullable();
