import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { accentOf } from '@/lib/accent';
import type { PersonSummary } from '@/lib/api/friend-requests';
import type { Conversation } from '@/lib/api/types';
import { candidatesFor } from '@/lib/conversation-new/candidates';
import type { SendSheetCatalogKey } from '@/lib/i18n-send-sheet-catalog';
import { publishOffered, targetKeyOf, type SendPayload, type SendPlanError, type SendPreview, type SendTarget } from '@/lib/send/send-sheet-plan';
import type { TargetStatus } from '@/lib/send/send-sheet-run';
import { avatarOf, initialsOf, participantAvatarOf, peerOf, titleOf } from '@/lib/view/conversation';

/**
 * CE QUE LA FEUILLE D'ENVOI MONTRE, en fonctions PURES (#8884) — les lignes de
 * destinataires, l'aperçu de ce qui part, le mot de chaque état. La vue
 * (`send-sheet.tsx`) ne décide rien : elle rend ces valeurs.
 */

export type RecipientTarget = Extract<SendTarget, { readonly kind: 'conversation' | 'contact' }>;

export type RecipientRow = {
  readonly key: string;
  readonly target: RecipientTarget;
  readonly label: string;
  readonly initials: string;
  readonly color: string;
  readonly avatarUrl?: string;
  readonly isGroup: boolean;
};

/** La rangée « Récents » — assez pour un pouce, jamais une seconde liste. */
export const RECENTS_MAX = 8;

const fold = (text: string): string => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('fr');

const avatarProp = (url: string | undefined): { readonly avatarUrl?: string } => (url === undefined ? {} : { avatarUrl: url });

function conversationRow(conversation: Conversation, viewerId: string): RecipientRow {
  const label = titleOf(conversation, viewerId);
  const avatarUrl = avatarOf(conversation, viewerId);
  const isGroup = conversation.type !== 'direct';
  const target: RecipientTarget = {
    kind: 'conversation',
    conversationId: conversation.id,
    label,
    ...(avatarUrl === undefined ? {} : { avatarUrl }),
    ...(isGroup ? { isGroup } : {}),
  };
  return { key: targetKeyOf(target), target, label, initials: initialsOf(label), color: accentOf(conversation), isGroup, ...avatarProp(avatarUrl) };
}

function personRow(person: PersonSummary): RecipientRow {
  const label = person.displayName ?? person.username;
  const avatarUrl = participantAvatarOf({ avatar: person.avatar ?? undefined });
  const target: RecipientTarget = { kind: 'contact', userId: person.id, label, ...(avatarUrl === undefined ? {} : { avatarUrl }) };
  return { key: targetKeyOf(target), target, label, initials: initialsOf(label), color: colorForName(label), isGroup: false, ...avatarProp(avatarUrl) };
}

/**
 * LES DESTINATAIRES — les conversations du cache, puis les personnes SANS
 * conversation directe (amis d'abord, puis la recherche globale : la même loi
 * que « Nouvelle conversation », `candidatesFor`). Une personne qui a déjà un
 * direct n'apparaît qu'une fois, par sa conversation : deux lignes pour la même
 * personne enverraient deux fois.
 */
export function recipientRows(params: {
  readonly conversations: readonly Conversation[];
  readonly friends: readonly PersonSummary[];
  readonly searchResults: readonly PersonSummary[] | undefined;
  readonly viewerId: string;
  readonly query: string;
}): { readonly recents: readonly RecipientRow[]; readonly conversations: readonly RecipientRow[]; readonly people: readonly RecipientRow[] } {
  const { conversations, viewerId } = params;
  const needle = fold(params.query.trim());
  const all = conversations.map((conversation) => conversationRow(conversation, viewerId));
  const withDirect = new Set(conversations.flatMap((conversation) => {
    const peer = peerOf(conversation, viewerId);
    return peer === undefined ? [] : [peer.userId];
  }));
  const candidates = candidatesFor({ friends: params.friends, query: params.query, searchResults: params.searchResults, viewerId });
  const people = [...candidates.friends, ...candidates.others]
    .filter((person) => person.id !== viewerId && !withDirect.has(person.id))
    .map(personRow);
  return {
    recents: all.slice(0, RECENTS_MAX),
    conversations: needle === '' ? all : all.filter((row) => fold(row.label).includes(needle)),
    people: [...new Map(people.map((row) => [row.key, row])).values()],
  };
}

export type MessageRef = { readonly key: SendSheetCatalogKey; readonly count?: number };

export type StatusView = { readonly tone: 'sending' | 'sent' | 'failed'; readonly label: SendSheetCatalogKey; readonly retry: boolean };

const FAILURE_LABEL = {
  offline: 'sendSheet.state.waitingNetwork',
  network: 'sendSheet.state.failed',
  download: 'sendSheet.failure.download',
  refused: 'sendSheet.failure.refused',
} as const satisfies Readonly<Record<string, SendSheetCatalogKey>>;

/** Le mot d'une ligne. `started` : l'envoi est lancé — une cible pas encore
 * jouée se dit DÉJÀ « Envoi… » (optimiste), jamais « rien ». */
export function statusViewOf(status: TargetStatus | undefined, started: boolean): StatusView | null {
  if (status === undefined || (status.state === 'idle' && !started)) return null;
  switch (status.state) {
    case 'idle':
    case 'sending':
      return { tone: 'sending', label: 'sendSheet.state.sending', retry: false };
    case 'sent':
      return { tone: 'sent', label: 'sendSheet.state.sent', retry: false };
    case 'failed':
      return { tone: 'failed', label: FAILURE_LABEL[status.failure.kind], retry: true };
  }
}

export function planErrorMessageOf(error: SendPlanError): MessageRef {
  switch (error.kind) {
    case 'too-many-targets':
      return { key: 'sendSheet.limit.recipients', count: error.max };
    case 'caption-too-long':
      return { key: 'sendSheet.error.captionTooLong', count: error.max };
    case 'too-many-files':
      return { key: 'sendSheet.error.tooManyFiles', count: error.max };
    case 'protected':
      return { key: 'sendSheet.protected' };
    default:
      return { key: 'sendSheet.state.failed' };
  }
}

export type PreviewView = {
  readonly kind: SendPreview['kind'];
  readonly label?: MessageRef;
  readonly text?: string;
  readonly thumbUrl?: string;
  readonly count?: number;
};

const kindOfMime = (mime: string): SendPreview['kind'] => {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
};

const KIND_LABEL: Readonly<Partial<Record<SendPreview['kind'], SendSheetCatalogKey>>> = {
  image: 'sendSheet.preview.photo',
  video: 'sendSheet.preview.video',
  audio: 'sendSheet.preview.voice',
  file: 'sendSheet.preview.file',
  publication: 'sendSheet.preview.publication',
};

const labelProp = (kind: SendPreview['kind']): { readonly label?: MessageRef } => {
  const key = KIND_LABEL[kind];
  return key === undefined ? {} : { label: { key } };
};

const optional = <K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> =>
  (value === undefined || value === '' ? {} : { [key]: value }) as Partial<Record<K, V>>;

function fromPreview(preview: SendPreview): PreviewView {
  return { kind: preview.kind, ...labelProp(preview.kind), ...optional('text', preview.text), ...optional('thumbUrl', preview.thumbUrl) };
}

export function previewOf(payload: SendPayload): PreviewView {
  switch (payload.kind) {
    case 'messages': {
      const count = payload.preview.count ?? payload.messages.length;
      return count > 1 ? { kind: 'messages', label: { key: 'sendSheet.preview.messages', count } } : fromPreview(payload.preview);
    }
    case 'attachment': {
      const kind = kindOfMime(payload.mime);
      const visual = kind === 'image' || kind === 'video';
      return { kind, ...labelProp(kind), ...(visual ? { thumbUrl: payload.previewUrl } : {}) };
    }
    case 'publication':
      return { ...fromPreview(payload.preview), kind: 'publication', label: { key: 'sendSheet.preview.publication' } };
    case 'media':
      return fromPreview(payload.preview);
    case 'files': {
      const [first] = payload.files;
      const kind = first === undefined ? 'file' : kindOfMime(first.type);
      return {
        kind,
        ...labelProp(kind),
        ...optional('text', first?.name),
        ...(payload.files.length > 1 ? { count: payload.files.length } : {}),
      };
    }
    case 'text':
      return { kind: 'text', text: [payload.text, payload.url].filter((part) => part !== undefined && part !== '').join('\n') };
  }
}

/** Rien n'est publiable PARCE QUE le contenu est protégé (vue unique, flouté,
 * éphémère, chiffré) — seul cas où la feuille explique l'absence des pastilles. */
export function protectedFromPublishing(payload: SendPayload): boolean {
  if (publishOffered(payload).length > 0) return false;
  if (payload.kind === 'attachment') return payload.protected;
  return payload.kind === 'messages' && payload.soleMedia?.protected === true;
}
