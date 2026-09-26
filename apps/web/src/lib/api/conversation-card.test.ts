import { describe, expect, test } from 'bun:test';

import { scriptedGateway } from '@/test-support/scripted-transport';

import { cardWithMembership, decodeConversationCard, leaveConversation, loadConversationCard } from './conversation-card';

/**
 * **LE PORT DE LA CARTE DE CONVERSATION (#8099).**
 *
 * Deux adresses, un décodeur. Le 404 n'est PAS une erreur : c'est la réponse
 * que la passerelle fait, à l'identique, pour un lien inconnu et — sur un lien
 * direct — pour une conversation dont le lecteur n'est pas membre. Le port le
 * rend en `null`, que la carte dessine « Conversation privée » ; le confondre
 * avec une panne ferait proposer « Réessayer » sur une porte fermée.
 */

const WIRE = {
  kind: 'share-link',
  conversationId: null,
  title: 'Les bêta-testeurs',
  description: 'Un groupe pour tester',
  avatarUrl: 'https://cdn.meeshy.me/a.png',
  bannerUrl: null,
  conversationType: 'group',
  stats: { memberCount: 7, onlineCount: null, messageCount: 42, languages: ['fr', 'en'] },
  viewer: { isMember: false, canJoin: true, requiresAccount: false, canJoinAnonymously: true },
  link: { identifier: 'mshy_beta', isActive: true, expiresAt: null },
  inviter: { displayName: 'Alice', username: 'alice', avatarUrl: null },
  inviteMessage: 'Venez !',
};

describe('decodeConversationCard', () => {
  test('rend la carte servie', () => {
    expect(decodeConversationCard(WIRE)).toEqual(WIRE);
  });

  test('refuse une charge sans titre ni forme', () => {
    expect(decodeConversationCard({ kind: 'share-link' })).toBeNull();
  });

  test('tient un inviteur et un message absents d’une passerelle plus ancienne pour nuls', () => {
    const { inviter: _i, inviteMessage: _m, ...older } = WIRE;
    const card = decodeConversationCard({ ...older, viewer: { isMember: false, canJoin: true, requiresAccount: false } });
    expect(card?.inviter).toBeNull();
    expect(card?.inviteMessage).toBeNull();
    expect(card?.viewer.canJoinAnonymously).toBe(false);
  });
});

describe('loadConversationCard', () => {
  test('lit un lien de partage à son adresse, identifiant encodé', async () => {
    const { deps, calls } = scriptedGateway({ 'GET /api/v1/links/mshy%20beta/card': { ok: true, data: WIRE } });
    const result = await loadConversationCard({ ...deps, target: { kind: 'share-link', identifier: 'mshy beta' } });
    expect(result).toEqual({ ok: true, data: WIRE });
    expect(calls().map((call) => call.path)).toEqual(['/api/v1/links/mshy%20beta/card']);
  });

  test('lit un lien direct à son adresse', async () => {
    const { deps } = scriptedGateway({ 'GET /api/v1/conversations/c1/card': { ok: true, data: { ...WIRE, kind: 'direct' } } });
    const result = await loadConversationCard({ ...deps, target: { kind: 'direct', identifier: 'c1' } });
    expect(result.ok && result.data?.kind).toBe('direct');
  });

  test('rend null sur un 404 — porte fermée, pas panne', async () => {
    const { deps } = scriptedGateway({});
    expect(await loadConversationCard({ ...deps, target: { kind: 'direct', identifier: 'c1' } })).toEqual({ ok: true, data: null });
  });

  test('rend l’échec réseau tel quel', async () => {
    const { deps } = scriptedGateway({ 'GET /api/v1/conversations/c1/card': { ok: false, status: 0, error: 'offline' } });
    const result = await loadConversationCard({ ...deps, target: { kind: 'direct', identifier: 'c1' } });
    expect(result.ok).toBe(false);
  });
});

describe('leaveConversation', () => {
  test('part par la route existante de départ', async () => {
    const { deps, calls } = scriptedGateway({ 'POST /api/v1/conversations/c1/leave': { ok: true, data: { conversationId: 'c1' } } });
    const result = await leaveConversation(deps, 'c1');
    expect(result.ok).toBe(true);
    expect(calls().map((call) => `${call.method} ${call.path}`)).toEqual(['POST /api/v1/conversations/c1/leave']);
  });
});

describe('cardWithMembership', () => {
  const card = decodeConversationCard(WIRE)!;

  test('rejoindre fait du lecteur un membre, avec l’identifiant de la conversation', () => {
    expect(cardWithMembership(card, { isMember: true, conversationId: 'c1' })).toMatchObject({
      conversationId: 'c1',
      viewer: { isMember: true, canJoin: false, canJoinAnonymously: false },
      stats: { memberCount: 8 },
    });
  });

  test('quitter rend la jonction au lecteur et retire un membre', () => {
    const member = cardWithMembership(card, { isMember: true, conversationId: 'c1' });
    expect(cardWithMembership(member, { isMember: false, conversationId: null })).toMatchObject({
      conversationId: null,
      viewer: { isMember: false, canJoin: true, canJoinAnonymously: true },
      stats: { memberCount: 7 },
    });
  });
});
