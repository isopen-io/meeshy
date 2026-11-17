/**
 * @jest-environment node
 *
 * #18380 — l'échec d'UN lecteur ne coûte que ce lecteur.
 *
 * Les trois émetteurs de `conversation:updated` composent une charge PAR
 * destinataire et la poussent dans une boucle. Les trois boucles vivaient sous
 * un `catch` d'appelant qui ATTRAPAIT la levée sans la CONFINER : le lecteur
 * suivant la payait, et l'appelant perdait tout ce qu'il faisait après — la
 * pastille de non-lus sur deux d'entre eux, l'accusé de remise automatique
 * (✓ → ✓✓) sur le transport PRIMAIRE d'envoi.
 *
 * Les témoins qui suivent portent sur l'unité, pas sur ses trois appelants :
 * c'est elle qui porte désormais la règle, et un quatrième émetteur l'héritera.
 */
import { describe, it, expect, jest } from '@jest/globals';

import { emitConversationUpdatedPerReader } from '../conversationUpdatedPerReader';

type Participant = { readonly id: string };

function makeIo(failingRooms: ReadonlySet<string> = new Set()) {
  const sent: { room: string; event: string; payload: unknown }[] = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        if (failingRooms.has(room)) throw new Error(`adapter down for ${room}`);
        sent.push({ room, event, payload });
        return undefined;
      },
    }),
  };
  return { io: io as never, sent };
}

const targets = (...ids: readonly string[]) =>
  ids.map((id) => ({ room: `user:${id}`, participant: { id } as Participant }));

const payloadFor = (p: Participant) =>
  ({ conversationId: 'c-1', updatedBy: { id: 'u-sender' }, lastMessageId: `m-${p.id}` }) as never;

describe('emitConversationUpdatedPerReader (#18380)', () => {
  it('sert chaque lecteur avec SA charge', () => {
    const { io, sent } = makeIo();

    emitConversationUpdatedPerReader(io, targets('a', 'b'), payloadFor);

    expect(sent.map((s) => s.room)).toEqual(['user:a', 'user:b']);
    expect(sent.map((s) => s.event)).toEqual(['conversation:updated', 'conversation:updated']);
    expect(sent.map((s) => (s.payload as { lastMessageId: string }).lastMessageId)).toEqual(['m-a', 'm-b']);
  });

  /* Le cœur du lot : le lecteur fautif est le PREMIER, donc son échec a tout à emporter. */
  it("une ÉMISSION qui lève sur le premier lecteur ne retire rien aux suivants", () => {
    const { io, sent } = makeIo(new Set(['user:a']));

    expect(() => emitConversationUpdatedPerReader(io, targets('a', 'b', 'c'), payloadFor)).not.toThrow();

    expect(sent.map((s) => s.room)).toEqual(['user:b', 'user:c']);
  });

  /*
   * La COMPOSITION est dans la portée gardée, et ce témoin est ce qui le dit :
   * `compose` lit la ligne du participant courant (le Prisme de l'aperçu est
   * résolu par lecteur), donc elle lève pour les mêmes raisons que l'émission.
   * La laisser dehors aurait mis la moitié du risque hors de la garde.
   */
  it('une COMPOSITION qui lève pour un lecteur ne retire rien aux suivants', () => {
    const { io, sent } = makeIo();

    emitConversationUpdatedPerReader(io, targets('a', 'b'), (p) => {
      if (p.id === 'a') throw new Error('preview resolution failed');
      return payloadFor(p);
    });

    expect(sent.map((s) => s.room)).toEqual(['user:b']);
  });

  /* `null` = « rien à envoyer à celui-ci » — ce que les `continue` des appelants voulaient dire. */
  it('un lecteur dont la charge est `null` est SAUTÉ, pas servi vide', () => {
    const { io, sent } = makeIo();

    emitConversationUpdatedPerReader(io, targets('a', 'b'), (p) => (p.id === 'a' ? null : payloadFor(p)));

    expect(sent.map((s) => s.room)).toEqual(['user:b']);
  });

  /* L'échec est NOMMÉ avec sa room : sans elle, un journal dit qu'un lecteur a échoué sans dire lequel. */
  it("rend l'erreur à l'appelant avec la room du lecteur fautif", () => {
    const { io } = makeIo(new Set(['user:b']));
    const onError = jest.fn();

    emitConversationUpdatedPerReader(io, targets('a', 'b'), payloadFor, onError as never);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'user:b');
  });
});
