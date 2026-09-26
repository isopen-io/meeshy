import { segmentText, type TextSegment } from '@meeshy/shared/utils/text-segments';

import type { Attachment, Message } from '@/lib/api/types';

import { placeOf, type SharedPlace } from './message-body';

/**
 * **L'INDEX D'UNE CONVERSATION, GENRE PAR GENRE (#8103)** — la loi PURE de
 * l'écran « Médias, liens et documents ».
 *
 * La passerelle (`GET /conversations/:id/messages?view=media&kinds=…`,
 * `services/gateway/src/routes/conversations/messages-media-kinds.ts`) sert
 * des MESSAGES ; l'écran montre des ÉLÉMENTS. Un message peut en porter
 * plusieurs — et d'un autre genre que celui demandé (une photo et un PDF dans
 * le même envoi). Chaque segment ne garde donc que ce qui est le sien, selon
 * la MÊME partition que la clause serveur : visuel = `image/*`, `video/*` ;
 * audio = `audio/*` ; contact = `text/vcard`, `text/x-vcard` ; document =
 * tout le reste. Une partition différente ferait servir par la passerelle un
 * message dont le segment n'afficherait RIEN.
 *
 * La vue unique est exclue aux deux niveaux qui la déclarent (message, pièce),
 * comme côté serveur : une réponse plus ancienne que #8098, ou un cache
 * restauré, ne la fait pas réapparaître ici.
 */
export const MEDIA_HUB_KINDS = ['visual', 'audio', 'document', 'link', 'contact', 'conversation', 'location'] as const;

export type MediaHubKind = (typeof MEDIA_HUB_KINDS)[number];

type ItemBase = {
  /** `messageId:…` — unique dans un segment, stable d'une page à l'autre. */
  readonly key: string;
  readonly messageId: string;
  readonly message: Message;
};

export type MediaHubAttachmentItem = ItemBase & {
  readonly kind: 'visual' | 'audio' | 'document' | 'contact';
  readonly attachment: Attachment;
};

export type MediaHubLinkItem = ItemBase & {
  readonly kind: 'link' | 'conversation';
  readonly href: string;
  readonly host: string;
};

export type MediaHubPlaceItem = ItemBase & {
  readonly kind: 'location';
  readonly place: SharedPlace;
};

export type MediaHubItem = MediaHubAttachmentItem | MediaHubLinkItem | MediaHubPlaceItem;

type AttachmentKind = MediaHubAttachmentItem['kind'];

const CONTACT_MIMES = ['text/vcard', 'text/x-vcard'] as const;

export function attachmentKindOf(mimeType: string): AttachmentKind {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith('image/') || mime.startsWith('video/')) return 'visual';
  if (mime.startsWith('audio/')) return 'audio';
  if (CONTACT_MIMES.some((prefix) => mime.startsWith(prefix))) return 'contact';
  return 'document';
}

/**
 * Les adresses de conversation que la passerelle reconnaît (`FORMES_DE_CONVERSATION`) :
 * `/chat/`, `/join/`, `/c/`, `/conversation/` sur `meeshy.me` (et ses sous-domaines).
 */
const CONVERSATION_PATH = /^\/(chat|join|c|conversation)\/[^/]+/u;

const hostOf = (href: string): string | null => {
  try {
    return new URL(href).host.toLowerCase();
  } catch {
    return null;
  }
};

export function isConversationUrl(href: string): boolean {
  try {
    const url = new URL(href);
    const host = url.host.toLowerCase();
    const meeshy = host === 'meeshy.me' || host.endsWith('.meeshy.me');
    return meeshy && CONVERSATION_PATH.test(url.pathname);
  } catch {
    return false;
  }
}

function urlsOf(segments: readonly TextSegment[]): readonly string[] {
  return segments.flatMap((segment): readonly string[] => {
    if (segment.kind === 'emphasis') return urlsOf(segment.children);
    if (segment.kind === 'url' && /^https?:\/\//iu.test(segment.href)) return [segment.href];
    if (segment.kind === 'tracked-link' && segment.url !== null) return [segment.url];
    return [];
  });
}

const isHidden = (message: Message): boolean => message.isViewOnce === true;

function attachmentItems(message: Message, kind: AttachmentKind): readonly MediaHubItem[] {
  return (message.attachments ?? [])
    .filter((attachment) => attachment.isViewOnce !== true && attachmentKindOf(attachment.mimeType) === kind)
    .map((attachment) => ({ kind, key: `${message.id}:${attachment.id}`, messageId: message.id, message, attachment }));
}

function linkItems(message: Message, kind: 'link' | 'conversation'): readonly MediaHubItem[] {
  const content = message.content ?? '';
  if (content === '') return [];
  const unique = [...new Set(urlsOf(segmentText(content)))];
  return unique.flatMap((href) => {
    const host = hostOf(href);
    if (host === null) return [];
    if (kind === 'conversation' && !isConversationUrl(href)) return [];
    return [{ kind, key: `${message.id}:${href}`, messageId: message.id, message, href, host }];
  });
}

function placeItems(message: Message): readonly MediaHubItem[] {
  const place = placeOf(message as Message & { readonly location?: unknown });
  return place === null ? [] : [{ kind: 'location', key: `${message.id}:place`, messageId: message.id, message, place }];
}

/** Les éléments d'un genre, dans l'ordre SERVI des messages (le plus récent d'abord). */
export function itemsOfKind(messages: readonly Message[], kind: MediaHubKind): readonly MediaHubItem[] {
  return messages.flatMap((message) => {
    if (isHidden(message)) return [];
    switch (kind) {
      case 'visual':
      case 'audio':
      case 'document':
      case 'contact':
        return attachmentItems(message, kind);
      case 'link':
      case 'conversation':
        return linkItems(message, kind);
      case 'location':
        return placeItems(message);
    }
  });
}

export type MediaHubViewer = {
  readonly items: readonly Attachment[];
  readonly startIndex: number;
  readonly messageIdAt: (index: number) => string | undefined;
};

/**
 * La visionneuse CONVERSATION-ENTIÈRE (#6303) — les pièces visuelles de TOUT
 * l'index chargé, dans l'ordre de la grille, ouverte sur la tuile touchée.
 * L'appariement porte sur la CLÉ (message, pièce), jamais sur l'id de pièce
 * seul ; une tuile disparue entre le geste et l'ouverture ouvre au début.
 */
export function mediaHubViewerOf(items: readonly MediaHubItem[], openedKey: string): MediaHubViewer {
  const visual = items.filter((item): item is MediaHubAttachmentItem => item.kind === 'visual');
  const index = visual.findIndex((item) => item.key === openedKey);
  return {
    items: visual.map((item) => item.attachment),
    startIndex: index === -1 ? 0 : index,
    messageIdAt: (at) => visual[at]?.messageId,
  };
}
