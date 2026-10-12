/**
 * #10286 — `GET /conversations/:id/messages` ne sert jamais la carte de liens
 * suivis d'un message d'invité ANONYME écrit avant la loi : `metadata`
 * ressort sans `trackingLinks`, ses voisins intacts. Un compte inscrit garde
 * la sienne.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import { mapMessageRowForList } from '../../../../routes/conversations/messages-list-query';

const MAP = [{ url: 'https://evil.example/login', token: 'tok-1' }];

const row = (sender: Record<string, unknown>, metadata: unknown) => ({
  id: 'm1',
  conversationId: 'c1',
  senderId: sender.id,
  content: 'voir https://evil.example/login',
  originalLanguage: 'fr',
  messageType: 'text',
  createdAt: new Date(),
  attachments: [],
  metadata,
  sender,
});

const ctx = {
  includeTranslations: true,
  includeReplies: false,
  hasLanguageFilter: false,
  languageFilter: undefined,
  currentParticipantId: 'reader',
  readStatusMap: new Map(),
  senderPresenceVis: new Map(),
  listMissingEntry: 'hide',
  consumptionMap: new Map(),
  ephemeralDeadlines: new Map(),
} as never;

describe('liste REST — liens suivis d’un invité anonyme (#10286)', () => {
  it('retient la carte trackingLinks d’un message d’anonyme et garde ses voisins', () => {
    const anon = { id: 'p-anon', userId: null, type: 'anonymous', displayName: 'Invité' };
    const served = mapMessageRowForList(row(anon, { trackingLinks: MAP, location: { lat: 1, lng: 2 } }) as never, ctx);

    expect(served.metadata).toEqual({ location: { lat: 1, lng: 2 } });
  });

  it('sert la carte d’un compte inscrit telle quelle', () => {
    const user = { id: 'p-user', userId: 'u-1', type: 'user', displayName: 'Ada' };
    const served = mapMessageRowForList(row(user, { trackingLinks: MAP }) as never, ctx);

    expect(served.metadata).toEqual({ trackingLinks: MAP });
  });
});
