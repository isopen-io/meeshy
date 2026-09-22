import { z } from 'zod';

/**
 * La DURÉE d'un message éphémère, déclarée UNE fois pour les trois transports
 * d'envoi (#7451) — jumelle de `ENCRYPTION_ENVELOPE_SHAPE` et de
 * `MENTIONED_USER_IDS_SHAPE`, née du même défaut.
 *
 * ## Ce qu'un client envoie, et ce que le serveur en faisait
 *
 * iOS pose `ephemeralDuration` sur le fil depuis `ConversationViewModel+Send`.
 * Aucun des trois schémas ne le déclarait, donc `z.object` le STRIPPAIT — et la
 * colonne `Message.ephemeralDuration`, qui existe au schéma Prisma depuis des
 * mois, n'avait aucun écrivain. Ce que le serveur gardait était l'`expiresAt`
 * que le client avait calculé chez lui, à l'ENVOI : un destinataire hors ligne
 * pendant toute la durée retrouvait un message déjà mort sans l'avoir jamais vu.
 *
 * Directive porteur 2026-09-22 : « les messages avec temps décompté ne doivent
 * décompter que lorsque l'utilisateur l'a reçu ». Ce qui voyage est donc une
 * DURÉE ; l'échéance se dérive par destinataire, côté serveur
 * (`packages/shared/utils/ephemeral-countdown.ts`).
 *
 * ## Le PLAFOND n'est pas ici
 *
 * Aucun `.max()` : le plafond d'un éphémère est une décision de RÉTENTION, et
 * elle est prise une fois, côté serveur, par le plafond de rétention nommé
 * (#7450). Le transport n'a qu'une chose à garantir — que la valeur est une
 * durée, c'est-à-dire un entier de secondes strictement positif. Une durée
 * absurde y produit une échéance absurde, que le balayage de rétention borne
 * de toute façon ; la refuser au transport aurait fait d'un arbitrage produit
 * une règle recopiée en trois endroits.
 *
 * `positive()` et non `nonnegative()` : zéro n'est pas « pas d'éphémère », c'est
 * un message déjà mort à l'envoi. Un envoi non éphémère omet simplement le
 * champ.
 */
export const EPHEMERAL_DURATION_SHAPE = {
  /** Secondes entières, > 0. Absent ⇒ le message n'est pas éphémère. */
  ephemeralDuration: z.number().int().positive().optional(),
} as const;
