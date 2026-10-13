import { describe, expect, test } from 'bun:test';

import { gestureEffect, gesturesOffered, withPostView } from './post-gestures';
import { postStateOf } from './post-state';

/**
 * LES GESTES D'UNE PUBLICATION, VUS AVANT LA RÉPONSE (#10392) — le reflet optimiste
 * de la loi de la passerelle (`services/admin/publication-moderation.ts`) : la ligne
 * change d'état au geste ; la vue servie le confirme ou le corrige.
 */
const NOW = new Date('2026-10-12T12:00:00.000Z');
const facts = (overrides: Record<string, unknown> = {}) => ({
  visibility: 'PUBLIC' as string | null,
  moderationHiddenAt: null as string | null,
  moderationPriorVisibility: null as string | null,
  deletedAt: null as string | null,
  expiresAt: null as string | null,
  ...overrides,
});

describe('postStateOf — hors ligne et privée (#10392)', () => {
  test('un retrait de modération la dit hors ligne, avant l’expiration et la visibilité', () => {
    expect(postStateOf(facts({ visibility: 'PRIVATE', moderationHiddenAt: '2026-10-11T00:00:00Z', expiresAt: '2026-10-01T00:00:00Z' }), NOW)).toBe('offline');
  });
  test('PRIVATE sans retrait se dit privée', () => {
    expect(postStateOf(facts({ visibility: 'PRIVATE' }), NOW)).toBe('private');
  });
  test('supprimée reste prioritaire', () => {
    expect(postStateOf(facts({ deletedAt: '2026-10-11T00:00:00Z', moderationHiddenAt: '2026-10-11T00:00:00Z' }), NOW)).toBe('deleted');
  });
});

describe('gestureEffect — la loi de la passerelle, vue d’avance', () => {
  test('hors ligne : PRIVATE, retrait daté, audience retenue', () => {
    expect(gestureEffect(facts({ visibility: 'FRIENDS' }), { gesture: 'take-offline' }, NOW)).toMatchObject({
      visibility: 'PRIVATE',
      moderationHiddenAt: NOW.toISOString(),
      moderationPriorVisibility: 'FRIENDS',
    });
  });
  test('remise en ligne : l’audience de l’auteur rendue, le retrait levé', () => {
    expect(gestureEffect(facts({ visibility: 'PRIVATE', moderationHiddenAt: '2026-10-11T00:00:00Z', moderationPriorVisibility: 'COMMUNITY' }), { gesture: 'restore' }, NOW)).toMatchObject({
      visibility: 'COMMUNITY',
      moderationHiddenAt: null,
      moderationPriorVisibility: null,
    });
  });
  test('audience choisie : lève le retrait ; vers PRIVATE, retient l’audience d’avant', () => {
    expect(gestureEffect(facts({ visibility: 'PRIVATE', moderationHiddenAt: '2026-10-11T00:00:00Z', moderationPriorVisibility: 'PUBLIC' }), { gesture: 'set-visibility', visibility: 'PUBLIC' }, NOW)).toMatchObject({
      visibility: 'PUBLIC',
      moderationHiddenAt: null,
      moderationPriorVisibility: null,
    });
    expect(gestureEffect(facts({ visibility: 'FRIENDS' }), { gesture: 'set-visibility', visibility: 'PRIVATE' }, NOW)).toMatchObject({ visibility: 'PRIVATE', moderationPriorVisibility: 'FRIENDS' });
  });
  test('Publique → Amis → Publique : le resserrement retient l’audience de l’auteur, le retour l’oublie (#10471)', () => {
    const narrowed = gestureEffect(facts(), { gesture: 'set-visibility', visibility: 'FRIENDS' }, NOW);
    expect(narrowed).toMatchObject({ visibility: 'FRIENDS', moderationPriorVisibility: 'PUBLIC' });
    expect(gestureEffect(narrowed, { gesture: 'set-visibility', visibility: 'PUBLIC' }, NOW)).toMatchObject({ visibility: 'PUBLIC', moderationPriorVisibility: null });
  });
  test('resserrée puis mise hors ligne, la remise en ligne rend l’audience de l’auteur (#10471)', () => {
    const narrowed = gestureEffect(facts(), { gesture: 'set-visibility', visibility: 'FRIENDS' }, NOW);
    const offline = gestureEffect(narrowed, { gesture: 'take-offline' }, NOW);
    expect(offline).toMatchObject({ visibility: 'PRIVATE', moderationPriorVisibility: 'PUBLIC' });
    expect(gestureEffect(offline, { gesture: 'restore' }, NOW)).toMatchObject({ visibility: 'PUBLIC', moderationHiddenAt: null, moderationPriorVisibility: null });
  });
  test('une publication supprimée ne change jamais', () => {
    const gone = facts({ deletedAt: '2026-10-11T00:00:00Z' });
    expect(gestureEffect(gone, { gesture: 'restore' }, NOW)).toBe(gone);
  });
});

describe('gesturesOffered — ce que chaque état laisse faire', () => {
  test('publiée : hors ligne et audience ; hors ligne : remise en ligne et audience ; supprimée : rien', () => {
    expect(gesturesOffered('published')).toEqual(['take-offline', 'set-visibility']);
    expect(gesturesOffered('offline')).toEqual(['restore', 'set-visibility']);
    expect(gesturesOffered('deleted')).toEqual([]);
  });
});

describe('withPostView — la vue servie fait foi', () => {
  test('remplace les champs de la ligne par ceux de la vue, sans toucher aux autres lignes', () => {
    const page = { rows: [{ id: 'a', ...facts(), likeCount: 3 }, { id: 'b', ...facts() }], total: 2, hasMore: false };
    const next = withPostView(page, { id: 'a', state: 'offline', visibility: 'PRIVATE', moderationHiddenAt: NOW.toISOString(), moderationPriorVisibility: 'PUBLIC', updatedAt: NOW.toISOString() });
    expect(next.rows[0]).toMatchObject({ id: 'a', visibility: 'PRIVATE', moderationHiddenAt: NOW.toISOString(), likeCount: 3 });
    expect(next.rows[1]).toBe(page.rows[1]);
  });
});
