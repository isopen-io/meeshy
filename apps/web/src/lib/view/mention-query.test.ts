import { describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';
import type { MentionCandidate } from '@/lib/api/mention-suggestions';

import {
  activeMentionQuery,
  filterMentionCandidates,
  insertMention,
  localMentionCandidates,
  mergeMentionCandidates,
  queriesRemote,
} from './mention-query';

const caretAtEnd = (text: string) => activeMentionQuery(text, text.length);

const candidate = (over: Partial<MentionCandidate> & { readonly id: string; readonly username: string }): MentionCandidate => ({
  displayName: over.username,
  ...over,
});

type SenderInput = {
  readonly id: string;
  readonly senderId: string;
  readonly username?: string;
  readonly displayName?: string;
  readonly avatar?: string;
  readonly type?: 'user' | 'anonymous';
};

const message = ({ id, senderId, username, displayName, avatar, type = 'user' }: SenderInput): Message =>
  ({
    id,
    conversationId: 'c1',
    senderId,
    content: 'bonjour',
    originalLanguage: 'fr',
    createdAt: new Date(0),
    sender: {
      id: `p-${senderId}`,
      conversationId: 'c1',
      type,
      userId: senderId,
      displayName: displayName ?? username ?? '',
      role: 'member',
      language: 'fr',
      isActive: true,
      isOnline: false,
      joinedAt: new Date(0),
      ...(username === undefined ? {} : { user: { id: senderId, username, ...(avatar === undefined ? {} : { avatar }) } }),
    },
  }) as unknown as Message;

describe('activeMentionQuery — la requête @ AU CURSEUR', () => {
  test('un @ nu en début de champ ouvre une requête vide', () => {
    expect(caretAtEnd('@')).toEqual({ query: '', start: 0, end: 1 });
  });

  test('un @ après une espace ouvre la requête tapée jusque-là', () => {
    expect(caretAtEnd('salut @al')).toEqual({ query: 'al', start: 6, end: 9 });
  });

  test('une adresse e-mail n’ouvre rien : le @ doit commencer un mot', () => {
    expect(caretAtEnd('contact@exemple.com')).toBeNull();
  });

  test('le pseudo admet lettres, chiffres, souligné, point et tiret — et les lettres accentuées', () => {
    expect(caretAtEnd('@marie-claire.b_2')?.query).toBe('marie-claire.b_2');
    expect(caretAtEnd('@Éric')?.query).toBe('Éric');
  });

  test('une espace après le pseudo ferme la requête', () => {
    expect(caretAtEnd('@alice ')).toBeNull();
  });

  test('au-delà de 32 caractères ce n’est plus une frappe : rien ne s’ouvre', () => {
    expect(caretAtEnd(`@${'a'.repeat(33)}`)).toBeNull();
  });

  test('la requête se lit AU CURSEUR, pas en fin de texte', () => {
    const text = 'bonjour @al et au revoir';
    expect(activeMentionQuery(text, 11)).toEqual({ query: 'al', start: 8, end: 11 });
  });

  test('curseur au milieu d’un pseudo : la requête s’arrête au curseur, le remplacement couvre le mot entier', () => {
    expect(activeMentionQuery('@alice', 3)).toEqual({ query: 'al', start: 0, end: 6 });
  });

  test('un curseur hors du texte n’ouvre rien', () => {
    expect(activeMentionQuery('@al', 9)).toBeNull();
  });
});

describe('insertMention — `@username ` à la place de la requête', () => {
  test('en fin de texte, insère le pseudo suivi d’une espace et place le curseur après', () => {
    const text = 'salut @al';
    const query = caretAtEnd(text);
    expect(query).not.toBeNull();
    if (query === null) return;
    expect(insertMention(text, query, 'alice')).toEqual({ text: 'salut @alice ', caret: 13 });
  });

  test('au milieu du texte, remplace le mot entier et n’ajoute pas une seconde espace', () => {
    const text = 'bonjour @al et au revoir';
    const query = activeMentionQuery(text, 11);
    if (query === null) throw new Error('requête attendue');
    expect(insertMention(text, query, 'alice')).toEqual({ text: 'bonjour @alice et au revoir', caret: 15 });
  });
});

describe('queriesRemote — la passerelle n’est interrogée qu’à partir de deux caractères', () => {
  test('seuil', () => {
    expect(queriesRemote('')).toBe(false);
    expect(queriesRemote('a')).toBe(false);
    expect(queriesRemote('al')).toBe(true);
  });
});

describe('localMentionCandidates — les expéditeurs des messages chargés', () => {
  test('distincts, le plus récent d’abord, sans soi, sans anonyme ni expéditeur sans pseudo', () => {
    const messages = [
      message({ id: 'm1', senderId: 'u1', username: 'alice', displayName: 'Alice' }),
      message({ id: 'm2', senderId: 'me', username: 'moi' }),
      message({ id: 'm3', senderId: 'u2', username: 'bob', avatar: 'https://cdn/bob.png' }),
      message({ id: 'm4', senderId: 'u1', username: 'alice', displayName: 'Alice' }),
      message({ id: 'm5', senderId: 'g1', displayName: 'Invité', type: 'anonymous' }),
      message({ id: 'm6', senderId: 'u3', displayName: 'Sans pseudo' }),
    ];
    expect(localMentionCandidates(messages, 'me')).toEqual([
      { id: 'u1', username: 'alice', displayName: 'Alice' },
      { id: 'u2', username: 'bob', displayName: 'bob', avatar: 'https://cdn/bob.png' },
    ]);
  });
});

describe('filterMentionCandidates — sur le pseudo OU le nom, sans casse ni accent', () => {
  const people = [
    candidate({ id: '1', username: 'eric', displayName: 'Éric Dupont' }),
    candidate({ id: '2', username: 'bob', displayName: 'Robert' }),
  ];

  test('une requête vide rend tout le monde', () => {
    expect(filterMentionCandidates(people, '')).toEqual(people);
  });

  test('le nom affiché compte, accent compris', () => {
    expect(filterMentionCandidates(people, 'rob').map((c) => c.id)).toEqual(['2']);
    expect(filterMentionCandidates(people, 'ÉRI').map((c) => c.id)).toEqual(['1']);
    expect(filterMentionCandidates(people, 'dup').map((c) => c.id)).toEqual(['1']);
  });
});

describe('mergeMentionCandidates — les locaux d’abord, puis les distants absents', () => {
  test('dédoublonne par identifiant et par pseudo, et ne propose jamais soi-même', () => {
    const locals = [candidate({ id: 'u1', username: 'alice' })];
    const remote = [
      candidate({ id: 'u1', username: 'alice', badge: 'conversation' }),
      candidate({ id: 'u9', username: 'ALICE' }),
      candidate({ id: 'me', username: 'moi' }),
      candidate({ id: 'u2', username: 'alicia', badge: 'friend' }),
    ];
    expect(mergeMentionCandidates({ locals, remote, selfId: 'me' }).map((c) => c.id)).toEqual(['u1', 'u2']);
  });
});
