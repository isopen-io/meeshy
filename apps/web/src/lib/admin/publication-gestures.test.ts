import { describe, expect, test } from 'bun:test';

import type { AdminPublication } from '@/lib/api/admin-user-publications';

import { applyGestureToPage, applyPublicationGesture } from './publication-gestures';

const NOW = new Date('2026-10-12T10:00:00.000Z');

const publication = (over: Partial<AdminPublication> = {}): AdminPublication => ({
  id: 'p-1',
  type: 'POST',
  visibility: 'FRIENDS',
  state: 'online',
  contentPreview: null,
  createdAt: '2026-10-10T10:00:00.000Z',
  expiresAt: null,
  moderationHiddenAt: null,
  priorVisibility: null,
  mediaCount: 0,
  thumbnail: null,
  ...over,
});

describe('le reflet optimiste des trois gestes', () => {
  test('mettre en privé retient l’audience de l’auteur', () => {
    expect(applyPublicationGesture(publication(), 'make-private', NOW)).toMatchObject({ visibility: 'PRIVATE', priorVisibility: 'FRIENDS', state: 'private' });
  });

  test('mettre hors ligne date le retrait et retient l’audience', () => {
    expect(applyPublicationGesture(publication(), 'take-offline', NOW)).toMatchObject({
      visibility: 'PRIVATE',
      priorVisibility: 'FRIENDS',
      moderationHiddenAt: NOW.toISOString(),
      state: 'offline',
    });
  });

  test('remettre en ligne rend l’audience retenue', () => {
    const offline = publication({ visibility: 'PRIVATE', priorVisibility: 'PUBLIC', moderationHiddenAt: '2026-10-11T00:00:00.000Z', state: 'offline' });
    expect(applyPublicationGesture(offline, 'restore', NOW)).toMatchObject({ visibility: 'PUBLIC', priorVisibility: null, moderationHiddenAt: null, state: 'online' });
  });

  test('une story remise en ligne après sa fin se dit expirée', () => {
    const story = publication({ type: 'STORY', visibility: 'PRIVATE', priorVisibility: 'FRIENDS', moderationHiddenAt: '2026-10-11T00:00:00.000Z', state: 'offline', expiresAt: '2026-10-11T12:00:00.000Z' });
    expect(applyPublicationGesture(story, 'restore', NOW).state).toBe('expired');
  });

  test('aucun geste ne touche une publication supprimée', () => {
    const deleted = publication({ state: 'deleted' });
    expect(applyPublicationGesture(deleted, 'restore', NOW)).toBe(deleted);
    expect(applyPublicationGesture(deleted, 'take-offline', NOW)).toBe(deleted);
  });

  test('seules les publications choisies changent', () => {
    const page = { publications: [publication({ id: 'a' }), publication({ id: 'b' })], total: 2, offset: 0, hasMore: false };
    const after = applyGestureToPage(page, new Set(['b']), 'take-offline', NOW);
    expect(after.publications.map((p) => p.state)).toEqual(['online', 'offline']);
  });
});
