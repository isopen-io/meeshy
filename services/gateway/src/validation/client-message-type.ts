import { z } from 'zod';

/**
 * #12822 — un message `system` n'est écrit que par la passerelle
 * (`conversationNotice.ts`, `CallService`, `captureNoticeRetention.ts`), en
 * direct. Déclaré par un client, il se faisait passer pour un avis de la
 * passerelle et échappait au scellement au repos. Refusé à chaque frontière
 * d'envoi, quelle que soit sa casse.
 */
export const SERVER_ONLY_MESSAGE_TYPE = 'system';

export const isClientMessageType = (value: unknown): boolean =>
  typeof value !== 'string' || value.trim().toLowerCase() !== SERVER_ONLY_MESSAGE_TYPE;

export const clientMessageTypeSchema = z
  .string()
  .refine(isClientMessageType, { message: 'messageType "system" is reserved to the gateway' });
