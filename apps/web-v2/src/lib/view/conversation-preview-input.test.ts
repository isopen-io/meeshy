import { describe, expect, test } from 'bun:test';

import { composeConversationPreview, renderConversationPreviewText } from '@meeshy/shared/utils/conversation-preview';

import type { ListConversation } from '@/lib/api/list-preview';
import type { Conversation, Message } from '@/lib/api/types';

import { previewInputOf, type PreviewContext } from './conversation-preview-input';

/**
 * L'ADAPTATEUR DE LA LIGNE (#7547) — la conversation telle que le cache de
 * liste la tient, projetée sur l'ENTRÉE du composeur partagé (#7546). Il ne
 * compose rien : ces témoins passent sa sortie au composeur et lisent le texte
 * rendu, pour prouver que chaque donnée ARRIVE là où le composeur la cherche.
 */

const ctx = (partial: Partial<PreviewContext> = {}): PreviewContext => ({
  viewerId: 'u-me',
  language: 'fr',
  preferredLanguages: ['fr', 'en'],
  now: Date.parse('2026-09-23T10:00:00.000Z'),
  ...partial,
});

const message = (partial: Record<string, unknown>): Message =>
  ({
    id: 'm-1',
    conversationId: 'c-a',
    senderId: 'p-alice',
    content: 'Bonjour',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    translations: [],
    createdAt: '2026-09-23T09:59:00.000Z',
    timestamp: '2026-09-23T09:59:00.000Z',
    sender: { id: 'p-alice', userId: 'u-alice', displayName: 'Alice' },
    ...partial,
  }) as unknown as Message;

const conversation = (partial: Partial<ListConversation> = {}): Conversation =>
  ({
    id: 'c-a',
    type: 'group',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 3,
    participants: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    unreadCount: 0,
    lastMessage: message({}),
    lastMessageAt: '2026-09-23T09:59:00.000Z',
    lastMessageOriginalLanguage: 'fr',
    ...partial,
  }) as unknown as Conversation;

const line = (c: Conversation, context: PreviewContext = ctx()): string =>
  renderConversationPreviewText(composeConversationPreview(previewInputOf(c, context)), context.language);

describe('previewInputOf (#7547)', () => {
  test('l’auteur est nommé, et le texte vient de la carte du Prisme au rang 2', () => {
    const c = conversation({
      lastMessage: message({ content: 'Hello', originalLanguage: 'de' }),
      lastMessageOriginalLanguage: 'de',
      lastMessageTranslations: { en: 'Hello there' },
    });
    expect(line(c)).toBe('Alice : Hello there');
  });

  test('mon message dit « Vous », reconnu par le `userId` de l’expéditeur', () => {
    const c = conversation({ lastMessage: message({ senderId: 'p-me', sender: { id: 'p-me', userId: 'u-me', displayName: 'Moi' } }) });
    expect(line(c)).toBe('Vous : Bonjour');
  });

  test('mon optimiste (senderId = mon User.id, sans sender) dit « Vous »', () => {
    const c = conversation({ lastMessage: message({ senderId: 'u-me', sender: undefined }) });
    expect(line(c)).toBe('Vous : Bonjour');
  });

  test('la première pièce jointe porte ses détails, et seulement ceux qui existent', () => {
    const c = conversation({
      lastMessage: message({
        content: '',
        messageType: 'image',
        attachments: [{ id: 'a1', mimeType: 'image/jpeg', originalName: 'p.jpg', fileName: 'p.jpg', fileSize: 239_616, width: 450, height: 456 }],
      }),
    });
    expect(line(c)).toBe('Alice : 📷 Photo · 450×456 · 234 Ko');
  });

  test('sans résumé servi, le résumé se déduit des pièces du message (message:new, envoi)', () => {
    const photo = (id: string) => ({ id, mimeType: 'image/png', originalName: `${id}.png`, fileName: `${id}.png`, fileSize: 489_335 });
    const c = conversation({ lastMessage: message({ content: '', messageType: 'image', attachments: [photo('a1'), photo('a2'), photo('a3')] }) });
    expect(line(c)).toBe('Alice : 📷 3 photos · 1,4 Mo');
  });

  test('un transféré se lit depuis `forwardedFromId` quand le drapeau n’est pas servi', () => {
    const c = conversation({ lastMessage: message({ content: 'texte', forwardedFromId: 'm-0' }) });
    expect(line(c)).toBe('Alice : ↪ texte');
  });

  test('sans dernier message : « Nouvelle conversation »', () => {
    const { lastMessage: _m, ...empty } = conversation() as ListConversation;
    expect(line(empty as Conversation)).toBe('Nouvelle conversation');
  });

  test('l’appel en cours, la frappe et le brouillon passent au composeur', () => {
    const c = conversation({ activeCall: { id: 'call-1', kind: 'audio', participantCount: 3, startedAt: '2026-09-23T09:58:00.000Z' } });
    expect(line(c)).toBe('📞 Appel en cours · 3 participants');
    expect(line(conversation(), ctx({ typing: ['Alice', 'Bob'] }))).toBe('Alice et Bob écrivent…');
    expect(line(conversation(), ctx({ draft: 'Je pensais que…' }))).toBe('Brouillon : Je pensais que…');
  });

  test('un éphémère décompte depuis MA réception, puis l’échéance servie la plus proche gagne', () => {
    const c = conversation({ lastMessage: message({ content: 'Rendez-vous à 18h', ephemeralDuration: 300, effectFlags: 1 }) });
    expect(line(c, ctx({ receivedAt: Date.parse('2026-09-23T09:59:00.000Z') }))).toBe('Alice : 🔥 4 min · Rendez-vous à 18h');
    expect(
      line(c, ctx({ receivedAt: Date.parse('2026-09-23T09:59:00.000Z'), servedDeadline: Date.parse('2026-09-23T10:00:30.000Z') })),
    ).toBe('Alice : 🔥 30 s · Rendez-vous à 18h');
  });

  test('un sticker de texte se lit par sa phrase (`alt`), hissé de `metadata.sticker`', () => {
    const c = conversation({
      lastMessage: message({
        content: '',
        messageType: 'image',
        sticker: { templateId: 'bubble-pop' },
        attachments: [{ id: 'a1', mimeType: 'image/png', originalName: 's.png', fileName: 's.png', fileSize: 48_000, alt: 'Bonjour à tous' }],
      }),
    });
    expect(line(c)).toBe('Alice : 🏷 Bonjour à tous');
  });

  test('un vue unique brûlé se lit « Ouvert »', () => {
    const c = conversation({ lastMessage: message({ content: '', isViewOnce: true, viewOnceCount: 1, maxViewOnceCount: 1 }) });
    expect(line(c)).toBe('Alice : 👁 Ouvert');
  });
});
