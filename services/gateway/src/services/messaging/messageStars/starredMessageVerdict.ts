/**
 * CE QU'UNE ÉTOILE A LE DROIT DE SERVIR — le verdict unique de l'écriture ET
 * de la liste du favori de message (#7377).
 *
 * Les règles sont celles de `services/gateway/decisions.md`, § « Le favori de
 * message ». Elles vivent ici, en fonctions PURES, pour que la pose d'une
 * étoile et sa lecture ne puissent pas diverger : un message que la liste ne
 * servirait jamais ne doit pas pouvoir être étoilé en silence, et un message
 * étoilable doit pouvoir être servi.
 *
 * Le masquage du contenu protégé n'est PAS réécrit : c'est `protectedPreview`
 * (`notifications/notification-preview.ts`), le prédicat de la bannière, de la
 * citation et de la recherche de médias, dont on ne lit que le verdict.
 *
 * ─── « EXPIRÉ » SE JUGE SUR L'HORLOGE DU LECTEUR (#16604) ───────────────────
 *
 * `Message.expiresAt` d'un message à échéance PAR LECTEUR est l'heure INTERNE
 * de destruction — `max D(u) + 1 h`, ou `envoi + 7 jours` tant que personne n'a
 * reçu. `hasPerReaderEphemeralDeadline` le dit : « quand la réponse est oui,
 * `Message.expiresAt` est une heure interne de destruction et ne se sert à
 * personne ». La lire pour trancher la règle 2 servait la ligne à TOUT
 * destinataire ayant reçu avant le dernier — le cas nominal d'un groupe.
 *
 * Le verdict reçoit donc l'échéance résolue POUR ce lecteur. La borne est celle
 * du SERVICE (`D(u) + 1 h`, `isEphemeralServableToReader`), la même que le fil,
 * `/sync`, les épinglés, la recherche et le lien de partage : le favori est une
 * porte de LECTURE, pas une sortie de contenu — c'est
 * `contentStillVisibleToReader` qui borne à `D(u)` sans grâce, pour un transfert.
 *
 * La colonne garde son mot quand il n'y a PAS d'échéance par lecteur : c'est
 * alors la seule horloge du message (vue unique, éphémère d'un client ancien).
 */
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { hasPerReaderEphemeralDeadline } from '@meeshy/shared/utils/ephemeral-countdown';

import {
  isEphemeralServableToReader,
  type EphemeralReaderResolution,
} from '../../../routes/conversations/ephemeralReaderDeadlines';
import { protectedPreview } from '../../notifications/notification-preview';
import type { PersonalHistoryHiding } from '../../personalHistoryFilter';

/** Les colonnes du message dont dépend le verdict — et rien d'autre. */
export type StarredMessageProtectionRow = {
  readonly id: string;
  readonly messageType: string;
  readonly createdAt: Date;
  readonly deletedAt: Date | null;
  readonly expiresAt: Date | null;
  /** La DURÉE déclarée — avec le bit flamme-œil, ce qui fait l'échéance par lecteur. */
  readonly ephemeralDuration: number | null;
  readonly isViewOnce: boolean;
  readonly isBlurred: boolean;
  readonly isEncrypted: boolean;
  readonly effectFlags: number;
};

/**
 * - `gone` : supprimé pour tous, ou éphémère dont le service est clos POUR CE
 *   LECTEUR (#16604) — la ligne sort, l'étoile ne se pose pas (404) ;
 * - `view-once` : la ligne sort, l'étoile ne se pose pas (409) ;
 * - `placeholder` : flouté, chiffré ou éphémère encore vivant — servi sans
 *   texte, sans traduction, sans média ;
 * - `served` : servi vivant.
 */
export type StarredMessageVerdict = 'gone' | 'view-once' | 'placeholder' | 'served';

function hasExpired(expiresAt: Date | null, now: Date): boolean {
  return expiresAt instanceof Date && expiresAt.getTime() <= now.getTime();
}

function isViewOnce(message: StarredMessageProtectionRow): boolean {
  return message.isViewOnce === true || ((message.effectFlags ?? 0) & MESSAGE_EFFECT_FLAGS.VIEW_ONCE) !== 0;
}

/**
 * Le message a-t-il DISPARU pour ce lecteur ? L'horloge dépend de ce que le
 * message EST : l'échéance servie au lecteur dès qu'il en a une, la colonne
 * sinon — jamais les deux, et jamais la colonne quand il y a mieux.
 */
function goneForReader(
  message: StarredMessageProtectionRow,
  now: Date,
  ephemeralReader: EphemeralReaderResolution | undefined,
): boolean {
  if (message.deletedAt != null) return true;
  return hasPerReaderEphemeralDeadline(message)
    ? !isEphemeralServableToReader(message, ephemeralReader, now)
    : hasExpired(message.expiresAt, now);
}

/**
 * @param params.ephemeralReader l'échéance de CE lecteur sur CE message —
 *   `undefined` quand aucune n'est résolue, ce qui vaut « décompte pas
 *   démarré » (servi), jamais « le décompte d'un autre ». Le paramètre est
 *   REQUIS par le type : un paramètre dont l'absence désactive une garde est un
 *   demi-correctif, et les deux appelants (la pose, la liste) doivent chacun
 *   dire comment ils l'ont lu.
 */
export function starredMessageVerdict(
  message: StarredMessageProtectionRow,
  params: { readonly now: Date; readonly ephemeralReader: EphemeralReaderResolution | undefined },
): StarredMessageVerdict {
  if (goneForReader(message, params.now, params.ephemeralReader)) return 'gone';
  if (isViewOnce(message)) return 'view-once';
  const masked = protectedPreview({
    messageType: message.messageType,
    isEncrypted: message.isEncrypted,
    isViewOnce: message.isViewOnce,
    isBlurred: message.isBlurred,
    effectFlags: message.effectFlags,
    expiresAt: message.expiresAt,
    ephemeralDuration: message.ephemeralDuration,
  });
  return masked === null ? 'served' : 'placeholder';
}

/**
 * Le message est-il lisible par CE lecteur dans sa conversation — plancher
 * d'historique (`historyFloor.ts`) et masquage personnel
 * (`personalHistoryFilter.ts`) ? Même bornes que les requêtes de ces deux
 * modules : le plancher et l'effacement d'historique sont des `gte`, donc un
 * message écrit À l'instant exact reste lisible.
 */
export function readableByReader(
  message: Pick<StarredMessageProtectionRow, 'id' | 'createdAt'>,
  reader: { readonly floor: Date | null; readonly hiding: PersonalHistoryHiding },
): boolean {
  const createdAt = message.createdAt.getTime();
  if (reader.floor && createdAt < reader.floor.getTime()) return false;
  if (reader.hiding.hiddenMessageIds.includes(message.id)) return false;
  const cutoff = reader.hiding.clearHistoryBefore;
  return cutoff === null || createdAt >= cutoff.getTime();
}
