/**
 * #18701 — le repli curseur de la LIVRAISON est une horloge MURALE.
 *
 * `ConversationReadCursor.lastDeliveredAt` est posé à `now` par `_advanceCursor` :
 * c'est le moment où un accusé a été TRAITÉ, jamais la position du dernier
 * message réellement livré. Comparé à `message.createdAt`, il répond « remis »
 * pour tout message antérieur au traitement — y compris celui que le drain
 * vient de REFUSER d'émettre, ou celui que le plafond de 500 de la file a
 * évincé sans que personne ne le voie.
 *
 * La lecture a reçu sa discipline au 2026-07-24 (`resolveReadAt` + bascule) :
 * passé la bascule, l'absence de gel VEUT DIRE l'absence de lecture. La
 * livraison ne l'avait pas, et c'est cette asymétrie-là qui sert faux.
 *
 * @jest-environment node
 */

import {
  resolveCursorDeliveredAt,
  resolveReceivedAt,
} from '../../../utils/read-exactness';

const CUTOVER = new Date('2026-09-22T00:00:00.000Z');
const BEFORE = new Date('2026-09-01T10:00:00.000Z');
const AFTER = new Date('2026-10-01T10:00:00.000Z');

describe('resolveCursorDeliveredAt — le repli de livraison suit la bascule (#18701)', () => {
  it("refuse le repli pour un message créé APRÈS la bascule : l'absence de gel VEUT DIRE non livré", () => {
    expect(
      resolveCursorDeliveredAt({
        cursorLastDeliveredAt: new Date('2026-10-01T11:00:00.000Z'),
        messageCreatedAt: AFTER,
        cutover: CUTOVER,
      })
    ).toBeNull();
  });

  it('conserve le repli pour un message ANTÉRIEUR à la bascule — il n\'a jamais eu l\'occasion d\'être gelé', () => {
    const cursorAt = new Date('2026-09-01T11:00:00.000Z');

    expect(
      resolveCursorDeliveredAt({
        cursorLastDeliveredAt: cursorAt,
        messageCreatedAt: BEFORE,
        cutover: CUTOVER,
      })
    ).toEqual(cursorAt);
  });

  it('bascule NON armée : comportement historique à l\'identique', () => {
    const cursorAt = new Date('2026-10-01T11:00:00.000Z');

    expect(
      resolveCursorDeliveredAt({
        cursorLastDeliveredAt: cursorAt,
        messageCreatedAt: AFTER,
        cutover: null,
      })
    ).toEqual(cursorAt);
  });

  it('reste borné au message : un curseur ANTÉRIEUR au message ne répond jamais', () => {
    expect(
      resolveCursorDeliveredAt({
        cursorLastDeliveredAt: new Date('2026-09-01T09:00:00.000Z'),
        messageCreatedAt: BEFORE,
        cutover: null,
      })
    ).toBeNull();
  });

  it('aucun curseur ⇒ rien à affirmer', () => {
    expect(
      resolveCursorDeliveredAt({
        cursorLastDeliveredAt: null,
        messageCreatedAt: BEFORE,
        cutover: null,
      })
    ).toBeNull();
  });
});

describe('resolveReceivedAt — ce qui survit à la bascule (#18701)', () => {
  it('garde la LECTURE pour dernier repli : on ne lit pas ce qu\'on n\'a pas reçu', () => {
    const readAt = new Date('2026-10-01T12:00:00.000Z');

    expect(
      resolveReceivedAt({
        frozenReceivedAt: null,
        frozenDeliveredAt: null,
        cursorDeliveredAt: resolveCursorDeliveredAt({
          cursorLastDeliveredAt: new Date('2026-10-01T11:00:00.000Z'),
          messageCreatedAt: AFTER,
          cutover: CUTOVER,
        }),
        readAt,
      })
    ).toEqual(readAt);
  });

  it('sans gel ni lecture, passé la bascule, n\'affirme RIEN', () => {
    expect(
      resolveReceivedAt({
        frozenReceivedAt: null,
        frozenDeliveredAt: null,
        cursorDeliveredAt: resolveCursorDeliveredAt({
          cursorLastDeliveredAt: new Date('2026-10-01T11:00:00.000Z'),
          messageCreatedAt: AFTER,
          cutover: CUTOVER,
        }),
        readAt: null,
      })
    ).toBeNull();
  });

  it('le gel prime toujours, bascule ou non', () => {
    const frozen = new Date('2026-10-01T10:30:00.000Z');

    expect(
      resolveReceivedAt({
        frozenReceivedAt: null,
        frozenDeliveredAt: frozen,
        cursorDeliveredAt: null,
        readAt: null,
      })
    ).toEqual(frozen);
  });
});
