import type { NotificationContentDetail } from '@meeshy/shared/types/notification-content-detail';
import { notificationString, type NotificationStringKey } from '@meeshy/shared/utils/notification-strings';

/**
 * LES LIBELLÉS DES ACTIONS D'UNE BANNIÈRE DE MESSAGE (#8860) — jumeau web de
 * `NotificationDetailCategories` iOS (#8858).
 *
 * iOS tire ses boutons de SON catalogue ; le service worker web est un script
 * classique qui n'en charge aucun (`apps/web/public/sw-push.js`, en-tête). Les
 * libellés voyagent donc DÉJÀ LOCALISÉS dans `data`, comme ceux de l'appel
 * (`callBackPushFields`, `call-incoming-push.ts`) :
 *
 * - `contentActionLabel` — « Ouvrir la carte » pour une position, « Rejoindre »
 *   pour une invitation. Sous la MÊME retenue que les clés du détail
 *   (`detailTravels` : `showPreview` et aucun `notificationLocKey`) : le nom
 *   d'une action dirait à lui seul ce que le message contient.
 * - `replyActionLabel` — « Répondre », sur tout message de conversation. Il ne
 *   dit rien du contenu : il voyage aussi pour un message protégé ou masqué.
 */

const REPLYABLE_TYPES: ReadonlySet<string> = new Set([
  'new_message',
  'message_reply',
  'reply',
  'user_mentioned',
  'message_forwarded',
]);

export type ContentActionPushInput = {
  readonly type: string;
  readonly conversationId: string | undefined;
  readonly detail: NotificationContentDetail | undefined;
  readonly detailTravels: boolean;
  readonly language: () => Promise<string>;
};

export type ContentActionPushFields = {
  readonly contentActionLabel?: string;
  readonly replyActionLabel?: string;
};

function contentActionKey(detail: NotificationContentDetail | undefined): NotificationStringKey | null {
  if (detail?.location) return 'content.action.openMap';
  if (detail?.invite) return 'content.action.join';
  return null;
}

export async function contentActionPushFields(input: ContentActionPushInput): Promise<ContentActionPushFields> {
  if (!input.conversationId || !REPLYABLE_TYPES.has(input.type)) return {};
  const lang = await input.language();
  const key = input.detailTravels ? contentActionKey(input.detail) : null;
  return {
    ...(key ? { contentActionLabel: notificationString(lang, key) } : {}),
    replyActionLabel: notificationString(lang, 'message.action.reply'),
  };
}
