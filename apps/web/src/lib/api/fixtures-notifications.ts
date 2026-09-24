import { categoryAccepts, type NotificationCategory } from '@/lib/notifications/categories';
import type { NotificationRecord } from '@/lib/notifications/record';

import { CONVERSATION_ID, minutesAgo } from './fixtures-base';
import type { ApiResult } from './http';
import type { NotificationCounts, NotificationsPage } from './notifications';

/**
 * **LE CORPUS DE RECETTE DE LA CLOCHE** (#6288) — douze notifications, dont
 * TROIS non lues, réparties sur huit des onze catégories. « Appels » est
 * volontairement VIDE : c'est la catégorie où l'état vide se recette.
 *
 * Les cibles sont celles des AUTRES corpus (`fixtures-base.ts`,
 * `fixtures-feed.ts`, `fixtures-stories.ts`) : une ligne qui mènerait à une
 * conversation ou à une publication que le POC ne sert pas serait une recette
 * qui ment.
 *
 * `read` et `deleted` mémorisent, pour la durée du processus, ce que la
 * passerelle SIMULÉE a enregistré — même discipline que `fixtures-reactions.ts` :
 * une page relue après un marquage le reflète, et
 * `resetFixtureNotificationsForTests` évite qu'un témoin dépende d'un autre.
 */

const read = new Set<string>();
const deleted = new Set<string>();

export function resetFixtureNotificationsForTests(): void {
  read.clear();
  deleted.clear();
}

const at = (minutes: number): string => minutesAgo(minutes).toISOString();

const notification = (
  partial: Pick<NotificationRecord, 'id' | 'type' | 'title' | 'content'> & Partial<NotificationRecord> & { readonly minutes: number },
): NotificationRecord => {
  const { minutes, ...rest } = partial;
  return {
    actor: null,
    context: {},
    metadata: {},
    state: { isRead: true, createdAt: at(minutes) },
    ...rest,
    ...(rest.state === undefined ? {} : { state: { ...rest.state, createdAt: at(minutes) } }),
  };
};

const kwame = { id: 'u-kwame', username: 'kwame', displayName: 'Kwame Mensah', avatar: null } as const;
const amina = { id: 'u-amina', username: 'amina', displayName: 'Amina Diallo', avatar: null } as const;
const fatou = { id: 'u-fatou', username: 'fatou', displayName: 'Fatou Ndiaye', avatar: null } as const;
const camille = { id: 'u-camille', username: 'camille', displayName: 'Camille Roy', avatar: null } as const;
const bruno = { id: 'u-bruno', username: 'bruno', displayName: 'Bruno Laurent', avatar: null } as const;

const deploiement = { conversationId: CONVERSATION_ID, conversationTitle: 'Équipe déploiement', conversationType: 'group' } as const;

const CORPUS: readonly NotificationRecord[] = [
  notification({
    id: 'fx-notif-mention',
    type: 'user_mentioned',
    title: 'Kwame Mensah vous a mentionné',
    content: '@vous tu peux relire la PR avant 18 h ?',
    actor: kwame,
    context: { ...deploiement, messageId: 'm7' },
    state: { isRead: false, createdAt: '' },
    minutes: 4,
  }),
  notification({
    id: 'fx-notif-message',
    type: 'new_message',
    title: null,
    content: 'Le build de staging est vert ✅',
    actor: amina,
    context: deploiement,
    state: { isRead: false, createdAt: '' },
    minutes: 12,
  }),
  notification({
    id: 'fx-notif-reaction',
    type: 'message_reaction',
    title: 'Fatou Ndiaye a réagi ❤️ à votre message',
    content: '« On livre demain matin »',
    actor: fatou,
    context: deploiement,
    state: { isRead: false, createdAt: '' },
    minutes: 35,
  }),
  notification({
    id: 'fx-notif-comment',
    type: 'post_comment',
    title: 'Camille Roy a commenté votre publication',
    content: 'Superbe lumière sur cette photo !',
    actor: camille,
    context: { postId: 'post-image-fr', commentId: 'fx-comment-1' },
    metadata: { postType: 'POST' },
    minutes: 3 * 60,
  }),
  notification({
    id: 'fx-notif-story',
    type: 'story_reaction',
    title: 'Amina Diallo a réagi à votre story',
    content: '🔥',
    actor: amina,
    context: { postId: 'st-amie-1' },
    metadata: { postType: 'STORY' },
    minutes: 5 * 60,
  }),
  notification({
    id: 'fx-notif-contact',
    type: 'friend_request',
    title: 'Bruno Laurent veut se connecter',
    content: '',
    actor: bruno,
    context: { friendRequestId: 'fx-fr-1' },
    minutes: 26 * 60,
  }),
  notification({
    id: 'fx-notif-member',
    type: 'member_joined',
    title: 'Fatou Ndiaye a rejoint Équipe déploiement',
    content: '',
    actor: fatou,
    context: deploiement,
    minutes: 2 * 24 * 60,
  }),
  notification({
    id: 'fx-notif-translation',
    type: 'translation_completed',
    title: 'Traduction terminée',
    content: 'Votre message vocal est disponible en anglais.',
    context: deploiement,
    minutes: 3 * 24 * 60,
  }),
  notification({
    id: 'fx-notif-badge',
    type: 'achievement_unlocked',
    title: 'Nouveau badge : Polyglotte',
    content: 'Vous avez écrit dans trois langues cette semaine.',
    minutes: 4 * 24 * 60,
  }),
  notification({
    id: 'fx-notif-login',
    type: 'login_new_device',
    title: 'Nouvelle connexion',
    content: 'Safari sur macOS · Paris',
    minutes: 6 * 24 * 60,
  }),
  notification({
    id: 'fx-notif-like',
    type: 'post_like',
    title: 'Kwame Mensah aime votre publication',
    content: '',
    actor: kwame,
    context: { postId: 'post-image-fr' },
    metadata: { postType: 'POST' },
    minutes: 8 * 24 * 60,
  }),
  notification({
    id: 'fx-notif-mention-old',
    type: 'user_mentioned',
    title: 'Amina Diallo vous a mentionné',
    content: '@vous merci pour le suivi',
    actor: amina,
    context: deploiement,
    minutes: 10 * 24 * 60,
  }),
];

const served = (): readonly NotificationRecord[] =>
  CORPUS.filter((n) => !deleted.has(n.id)).map((n) => (read.has(n.id) ? { ...n, state: { ...n.state, isRead: true } } : n));

/** Mime `GET /notifications` : filtre de catégorie, ordre du plus récent, curseur opaque. */
export function fixtureNotificationsPage(params: {
  readonly category: NotificationCategory;
  readonly limit: number;
  readonly cursor?: string;
}): NotificationsPage {
  const rows = served().filter((n) => categoryAccepts(params.category, n));
  const start = params.cursor === undefined ? 0 : Math.max(0, Number.parseInt(params.cursor, 10) || 0);
  const notifications = rows.slice(start, start + params.limit);
  const end = start + notifications.length;
  const hasMore = end < rows.length;
  return { notifications, hasMore, nextCursor: hasMore ? String(end) : null };
}

/** Mime `GET /notifications/counts`. */
export function fixtureNotificationCounts(): NotificationCounts {
  const rows = served();
  const byType = rows.reduce<Readonly<Record<string, number>>>(
    (counts, n) => ({ ...counts, [n.type]: (counts[n.type] ?? 0) + 1 }),
    {},
  );
  return { total: rows.length, unread: rows.filter((n) => !n.state.isRead).length, byType };
}

const known = (id: string): boolean => CORPUS.some((n) => n.id === id) && !deleted.has(id);

const NOT_FOUND: ApiResult<unknown> = { ok: false, status: 404, error: 'Notification not found' };

export function fixtureMarkNotificationRead(id: string): ApiResult<unknown> {
  if (!known(id)) return NOT_FOUND;
  read.add(id);
  return { ok: true, data: undefined };
}

export function fixtureMarkAllNotificationsRead(): ApiResult<unknown> {
  for (const n of CORPUS) read.add(n.id);
  return { ok: true, data: undefined };
}

export function fixtureDeleteNotification(id: string): ApiResult<unknown> {
  if (!known(id)) return NOT_FOUND;
  deleted.add(id);
  return { ok: true, data: undefined };
}
