import { describe, expect, test } from 'bun:test';

import type { FeedPost } from '@/lib/api/feed-pages';
import type { PostComment } from '@/lib/api/publication-comments';

import {
  NO_POST_COMMENT_PICK,
  composingPostOf,
  postCommentCardSourceOf,
  postCommentChoiceOf,
  postCommentImageable,
  postCommentMessageCardSubjectOf,
  postCommentPickAfter,
  type PostCommentCardLabels,
} from './composed-comment-card';

/**
 * **IMAGER UN COMMENTAIRE DE POST, CÔTÉ WEB** (#9687) — l'adaptateur entre le
 * fil (`PostComment`, `FeedPost`) et la composition partagée
 * (`@meeshy/shared/utils/comment-card-composition`), puis la carte
 * qu'« Imagine » peint. Les règles sont éprouvées dans `packages/shared` ;
 * ici, ce que le web y met : les textes servis, la puce de langue, les
 * médias peignables, et la projection sur `MessageCardSubject`.
 */

const labels: PostCommentCardLabels = { title: 'Fil de commentaires', folded: (count) => `+${count} réponses` };
const viewer = { id: 'me', displayName: 'Moi' };

const post = (overrides: Partial<FeedPost> = {}): FeedPost => ({
  id: 'p-1',
  type: 'POST',
  createdAt: '2026-10-08T10:00:00.000Z',
  content: 'Sunset in Dakar',
  originalLanguage: 'en',
  translations: { fr: { text: 'Coucher de soleil à Dakar' } },
  author: { id: 'u-awa', username: '@awa', displayName: 'Awa' },
  media: [],
  ...overrides,
});

const comment = (id: string, overrides: Partial<PostComment> = {}): PostComment => ({
  id,
  content: `texte ${id}`,
  createdAt: '2026-10-08T10:01:00.000Z',
  author: { id: `u-${id}`, username: id, displayName: id.toUpperCase() },
  ...overrides,
});

const root = comment('root', { createdAt: '2026-10-08T10:01:00.000Z' });
const reply = comment('r1', { parentId: 'root', createdAt: '2026-10-08T10:02:00.000Z' });

describe('la source que le web remet à la composition', () => {
  test('le post en tête parle la langue du lecteur (le Prisme), et la cible dit ce que sa rangée affiche', () => {
    const source = postCommentCardSourceOf({ post: post(), target: root, targetText: 'ce que la rangée affiche', thread: [], readerLanguages: ['fr'], viewer });
    const subject = postCommentMessageCardSubjectOf(source, { mode: 'postAndComment', showsPost: true }, labels);
    expect(subject?.quoted).toEqual({ author: 'Awa', text: 'Coucher de soleil à Dakar', handle: 'awa' });
    expect(subject?.reply).toEqual({ author: 'ROOT', text: 'ce que la rangée affiche', handle: 'root' });
    expect(subject?.sentAt).toEqual(new Date('2026-10-08T10:01:00.000Z'));
    expect(subject?.quotedAt).toEqual(new Date('2026-10-08T10:00:00.000Z'));
  });

  test('un fil : la tête en citation, le reste sous « Fil de commentaires », dans le texte servi', () => {
    const translated = comment('r0', { parentId: 'root', createdAt: '2026-10-08T10:01:30.000Z', content: 'Where?', originalLanguage: 'en', translations: { fr: { text: 'Où ?' } } });
    const source = postCommentCardSourceOf({ post: post(), target: reply, targetText: 'texte r1', thread: [root, translated, reply], readerLanguages: ['fr'], viewer });
    const subject = postCommentMessageCardSubjectOf(source, { mode: 'threadToHere', showsPost: false }, labels);
    expect(subject?.quoted?.text).toBe('texte root');
    expect(subject?.reply).toEqual({ author: 'Fil de commentaires', text: 'R0 : Où ?\nR1 : texte r1', handle: null });
  });

  test('un commentaire en vol ou à vue unique n’a aucun mode ; un éphémère non plus', () => {
    for (const flags of [{ pending: true }, { effectFlags: 4 }, { effectFlags: 1 }]) {
      const source = postCommentCardSourceOf({ post: post(), target: comment('x', flags), targetText: 'x', thread: [], readerLanguages: ['fr'], viewer });
      expect(postCommentMessageCardSubjectOf(source, { mode: 'commentAlone', showsPost: false }, labels)).toBeNull();
    }
  });

  test('les médias peignables viennent signés de leur bloc ; la vignette du post d’abord', () => {
    const withPhoto = post({ media: [{ id: 'pm', fileUrl: '/p.jpg', mimeType: 'image/jpeg', width: 800, height: 600 }] });
    const target = comment('root', { media: [{ id: 'cm', fileUrl: '/c.jpg', mimeType: 'image/jpeg' }, { id: 'doc', fileUrl: '/d.pdf', mimeType: 'application/pdf' }] });
    const source = postCommentCardSourceOf({ post: withPhoto, target, targetText: 'Regarde', thread: [], readerLanguages: ['fr'], viewer });
    const subject = postCommentMessageCardSubjectOf(source, { mode: 'postAndComment', showsPost: true }, labels);
    expect(subject?.media.map((item) => item.id)).toEqual(['pm', 'cm']);
    expect(subject?.media[0]?.author).toEqual({ name: 'Awa', handle: 'awa', quoted: true });
    expect(subject?.media[1]?.author).toEqual({ name: 'ROOT', handle: 'root', quoted: false });
  });

  test('une story, un statut ou un canvas de story ne se mettent pas en tête', () => {
    for (const overrides of [{ type: 'STORY' }, { type: 'STATUS' }, { storyEffects: { layers: [] } }] as const) {
      const source = postCommentCardSourceOf({ post: post(overrides), target: root, targetText: 'x', thread: [], readerLanguages: ['fr'], viewer });
      expect(postCommentMessageCardSubjectOf(source, { mode: 'postAndComment', showsPost: true }, labels)).toBeNull();
      expect(postCommentMessageCardSubjectOf(source, { mode: 'commentAlone', showsPost: true }, labels)?.quoted).toBeNull();
    }
  });
});

describe('qui compose, et quand « Imager » s’offre', () => {
  test('un post compose ; une story ou un statut gardent la carte du commentaire, et sans post rien ne compose', () => {
    expect(composingPostOf(post())?.id).toBe('p-1');
    expect(composingPostOf(post({ type: 'REEL' }))?.id).toBe('p-1');
    expect(composingPostOf(post({ type: 'STORY' }))).toBeNull();
    expect(composingPostOf(post({ type: 'status' }))).toBeNull();
    expect(composingPostOf(undefined)).toBeNull();
  });

  test('« Imager » s’offre dès qu’un mode compose — jamais sous un ancêtre protégé ni sans racine chargée', () => {
    const input = (target: PostComment, thread: readonly PostComment[]) => ({ post: post(), target, targetText: 'x', thread, readerLanguages: ['fr'], viewer });
    expect(postCommentImageable(input(root, []))).toBe(true);
    expect(postCommentImageable(input(reply, [root]))).toBe(true);
    expect(postCommentImageable(input(reply, []))).toBe(false);
    expect(postCommentImageable(input(reply, [{ ...root, effectFlags: 2 }]))).toBe(false);
  });
});

describe('le choix de composition dans l’atelier', () => {
  const r2 = comment('r2', { parentId: 'root', createdAt: '2026-10-08T10:03:00.000Z' });
  const r3 = comment('r3', { parentId: 'root', createdAt: '2026-10-08T10:04:00.000Z' });
  const source = postCommentCardSourceOf({ post: post(), target: r2, targetText: 'texte r2', thread: [root, reply, r2, r3], readerLanguages: ['fr'], viewer });

  test('à l’ouverture : le mode par défaut, son post en tête par défaut, les cases du fil jusqu’ici', () => {
    const choice = postCommentChoiceOf(source, NO_POST_COMMENT_PICK);
    expect(choice?.mode).toBe('threadToHere');
    expect(choice?.showsPost).toBe(false);
    expect([...(choice?.chosen ?? [])].sort()).toEqual(['r1', 'root']);
  });

  test('choisir un mode remet « Post en tête » à son défaut ; la bascule se garde dans le mode', () => {
    const toggled = postCommentPickAfter(source, NO_POST_COMMENT_PICK, { kind: 'togglePost' });
    expect(postCommentChoiceOf(source, toggled)?.showsPost).toBe(true);
    const postRoot = postCommentPickAfter(source, toggled, { kind: 'mode', mode: 'postRootAndReply' });
    expect(postCommentChoiceOf(source, postRoot)).toMatchObject({ mode: 'postRootAndReply', showsPost: true });
    const withoutPost = postCommentPickAfter(source, postRoot, { kind: 'togglePost' });
    expect(postCommentChoiceOf(source, withoutPost)).toMatchObject({ mode: 'postRootAndReply', showsPost: false });
    expect(postCommentChoiceOf(source, postCommentPickAfter(source, withoutPost, { kind: 'mode', mode: 'threadToHere' }))?.showsPost).toBe(false);
  });

  test('« Choisir les réponses » ouvre sur le fil jusqu’ici, puis chaque case se coche et se décoche', () => {
    const choosing = postCommentPickAfter(source, NO_POST_COMMENT_PICK, { kind: 'mode', mode: 'chosenReplies' });
    const plusR3 = postCommentPickAfter(source, choosing, { kind: 'reply', id: 'r3' });
    const minusRoot = postCommentPickAfter(source, plusR3, { kind: 'reply', id: 'root' });
    expect([...(postCommentChoiceOf(source, minusRoot)?.chosen ?? [])].sort()).toEqual(['r1', 'r3']);
    const subject = postCommentMessageCardSubjectOf(source, postCommentChoiceOf(source, minusRoot)!, labels);
    expect(subject?.quoted?.text).toBe('texte r1');
    expect(subject?.reply.text).toBe('R3 : texte r3\nR2 : texte r2');
  });

  test('un mode qui ne s’offre plus retombe sur le défaut ; rien ne s’image ⇒ aucun choix', () => {
    expect(postCommentChoiceOf(source, { ...NO_POST_COMMENT_PICK, mode: 'postAndComment' })?.mode).toBe('threadToHere');
    const lone = postCommentCardSourceOf({ post: post(), target: comment('x', { effectFlags: 4 }), targetText: 'x', thread: [], readerLanguages: ['fr'], viewer });
    expect(postCommentChoiceOf(lone, NO_POST_COMMENT_PICK)).toBeNull();
  });
});

