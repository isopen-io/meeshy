/**
 * Les RÉGLAGES PAR PERSONNE que JE pose pour l'autre — `GET|PUT
 * /api/v1/relations/:userId/settings` (spec cercles § 4). Des préférences de
 * RÉCEPTION, actives par défaut (#14407) : `bringBlocked` (#13936) coupe le Bring
 * de cette personne vers moi, `talkieBlocked` (#13935) la réception directe de
 * son talkie (sa voix arrive alors en message vocal).
 *
 * L'écriture est PARTIELLE (au moins un réglage) et STRICTE : un réglage inconnu
 * est refusé, jamais ignoré — un client ne doit pas croire avoir réglé ce que le
 * serveur ne tient pas.
 */
import { z } from 'zod';

export const relationPersonSettingsSchema = z.object({
  userId: z.string(),
  bringBlocked: z.boolean(),
  talkieBlocked: z.boolean(),
});
export type RelationPersonSettings = z.infer<typeof relationPersonSettingsSchema>;

export const relationPersonSettingsUpdateSchema = z
  .object({ bringBlocked: z.boolean().optional(), talkieBlocked: z.boolean().optional() })
  .strict()
  .refine((value) => value.bringBlocked !== undefined || value.talkieBlocked !== undefined, { message: 'Aucun réglage' });
export type RelationPersonSettingsUpdate = z.infer<typeof relationPersonSettingsUpdateSchema>;
