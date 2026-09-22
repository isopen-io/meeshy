import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import type { StarredMessageItem } from '@meeshy/shared/types/message-star';

import { BLURRED_WITNESS_ID, PROTECTION_CONVERSATION_ID, VIEWER_ID, conversationById, messagesOf } from './fixtures';
import { CONVERSATION_ID, minutesAgo } from './fixtures-base';
import type { ApiResult } from './http';
import type { StarredMembership } from './starred-messages-cache';
import type { Message } from './types';

/**
 * **LES FAVORIS DE MESSAGES DES FIXTURES** (#7378, #7286) — un petit serveur en
 * mémoire qui tient les étoiles du lecteur de fixture, et projette chaque
 * ligne depuis les messages VIVANTS du corpus sous les règles de la passerelle
 * (`starredMessageVerdict.ts`, `services/gateway/decisions.md` § « Le favori
 * de message ») :
 * - supprimé, expiré ou à vue unique : la ligne SORT (règle 2), et poser une
 *   étoile sur une vue unique rend 409 `MESSAGE_NOT_STARRABLE` ;
 * - flouté, chiffré ou éphémère vivant : PLACEHOLDER, sans texte, sans langue,
 *   sans traduction, sans pièce jointe (règle 3).
 *
 * MUTABLE, comme `recordSentMessage` (`fixtures.ts`) : un favori posé depuis le
 * fil doit se retrouver sur l'écran des favoris, et un retrait depuis l'écran
 * doit éteindre l'étoile du fil — c'est le critère de fin de #7378, et les
 * gates navigateur le jouent sur le `dist` construit en fixtures.
 *
 * TROIS ÉTOILES AU DÉPART, et chacune garde quelque chose : `m1` est anglais
 * avec une traduction française (le Prisme), `m-amina` vit dans une
 * conversation DIRECTE (le nom servi est celui du pair), et le témoin FLOUTÉ
 * de la salle protégée rend un placeholder.
 */

type StarEntry = { readonly messageId: string; readonly conversationId: string; readonly starredAt: string };

const SEEDS = (): readonly StarEntry[] => [
  { messageId: 'm1', conversationId: CONVERSATION_ID, starredAt: minutesAgo(5).toISOString() },
  { messageId: 'm-amina', conversationId: 'c-amina', starredAt: minutesAgo(40).toISOString() },
  { messageId: BLURRED_WITNESS_ID, conversationId: PROTECTION_CONVERSATION_ID, starredAt: minutesAgo(90).toISOString() },
];

let stars: readonly StarEntry[] = SEEDS();

export function resetStarredFixturesForTests(): void {
  stars = SEEDS();
}

const isViewOnce = (message: Message): boolean =>
  message.isViewOnce || ((message.effectFlags ?? 0) & MESSAGE_EFFECT_FLAGS.VIEW_ONCE) !== 0;

const isGone = (message: Message, now: number): boolean =>
  message.deletedAt != null || (message.expiresAt != null && new Date(message.expiresAt).getTime() <= now);

const isProtected = (message: Message): boolean => message.isBlurred || message.isEncrypted || message.expiresAt != null;

const messageOf = (entry: Pick<StarEntry, 'messageId' | 'conversationId'>): Message | undefined =>
  messagesOf(entry.conversationId).find((message) => message.id === entry.messageId);

const iso = (value: Date | string): string => new Date(value).toISOString();

function rowOf(entry: StarEntry, now: number): StarredMessageItem | null {
  const message = messageOf(entry);
  const conversation = conversationById(entry.conversationId);
  if (message === undefined || conversation === undefined) return null;
  if (isGone(message, now) || isViewOnce(message)) return null;
  const masked = isProtected(message);
  const peer = conversation.type === 'direct' ? conversation.participants.find((p) => p.userId !== VIEWER_ID) : undefined;
  return {
    id: `star-${entry.messageId}`,
    starredAt: entry.starredAt,
    message: {
      id: message.id,
      conversationId: entry.conversationId,
      messageType: message.messageType,
      createdAt: iso(message.createdAt),
      editedAt: masked || message.editedAt === undefined ? null : iso(message.editedAt),
      isProtected: masked,
      content: masked ? null : message.content,
      originalLanguage: masked ? null : message.originalLanguage,
      translations: masked
        ? []
        : message.translations.map((t) => ({
            id: t.id,
            messageId: t.messageId,
            targetLanguage: t.targetLanguage,
            translatedContent: t.translatedContent,
          })),
      attachments: masked
        ? []
        : (message.attachments ?? []).map((a) => ({
            id: a.id,
            mimeType: a.mimeType,
            fileUrl: a.fileUrl,
            thumbnailUrl: a.thumbnailUrl ?? null,
            isMasked: false,
          })),
    },
    sender:
      message.sender === undefined
        ? null
        : {
            id: message.sender.id,
            userId: message.sender.userId ?? null,
            displayName: message.sender.displayName ?? null,
            avatar: message.sender.avatar ?? null,
            username: null,
          },
    conversation: {
      id: conversation.id,
      identifier: conversation.identifier ?? conversation.id,
      type: conversation.type,
      name: peer?.displayName ?? conversation.title ?? null,
      avatar: peer?.avatar ?? conversation.avatar ?? null,
    },
  };
}

/** Les lignes SERVIES, la plus récente étoile d'abord — ce que rend `GET /me/starred-messages`. */
export function fixtureStarredRows(now: number = Date.now()): readonly StarredMessageItem[] {
  return [...stars]
    .sort((a, b) => b.starredAt.localeCompare(a.starredAt))
    .flatMap((entry) => {
      const line = rowOf(entry, now);
      return line === null ? [] : [line];
    });
}

export function fixtureStarredMembership(): StarredMembership {
  return Object.fromEntries(fixtureStarredRows().map((line) => [line.message.id, line.starredAt]));
}

/** `PUT` / `DELETE /me/starred-messages/:messageId` — idempotents, comme la passerelle. */
export function recordFixtureStar(target: { readonly id: string; readonly conversationId: string }, on: boolean): ApiResult<unknown> {
  if (!on) {
    stars = stars.filter((entry) => entry.messageId !== target.id);
    return { ok: true, data: { messageId: target.id, starred: false } };
  }
  const message = messageOf({ messageId: target.id, conversationId: target.conversationId });
  if (message === undefined || isGone(message, Date.now())) {
    return { ok: false, status: 404, error: 'Message introuvable', code: 'MESSAGE_NOT_FOUND' };
  }
  if (isViewOnce(message)) return { ok: false, status: 409, error: 'Message non favorisable', code: 'MESSAGE_NOT_STARRABLE' };
  const existing = stars.find((entry) => entry.messageId === target.id);
  const starredAt = existing?.starredAt ?? new Date().toISOString();
  if (existing === undefined) stars = [...stars, { messageId: target.id, conversationId: target.conversationId, starredAt }];
  return { ok: true, data: { messageId: target.id, conversationId: target.conversationId, starred: true, starredAt } };
}
