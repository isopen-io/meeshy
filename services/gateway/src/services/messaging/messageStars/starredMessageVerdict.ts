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
 */
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { protectedPreview } from '../../notifications/notification-preview';
import type { PersonalHistoryHiding } from '../../personalHistoryFilter';

/** Les colonnes du message dont dépend le verdict — et rien d'autre. */
export type StarredMessageProtectionRow = {
  readonly id: string;
  readonly messageType: string;
  readonly createdAt: Date;
  readonly deletedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly isViewOnce: boolean;
  readonly isBlurred: boolean;
  readonly isEncrypted: boolean;
  readonly effectFlags: number;
};

/**
 * - `gone` : supprimé pour tous ou éphémère expiré — la ligne sort, l'étoile
 *   ne se pose pas (404) ;
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

export function starredMessageVerdict(message: StarredMessageProtectionRow, now: Date): StarredMessageVerdict {
  if (message.deletedAt != null || hasExpired(message.expiresAt, now)) return 'gone';
  if (isViewOnce(message)) return 'view-once';
  const masked = protectedPreview({
    messageType: message.messageType,
    isEncrypted: message.isEncrypted,
    isViewOnce: message.isViewOnce,
    isBlurred: message.isBlurred,
    effectFlags: message.effectFlags,
    expiresAt: message.expiresAt,
    createdAt: message.createdAt,
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
