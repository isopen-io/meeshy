/**
 * Unit tests for read-exactness util (read-exactness.ts)
 *
 * Deux fonctions pures qui portent le passage de « lu = fenêtre temporelle »
 * à « lu = réellement affiché » :
 *  - computeContiguousReadPrefix : jusqu'où le curseur de lecture peut avancer
 *    sans franchir un message non lu.
 *  - resolveReadAt : arbitre entre le gel per-message et le repli curseur
 *    hérité, selon la date de bascule.
 *
 * @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  computeContiguousReadPrefix,
  resolveReadAt,
  resolveReceivedAt,
} from '../../../utils/read-exactness';

describe('computeContiguousReadPrefix', () => {
  it('returns the last id when every message is read', () => {
    expect(
      computeContiguousReadPrefix(['a', 'b', 'c'], new Set(['a', 'b', 'c']))
    ).toBe('c');
  });

  it('stops at the message preceding the first gap', () => {
    expect(
      computeContiguousReadPrefix(['a', 'b', 'c', 'd'], new Set(['a', 'b', 'd']))
    ).toBe('b');
  });

  it('returns null when the very first message is unread', () => {
    expect(
      computeContiguousReadPrefix(['a', 'b'], new Set(['b']))
    ).toBeNull();
  });

  it('returns null on an empty read set', () => {
    expect(computeContiguousReadPrefix(['a', 'b'], new Set())).toBeNull();
  });

  it('returns null on an empty message list', () => {
    expect(computeContiguousReadPrefix([], new Set(['a']))).toBeNull();
  });

  it('handles a single read message', () => {
    expect(computeContiguousReadPrefix(['a'], new Set(['a']))).toBe('a');
  });

  it('ignores read ids that are not in the ordered list', () => {
    expect(
      computeContiguousReadPrefix(['a', 'b'], new Set(['a', 'b', 'zzz']))
    ).toBe('b');
  });

  it('does not advance past a gap even when later messages are all read', () => {
    expect(
      computeContiguousReadPrefix(
        ['a', 'b', 'c', 'd', 'e'],
        new Set(['a', 'c', 'd', 'e'])
      )
    ).toBe('a');
  });
});

describe('resolveReadAt — le gel per-message fait toujours foi', () => {
  const cutover = new Date('2026-08-01T00:00:00.000Z');
  const frozen = new Date('2026-08-05T10:00:00.000Z');

  it('returns the frozen readAt for a message created after the cutover', () => {
    expect(
      resolveReadAt({
        frozenReadAt: frozen,
        cursorLastReadAt: new Date('2026-08-06T00:00:00.000Z'),
        messageCreatedAt: new Date('2026-08-04T00:00:00.000Z'),
        cutover,
      })
    ).toEqual(frozen);
  });

  it('returns the frozen readAt for a legacy message too', () => {
    expect(
      resolveReadAt({
        frozenReadAt: frozen,
        cursorLastReadAt: null,
        messageCreatedAt: new Date('2026-07-01T00:00:00.000Z'),
        cutover,
      })
    ).toEqual(frozen);
  });
});

describe('resolveReadAt — repli curseur réservé à l\'héritage', () => {
  const cutover = new Date('2026-08-01T00:00:00.000Z');

  it('falls back to the cursor for a message predating the cutover', () => {
    const cursor = new Date('2026-07-20T12:00:00.000Z');
    expect(
      resolveReadAt({
        frozenReadAt: null,
        cursorLastReadAt: cursor,
        messageCreatedAt: new Date('2026-07-10T00:00:00.000Z'),
        cutover,
      })
    ).toEqual(cursor);
  });

  it('does not fall back when the cursor predates the message', () => {
    expect(
      resolveReadAt({
        frozenReadAt: null,
        cursorLastReadAt: new Date('2026-07-05T00:00:00.000Z'),
        messageCreatedAt: new Date('2026-07-10T00:00:00.000Z'),
        cutover,
      })
    ).toBeNull();
  });

  it('does not fall back when there is no cursor', () => {
    expect(
      resolveReadAt({
        frozenReadAt: null,
        cursorLastReadAt: null,
        messageCreatedAt: new Date('2026-07-10T00:00:00.000Z'),
        cutover,
      })
    ).toBeNull();
  });

  it('REFUSES the cursor fallback once the message is created after the cutover', () => {
    expect(
      resolveReadAt({
        frozenReadAt: null,
        cursorLastReadAt: new Date('2026-08-20T00:00:00.000Z'),
        messageCreatedAt: new Date('2026-08-10T00:00:00.000Z'),
        cutover,
      })
    ).toBeNull();
  });

  it('treats a message created exactly at the cutover as exact-tracked', () => {
    expect(
      resolveReadAt({
        frozenReadAt: null,
        cursorLastReadAt: new Date('2026-08-20T00:00:00.000Z'),
        messageCreatedAt: cutover,
        cutover,
      })
    ).toBeNull();
  });
});

describe('resolveReadAt — bascule non armée (opt-in)', () => {
  // `push main` déclenche le déploiement sur ce dépôt : la bascule doit être
  // armée explicitement en production, jamais par le simple fait de livrer le
  // code. Sans date, le comportement historique est conservé à l'identique.
  it('keeps the legacy cursor fallback when no cutover is configured', () => {
    const cursor = new Date('2026-08-20T00:00:00.000Z');
    expect(
      resolveReadAt({
        frozenReadAt: null,
        cursorLastReadAt: cursor,
        messageCreatedAt: new Date('2026-08-10T00:00:00.000Z'),
        cutover: null,
      })
    ).toEqual(cursor);
  });

  it('still prefers the frozen readAt when no cutover is configured', () => {
    const frozen = new Date('2026-08-11T00:00:00.000Z');
    expect(
      resolveReadAt({
        frozenReadAt: frozen,
        cursorLastReadAt: new Date('2026-08-20T00:00:00.000Z'),
        messageCreatedAt: new Date('2026-08-10T00:00:00.000Z'),
        cutover: null,
      })
    ).toEqual(frozen);
  });

  it('still refuses a cursor that predates the message when no cutover is configured', () => {
    expect(
      resolveReadAt({
        frozenReadAt: null,
        cursorLastReadAt: new Date('2026-08-05T00:00:00.000Z'),
        messageCreatedAt: new Date('2026-08-10T00:00:00.000Z'),
        cutover: null,
      })
    ).toBeNull();
  });
});

/**
 * `resolveReceivedAt` — « on ne lit pas ce qu'on n'a pas reçu ».
 *
 * Défaut observé en production le 2026-08-24 (capture user) : le panneau
 * « Qui a vu » annonçait `Distribué 0` et `Lu 2` sur le MÊME message, et la
 * bulle n'affichait qu'une coche. Les deux dates étaient dérivées côte à côte
 * mais par des chemins ASYMÉTRIQUES : `readAt` acceptait un repli sur le
 * curseur (`lastReadAt`), `receivedAt` n'acceptait le sien que si
 * `lastDeliveredAt` existait ET datait d'après le message. Un participant qui
 * marque « lu » sans avoir jamais émis d'accusé de livraison comptait donc
 * comme lecteur sans compter comme destinataire.
 *
 * L'invariant est logique, pas cosmétique : une lecture PROUVE la réception.
 */
describe('resolveReceivedAt', () => {
  const frozen = new Date('2026-08-20T10:00:00Z');
  const delivered = new Date('2026-08-20T09:00:00Z');
  const cursor = new Date('2026-08-20T08:00:00Z');
  const read = new Date('2026-08-20T11:00:00Z');

  it('prefers the frozen receivedAt over every other source', () => {
    expect(
      resolveReceivedAt({
        frozenReceivedAt: frozen,
        frozenDeliveredAt: delivered,
        cursorDeliveredAt: cursor,
        readAt: read,
      })
    ).toEqual(frozen);
  });

  it('falls back to the frozen deliveredAt, then to the cursor', () => {
    expect(
      resolveReceivedAt({
        frozenReceivedAt: null,
        frozenDeliveredAt: delivered,
        cursorDeliveredAt: cursor,
        readAt: read,
      })
    ).toEqual(delivered);
    expect(
      resolveReceivedAt({
        frozenReceivedAt: null,
        frozenDeliveredAt: null,
        cursorDeliveredAt: cursor,
        readAt: read,
      })
    ).toEqual(cursor);
  });

  it('READ implies RECEIVED — a reader with no delivery proof still counts as a recipient', () => {
    expect(
      resolveReceivedAt({
        frozenReceivedAt: null,
        frozenDeliveredAt: null,
        cursorDeliveredAt: null,
        readAt: read,
      })
    ).toEqual(read);
  });

  it('stays null when nothing at all is known — absence is not a reception', () => {
    expect(
      resolveReceivedAt({
        frozenReceivedAt: null,
        frozenDeliveredAt: null,
        cursorDeliveredAt: null,
        readAt: null,
      })
    ).toBeNull();
  });
});
