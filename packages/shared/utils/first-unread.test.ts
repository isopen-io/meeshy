/**
 * Témoins de `firstUnreadBoundary()` — voir `first-unread.ts` pour la loi.
 * Miroir Swift : `packages/MeeshySDK/Sources/MeeshySDK/Models/FirstUnreadBoundary.swift`
 * (`FirstUnreadBoundaryTests.swift` rejoue les mêmes 13 cas + un 14e, Swift-only,
 * de non-régression sur le type `Sendable`).
 *
 * Cinq de ces témoins existent parce que la relecture a MESURÉ, par mutation,
 * que la règle qu'ils nomment n'en avait aucun : retirer le filtre
 * `id !== lastReadMessageId`, relâcher la comparaison de frontière en `>=`,
 * ou supprimer le rang `joinedAt` laissait les huit premiers témoins VERTS.
 * Deux règles qui se MASQUENT l'une l'autre sur les cas nominaux n'ont chacune
 * aucun témoin — c'est la leçon du témoin de rang, écrit sur un rang AUTRE
 * que le premier.
 */
import { describe, it, expect } from 'vitest';
import { firstUnreadBoundary, type FirstUnreadCandidateMessage } from './first-unread';

const VIEWER = 'viewer-1';
const OTHER = 'other-2';

function message(
  id: string,
  senderId: string,
  createdAt: string
): FirstUnreadCandidateMessage {
  return { id, senderId, createdAt: new Date(createdAt) };
}

describe('firstUnreadBoundary', () => {
  it('élit le premier message d’autrui quand le curseur est absent (participant neuf)', () => {
    const messages = [
      message('m1', OTHER, '2026-09-21T10:00:00Z'),
      message('m2', VIEWER, '2026-09-21T10:01:00Z'),
      message('m3', OTHER, '2026-09-21T10:02:00Z'),
    ];

    const result = firstUnreadBoundary({ messages, viewerId: VIEWER });

    expect(result).toEqual({ firstUnreadId: 'm1', unreadCount: 2 });
  });

  it('élit le premier message d’autrui STRICTEMENT après lastReadMessageCreatedAt, jamais le message au curseur', () => {
    const messages = [
      message('m1', OTHER, '2026-09-21T10:00:00Z'),
      message('m2', OTHER, '2026-09-21T10:01:00Z'), // au curseur
      message('m3', VIEWER, '2026-09-21T10:02:00Z'),
      message('m4', OTHER, '2026-09-21T10:03:00Z'),
    ];

    const result = firstUnreadBoundary({
      messages,
      viewerId: VIEWER,
      lastReadMessageId: 'm2',
      lastReadMessageCreatedAt: new Date('2026-09-21T10:01:00Z'),
    });

    expect(result).toEqual({ firstUnreadId: 'm4', unreadCount: 1 });
  });

  it('ne compte ni n’élit jamais un message du LECTEUR, même après la frontière', () => {
    const messages = [
      message('m1', OTHER, '2026-09-21T10:00:00Z'), // au curseur
      message('m2', VIEWER, '2026-09-21T10:01:00Z'), // exclu : c'est le lecteur
      message('m3', OTHER, '2026-09-21T10:02:00Z'),
    ];

    const result = firstUnreadBoundary({
      messages,
      viewerId: VIEWER,
      lastReadMessageId: 'm1',
      lastReadMessageCreatedAt: new Date('2026-09-21T10:00:00Z'),
    });

    expect(result).toEqual({ firstUnreadId: 'm3', unreadCount: 1 });
  });

  it('rend null quand tout est lu', () => {
    const messages = [
      message('m1', OTHER, '2026-09-21T10:00:00Z'),
      message('m2', OTHER, '2026-09-21T10:01:00Z'),
    ];

    const result = firstUnreadBoundary({
      messages,
      viewerId: VIEWER,
      lastReadMessageId: 'm2',
      lastReadMessageCreatedAt: new Date('2026-09-21T10:01:00Z'),
    });

    expect(result).toBeNull();
  });

  it('rend null quand la conversation n’a aucun message', () => {
    const result = firstUnreadBoundary({ messages: [], viewerId: VIEWER });

    expect(result).toBeNull();
  });

  it('rend null quand seuls des messages du lecteur suivent la frontière', () => {
    const messages = [
      message('m1', OTHER, '2026-09-21T10:00:00Z'), // au curseur
      message('m2', VIEWER, '2026-09-21T10:01:00Z'),
      message('m3', VIEWER, '2026-09-21T10:02:00Z'),
    ];

    const result = firstUnreadBoundary({
      messages,
      viewerId: VIEWER,
      lastReadMessageId: 'm1',
      lastReadMessageCreatedAt: new Date('2026-09-21T10:00:00Z'),
    });

    expect(result).toBeNull();
  });

  it('replie sur lastReadAt quand lastReadMessageCreatedAt est absent', () => {
    const messages = [
      message('m1', OTHER, '2026-09-21T10:00:00Z'),
      message('m2', OTHER, '2026-09-21T10:05:00Z'),
    ];

    const result = firstUnreadBoundary({
      messages,
      viewerId: VIEWER,
      lastReadAt: new Date('2026-09-21T10:02:00Z'),
    });

    expect(result).toEqual({ firstUnreadId: 'm2', unreadCount: 1 });
  });

  it('exclut le message AU curseur même quand son createdAt suit la frontière (décalage d’horloge)', () => {
    const messages = [
      message('m2', OTHER, '2026-09-21T10:01:00Z'), // le message lu, gravé APRÈS la frontière enregistrée
      message('m4', OTHER, '2026-09-21T10:03:00Z'),
    ];

    const result = firstUnreadBoundary({
      messages,
      viewerId: VIEWER,
      lastReadMessageId: 'm2',
      lastReadMessageCreatedAt: new Date('2026-09-21T10:00:59Z'),
    });

    expect(result).toEqual({ firstUnreadId: 'm4', unreadCount: 1 });
  });

  it('exclut un message d’autrui posé EXACTEMENT sur la frontière (comparaison stricte)', () => {
    const messages = [
      message('m1', OTHER, '2026-09-21T10:02:00Z'), // à la frontière, mais PAS le message au curseur
      message('m2', OTHER, '2026-09-21T10:05:00Z'),
    ];

    const result = firstUnreadBoundary({
      messages,
      viewerId: VIEWER,
      lastReadAt: new Date('2026-09-21T10:02:00Z'),
    });

    expect(result).toEqual({ firstUnreadId: 'm2', unreadCount: 1 });
  });

  it('replie sur joinedAt quand aucune lecture n’a jamais eu lieu (membre neuf d’un groupe ancien)', () => {
    const messages = [
      message('m1', OTHER, '2019-04-02T09:00:00Z'),
      message('m2', OTHER, '2019-04-03T09:00:00Z'),
      message('m3', OTHER, '2026-09-21T10:04:00Z'),
    ];

    const result = firstUnreadBoundary({
      messages,
      viewerId: VIEWER,
      joinedAt: new Date('2026-09-21T10:00:00Z'),
    });

    expect(result).toEqual({ firstUnreadId: 'm3', unreadCount: 1 });
  });

  it('classe joinedAt APRÈS lastReadAt — un membre qui repart et revient garde sa lecture', () => {
    const messages = [
      message('m1', OTHER, '2026-09-21T10:01:00Z'),
      message('m2', OTHER, '2026-09-21T10:06:00Z'),
    ];

    const result = firstUnreadBoundary({
      messages,
      viewerId: VIEWER,
      lastReadAt: new Date('2026-09-21T10:00:00Z'),
      joinedAt: new Date('2026-09-21T10:05:00Z'),
    });

    expect(result).toEqual({ firstUnreadId: 'm1', unreadCount: 2 });
  });

  it('départage par id deux messages gravés au MÊME instant, quel que soit l’ordre d’entrée', () => {
    const sameInstant = '2026-09-21T10:07:00Z';
    const ordered = [message('mA', OTHER, sameInstant), message('mB', OTHER, sameInstant)];
    const reversed = [message('mB', OTHER, sameInstant), message('mA', OTHER, sameInstant)];

    expect(firstUnreadBoundary({ messages: ordered, viewerId: VIEWER })).toEqual({
      firstUnreadId: 'mA',
      unreadCount: 2,
    });
    expect(firstUnreadBoundary({ messages: reversed, viewerId: VIEWER })).toEqual({
      firstUnreadId: 'mA',
      unreadCount: 2,
    });
  });

  it('reste correct quand les messages ne sont pas triés en entrée', () => {
    const messages = [
      message('m3', OTHER, '2026-09-21T10:03:00Z'),
      message('m1', OTHER, '2026-09-21T10:01:00Z'),
      message('m2', VIEWER, '2026-09-21T10:02:00Z'),
    ];

    const result = firstUnreadBoundary({ messages, viewerId: VIEWER });

    expect(result).toEqual({ firstUnreadId: 'm1', unreadCount: 2 });
  });
});
