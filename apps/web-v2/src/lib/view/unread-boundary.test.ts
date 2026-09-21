import { describe, expect, test } from 'bun:test';

import { nextFrozenUnreadBoundary } from './unread-boundary';

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
