import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import {
  EPHEMERAL_UNRECEIVED_RETENTION_MS,
  normalizeEphemeralDuration,
} from '@meeshy/shared/utils/ephemeral-countdown';

/**
 * Les deux colonnes d'éphémère qu'un ENVOI écrit — le point où les trois
 * transports se rejoignent (#7451).
 *
 * ─── CE QUE `expiresAt` VEUT DIRE À PARTIR D'ICI ────────────────────────────
 *
 * Avant ce lot, la colonne portait l'échéance que le CLIENT avait calculée chez
 * lui, à l'envoi, et les trois clients l'affichaient telle quelle. Elle porte
 * désormais l'heure de DESTRUCTION du contenu — une valeur INTERNE, que plus
 * aucun lecteur ne reçoit pour un éphémère (`servedEphemeralExpiresAt`), et que
 * `startEphemeralCountdowns` recalcule à chaque première réception.
 *
 * À l'envoi, personne n'a encore rien reçu : la valeur est donc le PLAFOND DE
 * RÉTENTION (#7450). C'est ce qui garantit qu'un message adressé à quelqu'un qui
 * ne se reconnecte jamais finit quand même par être détruit — sans lui, la
 * colonne resterait nulle et le balayage ne verrait jamais la ligne.
 *
 * ─── UN ANCIEN CLIENT N'EST PAS IGNORÉ, IL EST TRADUIT ──────────────────────
 *
 * Un binaire déjà distribué n'envoie qu'`expiresAt`. On n'en garde pas
 * l'échéance — elle n'a de sens que sur son horloge — mais la DISTANCE au moment
 * de l'envoi, qui est la seule chose qu'il voulait dire. La conversion vit dans
 * `normalizeEphemeralDuration`, à côté de la loi qu'elle sert.
 */
export interface EphemeralSendFields {
  readonly ephemeralDuration: number | null;
  readonly expiresAt: Date | null;
  /**
   * #7578 — le PLAFOND DE RÉTENTION d'une vue unique (#7450) : son contenu est
   * purgé à cette échéance même si un destinataire ne l'ouvre jamais. Absent
   * pour un message ordinaire. La grâce posée quand tous les destinataires ont
   * ouvert (`scheduleViewOnceBurn`) ne peut que la RAPPROCHER.
   */
  readonly viewOnceBurnAt?: Date;
}

export function ephemeralSendFields(input: {
  readonly ephemeralDuration?: number | null;
  readonly expiresAt?: Date | null;
  readonly isViewOnce?: boolean | null;
  readonly now: Date;
}): EphemeralSendFields {
  const duration = normalizeEphemeralDuration({
    ephemeralDuration: input.ephemeralDuration,
    expiresAt: input.expiresAt,
    now: input.now,
  });
  const retentionCap = new Date(input.now.getTime() + EPHEMERAL_UNRECEIVED_RETENTION_MS);
  const viewOnce = input.isViewOnce === true ? { viewOnceBurnAt: retentionCap } : {};

  if (duration === null) {
    return { ephemeralDuration: null, expiresAt: input.expiresAt ?? null, ...viewOnce };
  }

  return { ephemeralDuration: duration, expiresAt: retentionCap, ...viewOnce };
}

/**
 * Le bitfield `effectFlags`, recomposé depuis les colonnes que le client
 * déclare — un client peut n'envoyer que l'une ou l'autre forme, et les deux
 * doivent tenir.
 *
 * Extrait de `MessageProcessor.saveMessage` avec #7451 : `ephemeralDuration`
 * rejoint `expiresAt` comme PREUVE d'éphémère (un client à jour n'envoie plus
 * que la durée, et sans cette ligne son message perdait le bit EPHEMERAL), et
 * le fichier hôte est au plafond de son cliquet de taille.
 */
export function composeMessageEffectFlags(declared: {
  readonly effectFlags?: number;
  readonly isBlurred?: boolean;
  readonly expiresAt?: Date | null;
  readonly ephemeralDuration?: number | null;
  readonly isViewOnce?: boolean;
}): number {
  let flags = declared.effectFlags ?? 0;
  if (declared.isBlurred) flags |= MESSAGE_EFFECT_FLAGS.BLURRED;
  if (declared.expiresAt || declared.ephemeralDuration) flags |= MESSAGE_EFFECT_FLAGS.EPHEMERAL;
  if (declared.isViewOnce) flags |= MESSAGE_EFFECT_FLAGS.VIEW_ONCE;
  return flags;
}
