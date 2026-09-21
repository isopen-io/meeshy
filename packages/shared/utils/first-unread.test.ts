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

/**
 * `unreadCountHint` (#7351, V3) — LE REPLI SERVEUR, quand AUCUN rang
 * chronologique n'existe (ni cursor, ni `joinedAt`). Cas réel : un lecteur
 * qui ouvre `/conversations/:id` en premier (deep link, notification) sur une
 * conversation qu'il n'a JAMAIS ouverte — `GET /conversations/:id` sert
 * `unreadCount` (il ne coûte aucune colonne, toujours rendu,
 * `core-detail.ts:193,227`) mais jamais `currentUserJoinedAt` (réservé à la
 * liste). Sans ce repli, l'absence LOCALE de rang faisait passer un fil
 * RÉELLEMENT non lu pour lu (`null`) — l'inverse de D-L2.
 *
 * Additif et RÉTROCOMPATIBLE : omis, le comportement des 13 témoins
 * ci-dessus ne change pas — c'est le point, le mirror Swift qui ne le
 * porte pas encore reste valide pour tout ce qu'il implémente déjà.
 */
describe('firstUnreadBoundary — unreadCountHint (#7351, V3)', () => {
  it('AUCUN rang chronologique, hint positif ⇒ élit les N DERNIERS candidats, jamais les premiers', () => {
    const messages = [
      message('m1', OTHER, '2026-09-21T09:01:00Z'),
      message('m2', OTHER, '2026-09-21T09:02:00Z'),
      message('m3', OTHER, '2026-09-21T09:03:00Z'),
    ];

    const result = firstUnreadBoundary({ messages, viewerId: VIEWER, unreadCountHint: 2 });

    // Les DEUX derniers (m2, m3) sont non lus — jamais m1 (le "4 812
    // non-lus" que la garde du zéro-signal évite déjà).
    expect(result).toEqual({ firstUnreadId: 'm2', unreadCount: 2 });
  });

  it('le hint dépasse la fenêtre chargée ⇒ tous les candidats chargés sont non lus', () => {
    const messages = [
      message('m1', OTHER, '2026-09-21T09:01:00Z'),
      message('m2', OTHER, '2026-09-21T09:02:00Z'),
    ];

    const result = firstUnreadBoundary({ messages, viewerId: VIEWER, unreadCountHint: 50 });

    expect(result).toEqual({ firstUnreadId: 'm1', unreadCount: 2 });
  });

  it('hint à 0 ⇒ null IMMÉDIATEMENT, même si un curseur PÉRIMÉ dirait le contraire', () => {
    const messages = [
      message('m1', OTHER, '2026-09-21T09:01:00Z'),
      message('m2', OTHER, '2026-09-21T09:05:00Z'),
    ];

    // Un curseur qui n'a pas encore rattrapé m2 dirait normalement
    // { firstUnreadId: 'm2', unreadCount: 1 } — le hint serveur à 0 (« le
    // client vient de confirmer avoir tout lu ») prime, cas du cache de
    // détail pas encore repatché après un `markCaughtUp` (#7351, critère 2).
    const result = firstUnreadBoundary({
      messages,
      viewerId: VIEWER,
      lastReadMessageId: 'm1',
      lastReadMessageCreatedAt: new Date('2026-09-21T09:01:00Z'),
      unreadCountHint: 0,
    });

    expect(result).toBeNull();
  });

  it('un rang chronologique existe (joinedAt) ⇒ le hint est IGNORÉ, la loi par curseur tranche seule', () => {
    const messages = [
      message('m1', OTHER, '2019-04-02T09:00:00Z'),
      message('m2', OTHER, '2026-09-21T10:04:00Z'),
    ];

    const result = firstUnreadBoundary({
      messages,
      viewerId: VIEWER,
      joinedAt: new Date('2026-09-21T10:00:00Z'),
      unreadCountHint: 999,
    });

    expect(result).toEqual({ firstUnreadId: 'm2', unreadCount: 1 });
  });

  it('hint omis ⇒ comportement INCHANGÉ (garde du zéro-signal côté appelant)', () => {
    const messages = [message('m1', OTHER, '2026-09-21T09:01:00Z')];

    const result = firstUnreadBoundary({ messages, viewerId: VIEWER });

    expect(result).toEqual({ firstUnreadId: 'm1', unreadCount: 1 });
  });
});
