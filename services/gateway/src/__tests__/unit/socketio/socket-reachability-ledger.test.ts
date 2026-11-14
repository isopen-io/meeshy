/**
 * #16726 — le verdict de joignabilité d'un COMPTE est l'INTERSECTION de ceux
 * de ses sockets.
 *
 * Un compte est joignable pour une conversation dès qu'UNE de ses sockets est
 * dans la room. L'union enfilerait pour un compte parfaitement joignable
 * (doublons à la remise) ; le dernier écrit PERD — et c'est la perte, pas le
 * doublon, qui a coûté : une socket absente de la room tenue pour joignable
 * n'a ni diffusion, ni file, donc rien à rejouer.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import {
  combineSocketReachability,
  liveSocketsOf,
  readSocketReachability,
  recordSocketReachability,
  noteConversationReachable,
  noteConversationUnreachable,
} from '../../../socketio/socketReachability';

const A = 'conv-a';
const B = 'conv-b';

const socketWith = (id: string, reach?: { unreachableConversations?: ReadonlySet<string>; allConversationRoomsUnreachable?: boolean }) => {
  const socket = { id, data: {} as unknown };
  if (reach) recordSocketReachability(socket, reach);
  return socket;
};

describe('la loi de combinaison', () => {
  it('une seule socket SAINE rend le compte joignable, quoi que portent les autres', () => {
    const verdict = combineSocketReachability([
      socketWith('malade', { unreachableConversations: new Set([A, B]) }),
      socketWith('sain'),
    ]);

    expect(verdict).toEqual({});
  });

  it('ne garde que ce que TOUTES les sockets déclarent injoignable', () => {
    const verdict = combineSocketReachability([
      socketWith('s1', { unreachableConversations: new Set([A, B]) }),
      socketWith('s2', { unreachableConversations: new Set([A]) }),
    ]);

    expect(verdict.unreachableConversations && [...verdict.unreachableConversations]).toEqual([A]);
    expect(verdict.allConversationRoomsUnreachable).toBeUndefined();
  });

  it('« toutes, liste inconnue » est ABSORBANT : il ne retire rien à ce qu une autre socket nomme', () => {
    const verdict = combineSocketReachability([
      socketWith('s1', { allConversationRoomsUnreachable: true }),
      socketWith('s2', { unreachableConversations: new Set([A]) }),
    ]);

    expect(verdict.unreachableConversations && [...verdict.unreachableConversations]).toEqual([A]);
  });

  it('« toutes » ne devient le verdict du COMPTE que si toutes ses sockets le portent', () => {
    const toutes = [socketWith('s1', { allConversationRoomsUnreachable: true }), socketWith('s2', { allConversationRoomsUnreachable: true })];

    expect(combineSocketReachability(toutes)).toEqual({ allConversationRoomsUnreachable: true });
  });

  it('deux sockets qui ne se recoupent pas rendent le compte joignable', () => {
    const verdict = combineSocketReachability([
      socketWith('s1', { unreachableConversations: new Set([A]) }),
      socketWith('s2', { unreachableConversations: new Set([B]) }),
    ]);

    expect(verdict).toEqual({});
  });

  it('zéro socket rend un verdict VIDE — un compte sans socket est hors ligne, et la file l enfile', () => {
    expect(combineSocketReachability([])).toEqual({});
  });
});

describe('le fait est rangé sur la SOCKET', () => {
  it('une conversation rejointe sort de son ensemble, une conversation perdue y entre', () => {
    const socket = socketWith('s1', { unreachableConversations: new Set([A, B]) });

    noteConversationReachable(socket, A);
    expect([...(readSocketReachability(socket)?.unreachableConversations ?? [])]).toEqual([B]);

    noteConversationUnreachable(socket, A);
    expect(readSocketReachability(socket)?.unreachableConversations?.has(A)).toBe(true);
  });

  it('un ensemble vidé ne laisse pas un ensemble VIDE derrière lui', () => {
    const socket = socketWith('s1', { unreachableConversations: new Set([A]) });

    noteConversationReachable(socket, A);

    expect(readSocketReachability(socket)?.unreachableConversations).toBeUndefined();
  });
});

describe('liveSocketsOf — « je ne sais pas » n est pas « aucune »', () => {
  it('rend undefined quand le namespace n est pas lisible, jamais une liste vide', () => {
    expect(liveSocketsOf({ id: 's1' }, ['s2'])).toBeUndefined();
  });

  it('résout les ids par le namespace et se rend LUI-MÊME sans le consulter', () => {
    const autre = socketWith('s2');
    const socket = { id: 's1', data: {}, nsp: { sockets: { get: (id: string) => (id === 's2' ? autre : undefined) } } };

    expect(liveSocketsOf(socket, ['s1', 's2', 'parti'])).toEqual([socket, autre]);
  });
});
