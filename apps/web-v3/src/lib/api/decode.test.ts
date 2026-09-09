import { describe, expect, test } from 'bun:test';

import { decodeConversation, decodeMessage, toDate } from './decode';
import { CONVERSATION_ID, VIEWER_ID, amina, conversationDefaults, message, translation, viewer } from './fixtures-base';
import type { Conversation, Message } from './types';

describe('toDate — idempotent', () => {
  test('sur une Date déjà décodée, rend la MÊME instance', () => {
    const d = new Date('2026-09-08T09:00:00.000Z');
    expect(toDate(d)).toBe(d);
  });

  test('sur une chaîne ISO valide, rend une Date valide au bon instant', () => {
    const d = toDate('2026-09-08T09:00:00.000Z');
    expect(d instanceof Date).toBe(true);
    expect(Number.isNaN(d.getTime())).toBe(false);
    expect(d.toISOString()).toBe('2026-09-08T09:00:00.000Z');
  });

  test('sur une chaîne invalide, rend Invalid Date — jamais une exception', () => {
    expect(() => toDate('pas-une-date')).not.toThrow();
    expect(Number.isNaN(toDate('pas-une-date').getTime())).toBe(true);
  });
});

describe('decodeConversation', () => {
  const base: Conversation = {
    ...conversationDefaults,
    id: CONVERSATION_ID,
    title: 'Équipe déploiement',
    type: 'group',
    memberCount: 3,
    participants: [],
    createdAt: '2026-09-01T08:00:00.000Z' as unknown as Date,
    updatedAt: '2026-09-08T09:00:00.000Z' as unknown as Date,
    lastMessageAt: '2026-09-08T09:00:00.000Z' as unknown as Date,
    currentUserJoinedAt: '2026-09-01T08:00:00.000Z',
    userPreferences: [{ isPinned: true }],
    lastMessageTranslations: { en: 'Hello' },
  };

  test('revit createdAt, updatedAt, lastMessageAt, currentUserJoinedAt', () => {
    const decoded = decodeConversation(base);
    expect(decoded.createdAt).toBeInstanceOf(Date);
    expect(decoded.createdAt.toISOString()).toBe('2026-09-01T08:00:00.000Z');
    expect(decoded.updatedAt).toBeInstanceOf(Date);
    expect(decoded.lastMessageAt).toBeInstanceOf(Date);
    expect(decoded.currentUserJoinedAt).toBeInstanceOf(Date);
  });

  test('ne touche pas userPreferences (tableau) ni lastMessageTranslations', () => {
    const decoded = decodeConversation(base);
    expect(decoded.userPreferences).toEqual([{ isPinned: true }]);
    expect(decoded.lastMessageTranslations).toEqual({ en: 'Hello' });
  });

  test('les clés ABSENTES restent absentes', () => {
    const { lastMessageAt: _lastMessageAt, currentUserJoinedAt: _currentUserJoinedAt, ...withoutOptional } = base;
    const decoded = decodeConversation(withoutOptional as Conversation);
    expect('lastMessageAt' in decoded).toBe(false);
    expect('currentUserJoinedAt' in decoded).toBe(false);
  });

  test('décode aussi lastMessage.createdAt quand présent', () => {
    const withLastMessage: Conversation = {
      ...base,
      lastMessage: {
        ...message({ id: 'm1', senderId: VIEWER_ID, sender: viewer, content: 'salut', originalLanguage: 'fr', translations: [], createdAt: new Date(0) }),
        createdAt: '2026-09-08T09:00:00.000Z' as unknown as Date,
      },
    };
    const decoded = decodeConversation(withLastMessage);
    expect(decoded.lastMessage?.createdAt).toBeInstanceOf(Date);
  });

  test('lastMessage EMBARQUÉ — l’aperçu ALLÉGÉ que sert réellement GET /conversations, SANS translations ni sender.lastActiveAt — ne jette PAS', () => {
    // Mesuré en direct sur gate.staging.meeshy.me (#5650, revue-correction) :
    // l'objet `lastMessage` d'une conversation ne porte NI `translations`
    // NI `conversationId` NI `originalLanguage` — un `Message` COMPLET
    // (`GET /conversations/:id/messages`) et cet APERÇU sont deux formes
    // distinctes que ce décodeur doit servir toutes les deux.
    const embeddedPreview = {
      id: 'm-preview',
      content: 'À jeudi.',
      senderId: 'u-someone',
      messageType: 'text',
      createdAt: '2026-09-08T07:02:34.617Z',
      sender: {
        id: 'p-someone',
        userId: 'u-someone',
        username: 'someone',
        displayName: 'Someone',
        avatar: null,
        isOnline: false,
        type: 'user',
      },
      attachments: [],
    } as unknown as Message;

    const withLastMessage: Conversation = { ...base, lastMessage: embeddedPreview };
    expect(() => decodeConversation(withLastMessage)).not.toThrow();
    const decoded = decodeConversation(withLastMessage);
    expect(decoded.lastMessage?.createdAt).toBeInstanceOf(Date);
    expect(decoded.lastMessage?.translations).toEqual([]);
  });
});

describe('decodeMessage', () => {
  test('revit createdAt, updatedAt, editedAt, deletedAt, expiresAt, pinnedAt, deliveredToAllAt, readByAllAt', () => {
    const raw = {
      ...message({
        id: 'm1',
        senderId: 'u-amina',
        sender: amina,
        content: 'hello',
        originalLanguage: 'en',
        translations: [translation('m1', 'fr', 'bonjour')],
        createdAt: '2026-09-08T09:00:00.000Z' as unknown as Date,
      }),
      updatedAt: '2026-09-08T09:01:00.000Z' as unknown as Date,
      editedAt: '2026-09-08T09:01:00.000Z' as unknown as Date,
      deletedAt: '2026-09-08T09:02:00.000Z' as unknown as Date,
      expiresAt: '2026-09-09T09:00:00.000Z' as unknown as Date,
      pinnedAt: '2026-09-08T09:03:00.000Z' as unknown as Date,
      deliveredToAllAt: '2026-09-08T09:04:00.000Z' as unknown as Date,
      readByAllAt: '2026-09-08T09:05:00.000Z' as unknown as Date,
    };
    const decoded = decodeMessage(raw);
    for (const key of [
      'createdAt',
      'updatedAt',
      'editedAt',
      'deletedAt',
      'expiresAt',
      'pinnedAt',
      'deliveredToAllAt',
      'readByAllAt',
    ] as const) {
      expect(decoded[key]).toBeInstanceOf(Date);
    }
  });

  test('revit translations[].createdAt et sender.lastActiveAt', () => {
    const raw = message({
      id: 'm1',
      senderId: 'u-amina',
      sender: { ...amina, lastActiveAt: '2026-09-08T09:00:00.000Z' as unknown as Date },
      content: 'hello',
      originalLanguage: 'en',
      translations: [{ ...translation('m1', 'fr', 'bonjour'), createdAt: '2026-09-08T09:00:00.000Z' as unknown as Date }],
      createdAt: new Date(),
    });
    const decoded = decodeMessage(raw);
    expect(decoded.translations[0]?.createdAt).toBeInstanceOf(Date);
    expect(decoded.sender?.lastActiveAt).toBeInstanceOf(Date);
  });

  test('décode replyTo (récursif, un niveau)', () => {
    const raw = message({
      id: 'm2',
      senderId: VIEWER_ID,
      sender: viewer,
      content: 'reply',
      originalLanguage: 'fr',
      translations: [],
      createdAt: new Date(),
      replyTo: message({
        id: 'm1',
        senderId: 'u-amina',
        sender: amina,
        content: 'original',
        originalLanguage: 'en',
        translations: [],
        createdAt: '2026-09-08T09:00:00.000Z' as unknown as Date,
      }),
    });
    const decoded = decodeMessage(raw);
    expect(decoded.replyTo?.createdAt).toBeInstanceOf(Date);
  });

  test('viewOnceCount et isBlurred traversent intacts', () => {
    const raw = message({
      id: 'm3',
      senderId: VIEWER_ID,
      sender: viewer,
      content: 'secret',
      originalLanguage: 'fr',
      translations: [],
      createdAt: new Date(),
      isViewOnce: true,
      viewOnceCount: 2,
      isBlurred: true,
    });
    const decoded = decodeMessage(raw);
    expect(decoded.viewOnceCount).toBe(2);
    expect(decoded.isBlurred).toBe(true);
  });
});

/**
 * REVUE-CORRECTION (#5650) — LE `null` EXPLICITE DU FIL, SUR LES DEUX
 * PORTEURS DE MESSAGE IMBRIQUÉ.
 *
 * `Conversation.lastMessage` était gardé contre `null` par ce lot sans
 * qu'aucun témoin ne le prouve : retirer `|| raw.lastMessage === null`
 * laissait la suite VERTE. `Message.replyTo` — l'AUTRE porteur imbriqué,
 * décodé par le MÊME appel récursif, écrit dans la MÊME expression — ne
 * l'était pas du tout. Un `replyTo: null` (la forme que sert
 * `messages-list-query.ts:718-745` sur la ligne Prisma quand le message
 * cité a disparu, et que le champ `sender: replySender ? … : null` juste
 * en-dessous prouve possible dans cette charge) faisait lever
 * `decodeMessage(null)` sur `raw.sender` — le fil ENTIER tombait en erreur
 * pour UN message dont la citation manquait.
 *
 * « Que transporte-t-on À CÔTÉ de ce qu'on vient de garder ? » — la garde
 * posée sur un porteur se pose sur TOUS les porteurs du même type.
 */
describe('decode — le `null` explicite de la passerelle, sur les deux porteurs imbriqués', () => {
  const baseConversation: Conversation = {
    ...conversationDefaults,
    id: CONVERSATION_ID,
    title: 'Équipe déploiement',
    type: 'group',
    memberCount: 3,
    participants: [],
    createdAt: '2026-09-01T08:00:00.000Z' as unknown as Date,
    updatedAt: '2026-09-08T09:00:00.000Z' as unknown as Date,
  };

  test('decodeConversation avec lastMessage: null ⇒ pas d’exception, clé ABSENTE', () => {
    const withNull = { ...baseConversation, lastMessage: null } as unknown as Conversation;
    expect(() => decodeConversation(withNull)).not.toThrow();
    expect('lastMessage' in decodeConversation(withNull)).toBe(false);
  });

  test('decodeMessage avec replyTo: null ⇒ pas d’exception, clé ABSENTE', () => {
    const raw = {
      ...message({
        id: 'm9',
        senderId: VIEWER_ID,
        sender: viewer,
        content: 'réponse orpheline',
        originalLanguage: 'fr',
        translations: [],
        createdAt: '2026-09-08T09:00:00.000Z' as unknown as Date,
      }),
      replyTo: null,
    } as unknown as Message;
    expect(() => decodeMessage(raw)).not.toThrow();
    expect('replyTo' in decodeMessage(raw)).toBe(false);
  });

  test('decodeMessage avec sender: null ⇒ pas d’exception (la passerelle sert `sender: null`)', () => {
    const raw = {
      ...message({
        id: 'm10',
        senderId: 'u-parti',
        sender: viewer,
        content: 'auteur disparu',
        originalLanguage: 'fr',
        translations: [],
        createdAt: '2026-09-08T09:00:00.000Z' as unknown as Date,
      }),
      sender: null,
    } as unknown as Message;
    expect(() => decodeMessage(raw)).not.toThrow();
    expect(decodeMessage(raw).createdAt).toBeInstanceOf(Date);
  });
});
