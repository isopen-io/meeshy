import { describe, expect, test } from 'bun:test';

import type { PersonSummary } from '@/lib/api/friend-requests';
import type { Conversation, Participant } from '@/lib/api/types';
import type { SendPayload } from '@/lib/send/send-sheet-plan';

import {
  planErrorMessageOf,
  previewOf,
  protectedFromPublishing,
  recipientRows,
  statusViewOf,
  RECENTS_MAX,
} from './send-sheet-model';

const VIEWER = 'u-moi';

const participant = (userId: string, displayName: string): Participant =>
  ({
    id: `p-${userId}`,
    conversationId: 'c',
    userId,
    type: 'user',
    displayName,
    role: 'member',
    language: 'fr',
    isActive: true,
    isOnline: false,
    joinedAt: new Date('2026-01-01'),
    user: { id: userId, username: userId, displayName },
  }) as Participant;

const conversation = (partial: Partial<Conversation>): Conversation =>
  ({
    id: 'c1',
    type: 'group',
    status: 'active',
    visibility: 'private',
    isActive: true,
    participants: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    title: 'Équipe',
    ...partial,
  }) as Conversation;

const person = (id: string, displayName: string): PersonSummary => ({ id, username: id, displayName, avatar: null });

const direct = (id: string, peerId: string, peerName: string): Conversation =>
  conversation({ id, type: 'direct', title: null as never, participants: [participant(VIEWER, 'Moi'), participant(peerId, peerName)] });

describe('recipientRows — conversations ET personnes sans conversation', () => {
  test('une personne qui a déjà un direct N’apparaît qu’une fois : par sa conversation', () => {
    const rows = recipientRows({
      conversations: [direct('c-amina', 'u-amina', 'Amina'), conversation({ id: 'c-lyon', title: 'Équipe Lyon' })],
      friends: [person('u-amina', 'Amina'), person('u-noah', 'Noah')],
      searchResults: undefined,
      viewerId: VIEWER,
      query: '',
    });
    expect(rows.conversations.map((row) => row.key)).toEqual(['conversation:c-amina', 'conversation:c-lyon']);
    expect(rows.people.map((row) => row.key)).toEqual(['contact:u-noah']);
    expect(rows.conversations[0]?.label).toBe('Amina');
    expect(rows.conversations[1]?.isGroup).toBe(true);
  });

  test('la recherche filtre les DEUX listes, sans accents ni casse', () => {
    const rows = recipientRows({
      conversations: [direct('c-amina', 'u-amina', 'Amina'), conversation({ id: 'c-lyon', title: 'Équipe Lyon' })],
      friends: [person('u-noah', 'Noah'), person('u-elea', 'Éléa')],
      searchResults: [person('u-eliott', 'Eliott'), person(VIEWER, 'Moi')],
      viewerId: VIEWER,
      query: 'EQUI',
    });
    expect(rows.conversations.map((row) => row.key)).toEqual(['conversation:c-lyon']);

    const people = recipientRows({
      conversations: [],
      friends: [person('u-noah', 'Noah'), person('u-elea', 'Éléa')],
      searchResults: [person('u-eliott', 'Eliott'), person(VIEWER, 'Moi')],
      viewerId: VIEWER,
      query: 'el',
    });
    expect(people.people.map((row) => row.key)).toEqual(['contact:u-elea', 'contact:u-eliott']);
  });

  test('les récents sont les premières conversations, bornés', () => {
    const many = Array.from({ length: RECENTS_MAX + 4 }, (_, i) => conversation({ id: `c${i}`, title: `Groupe ${i}` }));
    const rows = recipientRows({ conversations: many, friends: [], searchResults: undefined, viewerId: VIEWER, query: '' });
    expect(rows.recents).toHaveLength(RECENTS_MAX);
    expect(rows.recents[0]?.key).toBe('conversation:c0');
  });
});

describe('statusViewOf — ce que la ligne dit pendant et après l’envoi', () => {
  test('lancé mais pas encore joué : déjà « Envoi… » (optimiste)', () => {
    expect(statusViewOf({ state: 'idle' }, true)).toEqual({ tone: 'sending', label: 'sendSheet.state.sending', retry: false });
    expect(statusViewOf({ state: 'idle' }, false)).toBe(null);
  });

  test('chaque échec a son mot, et tous se rejouent', () => {
    expect(statusViewOf({ state: 'failed', failure: { kind: 'offline' } }, true)).toEqual({
      tone: 'failed',
      label: 'sendSheet.state.waitingNetwork',
      retry: true,
    });
    expect(statusViewOf({ state: 'failed', failure: { kind: 'network' } }, true)?.label).toBe('sendSheet.state.failed');
    expect(statusViewOf({ state: 'failed', failure: { kind: 'download' } }, true)?.label).toBe('sendSheet.failure.download');
    expect(statusViewOf({ state: 'failed', failure: { kind: 'refused', status: 403, message: 'non' } }, true)?.label).toBe(
      'sendSheet.failure.refused',
    );
    expect(statusViewOf({ state: 'sent' }, true)).toEqual({ tone: 'sent', label: 'sendSheet.state.sent', retry: false });
  });
});

describe('planErrorMessageOf — un refus du plan se DIT', () => {
  test('les limites parlent de leur nombre', () => {
    expect(planErrorMessageOf({ kind: 'too-many-targets', max: 10 })).toEqual({ key: 'sendSheet.limit.recipients', count: 10 });
    expect(planErrorMessageOf({ kind: 'caption-too-long', max: 5000 })).toEqual({ key: 'sendSheet.error.captionTooLong', count: 5000 });
    expect(planErrorMessageOf({ kind: 'too-many-files', max: 10 })).toEqual({ key: 'sendSheet.error.tooManyFiles', count: 10 });
    expect(planErrorMessageOf({ kind: 'protected' })).toEqual({ key: 'sendSheet.protected' });
  });
});

const attachment = (over: Partial<Extract<SendPayload, { kind: 'attachment' }>> = {}): SendPayload => ({
  kind: 'attachment',
  conversationId: 'c1',
  messageId: 'm1',
  attachmentId: 'a1',
  mime: 'image/jpeg',
  previewUrl: 'https://cdn.test/a1.jpg',
  mine: false,
  protected: false,
  ...over,
});

describe('previewOf — l’aperçu de ce qui part', () => {
  test('plusieurs messages se comptent ; un seul se montre', () => {
    expect(
      previewOf({
        kind: 'messages',
        conversationId: 'c1',
        messages: [],
        preview: { kind: 'messages', count: 3 },
      }),
    ).toEqual({ kind: 'messages', label: { key: 'sendSheet.preview.messages', count: 3 } });
    expect(
      previewOf({
        kind: 'messages',
        conversationId: 'c1',
        messages: [],
        preview: { kind: 'text', text: 'Bonjour' },
      }),
    ).toEqual({ kind: 'text', text: 'Bonjour' });
  });

  test('une pièce se nomme par sa nature et montre sa vignette', () => {
    expect(previewOf(attachment())).toEqual({
      kind: 'image',
      label: { key: 'sendSheet.preview.photo' },
      thumbUrl: 'https://cdn.test/a1.jpg',
    });
    expect(previewOf(attachment({ mime: 'audio/mp4' }))).toEqual({ kind: 'audio', label: { key: 'sendSheet.preview.voice' } });
  });

  test('des fichiers neufs : un seul se nomme, plusieurs se comptent', () => {
    const one = new File(['x'], 'rapport.pdf', { type: 'application/pdf' });
    expect(previewOf({ kind: 'files', files: [one] })).toEqual({ kind: 'file', label: { key: 'sendSheet.preview.file' }, text: 'rapport.pdf' });
    expect(previewOf({ kind: 'files', files: [one, one] })).toEqual({
      kind: 'file',
      label: { key: 'sendSheet.preview.file' },
      text: 'rapport.pdf',
      count: 2,
    });
  });
});

describe('protectedFromPublishing — l’explication n’apparaît que pour une vraie protection', () => {
  test('pièce protégée : oui ; pièce audio non protégée : non (rien à publier, mais rien de protégé)', () => {
    expect(protectedFromPublishing(attachment({ protected: true }))).toBe(true);
    expect(protectedFromPublishing(attachment({ mime: 'audio/mp4' }))).toBe(false);
    expect(
      protectedFromPublishing({
        kind: 'messages',
        conversationId: 'c1',
        messages: [{ id: 'm1', content: '', originalLanguage: 'fr' }],
        preview: { kind: 'image' },
        soleMedia: { attachmentId: 'a1', mime: 'image/png', protected: true },
      }),
    ).toBe(true);
  });
});
