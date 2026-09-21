import { describe, expect, test } from 'bun:test';

import { conversationDefaults, message, VIEWER_ID } from '@/lib/api/fixtures-base';
import type { Conversation, Message } from '@/lib/api/types';

import { nextFrozenUnreadBoundary, unreadBoundaryOf } from './unread-boundary';

/**
 * **LE GEL DE LA FRONTIÈRE DE NON-LUS** (#7202, W3, décision D-L2/D-L3) — le
 * séparateur ne doit PAS bouger pendant la session, même quand W1 (#7201)
 * avance la lecture pendant qu'on lit. `nextFrozenUnreadBoundary` est la loi
 * PURE qui décide QUAND (re)calculer, isolée de React (pas de `useRef`
 * ici) : elle prend l'état gelé précédent et rend le suivant, sans jamais
 * lire ni écrire un ref elle-même — c'est au hook (`useUnreadBoundary`,
 * glue non testée ici) de porter la référence.
 */
describe('nextFrozenUnreadBoundary — se fige au premier ready, ne bouge plus ensuite', () => {
  test('rien tant que ready est faux (conversation/messages pas encore chargés)', () => {
    const next = nextFrozenUnreadBoundary({
      previous: undefined,
      conversationId: 'c-1',
      ready: false,
      compute: () => {
        throw new Error('ne doit pas être appelé tant que ready est faux');
      },
    });
    expect(next).toBeUndefined();
  });

  test('se fige au premier ready, avec le résultat de compute()', () => {
    const next = nextFrozenUnreadBoundary({
      previous: undefined,
      conversationId: 'c-1',
      ready: true,
      compute: () => ({ firstUnreadId: 'm-3', unreadCount: 2 }),
    });
    expect(next).toEqual({ conversationId: 'c-1', boundary: { firstUnreadId: 'm-3', unreadCount: 2 } });
  });

  test('se fige aussi sur null (tout est lu) — un null gelé reste gelé', () => {
    const next = nextFrozenUnreadBoundary({
      previous: undefined,
      conversationId: 'c-1',
      ready: true,
      compute: () => null,
    });
    expect(next).toEqual({ conversationId: 'c-1', boundary: null });
  });

  test('ne recalcule JAMAIS pour la MÊME conversation, même si compute() changerait de réponse', () => {
    const gele = { conversationId: 'c-1', boundary: { firstUnreadId: 'm-3', unreadCount: 2 } };
    const next = nextFrozenUnreadBoundary({
      previous: gele,
      conversationId: 'c-1',
      ready: true,
      compute: () => {
        throw new Error('ne doit pas être appelé — la frontière est déjà gelée pour cette conversation');
      },
    });
    expect(next).toBe(gele);
  });

  test('se REFIGE à un changement de conversationId (nouveau fil ouvert)', () => {
    const gele = { conversationId: 'c-1', boundary: { firstUnreadId: 'm-3', unreadCount: 2 } };
    const next = nextFrozenUnreadBoundary({
      previous: gele,
      conversationId: 'c-2',
      ready: true,
      compute: () => ({ firstUnreadId: 'm-9', unreadCount: 1 }),
    });
    expect(next).toEqual({ conversationId: 'c-2', boundary: { firstUnreadId: 'm-9', unreadCount: 1 } });
  });

  test('un changement de conversationId SANS ready ne fige rien pour la nouvelle conversation — l’ancien état survit inchangé, le hook le rejette lui-même sur l’identifiant', () => {
    const gele = { conversationId: 'c-1', boundary: { firstUnreadId: 'm-3', unreadCount: 2 } };
    const next = nextFrozenUnreadBoundary({
      previous: gele,
      conversationId: 'c-2',
      ready: false,
      compute: () => {
        throw new Error('ne doit pas être appelé tant que ready est faux');
      },
    });
    expect(next).toBe(gele);
  });
});

/**
 * **`unreadBoundaryOf` — SANS AUCUN SIGNAL, NE PAS INVENTER DE FRONTIÈRE**
 * (garde ajoutée en revue, mesurée en clair par `check-thread-virtualization.mjs`
 * avant correction : un fil de 500 messages s'ouvrait à ~8 400 px du bas au
 * lieu de EN bas, `c-deploiement` n'ayant NI curseur de lecture NI
 * `currentUserJoinedAt` — un état que `GET /conversations/:id` (le chemin
 * nominal de `thread.tsx`) peut produire pour de vrai : ce endpoint ne sert
 * JAMAIS `currentUserJoinedAt` (S1, réservé à la LISTE), et un membre dont
 * `ConversationReadCursor` n'existe pas encore n'a ni `lastReadMessageId`
 * ni `lastReadAt` ni `lastReadMessageCreatedAt`. La loi partagée
 * (`firstUnreadBoundary`), appliquée à la lettre, élirait alors le tout
 * premier message d'autrui de la fenêtre chargée comme frontière — la
 * garde l'en empêche : zéro signal ⇒ comportement d'aujourd'hui (frontière
 * `null`, ouverture en bas).
 */
describe('unreadBoundaryOf — la garde du zéro-signal', () => {
  const conversationOf = (overrides: Partial<Conversation>): Conversation => ({
    ...conversationDefaults,
    id: 'c-test',
    title: 'Test',
    type: 'group',
    memberCount: 2,
    participants: [],
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-21T00:00:00.000Z'),
    ...overrides,
  });

  const messageOf = (id: string, senderId: string, minute: number): Message =>
    message({
      id,
      conversationId: 'c-test',
      senderId,
      content: `m-${id}`,
      originalLanguage: 'fr',
      translations: [],
      createdAt: new Date(`2026-09-21T09:0${minute}:00.000Z`),
    });

  const messages: readonly Message[] = [
    messageOf('m1', 'u-autrui', 1),
    messageOf('m2', 'u-autrui', 2),
    messageOf('m3', 'u-autrui', 3),
  ];

  test('AUCUN des quatre signaux ⇒ null (jamais « tout est non lu depuis toujours »)', () => {
    const conversation = conversationOf({});
    expect('lastReadMessageId' in conversation).toBe(false);
    expect('lastReadAt' in conversation).toBe(false);
    expect('lastReadMessageCreatedAt' in conversation).toBe(false);
    expect('currentUserJoinedAt' in conversation).toBe(false);

    const boundary = unreadBoundaryOf({ conversation, messages, viewerId: VIEWER_ID });

    expect(boundary).toBeNull();
  });

  test('UN SEUL signal (lastReadMessageId) suffit à laisser la loi partagée trancher', () => {
    const conversation = conversationOf({
      lastReadMessageId: 'm1',
      lastReadMessageCreatedAt: new Date('2026-09-21T09:01:00.000Z'),
    });

    const boundary = unreadBoundaryOf({ conversation, messages, viewerId: VIEWER_ID });

    expect(boundary).toEqual({ firstUnreadId: 'm2', unreadCount: 2 });
  });

  test('currentUserJoinedAt SEUL (servi par la liste, absent du détail) suffit aussi', () => {
    const conversation = conversationOf({ currentUserJoinedAt: new Date('2026-09-21T09:01:30.000Z') });

    const boundary = unreadBoundaryOf({ conversation, messages, viewerId: VIEWER_ID });

    expect(boundary).toEqual({ firstUnreadId: 'm2', unreadCount: 2 });
  });
});
