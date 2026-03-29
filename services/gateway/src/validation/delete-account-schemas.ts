import { z } from 'zod';

export const DeleteAccountBodySchema = z.object({
  confirmationPhrase: z.literal('SUPPRIMER MON COMPTE')
}).strict();

export const TokenQuerySchema = z.object({
  token: z.string().min(1)
}).strict();

export type DeleteAccountBody = z.infer<typeof DeleteAccountBodySchema>;
export type TokenQuery = z.infer<typeof TokenQuerySchema>;
