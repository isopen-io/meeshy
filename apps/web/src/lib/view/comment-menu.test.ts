import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import type { PostComment } from '@/lib/api/publication-comments';

import { commentMenuEntries } from './comment-menu';

const VIEWER = 'u-viewer';

const comment = (overrides: Partial<PostComment> = {}): PostComment => ({
  id: 'c-1',
  content: 'Where is it?',
  createdAt: '2026-09-29T09:00:00.000Z',
  author: { id: 'u-awa', username: 'awa', displayName: 'Awa' },
  ...overrides,
});

const mine = (overrides: Partial<PostComment> = {}) => comment({ author: { id: VIEWER, username: 'me' }, ...overrides });

const entries = (target: PostComment, servedText = 'C’est où ?', options: { readonly canImage?: boolean; readonly canReport?: boolean } = {}) =>
  commentMenuEntries({
    comment: target,
    viewerId: VIEWER,
    servedText,
    canImage: options.canImage ?? true,
    canReport: options.canReport ?? true,
  });

describe('commentMenuEntries — le menu « … » d’un commentaire (#8734, jumelle de #8709)', () => {
  test('le commentaire d’un AUTRE : copier, imager, signaler — jamais modifier ni supprimer', () => {
    expect(entries(comment())).toEqual(['copy', 'image', 'report']);
  });

  test('le SIEN : copier, imager, modifier, supprimer — jamais se signaler soi-même', () => {
    expect(entries(mine())).toEqual(['copy', 'image', 'edit', 'delete']);
  });

  test('une RACINE qui a des réponses offre aussi « Imager avec les réponses »', () => {
    expect(entries(comment({ replyCount: 2 }))).toEqual(['copy', 'image', 'imageWithReplies', 'report']);
  });

  test('une RÉPONSE n’offre pas « avec les réponses » — elle emporte sa racine en citation', () => {
    expect(entries(comment({ parentId: 'c-0', replyCount: 3 }))).toEqual(['copy', 'image', 'report']);
  });

  test('un commentaire FLOUTÉ ou à VUE UNIQUE ne se copie ni ne s’image en clair', () => {
    expect(entries(comment({ effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED, replyCount: 2 }))).toEqual(['report']);
    expect(entries(mine({ effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE }))).toEqual(['edit', 'delete']);
  });

  test('un commentaire sans texte servi ne se copie pas — son média s’image encore', () => {
    const media = [{ id: 'm-1', fileUrl: '/p.jpg', mimeType: 'image/jpeg', width: 800, height: 600 }];
    expect(entries(comment({ content: '', media }), '  ')).toEqual(['image', 'report']);
    expect(entries(comment({ content: '' }), '')).toEqual(['report']);
  });

  test('une rangée EN VOL n’offre aucune entrée — la passerelle ne la connaît pas encore', () => {
    expect(entries(mine({ pending: true }))).toEqual([]);
  });

  test('sans hôte d’atelier ni de signalement, ces entrées ne se montent pas (loi 4)', () => {
    expect(entries(comment({ replyCount: 1 }), 'x', { canImage: false, canReport: false })).toEqual(['copy']);
  });
});
