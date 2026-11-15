/**
 * #7978 — la ligne de liste nomme l'auteur du dernier message par son identité
 * UTILISATEUR (`lastMessageSenderUserId`), sur chaque chemin qui recalcule son
 * aperçu.
 *
 * `senderId` est un `Participant.id` sur le chemin REST/ZMQ et sur le recalcul :
 * comparé au `User.id` du lecteur, il ne reconnaît jamais « moi ». Quand un
 * tiers supprimait le dernier message et que le MIEN redevenait l'aperçu, la
 * ligne disait « Demo : » au lieu de « Vous : ». Idem pour chaque traduction
 * qui aboutit et ré-émet le même message.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { emitConversationPreviewUpdate } from '../emitConversationPreviewUpdate';
import { resolveLastMessagePreviewGroup } from '../utils/lastMessagePreviewGroup';

type Emitted = { room: string; event: string; payload: Record<string, unknown> };

const makeIo = (sink: Emitted[]) => ({
  to: (room: string) => ({
    emit: (event: string, payload: unknown) => {
      sink.push({ room, event, payload: payload as Record<string, unknown> });
    },
  }),
});

const reader = {
  id: 'p-demo',
  userId: 'u-demo',
  user: { systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null },
};

const myMessage = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg-mine',
  content: 'Hello everyone',
  senderId: 'p-demo',
  createdAt: new Date('2026-09-25T09:00:00Z'),
  originalLanguage: 'en',
  translations: { fr: { text: 'Bonjour à tous' } },
  sender: { displayName: 'Demo', userId: 'u-demo', user: { displayName: 'Demo' } },
  ...overrides,
});

const makePrisma = (latest: Record<string, unknown> | null) =>
  ({
    participant: {
      findMany: jest.fn(async () => [
        { id: 'p-demo', userId: 'u-demo', user: reader.user },
        { id: 'p-third', userId: 'u-third', user: { systemLanguage: 'en' } },
      ]),
    },
    message: { findFirst: jest.fn(async () => latest) },
    userMessageDeletion: { findMany: jest.fn(async () => []) },
    userConversationPreferences: { findMany: jest.fn(async () => []) },
  }) as any;

describe('resolveLastMessagePreviewGroup — lastMessageSenderUserId', () => {
  it("porte le User.id de l'auteur, jamais son Participant.id", () => {
    const group = resolveLastMessagePreviewGroup(reader, myMessage());

    expect(group.lastMessageSenderUserId).toBe('u-demo');
  });

  it('vaut null pour un auteur sans compte', () => {
    const group = resolveLastMessagePreviewGroup(
      reader,
      myMessage({ sender: { displayName: 'Invité', userId: null, user: null } }),
    );

    expect(group.lastMessageSenderUserId).toBeNull();
  });

  it("reste porté sous protection : l'auteur qualifie le placeholder", () => {
    const group = resolveLastMessagePreviewGroup(reader, myMessage({ isViewOnce: true }));

    expect(group.lastMessagePreview).toBe('');
    expect(group.lastMessageSenderUserId).toBe('u-demo');
  });

  it('vaut null quand aucun message ne reste', () => {
    expect(resolveLastMessagePreviewGroup(reader, null).lastMessageSenderUserId).toBeNull();
  });
});

describe('emitConversationPreviewUpdate — le recalcul nomme l’auteur par son User.id', () => {
  it("après la suppression par un tiers, mon message redevenu l'aperçu porte MON User.id", async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma(myMessage());

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'u-third');

    expect(emitted).toHaveLength(2);
    for (const e of emitted) {
      expect(e.event).toBe(SERVER_EVENTS.CONVERSATION_UPDATED);
      expect(e.payload.previewRecalculated).toBe(true);
      expect(e.payload.updatedBy).toEqual({ id: 'u-third' });
      expect(e.payload.senderId).toBe('p-demo');
      expect(e.payload.lastMessageSenderUserId).toBe('u-demo');
    }
  });

  it("demande l'identité utilisateur de l'auteur à la base", async () => {
    const prisma = makePrisma(myMessage());

    await emitConversationPreviewUpdate(prisma, makeIo([]), 'conv-1', 'u-third');

    const select = (prisma.message.findFirst as jest.Mock).mock.calls[0][0] as {
      select: { sender: { select: Record<string, unknown> } };
    };
    expect(select.select.sender.select.userId).toBe(true);
  });

  it('la ré-émission après traduction porte le User.id sans changer la langue servie', async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma(myMessage());

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'u-demo', undefined, {
      onlyIfLatestIs: 'msg-mine',
      onlyIfPreviewCarriesLanguage: 'fr',
    });

    expect(emitted.map((e) => e.room)).toEqual(['user:u-demo']);
    const payload = emitted[0].payload;
    expect(payload.lastMessageSenderUserId).toBe('u-demo');
    expect(payload.lastMessagePreview).toBe('Hello everyone');
    expect(payload.lastMessageOriginalLanguage).toBe('en');
    expect(payload.lastMessageTranslations).toEqual({ fr: 'Bonjour à tous' });
  });

  it('vaut null quand plus aucun message ne reste', async () => {
    const emitted: Emitted[] = [];

    await emitConversationPreviewUpdate(makePrisma(null), makeIo(emitted), 'conv-1', 'u-third');

    expect(emitted[0].payload.lastMessageId).toBeNull();
    expect(emitted[0].payload.lastMessageSenderUserId).toBeNull();
  });
});
