import { describe, expect, test } from 'bun:test';

import type { PersonSummary } from '@/lib/api/friend-requests';
import type { Conversation, Participant } from '@/lib/api/types';
import type { SendPayload } from '@/lib/send/send-sheet-plan';
import { sharePlanOf } from '@/lib/send/share-entry';

import {
  blockedReasonOf,
  newGroupTitleOf,
  planErrorMessageOf,
  previewOf,
  recipientRows,
  statusViewOf,
  withdrawnLineOf,
  withheldLineOf,
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

  test('hors ligne : « En file », sans bouton (la file repart seule au retour du réseau)', () => {
    expect(statusViewOf({ state: 'queued' }, true)).toEqual({ tone: 'queued', label: 'sendSheet.state.queued', retry: false });
  });

  test('chaque échec a son mot, et tous se rejouent', () => {
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
    expect(planErrorMessageOf({ kind: 'over-limits', trimCount: 2 })).toEqual({ key: 'sendSheet.limit.removeToSend', count: 2 });
    expect(planErrorMessageOf({ kind: 'blocked' })).toEqual({ key: 'sendSheet.blocked.title' });
  });
});

const attachment = (over: Partial<Extract<SendPayload, { kind: 'attachment' }>> = {}): SendPayload => ({
  kind: 'attachment',
  conversationId: 'c1',
  messageId: 'm1',
  attachmentId: 'a1',
  mime: 'image/jpeg',
  previewUrl: 'https://cdn.test/a1.jpg',
  exit: { id: 'm1', pieces: [{ id: 'a1', mimeType: over.mime ?? 'image/jpeg' }] },
  ...over,
});

describe('previewOf — l’aperçu de ce qui part', () => {
  test('plusieurs messages se comptent ; un seul se montre', () => {
    expect(
      previewOf({
        kind: 'messages',
        conversationId: 'c1',
        messages: [],
        exit: [],
        preview: { kind: 'messages', count: 3 },
      }),
    ).toEqual({ kind: 'messages', label: { key: 'sendSheet.preview.messages', count: 3 } });
    expect(
      previewOf({
        kind: 'messages',
        conversationId: 'c1',
        messages: [],
        exit: [],
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

const messagesOf = (exit: Extract<SendPayload, { kind: 'messages' }>['exit']): SendPayload => ({
  kind: 'messages',
  conversationId: 'c1',
  messages: exit.map((m) => ({ id: m.id, content: m.text ?? '', originalLanguage: 'fr' })),
  exit,
  preview: { kind: 'messages', count: exit.length },
});

describe('les lignes de motif — ce que la loi retire ou interdit se DIT', () => {
  test('une flamme : la ligne dit qu’elle ne se publie, ne s’enregistre ni ne se copie', () => {
    expect(withheldLineOf(sharePlanOf(attachment({ exit: { id: 'm1', effectFlags: 1, ephemeralDuration: 60, pieces: [{ id: 'a1', mimeType: 'image/jpeg' }] } })))).toBe('sendSheet.withheld.flame');
  });

  test('une photo seule ne fait pas un réel', () => {
    expect(withheldLineOf(sharePlanOf(attachment()))).toBe('sendSheet.withheld.singlePhoto');
  });

  test('un contenu ordinaire sans réserve : aucune ligne', () => {
    expect(withheldLineOf(sharePlanOf({ kind: 'text', text: 'Bonjour' }))).toBeNull();
  });

  test('D6 — le message à vue unique reste, les autres partent, et la ligne le compte', () => {
    expect(withdrawnLineOf(sharePlanOf(messagesOf([{ id: 'a' }, { id: 'b', isViewOnce: true }, { id: 'c' }])))).toEqual({ reason: 'sendSheet.withdrawn.viewOnce', leaving: 2 });
  });

  test('rien ne part : la carte « ne sort pas de Meeshy » et son motif', () => {
    const plan = sharePlanOf(messagesOf([{ id: 'b', isViewOnce: true }]));
    expect(withdrawnLineOf(plan)).toBeNull();
    expect(blockedReasonOf(plan)).toBe('sendSheet.withdrawn.viewOnce');
  });
});

describe('les destinataires — communautés, détails, chiffrement', () => {
  test('les canaux d’une communauté se rangent sous elle (D11), seulement si l’on connaît son nom', () => {
    const channel = conversation({ id: 'k-general', title: '#général', communityId: 'k1', memberCount: 40 });
    const rows = recipientRows({ conversations: [channel], friends: [], searchResults: undefined, viewerId: VIEWER, query: '', communities: { k1: { name: 'Lyon Polyglotte' } } });
    expect(rows.communities.map((c) => [c.name, c.channels.map((row) => row.key)])).toEqual([['Lyon Polyglotte', ['conversation:k-general']]]);
    expect(recipientRows({ conversations: [channel], friends: [], searchResults: undefined, viewerId: VIEWER, query: '' }).communities).toEqual([]);
  });

  test('une conversation où l’on ne peut pas écrire n’est pas un destinataire', () => {
    const readOnly = conversation({ id: 'c-ro', viewerWriteRestriction: 'announcement-only' as never });
    expect(recipientRows({ conversations: [readOnly], friends: [], searchResults: undefined, viewerId: VIEWER, query: '' }).conversations).toEqual([]);
  });

  test('une conversation chiffrée le dit ; un groupe dit son effectif', () => {
    const rows = recipientRows({
      conversations: [conversation({ id: 'c-e', encryptionMode: 'e2ee', memberCount: 4 }), conversation({ id: 'c-g', memberCount: 12 })],
      friends: [],
      searchResults: undefined,
      viewerId: VIEWER,
      query: '',
    });
    expect(rows.conversations.map((row) => [row.key, row.encrypted, row.detail])).toEqual([
      ['conversation:c-e', true, { key: 'sendSheet.row.encryptedGroup', count: 4 }],
      ['conversation:c-g', false, { key: 'sendSheet.row.group', count: 12 }],
    ]);
  });

  test('la recherche serveur ajoute les conversations hors cache, sans doublon', () => {
    const cached = conversation({ id: 'c-a', title: 'Lecture du soir' });
    const found = conversation({ id: 'c-b', title: 'Lecture partagée' });
    const rows = recipientRows({ conversations: [cached], friends: [], searchResults: undefined, viewerId: VIEWER, query: 'lec', conversationResults: [cached, found] });
    expect(rows.conversations.map((row) => row.key)).toEqual(['conversation:c-a', 'conversation:c-b']);
  });

  test('une personne porte sa clé de présence ; un groupe, jamais', () => {
    const rows = recipientRows({ conversations: [conversation({ id: 'c-g' }), direct('c-d', 'u-ana', 'Ana')], friends: [person('u-lea', 'Léa')], searchResults: undefined, viewerId: VIEWER, query: '' });
    expect(rows.conversations.map((row) => row.presenceKey)).toEqual([undefined, 'u-ana']);
    expect(rows.people.map((row) => row.presenceKey)).toEqual(['u-lea']);
  });

  test('le nom d’un groupe neuf : les prénoms, dans l’ordre choisi', () => {
    const rows = recipientRows({ conversations: [], friends: [person('u-1', 'Léa Martin'), person('u-2', 'Léon Ndiaye')], searchResults: undefined, viewerId: VIEWER, query: '' });
    expect(newGroupTitleOf(rows.people)).toBe('Léa, Léon');
  });
});

/** #9573 — un refus du serveur dont on connaît le motif s'EXPLIQUE, et ne propose pas de réessayer ce qui sera refusé encore. */
describe('statusViewOf — le refus du serveur est une explication', () => {
  const refused = (message: string, code?: string) =>
    statusViewOf({ state: 'failed', failure: { kind: 'refused', status: 400, message, ...(code === undefined ? {} : { code }) } }, true);

  test('chaque motif du transfert a sa phrase, sans « Réessayer »', () => {
    expect(refused('Un message à vue unique ne peut pas être transféré')).toEqual({ tone: 'failed', label: 'sendSheet.failure.forward.viewOnce', retry: false });
    expect(refused('Un message qui disparaît après lecture ne peut pas être transféré')).toEqual({ tone: 'failed', label: 'sendSheet.failure.forward.afterRead', retry: false });
    expect(refused('Le message d’origine n’est plus disponible : rien à transférer')).toEqual({ tone: 'failed', label: 'sendSheet.failure.forward.unavailable', retry: false });
  });

  test('un média protégé refusé à la publication dit « contenu protégé »', () => {
    expect(refused('This media is protected and cannot be published', 'PROTECTED_MEDIA')).toEqual({ tone: 'failed', label: 'sendSheet.protected', retry: false });
  });

  test('un refus sans motif connu reste « refusé », rejouable', () => {
    expect(refused('autre chose')).toEqual({ tone: 'failed', label: 'sendSheet.failure.refused', retry: true });
  });
});
