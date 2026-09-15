import type { NotificationActor, NotificationContext } from '@meeshy/shared/types/notification';

/**
 * **UNE NOTIFICATION TELLE QUE LA CLOCHE LA LIT** (#6288) — une PROJECTION du
 * type partagé `Notification` (`packages/shared/types/notification.ts`), jamais
 * une redéfinition : les champs gardés sont nommés par `Pick` sur les types de
 * `@meeshy/shared`.
 *
 * Pourquoi une projection plutôt que `Notification` tel quel : le fil JSON ne
 * porte pas la forme que le type déclare. `NotificationFormatter` sert
 * `title: null`, `actor: undefined`, `context: {}`, et les dates en CHAÎNES —
 * `state.createdAt: Date` y serait un mensonge que le cache persisté
 * (`query-client.ts`, `dehydrate`) rendrait vrai une fois sur deux. La ligne
 * décodée ne porte que des valeurs JSON : elle se persiste et se relit à
 * l'identique.
 *
 * `state` reste imbriqué, et ce n'est pas un détail : c'est la forme que les
 * deux prédicats partagés des marquages en masse interrogent
 * (`notificationMatchesReadBulkScope` / `…DeletedBulkScope`,
 * `packages/shared/utils/notification-read-bulk.ts`). Aplatie, la ligne aurait
 * exigé une seconde écriture de ces prédicats — la jumelle qu'ils existent
 * pour empêcher.
 *
 * **Le texte servi EST le Prisme.** `title` et `content` sont résolus CÔTÉ
 * SERVEUR dans la langue du destinataire (quatrième famille du Prisme,
 * CLAUDE.md § « bannière de notification ») : la cloche les rend tels quels,
 * sans aucune descente locale ni `translations[0]`.
 */

type ContextStringField =
  | 'conversationId'
  | 'conversationTitle'
  | 'messageId'
  | 'postId'
  | 'commentId'
  | 'parentCommentId'
  | 'friendRequestId'
  | 'callSessionId'
  | 'postExpiresAt';

const CONTEXT_STRING_FIELDS: readonly ContextStringField[] = [
  'conversationId',
  'conversationTitle',
  'messageId',
  'postId',
  'commentId',
  'parentCommentId',
  'friendRequestId',
  'callSessionId',
  'postExpiresAt',
];

type ConversationType = NonNullable<NotificationContext['conversationType']>;

const CONVERSATION_TYPES: readonly ConversationType[] = ['direct', 'group', 'public', 'global', 'broadcast'];

type MetadataField = 'postType' | 'contentType' | 'postThumbnailUrl';

const METADATA_FIELDS: readonly MetadataField[] = ['postType', 'contentType', 'postThumbnailUrl'];

export type NotificationRecordContext = Pick<NotificationContext, ContextStringField | 'conversationType'>;

export type NotificationRecordMetadata = Partial<Readonly<Record<MetadataField, string>>>;

export type NotificationRecordActor = Pick<NotificationActor, 'id' | 'username'> & {
  readonly displayName: string | null;
  readonly avatar: string | null;
};

export type NotificationRecord = {
  readonly id: string;
  readonly type: string;
  readonly title: string | null;
  readonly content: string;
  readonly actor: NotificationRecordActor | null;
  readonly context: NotificationRecordContext;
  readonly metadata: NotificationRecordMetadata;
  readonly state: { readonly isRead: boolean; readonly createdAt: string };
};

type Json = Readonly<Record<string, unknown>>;

const objectOf = (value: unknown): Json | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null;

const filledString = (value: unknown): string | null => (typeof value === 'string' && value.trim().length > 0 ? value : null);

/** Les champs chaîne LISIBLES d'un objet, et eux seuls. Les entrées ne viennent
 * que de `keys` : l'assertion de `fromEntries` ne fait qu'en redonner le type. */
function pickStrings<K extends string>(source: Json | null, keys: readonly K[]): Partial<Readonly<Record<K, string>>> {
  if (source === null) return {};
  return Object.fromEntries(
    keys.flatMap((key) => {
      const value = filledString(source[key]);
      return value === null ? [] : [[key, value] as const];
    }),
  ) as Partial<Readonly<Record<K, string>>>;
}

function isoDate(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const text = filledString(value);
  return text !== null && !Number.isNaN(new Date(text).getTime()) ? text : null;
}

function decodeActor(value: unknown): NotificationRecordActor | null {
  const actor = objectOf(value);
  const id = filledString(actor?.id);
  const username = filledString(actor?.username);
  if (actor === null || id === null || username === null) return null;
  return { id, username, displayName: filledString(actor.displayName), avatar: filledString(actor.avatar) };
}

function decodeContext(value: unknown): NotificationRecordContext {
  const context = objectOf(value);
  const conversationType = CONVERSATION_TYPES.find((type) => type === context?.conversationType);
  return {
    ...pickStrings(context, CONTEXT_STRING_FIELDS),
    ...(conversationType === undefined ? {} : { conversationType }),
  };
}

export function decodeNotification(raw: unknown): NotificationRecord | null {
  const notification = objectOf(raw);
  if (notification === null) return null;
  const id = filledString(notification.id);
  const type = filledString(notification.type);
  const state = objectOf(notification.state);
  const createdAt = isoDate(state?.createdAt);
  if (id === null || type === null || state === null || createdAt === null) return null;

  return {
    id,
    type,
    title: filledString(notification.title),
    content: typeof notification.content === 'string' ? notification.content : '',
    actor: decodeActor(notification.actor),
    context: decodeContext(notification.context),
    metadata: pickStrings(objectOf(notification.metadata), METADATA_FIELDS),
    state: { isRead: state.isRead === true, createdAt },
  };
}

export function decodeNotifications(raw: unknown): readonly NotificationRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry: unknown) => {
    const decoded = decodeNotification(entry);
    return decoded === null ? [] : [decoded];
  });
}

/**
 * Le titre d'une ligne — celui que la passerelle a PERSISTÉ d'abord
 * (`buildNotificationDisplay`, localisé et conscient de l'entité), puis le NOM
 * de l'acteur. Jamais une phrase recomposée côté client : le repli d'iOS
 * (« Message de X », en français pour toutes les langues) est exactement le
 * texte qu'un lecteur arabophone n'a pas à recevoir.
 */
export function notificationTitle(notification: NotificationRecord): string {
  return notification.title ?? notification.actor?.displayName ?? notification.actor?.username ?? 'Meeshy';
}
