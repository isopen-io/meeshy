import { z } from 'zod';

export const DeleteAccountBodySchema = z.object({
  confirmationPhrase: z.literal('SUPPRIMER MON COMPTE')
}).strict();

/**
 * L'ouverture d'une demande de suppression exige la preuve qu'on est LÀ, pas
 * seulement qu'on détient un jeton : sans mot de passe courant, un jeton volé
 * ouvrait la suppression du compte (#4183).
 */
export const OpenAccountDeletionBodySchema = z.object({
  confirmationPhrase: z.literal('SUPPRIMER MON COMPTE'),
  currentPassword: z.string().min(1)
}).strict();

export const TokenQuerySchema = z.object({
  token: z.string().min(1)
}).strict();

export type DeleteAccountBody = z.infer<typeof DeleteAccountBodySchema>;
export type TokenQuery = z.infer<typeof TokenQuerySchema>;

export type OpenAccountDeletionBody = z.infer<typeof OpenAccountDeletionBodySchema>;
