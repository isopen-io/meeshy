import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import type { PostComment } from '@/lib/api/publication-comments';

import { commentImageable, commentMenuEntries } from './comment-menu';

const VIEWER = 'u-viewer';

const comment = (overrides: Partial<PostComment> = {}): PostComment => ({
  id: 'c-1',
  content: 'Where is it?',
  createdAt: '2026-09-29T09:00:00.000Z',
  author: { id: 'u-awa', username: 'awa', displayName: 'Awa' },
  ...overrides,
});

const mine = (overrides: Partial<PostComment> = {}) => comment({ author: { id: VIEWER, username: 'me' }, ...overrides });

const entries = (
  target: PostComment,
  servedText = 'C’est où ?',
  options: { readonly canCopy?: boolean; readonly canImage?: boolean; readonly canReport?: boolean; readonly postComposition?: { readonly imageable: boolean } } = {},
) =>
  commentMenuEntries({
    comment: target,
    viewerId: VIEWER,
    servedText,
    canCopy: options.canCopy ?? true,
    canImage: options.canImage ?? true,
    canReport: options.canReport ?? true,
    ...(options.postComposition === undefined ? {} : { postComposition: options.postComposition }),
  });

describe('commentMenuEntries — le menu « … » d’un commentaire (#8734, jumelle de #8709)', () => {
  test('le commentaire d’un AUTRE : copier, signaler — jamais modifier ni supprimer', () => {
    expect(entries(comment())).toEqual(['copy', 'report']);
  });

  test('le SIEN : copier, modifier, supprimer — jamais se signaler soi-même', () => {
    expect(entries(mine())).toEqual(['copy', 'edit', 'delete']);
  });

  test('une RACINE qui a des réponses offre aussi « Imager avec les réponses »', () => {
    expect(entries(comment({ replyCount: 2 }))).toEqual(['copy', 'imageWithReplies', 'report']);
  });

  test('une RÉPONSE n’offre pas « avec les réponses » — elle emporte sa racine en citation', () => {
    expect(entries(comment({ parentId: 'c-0', replyCount: 3 }))).toEqual(['copy', 'report']);
  });

  test('un commentaire FLOUTÉ ou à VUE UNIQUE ne se copie ni ne s’image en clair', () => {
    expect(entries(comment({ effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED, replyCount: 2 }))).toEqual(['report']);
    expect(entries(mine({ effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE }))).toEqual(['edit', 'delete']);
  });

  test('un commentaire sans texte servi ne se copie pas', () => {
    const media = [{ id: 'm-1', fileUrl: '/p.jpg', mimeType: 'image/jpeg', width: 800, height: 600 }];
    expect(entries(comment({ content: '', media }), '  ')).toEqual(['report']);
    expect(entries(comment({ content: '' }), '')).toEqual(['report']);
  });

  test('une rangée EN VOL n’offre aucune entrée — la passerelle ne la connaît pas encore', () => {
    expect(entries(mine({ pending: true }))).toEqual([]);
  });

  test('sans hôte de presse-papiers, d’atelier ni de signalement, ces entrées ne se montent pas (loi 4)', () => {
    expect(entries(comment({ replyCount: 1 }), 'x', { canImage: false, canReport: false })).toEqual(['copy']);
    expect(entries(mine(), 'x', { canCopy: false, canImage: false })).toEqual(['edit', 'delete']);
  });

  test('un commentaire de POST (#9687) : jamais « avec les réponses » au menu — la composition décide seule', () => {
    expect(entries(comment({ replyCount: 2 }), 'x', { postComposition: { imageable: true } })).toEqual(['copy', 'report']);
    expect(entries(comment({ parentId: 'c-0' }), 'x', { postComposition: { imageable: false } })).toEqual(['copy', 'report']);
    expect(entries(comment(), 'x', { canImage: false, postComposition: { imageable: true } })).toEqual(['copy', 'report']);
  });
});

describe('commentMenuEntries — « Retirer » le commentaire d’un autre (#11150)', () => {
  const withRemove = (target: PostComment) =>
    commentMenuEntries({ comment: target, viewerId: VIEWER, servedText: 'x', canCopy: true, canImage: false, canReport: true, canRemove: true });

  test('la modération le voit sur le commentaire d’un autre, avant « Signaler »', () => {
    expect(withRemove(comment())).toEqual(['copy', 'remove', 'report']);
  });

  test('jamais sur le sien, jamais sans la capacité', () => {
    expect(withRemove(mine())).toEqual(['copy', 'edit', 'delete']);
    expect(entries(comment())).not.toContain('remove');
  });
});

/**
 * **UN FIL FERMÉ NE SE RÉÉCRIT PLUS** (#16930, décision porteur 2026-11-08) —
 * la passerelle refuse le `PATCH` d'un commentaire quand la publication a fermé
 * ses commentaires (`403 COMMENTS_DISABLED`) : offrir « Modifier » serait un
 * contrôle qui ment (loi 4). Copier, Supprimer (l'auteur) et Signaler (les
 * autres) restent : seul le geste d'ÉCRITURE se retire.
 */
describe('commentMenuEntries — des commentaires FERMÉS (#16930)', () => {
  const closed = (target: PostComment, extra: { readonly canRemove?: boolean } = {}) =>
    commentMenuEntries({ comment: target, viewerId: VIEWER, servedText: 'x', canCopy: true, canImage: true, canReport: true, commentsClosed: true, ...extra });

  test('le SIEN : copier et supprimer — plus « Modifier »', () => {
    expect(closed(mine())).toEqual(['copy', 'delete']);
  });

  test('celui d’un AUTRE : « Signaler » reste offert, « Retirer » aussi pour la modération', () => {
    expect(closed(comment())).toEqual(['copy', 'report']);
    expect(closed(comment(), { canRemove: true })).toEqual(['copy', 'remove', 'report']);
  });

  test('ouverts (ou non dit), « Modifier » est là comme avant', () => {
    expect(commentMenuEntries({ comment: mine(), viewerId: VIEWER, servedText: 'x', canCopy: true, canImage: true, canReport: true, commentsClosed: false })).toEqual(['copy', 'edit', 'delete']);
    expect(entries(mine())).toEqual(['copy', 'edit', 'delete']);
  });
});

/** « IMAGER » VIT DANS LE RAIL DE LA RANGÉE (#16541) — même garde que la carte, plus jamais au « … ». */
describe('commentImageable — l’icône « Imager » du rail', () => {
  const imageable = (target: PostComment, servedText = 'C’est où ?', options: { readonly canImage?: boolean; readonly postComposition?: { readonly imageable: boolean } } = {}) =>
    commentImageable({
      comment: target,
      servedText,
      canImage: options.canImage ?? true,
      ...(options.postComposition === undefined ? {} : { postComposition: options.postComposition }),
    });

  test('un commentaire lisible s’image ; son média aussi, sans texte', () => {
    expect(imageable(comment())).toBe(true);
    const media = [{ id: 'm-1', fileUrl: '/p.jpg', mimeType: 'image/jpeg', width: 800, height: 600 }];
    expect(imageable(comment({ content: '', media }), '  ')).toBe(true);
  });

  test('flouté, à vue unique, en vol, ou sans atelier : jamais', () => {
    expect(imageable(comment({ effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED }))).toBe(false);
    expect(imageable(comment({ pending: true }))).toBe(false);
    expect(imageable(comment(), 'x', { canImage: false })).toBe(false);
  });

  test('un commentaire de POST : la composition décide', () => {
    expect(imageable(comment(), 'x', { postComposition: { imageable: false } })).toBe(false);
    expect(imageable(comment(), 'x', { postComposition: { imageable: true } })).toBe(true);
  });
});
