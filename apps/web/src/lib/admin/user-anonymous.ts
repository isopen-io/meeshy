import { getUserPresenceStatus } from '@meeshy/shared/utils/user-presence';

import type { AdminEntityRef } from '@/components/admin/entity-chip';
import type { AdminAnonymousConversation, AdminAnonymousRow } from '@/lib/api/admin-anonymous';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { interpretAccountState, interpretConversationType, interpretPresence } from './interpret/enums';
import { conversationLabel, guestLabel } from './interpret/labels';
import type { Interpreted } from './interpret/types';
import { humanizeKey } from './preference-labels';

/**
 * **LES INVITÉS, NOMMÉS ET INTERPRÉTÉS** (#8876) — ce qu'il faut d'un participant
 * anonyme pour le reconnaître (nom, photo, présence), dire où il parle
 * (conversation), dire ce qu'il est devenu (état) et ce qu'il a le droit de faire
 * (permissions en phrases). Fonctions PURES : la langue et l'horloge s'injectent.
 */

/** Un invité, comme une ENTITÉ : son nom (jamais « — » ni son identifiant), sa photo, sa présence CALCULÉE. */
export function anonymousEntityOf(row: AdminAnonymousRow, language: AdminLanguage, now: Date): AdminEntityRef {
  return {
    kind: 'anonymous',
    id: row.id,
    label: guestLabel(row.displayName, language),
    avatarUrl: row.avatar === '' ? null : row.avatar,
    presence: getUserPresenceStatus({ isOnline: row.isOnline, lastActiveAt: row.lastActiveAt }, now.getTime()),
  };
}

/** La conversation où il parle : son titre (ou « Conversation sans titre »), son type dit en mots quand il est servi. */
export function anonymousConversationRefOf(conversation: AdminAnonymousConversation, language: AdminLanguage): AdminEntityRef {
  return {
    kind: 'conversation',
    id: conversation.id,
    label: conversationLabel({ title: conversation.title, type: conversation.type }, language),
    secondary: conversation.type === '' ? null : interpretConversationType(conversation.type, language).label,
  };
}

/**
 * Un SEUL état, le plus parlant : parti (`leftAt`) > accès retiré (`isActive` faux,
 * sans départ daté — typiquement un lien fermé) > actif.
 */
export function anonymousStateOf(row: Pick<AdminAnonymousRow, 'isActive' | 'leftAt'>, language: AdminLanguage): Interpreted {
  if (row.leftAt !== null) {
    return { label: translateAdmin(language, 'admin.people.anonymous.state.left'), tone: 'neutral', explain: translateAdmin(language, 'admin.people.anonymous.state.left.explain'), glyph: 'userMinus', raw: 'left' };
  }
  if (!row.isActive) {
    return { label: translateAdmin(language, 'admin.people.anonymous.state.revoked'), tone: 'warning', explain: translateAdmin(language, 'admin.people.anonymous.state.revoked.explain'), glyph: 'prohibit', raw: 'revoked' };
  }
  return interpretAccountState('active', language);
}

/**
 * La présence, DITE — « Non communiquée » quand la passerelle ne la sert pas (un
 * lecteur sans rang d'administration reçoit `isOnline: false` et aucune activité :
 * ce n'est pas « hors ligne depuis toujours »).
 */
export function anonymousPresenceOf(row: Pick<AdminAnonymousRow, 'isOnline' | 'lastActiveAt'>, now: Date, language: AdminLanguage): Interpreted {
  if (!row.isOnline && row.lastActiveAt === null) return interpretPresence('unknown', language);
  return interpretPresence(getUserPresenceStatus(row, now.getTime()), language);
}

/** Les permissions qu'un participant anonyme reçoit à son arrivée — chacune a sa phrase, accordée et refusée. */
export const ANONYMOUS_PERMISSION_KEYS = [
  'canSendMessages',
  'canSendImages',
  'canSendFiles',
  'canSendVideos',
  'canSendAudios',
  'canSendLocations',
  'canSendLinks',
  'canViewHistory',
] as const;

export type AnonymousPermissionKey = (typeof ANONYMOUS_PERMISSION_KEYS)[number];

const isPermissionKey = (key: string): key is AnonymousPermissionKey => ANONYMOUS_PERMISSION_KEYS.some((known) => known === key);

/**
 * Une permission dite en PHRASE (« Peut envoyer des fichiers » / « Ne peut pas… »),
 * jamais `canSendFiles`. Une permission que la passerelle ajouterait demain est
 * humanisée et dite Oui / Non : un repli, jamais la clé brute.
 */
export function anonymousPermissionPhrase(key: string, granted: boolean, language: AdminLanguage): string {
  if (!isPermissionKey(key)) return `${humanizeKey(key)} : ${translateAdmin(language, granted ? 'admin.list.yes' : 'admin.list.no')}`;
  return translateAdmin(language, granted ? `admin.people.anonymous.perm.${key}.yes` : `admin.people.anonymous.perm.${key}.no`);
}
