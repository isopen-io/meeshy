import { describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';
import type { MentionCandidate } from '@/lib/api/mention-suggestions';

import type { FriendRequestRecord } from '@/lib/api/friend-requests';

import {
  activeMentionQuery,
  composeMentionList,
  contactMentionCandidates,
  filterMentionCandidates,
  insertMention,
  localMentionCandidates,
  mergeMentionCandidates,
  peopleMentionCandidates,
  queriesRemote,
  rankMentionCandidates,
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
    expect(mergeMentionCandidates({ groups: [locals, remote], selfId: 'me' }).map((c) => c.id)).toEqual(['u1', 'u2']);
  });
});

describe('rankMentionCandidates — une lettre FILTRE et TRIE, sans réseau (#7846)', () => {
  const people = [
    candidate({ id: '1', username: 'bernard', displayName: 'Bernard Alain' }),
    candidate({ id: '2', username: 'malik', displayName: 'Malik' }),
    candidate({ id: '3', username: 'zoe', displayName: 'Alice Zoé' }),
    candidate({ id: '4', username: 'anna', displayName: 'Anna' }),
    candidate({ id: '5', username: 'paul', displayName: 'Paul' }),
  ];

  test('le pseudo qui COMMENCE par la lettre passe devant le nom qui la contient', () => {
    expect(rankMentionCandidates(people, 'a').map((c) => c.id)).toEqual(['4', '1', '3', '2', '5']);
  });

  test('une requête vide garde l’ordre reçu', () => {
    expect(rankMentionCandidates(people, '')).toEqual(people);
  });
});

describe('composeMentionList — contacts, puis participants, puis autres, sans doublon (#7846)', () => {
  const contacts = [candidate({ id: 'c1', username: 'claire', badge: 'friend' }), candidate({ id: 'p1', username: 'paula', badge: 'friend' })];
  const participants = [candidate({ id: 'p1', username: 'paula' }), candidate({ id: 'p2', username: 'pierre' })];
  const remote = [candidate({ id: 'p2', username: 'pierre' }), candidate({ id: 'o1', username: 'olga' }), candidate({ id: 'me', username: 'moi' })];

  test('@ seul : les contacts d’abord, puis les participants qui n’en sont pas', () => {
    const list = composeMentionList({ contacts, participants, remote: [], query: '', selfId: 'me' });
    expect(list.map((c) => c.id)).toEqual(['c1', 'p1', 'p2']);
  });

  test('les distants ferment la marche, dédoublonnés, jamais soi-même', () => {
    const list = composeMentionList({ contacts, participants, remote, query: '', selfId: 'me' });
    expect(list.map((c) => c.id)).toEqual(['c1', 'p1', 'p2', 'o1']);
  });

  test('un contact qui parle dans le fil reste dans le groupe des contacts', () => {
    const list = composeMentionList({ contacts, participants, remote: [], query: 'p', selfId: 'me' });
    expect(list.map((c) => c.id)).toEqual(['p1', 'p2']);
    expect(list[0]?.badge).toBe('friend');
  });
});

describe('les candidats hors fil — des personnes, des contacts (#7846)', () => {
  const request = (over: Partial<FriendRequestRecord>): FriendRequestRecord => ({
    id: 'r',
    senderId: 'me',
    receiverId: 'x',
    status: 'accepted',
    message: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    sender: null,
    receiver: null,
    ...over,
  });

  test('un contact est l’AUTRE partie de l’amitié, marqué « ami », sans soi ni pseudo vide', () => {
    const accepted = [
      request({ id: 'r1', senderId: 'me', receiverId: 'u2', receiver: { id: 'u2', username: 'zoe', displayName: 'Zoé', avatar: null } }),
      request({ id: 'r2', senderId: 'u1', receiverId: 'me', sender: { id: 'u1', username: 'alice', displayName: null, avatar: 'https://cdn/a.png' } }),
      request({ id: 'r3', senderId: 'u3', receiverId: 'me', sender: { id: 'u3', username: '', displayName: 'Sans pseudo', avatar: null } }),
    ];
    expect(contactMentionCandidates(accepted, 'me')).toEqual([
      { id: 'u1', username: 'alice', displayName: 'alice', avatar: 'https://cdn/a.png', badge: 'friend' },
      { id: 'u2', username: 'zoe', displayName: 'Zoé', badge: 'friend' },
    ]);
  });

  test('sans lecteur connu, aucun contact', () => {
    expect(contactMentionCandidates([request({})], null)).toEqual([]);
  });

  test('les personnes d’une publication : distinctes, sans soi, sans pseudo manquant', () => {
    const people = [
      { id: 'a', username: 'auteur', displayName: 'L’auteur' },
      { id: 'me', username: 'moi' },
      { id: 'b', username: null, displayName: 'Sans pseudo' },
      { id: 'a', username: 'auteur' },
      { id: 'c', username: 'carl', avatar: ' ' },
    ];
    expect(peopleMentionCandidates(people, 'me')).toEqual([
      { id: 'a', username: 'auteur', displayName: 'L’auteur' },
      { id: 'c', username: 'carl', displayName: 'carl' },
    ]);
  });
});
