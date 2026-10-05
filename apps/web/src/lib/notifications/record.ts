import type { NotificationActor, NotificationContext } from '@meeshy/shared/types/notification';

import { decodeContentDetail } from './content-detail';

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
  | 'postCreatedAt'
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
  'postCreatedAt',
  'postExpiresAt',
];

type ConversationType = NonNullable<NotificationContext['conversationType']>;

const CONVERSATION_TYPES: readonly ConversationType[] = ['direct', 'group', 'public', 'global', 'broadcast'];

/**
 * Les champs STRUCTURÉS de `metadata` que la ligne lit (#8724) : les extraits
 * du commentaire, de son parent et du POST qui le porte, le média d'un contenu
 * sans texte, et la clé du palier d'engagement — jamais la prose du corps.
 */
type MetadataField =
  | 'postType'
  | 'contentType'
  | 'postThumbnailUrl'
  | 'callType'
  | 'commentPreview'
  | 'parentCommentPreview'
  | 'postPreview'
  | 'messagePreview'
  | 'excerpt'
  | 'mediaType'
  | 'axisKey'
  | 'achievementKey';

const METADATA_FIELDS: readonly MetadataField[] = [
  'postType',
  'contentType',
  'postThumbnailUrl',
  'callType',
  'commentPreview',
  'parentCommentPreview',
  'postPreview',
  'messagePreview',
  'excerpt',
  'mediaType',
  'axisKey',
  'achievementKey',
];

type MetadataNumberField = 'threshold' | 'level';

const METADATA_NUMBER_FIELDS: readonly MetadataNumberField[] = ['threshold', 'level'];

/**
 * #8860 — le DÉTAIL du contenu (#8857) et le média inline du vocal, que la
 * bannière in-app montre. `firstAttachmentFileSize` n'est pas lu : la
 * bannière ne dit pas le poids d'un fichier.
 */
type MediaField = 'contentDetail' | 'firstAttachmentUrl' | 'firstAttachmentMimeType' | 'firstAttachmentDurationMs';

export type NotificationRecordContext = Pick<NotificationContext, ContextStringField | 'conversationType' | MediaField>;

export type NotificationRecordMetadata = Partial<Readonly<Record<MetadataField, string>>> &
  Partial<Readonly<Record<MetadataNumberField, number>>>;

export type NotificationRecordActor = Pick<NotificationActor, 'id' | 'username'> & {
  readonly displayName: string | null;
  readonly avatar: string | null;
};

export type NotificationRecord = {
  readonly id: string;
  readonly type: string;
  readonly title: string | null;
  /** La ligne de contexte serveur (nom du groupe, cible d'un commentaire) — absente quand vide. */
  readonly subtitle?: string;
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

/** Les champs NUMÉRIQUES finis d'un objet — un palier servi en chaîne ou en `NaN` est retiré. */
function pickNumbers<K extends string>(source: Json | null, keys: readonly K[]): Partial<Readonly<Record<K, number>>> {
  if (source === null) return {};
  return Object.fromEntries(
    keys.flatMap((key) => {
      const value = source[key];
      return typeof value === 'number' && Number.isFinite(value) ? [[key, value] as const] : [];
    }),
  ) as Partial<Readonly<Record<K, number>>>;
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

/**
 * Le média et le détail d'un message — RIEN sous `notificationLocKey`, la
 * DÉCLARATION d'un contenu protégé (éphémère, vue unique, flouté, chiffré).
 * La passerelle les retient déjà (`mediaMayTravel`) ; ce second verrou ne
 * dépend pas de sa fidélité : une garde de confidentialité échoue en montrant
 * MOINS (cycle 125).
 */
function decodeMedia(context: Json | null): Pick<NotificationRecordContext, MediaField> {
  if (context === null || filledString(context.notificationLocKey) !== null) return {};
  const detail = decodeContentDetail(context.contentDetail);
  const url = filledString(context.firstAttachmentUrl);
  const mimeType = filledString(context.firstAttachmentMimeType);
  const durationMs = context.firstAttachmentDurationMs;
  return {
    ...(detail === null ? {} : { contentDetail: detail }),
    ...(url === null || mimeType === null ? {} : { firstAttachmentUrl: url, firstAttachmentMimeType: mimeType }),
    ...(url !== null && typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs > 0
      ? { firstAttachmentDurationMs: durationMs }
      : {}),
  };
}

function decodeContext(value: unknown): NotificationRecordContext {
  const context = objectOf(value);
  const conversationType = CONVERSATION_TYPES.find((type) => type === context?.conversationType);
  return {
    ...pickStrings(context, CONTEXT_STRING_FIELDS),
    ...(conversationType === undefined ? {} : { conversationType }),
    ...decodeMedia(context),
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

  const subtitle = filledString(notification.subtitle);
  const metadata = objectOf(notification.metadata);
  return {
    id,
    type,
    title: filledString(notification.title),
    ...(subtitle === null ? {} : { subtitle }),
    content: typeof notification.content === 'string' ? notification.content : '',
    actor: decodeActor(notification.actor),
    context: decodeContext(notification.context),
    metadata: { ...pickStrings(metadata, METADATA_FIELDS), ...pickNumbers(metadata, METADATA_NUMBER_FIELDS) },
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
