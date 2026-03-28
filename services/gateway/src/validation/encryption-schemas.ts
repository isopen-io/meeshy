import { z } from 'zod';
import { SignalSchemas } from '@meeshy/shared/utils/validation';

const mongoIdRegex = /^[0-9a-fA-F]{24}$/;
const base64Regex = /^[A-Za-z0-9+/=]+$/;

export const ConversationIdParamSchema = z.object({
  conversationId: z.string().regex(mongoIdRegex, 'Invalid conversationId format (must be MongoDB ObjectId)'),
}).strict();

export const KeyExchangeBodySchema = z.object({
  publicKey: z.string().min(1).regex(base64Regex, 'Public key must be base64 encoded'),
  keyType: z.enum(['identity', 'preKey', 'signedPreKey']),
  keyId: z.number().int().min(0).optional(),
  signature: z.string().regex(base64Regex, 'Signature must be base64 encoded').optional(),
}).strict();

export const PublishKeysBodySchema = SignalSchemas.preKeyBundle.extend({
  kyberPreKeyId: z.number().int().min(0).nullable().optional(),
  kyberPreKeyPublic: z.string().regex(base64Regex, 'Kyber pre-key must be base64 encoded').nullable().optional(),
  kyberPreKeySignature: z.string().regex(base64Regex, 'Kyber signature must be base64 encoded').nullable().optional(),
}).strict();

export type ConversationIdParam = z.infer<typeof ConversationIdParamSchema>;
export type KeyExchangeBody = z.infer<typeof KeyExchangeBodySchema>;
export type PublishKeysBody = z.infer<typeof PublishKeysBodySchema>;
