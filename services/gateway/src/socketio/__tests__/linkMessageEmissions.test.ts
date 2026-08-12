/**
 * `linkMessageEmissions` — ce qu'un message envoyé par lien de partage doit
 * mettre sur le fil pour être reçu par TOUS les clients, pas seulement le web.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

import { linkMessageEmissions } from '../linkMessageEmissions';

const MESSAGE = { id: 'msg-1', conversationId: 'conv-1', senderId: 'part-1', content: 'salut' };

describe('linkMessageEmissions', () => {
  it('conserve `link:message:new` avec son enveloppe `{ message }`', () => {
    const envelope = { message: MESSAGE };

    expect(linkMessageEmissions(envelope)).toContainEqual({
      event: SERVER_EVENTS.LINK_MESSAGE_NEW,
      payload: envelope,
    });
  });

  it('ajoute le `message:new` canonique en DÉBALLANT le message', () => {
    expect(linkMessageEmissions({ message: MESSAGE })).toContainEqual({
      event: SERVER_EVENTS.MESSAGE_NEW,
      payload: MESSAGE,
    });
  });

  it('émet `link:message:new` AVANT `message:new`', () => {
    expect(linkMessageEmissions({ message: MESSAGE }).map((e) => e.event)).toEqual([
      SERVER_EVENTS.LINK_MESSAGE_NEW,
      SERVER_EVENTS.MESSAGE_NEW,
    ]);
  });

  // Sans cette garde, un appelant dont l'enveloppe a dérivé diffuserait
  // `message:new` avec `undefined` : un client qui lit `.conversationId` d'un
  // payload absent ne peut que jeter le message — ou lever.
  it("n'ajoute PAS `message:new` quand l'enveloppe ne porte aucun message", () => {
    expect(linkMessageEmissions({}).map((e) => e.event)).toEqual([SERVER_EVENTS.LINK_MESSAGE_NEW]);
  });

  it("n'ajoute PAS `message:new` quand `message` n'est pas un objet", () => {
    expect(linkMessageEmissions({ message: null }).map((e) => e.event)).toEqual([
      SERVER_EVENTS.LINK_MESSAGE_NEW,
    ]);
    expect(linkMessageEmissions({ message: 'msg-1' }).map((e) => e.event)).toEqual([
      SERVER_EVENTS.LINK_MESSAGE_NEW,
    ]);
  });

  // Un tableau est un objet en JS : sans un test qui le nomme, `typeof === 'object'`
  // le laisserait passer et le client recevrait une liste là où il attend un message.
  it("n'ajoute PAS `message:new` quand `message` est un tableau", () => {
    expect(linkMessageEmissions({ message: [MESSAGE] }).map((e) => e.event)).toEqual([
      SERVER_EVENTS.LINK_MESSAGE_NEW,
    ]);
  });
});
