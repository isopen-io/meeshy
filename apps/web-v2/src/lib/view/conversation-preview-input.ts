import type { LastMessageAttachmentSummary, PreviewAttachmentKind } from '@meeshy/shared/types/conversation-preview';
import type {
  ConversationPreviewAttachment,
  ConversationPreviewInput,
  ConversationPreviewMessage,
} from '@meeshy/shared/utils/conversation-preview';

import type { ListConversation, ListLastMessage } from '@/lib/api/list-preview';
import type { Attachment, Conversation } from '@/lib/api/types';

/**
 * CE QUE LA LIGNE SAIT EN PLUS DE LA CONVERSATION — le lecteur, ses langues,
 * l'instant, et les trois sources locales que le cache de liste ne porte pas :
 * la réception d'un éphémère (#7451), la frappe, le brouillon.
 */
export type PreviewContext = {
  readonly viewerId: string;
  /** Langue de CADRAGE (celle de l'interface) : celle des libellés. */
  readonly language: string;
  readonly preferredLanguages: readonly string[];
  readonly now: number;
  readonly receivedAt?: number | null;
  /** L'échéance servie par `message:countdown-started`, quand elle est connue. */
  readonly servedDeadline?: number | null;
  readonly typing?: readonly string[] | null;
  readonly draft?: string | null;
};

type Hoisted = {
  readonly forwardedFromId?: string;
  readonly maxViewOnceCount?: number;
  readonly location?: { readonly name?: string | null; readonly address?: string | null } | null;
};

type ProtectedAttachment = Attachment & {
  readonly isViewOnce?: boolean;
  readonly isBlurred?: boolean;
  readonly effectFlags?: number;
};

const nonEmpty = (value: string | null | undefined): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

const kindOfMime = (mimeType: string): PreviewAttachmentKind => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
};

/**
 * LE RÉSUMÉ DES PIÈCES, QUAND LE SERVEUR NE L'A PAS SERVI — un message reçu
 * par `message:new` ou mon envoi portent leurs pièces ENTIÈRES, pas le résumé
 * que `GET /conversations` joint à `lastMessage`. La même projection que le
 * contrat (#7545) : familles par `mimeType`, somme des tailles connues.
 */
function summaryOf(attachments: readonly Attachment[]): LastMessageAttachmentSummary | null {
  if (attachments.length === 0) return null;
  const kinds = attachments.reduce<Partial<Record<PreviewAttachmentKind, number>>>((acc, a) => {
    const kind = kindOfMime(a.mimeType ?? '');
    return { ...acc, [kind]: (acc[kind] ?? 0) + 1 };
  }, {});
  const sizes = attachments.map((a) => a.fileSize).filter((s): s is number => typeof s === 'number' && Number.isFinite(s));
  return { count: attachments.length, kinds, totalSize: sizes.length === 0 ? null : sizes.reduce((a, b) => a + b, 0) };
}

function attachmentOf(attachment: ProtectedAttachment): ConversationPreviewAttachment {
  return {
    mimeType: attachment.mimeType,
    originalName: nonEmpty(attachment.originalName) ?? nonEmpty(attachment.fileName),
    fileSize: attachment.fileSize ?? null,
    duration: attachment.duration ?? null,
    width: attachment.width ?? null,
    height: attachment.height ?? null,
    pageCount: attachment.pageCount ?? null,
    ...(attachment.isViewOnce === undefined ? {} : { isViewOnce: attachment.isViewOnce }),
    ...(attachment.isBlurred === undefined ? {} : { isBlurred: attachment.isBlurred }),
    ...(attachment.effectFlags === undefined ? {} : { effectFlags: attachment.effectFlags }),
  };
}

function messageOf(conversation: Conversation, context: PreviewContext): ConversationPreviewMessage | null {
  const message = conversation.lastMessage as (ListLastMessage & Hoisted) | undefined | null;
  if (message === undefined || message === null) return null;
  const sender = message.sender;
  const attachments = (message.attachments ?? []) as readonly ProtectedAttachment[];
  const first = attachments[0];
  const summary = message.attachmentSummary ?? summaryOf(attachments);
  const served = context.servedDeadline ?? null;
  const expiresAt = served ?? message.expiresAt ?? null;
  const max = message.maxViewOnceCount;

  return {
    id: message.id,
    senderId: message.senderId ?? null,
    senderUserId: sender?.userId ?? null,
    senderName: nonEmpty(sender?.displayName) ?? nonEmpty(sender?.user?.displayName) ?? nonEmpty(sender?.user?.username),
    content: message.content ?? null,
    originalLanguage: conversation.lastMessageOriginalLanguage ?? message.originalLanguage ?? null,
    translations: conversation.lastMessageTranslations ?? null,
    createdAt: message.createdAt,
    messageType: message.messageType ?? null,
    effectFlags: message.effectFlags ?? null,
    ephemeralDuration: message.ephemeralDuration ?? null,
    expiresAt,
    isEncrypted: message.isEncrypted ?? null,
    isViewOnce: message.isViewOnce ?? null,
    isBlurred: message.isBlurred ?? null,
    viewOnceConsumed: typeof max === 'number' && max > 0 ? (message.viewOnceCount ?? 0) >= max : null,
    isForwarded: message.isForwarded ?? (typeof message.forwardedFromId === 'string' && message.forwardedFromId !== ''),
    systemEvent: message.systemEvent ?? null,
    callSummary: message.callSummary ?? null,
    location: message.location ?? null,
    attachment: first === undefined ? null : attachmentOf(first),
    attachmentSummary: summary,
  };
}

/**
 * `previewInputOf` — la conversation du cache de liste projetée sur l'ENTRÉE
 * de `composeConversationPreview` (#7546). Une PROJECTION, jamais une
 * composition : aucun libellé, aucune priorité, aucune règle de protection
 * n'est tranchée ici — tout cela appartient au composeur partagé, que le SDK
 * iOS rejoue sur le même fichier de cas.
 */
export function previewInputOf(conversation: Conversation, context: PreviewContext): ConversationPreviewInput {
  const row = conversation as ListConversation;
  return {
    viewerId: context.viewerId,
    language: context.language,
    preferredLanguages: context.preferredLanguages,
    now: context.now,
    receivedAt: context.receivedAt ?? null,
    activeCall: row.activeCall ?? null,
    typing: context.typing ?? null,
    draft: context.draft ?? null,
    lastReaction: row.lastReaction ?? null,
    lastMessage: messageOf(conversation, context),
  };
}
