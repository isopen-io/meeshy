import { servedEphemeralExpiresAt } from '@meeshy/shared/utils/ephemeral-countdown';
import type { MessageProtectionRow } from './messages-list-query-types';
import type { EphemeralReaderResolution } from './ephemeralReaderDeadlines';

/**
 * Les quatre familles de protection d'un message — vue unique, flou,
 * expiration, et le bitfield qui les résume — plus les deux compteurs de
 * limite/vues de la vue unique. Source UNIQUE du `select` Prisma ET de la
 * projection servie : #4885 a mesuré que `GET .../messages/search` les
 * réécrivait à la main sans elles, laissant un message à vue unique trouvé
 * par recherche FORWARDABLE (le garde côté client lit `isViewOnce`, absent
 * de la réponse). Toute route qui sert `Message.content` doit ce bloc, ou
 * dire pourquoi non (#4885 critère 4).
 */
export const MESSAGE_PROTECTION_SELECT = {
  isViewOnce: true,
  maxViewOnceCount: true,
  viewOnceCount: true,
  isBlurred: true,
  effectFlags: true,
  expiresAt: true,
  // #7451 — la DURÉE. C'est elle, et non l'échéance, qui est la même pour tout
  // le monde : les trois clients en dérivent leur décompte local.
  ephemeralDuration: true,
} as const;

/**
 * Projette les mêmes champs depuis une ligne Prisma déjà chargée — le pendant
 * servi de `MESSAGE_PROTECTION_SELECT`.
 *
 * ─── `expiresAt` N'EST PLUS LA COLONNE, POUR UN ÉPHÉMÈRE (#7451) ────────────
 *
 * Depuis la directive du 2026-09-22, `Message.expiresAt` porte l'heure de
 * DESTRUCTION du contenu — une valeur INTERNE, qui vaut le plafond de rétention
 * tant que personne n'a reçu, et qui recule à mesure que les destinataires
 * reçoivent. La servir telle quelle ferait afficher « ce message disparaît dans
 * 7 jours » sous un éphémère de trente secondes.
 *
 * Ce qui se sert est l'échéance du LECTEUR : `D(lecteur)` pour un destinataire,
 * la plus tardive des `D(u)` connues pour l'expéditeur, `null` tant que rien
 * n'a démarré. D'où le second paramètre — et d'où son ABSENCE qui, pour un
 * éphémère, sert `null` plutôt que la colonne : une porte de service échoue en
 * montrant MOINS, jamais plus. Un appelant qui n'a pas résolu les échéances
 * sert donc un message sans décompte, jamais le décompte de quelqu'un d'autre.
 *
 * Un message NON éphémère (`ephemeralDuration` nul) garde la colonne intacte :
 * c'est le chemin de la grâce de vue unique, que ce lot ne touche pas.
 */
export function mapMessageProtectionFields(
  message: MessageProtectionRow,
  reader?: EphemeralReaderResolution,
): MessageProtectionRow {
  return {
    isViewOnce: message.isViewOnce,
    maxViewOnceCount: message.maxViewOnceCount,
    viewOnceCount: message.viewOnceCount,
    isBlurred: message.isBlurred,
    effectFlags: message.effectFlags,
    ephemeralDuration: message.ephemeralDuration ?? null,
    expiresAt: servedEphemeralExpiresAt({
      ephemeralDuration: message.ephemeralDuration,
      rawExpiresAt: message.expiresAt ?? null,
      isSender: reader?.isSender ?? false,
      readerDeadline: reader?.readerDeadline ?? null,
      latestRecipientDeadline: reader?.latestRecipientDeadline ?? null,
    }),
  };
}
