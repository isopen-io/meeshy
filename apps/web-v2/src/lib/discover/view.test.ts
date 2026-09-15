import { describe, expect, test } from 'bun:test';

import type { FriendRequestRecord, PersonSummary } from '@/lib/api/friend-requests';

import { discoverTabFromSearch, personNameOf, relationshipIndexOf, relationshipOf, requestFilterFromSearch } from './view';

/**
 * LES RÈGLES DE LA DÉCOUVERTE (#6363) — miroir `UserRelationshipResolver.resolve`
 * et `FriendshipCache.status` : ce qu'une personne EST pour le lecteur décide du
 * geste que sa ligne offre (Ajouter, En attente, Accepter/Refuser, Contact,
 * Bloqué, rien pour soi).
 */

const person = (id: string, displayName: string | null = null): PersonSummary => ({ id, username: id.replace('u-', ''), displayName, avatar: null });

const request = (id: string, senderId: string, receiverId: string): FriendRequestRecord => ({
  id,
  senderId,
  receiverId,
  status: 'pending',
  message: null,
  createdAt: '2026-09-13T09:00:00.000Z',
  sender: person(senderId),
  receiver: person(receiverId),
});

const index = relationshipIndexOf({
  viewerId: 'u-me',
  received: [request('f-in', 'u-ada', 'u-me'), request('f-both-in', 'u-both', 'u-me')],
  sent: [request('f-out', 'u-me', 'u-grace'), request('f-both-out', 'u-me', 'u-both')],
  accepted: [request('f-friend-in', 'u-alan', 'u-me'), request('f-friend-out', 'u-me', 'u-linus')],
  blocked: [person('u-mallory'), person('u-linus')],
});

const summary = (userId: string): string => {
  const relationship = relationshipOf(index, userId);
  return relationship.kind === 'pendingSent' || relationship.kind === 'pendingReceived'
    ? `${relationship.kind}:${relationship.request.id}`
    : relationship.kind;
};

describe('ce qu’une personne est pour le lecteur', () => {
  test('soi, puis bloqué, puis contact, puis demande envoyée, puis reçue, sinon rien', () => {
    expect(relationshipOf(index, 'u-me')).toEqual({ kind: 'self' });
    expect(relationshipOf(index, 'u-mallory')).toEqual({ kind: 'blocked' });
    expect(relationshipOf(index, 'u-alan')).toEqual({ kind: 'friend' });
    expect(summary('u-grace')).toBe('pendingSent:f-out');
    expect(summary('u-ada')).toBe('pendingReceived:f-in');
    expect(relationshipOf(index, 'u-nobody')).toEqual({ kind: 'none' });
  });

  test('un contact accepté dans les DEUX sens est un contact ; bloqué l’emporte sur contact, envoyée sur reçue', () => {
    expect(relationshipOf(index, 'u-linus')).toEqual({ kind: 'blocked' });
    expect(summary('u-both')).toBe('pendingSent:f-both-out');
  });
});

describe('les onglets et le filtre vivent dans l’adresse', () => {
  test('« Découvrir » par défaut, comme `initialTab: .discover` ; « Reçues » par défaut dans les demandes', () => {
    expect(discoverTabFromSearch(null)).toBe('discover');
    expect(discoverTabFromSearch('inconnu')).toBe('discover');
    expect(discoverTabFromSearch('requests')).toBe('requests');
    expect(discoverTabFromSearch('blocked')).toBe('blocked');
    expect(requestFilterFromSearch(null)).toBe('received');
    expect(requestFilterFromSearch('sent')).toBe('sent');
  });
});

describe('le nom d’une personne', () => {
  test('le nom affiché, sinon l’identifiant, sinon le repli', () => {
    expect(personNameOf(person('u-ada', 'Ada Lovelace'), 'Inconnu')).toBe('Ada Lovelace');
    expect(personNameOf(person('u-ada'), 'Inconnu')).toBe('ada');
    expect(personNameOf(null, 'Inconnu')).toBe('Inconnu');
  });
});
