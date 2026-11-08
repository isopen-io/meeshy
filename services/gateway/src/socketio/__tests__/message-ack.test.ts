/**
 * Tests for the `message:send` ACK + `message:new` broadcast shaping contract
 * (Phase 4 §6.2).
 *
 * These exercise the REAL production helpers imported from
 * `utils/message-ack-shaping` — the same functions `MessageHandler` calls — so
 * a regression in the ack/broadcast data-flow (e.g. dropping the
 * `clientMessageId` echo, or leaking it into the peers' broadcast) fails here.
 *
 * Verifies:
 * - ACK echoes the server `messageId` (renamed from `id`)
 * - ACK echoes `clientMessageId` when provided, omits it otherwise
 * - ACK normalizes a `Date` `createdAt` to an ISO string, passes a string through
 * - `clientMessageId` is stripped from the peers' `message:new` broadcast
 * - stripping never mutates the sender's own payload
 */

import { describe, it, expect } from '@jest/globals';
import {
  buildMessageAckData,
  stripClientMessageId,
  withSubmittedClientMessageId,
} from '../utils/message-ack-shaping';

describe('buildMessageAckData (message:send ack)', () => {
  it('renames the server id to messageId and echoes clientMessageId when provided', () => {
    const data = buildMessageAckData({ row: { id: 'server-msg-123' }, submittedClientMessageId: 'client-temp-abc' });

    expect(data.messageId).toBe('server-msg-123');
    expect(data.clientMessageId).toBe('client-temp-abc');
  });

  it('omits clientMessageId when not provided', () => {
    const data = buildMessageAckData({ row: { id: 'server-msg-456' } });

    expect(data.messageId).toBe('server-msg-456');
    expect(data).not.toHaveProperty('clientMessageId');
  });

  it('normalizes a Date createdAt to an ISO string', () => {
    const when = new Date('2026-07-28T12:00:00.000Z');
    const data = buildMessageAckData({ row: { id: 'server-msg-789', createdAt: when } });

    expect(data.createdAt).toBe('2026-07-28T12:00:00.000Z');
  });

  it('passes a string createdAt through unchanged', () => {
    const data = buildMessageAckData({ row: { id: 'server-msg-789', createdAt: '2026-07-28T12:00:00.000Z' } });

    expect(data.createdAt).toBe('2026-07-28T12:00:00.000Z');
  });

  /**
   * #17058 — LE témoin du lot, et il ne peut s'écrire qu'avec deux cids
   * DIFFÉRENTS.
   *
   * Les cinq témoins ci-dessus passent le même cid que la ligne porte, ou
   * aucun : au cas nominal, la forme juste (« rendre celui de l'appelant ») et
   * le défaut (« rendre celui de la ligne ») rendent le MÊME résultat, et aucun
   * témoin posé là ne peut tomber. C'est la règle du rang (leçon 261) : un
   * témoin de provenance s'écrit là où les deux sources divergent.
   *
   * Elles divergent sur un hit de déduplication par CONTENU
   * (`findContentWindowDuplicate`, #17024) : la ligne rendue est celle du
   * PREMIER message, donc elle porte `cid_A` quand l'appelant a soumis
   * `cid_B`.
   */
  it('#17058 — sur un dédup, rend le cid SOUMIS et jamais celui de la ligne relue', () => {
    const data = buildMessageAckData({
      row: { id: 'server-msg-premier', clientMessageId: 'cid_A' },
      submittedClientMessageId: 'cid_B',
    });

    // L'accusé nomme le message qu'on lui a soumis.
    expect(data.clientMessageId).toBe('cid_B');
    // Et surtout, il ne nomme PAS l'autre : c'est cette attribution qui faisait
    // rattacher l'accusé à une ligne DÉJÀ confirmée côté iOS, laissant la bulle
    // de `cid_B` en horloge « envoi » indéfiniment.
    expect(data.clientMessageId).not.toBe('cid_A');
    // Le `messageId` reste celui de la LIGNE : c'est le seul champ dont elle
    // soit la source autoritative.
    expect(data.messageId).toBe('server-msg-premier');
  });

  it("#17058 — un cid de ligne sans cid soumis ne ressort PAS : l'accusé se taît", () => {
    // Un transport qui n'envoie pas de cid ne doit pas en recevoir un fabriqué
    // depuis la ligne. Le client lit alors `messageId` seul, ce qui est le
    // contrat du chemin REST.
    const data = buildMessageAckData({ row: { id: 'server-msg-x', clientMessageId: 'cid_fantome' } });

    expect(data).not.toHaveProperty('clientMessageId');
  });

  it('omits createdAt when not provided', () => {
    const data = buildMessageAckData({ row: { id: 'server-msg-000' } });

    expect(data).not.toHaveProperty('createdAt');
  });
});

describe('stripClientMessageId (message:new broadcast to peers)', () => {
  it('removes clientMessageId while keeping every other field', () => {
    const senderPayload = {
      id: 'server-msg-789',
      content: 'Hello world',
      senderId: 'user-1',
      conversationId: 'conv-1',
      clientMessageId: 'client-temp-xyz',
      createdAt: '2026-07-28T12:00:00.000Z',
    };

    const broadcast = stripClientMessageId(senderPayload);

    expect(broadcast.id).toBe('server-msg-789');
    expect(broadcast.content).toBe('Hello world');
    expect(broadcast.senderId).toBe('user-1');
    expect(broadcast.conversationId).toBe('conv-1');
    expect(broadcast).not.toHaveProperty('clientMessageId');
  });

  it('is a no-op strip when no clientMessageId exists', () => {
    const senderPayload = {
      id: 'server-msg-000',
      content: 'No client ID',
      senderId: 'user-2',
      conversationId: 'conv-2',
    };

    const broadcast = stripClientMessageId(senderPayload);

    expect(broadcast).toEqual(senderPayload);
    expect(broadcast).not.toHaveProperty('clientMessageId');
  });

  it('does not mutate the sender payload (sender keeps its cid-aware copy)', () => {
    const senderPayload = {
      id: 'server-msg-789',
      clientMessageId: 'client-temp-xyz',
    };

    stripClientMessageId(senderPayload);

    expect(senderPayload.clientMessageId).toBe('client-temp-xyz');
  });
});

/**
 * #17058 — le jumeau REST, dans le même module que la règle.
 *
 * `POST /conversations/:id/messages` rend la LIGNE entière. Sur un hit de
 * déduplication par contenu, la ligne est celle du PREMIER message, et le web
 * fusionne « par id OU clientMessageId » : la seconde bulle est absorbée par la
 * ligne du premier et disparaît.
 *
 * Les deux transports ont donc le MÊME défaut, et c'est pour ça que les deux
 * helpers vivent côte à côte : une règle retapée à chaque transport est une
 * règle qu'un transport finira par ne pas avoir.
 */
describe('withSubmittedClientMessageId (réponse REST d\'envoi)', () => {
  it('sur un dédup, remplace le cid de la LIGNE par celui qui a été SOUMIS', () => {
    const served = withSubmittedClientMessageId(
      { id: 'server-msg-premier', clientMessageId: 'cid_A', content: 'oui' },
      'cid_B',
    );

    expect(served.clientMessageId).toBe('cid_B');
    expect(served.clientMessageId).not.toBe('cid_A');
    // Tout le reste de la ligne passe intact — c'est une réponse d'envoi, pas
    // un accusé réduit.
    expect(served).toEqual(expect.objectContaining({ id: 'server-msg-premier', content: 'oui' }));
  });

  it('sans cid soumis, RETIRE celui de la ligne au lieu de le laisser passer', () => {
    const served = withSubmittedClientMessageId(
      { id: 'server-msg-x', clientMessageId: 'cid_fantome', content: 'oui' },
      undefined,
    );

    expect(served).not.toHaveProperty('clientMessageId');
    expect(served).toEqual(expect.objectContaining({ id: 'server-msg-x', content: 'oui' }));
  });

  it('ne mute pas la ligne reçue', () => {
    const row = { id: 'server-msg-y', clientMessageId: 'cid_A' };
    withSubmittedClientMessageId(row, 'cid_B');

    expect(row.clientMessageId).toBe('cid_A');
  });
});
