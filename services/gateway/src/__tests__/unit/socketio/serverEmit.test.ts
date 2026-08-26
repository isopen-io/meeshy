/**
 * `emitServerEvent` est la porte UNIQUE par laquelle le serveur émet vers les
 * clients — quatorze sites l'empruntent.
 *
 * Le défaut figé ici a été mesuré en PRODUCTION le 2026-08-25 :
 *
 *   TypeError: Cannot read properties of undefined (reading 'adapter')
 *       at emit (socket.io/dist/broadcast-operator.js:169)
 *       at emitServerEvent
 *       at SocialEventsHandler.emitToUser
 *       at broadcastPostBookmarked
 *
 * La porte faisait `const emit = target.emit` puis `emit(...)` : la méthode
 * était appelée DÉTACHÉE de son objet, donc `this` valait `undefined` et
 * `this.adapter` levait. Socket.IO ne le pardonne pas — `BroadcastOperator.emit`
 * lit `this.adapter` dès la première ligne.
 *
 * Conséquence, invisible pendant longtemps : les broadcasts `async` avalaient
 * l'exception en promesse rejetée (la route rendait 200 quand même), et seuls
 * les broadcasts SYNCHRONES la laissaient remonter — d'où un 500 sur le favori
 * et sur le like de commentaire, pendant que le reste du temps réel social
 * échouait en silence.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { emitServerEvent } from '../../../socketio/serverEmit';

/**
 * Un émetteur dont `emit` DÉPEND de son `this`, exactement comme
 * `BroadcastOperator`. Un appel détaché y lève au lieu d'enregistrer.
 */
function makeThisDependentTarget() {
  return {
    adapter: { broadcast: jest.fn() },
    received: [] as Array<{ event: string; payload: unknown }>,
    emit(event: string, payload: unknown) {
      // Reproduit la première ligne de BroadcastOperator.emit.
      this.adapter.broadcast({ event, payload }, {});
      this.received.push({ event, payload });
      return true;
    },
  };
}

describe('emitServerEvent — la porte préserve le receveur', () => {
  it("émet avec `this` lié à la cible (forme événement + charge)", () => {
    const target = makeThisDependentTarget();

    expect(() =>
      emitServerEvent(target as never, 'post:bookmarked' as never, { postId: 'p1' } as never),
    ).not.toThrow();

    expect(target.received).toEqual([{ event: 'post:bookmarked', payload: { postId: 'p1' } }]);
    expect(target.adapter.broadcast).toHaveBeenCalledTimes(1);
  });

  it("émet avec `this` lié à la cible (forme émission unique)", () => {
    const target = makeThisDependentTarget();

    expect(() =>
      emitServerEvent(target as never, {
        event: 'post:liked',
        payload: { postId: 'p2' },
      } as never),
    ).not.toThrow();

    expect(target.received).toEqual([{ event: 'post:liked', payload: { postId: 'p2' } }]);
  });

  it("ne rend pas la méthode détachable — c'est ce détachement qui cassait la prod", () => {
    const target = makeThisDependentTarget();
    // Le témoin de non-régression : appeler `emit` détaché DOIT lever. Si un
    // jour ce n'est plus vrai, les deux témoins ci-dessus deviennent muets et
    // ne prouveraient plus rien.
    const detached = target.emit;
    expect(() => detached('x', {})).toThrow(TypeError);
  });
});
