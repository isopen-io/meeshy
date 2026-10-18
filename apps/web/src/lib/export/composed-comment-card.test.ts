import { describe, expect, test } from 'bun:test';

import type { FeedPost } from '@/lib/api/feed-pages';
import type { PostComment } from '@/lib/api/publication-comments';

import {
  NO_POST_COMMENT_PICK,
  composingPostOf,
  postCommentCardSourceOf,
  postCommentChoiceOf,
  postCommentImageable,
  postCommentImagingOf,
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

const labels: PostCommentCardLabels = { folded: (count) => `+${count} réponses` };
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
  visibility: 'PUBLIC',
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

  test('un fil : la tête en citation, le reste IMBRIQUÉ à son niveau (plus aplati), dans le texte servi', () => {
    const translated = comment('r0', { parentId: 'root', createdAt: '2026-10-08T10:01:30.000Z', content: 'Where?', originalLanguage: 'en', translations: { fr: { text: 'Où ?' } } });
    const source = postCommentCardSourceOf({ post: post(), target: reply, targetText: 'texte r1', thread: [root, translated, reply], readerLanguages: ['fr'], viewer });
    const subject = postCommentMessageCardSubjectOf(source, { mode: 'threadToHere', showsPost: false }, labels);
    expect(subject?.quoted?.text).toBe('texte root');
    expect(subject?.context?.map((entry) => [entry.part.author, entry.part.text, entry.depth])).toEqual([['R0', 'Où ?', 1]]);
    expect(subject?.reply).toEqual({ author: 'R1', text: 'texte r1', handle: 'r1' });
    expect(subject?.replyDepth).toBe(1);
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

  test('une story ou un statut AVEC média se met en tête : son média est le héros de la carte', () => {
    const photo = [{ id: 'sm', fileUrl: '/s.jpg', mimeType: 'image/jpeg', width: 1080, height: 1920 }];
    for (const overrides of [{ type: 'STORY' }, { type: 'STATUS' }, { storyEffects: { layers: [] } }] as const) {
      const source = postCommentCardSourceOf({ post: post({ ...overrides, media: photo }), target: root, targetText: 'x', thread: [], readerLanguages: ['fr'], viewer });
      const subject = postCommentMessageCardSubjectOf(source, { mode: 'postAndComment', showsPost: true }, labels);
      expect(subject?.media.map((item) => [item.id, item.hero])).toEqual([['sm', true]]);
    }
  });

  test('le héros d’une story reste soumis aux gardes : une pièce à vue unique ou floutée ne se peint jamais', () => {
    for (const piece of [{ isViewOnce: true }, { isBlurred: true }, { effectFlags: 4 }, { isEncrypted: true }]) {
      const media = [{ id: 'sm', fileUrl: '/s.jpg', mimeType: 'image/jpeg', ...piece }];
      const storyPost = post({ type: 'STORY', media });
      expect(composingPostOf(storyPost)).toBeNull();
      const source = postCommentCardSourceOf({ post: storyPost, target: root, targetText: 'x', thread: [], readerLanguages: ['fr'], viewer });
      expect(postCommentMessageCardSubjectOf(source, { mode: 'postAndComment', showsPost: true }, labels)).toBeNull();
    }
  });

  test('un commentaire-sticker déclare son image sticker : elle se peindra ajustée, jamais coupée', () => {
    const target = comment('root', { media: [{ id: 'st', fileUrl: '/st.png', mimeType: 'image/png', width: 512, height: 512 }], sticker: { emoji: '🔥' } });
    const source = postCommentCardSourceOf({ post: post(), target, targetText: 'x', thread: [], readerLanguages: ['fr'], viewer });
    const [item] = postCommentMessageCardSubjectOf(source, { mode: 'commentAlone', showsPost: false }, labels)?.media ?? [];
    expect(item?.card.kind === 'image' && item.card.sticker).toBe(true);
  });

  test('un canvas de story sans média ne se met pas en tête', () => {
    for (const overrides of [{ type: 'STORY' }, { type: 'STATUS' }, { storyEffects: { layers: [] } }] as const) {
      const source = postCommentCardSourceOf({ post: post(overrides), target: root, targetText: 'x', thread: [], readerLanguages: ['fr'], viewer });
      expect(postCommentMessageCardSubjectOf(source, { mode: 'postAndComment', showsPost: true }, labels)).toBeNull();
      expect(postCommentMessageCardSubjectOf(source, { mode: 'commentAlone', showsPost: true }, labels)?.quoted).toBeNull();
    }
  });
});

describe('qui compose, et quand « Imager » s’offre', () => {
  test('un post compose ; une story ou un statut SANS média gardent la carte du commentaire, et sans post rien ne compose', () => {
    expect(composingPostOf(post())?.id).toBe('p-1');
    expect(composingPostOf(post({ type: 'REEL' }))?.id).toBe('p-1');
    expect(composingPostOf(post({ type: 'STORY' }))).toBeNull();
    expect(composingPostOf(post({ type: 'status' }))).toBeNull();
    const media = [{ id: 'sm', fileUrl: '/s.jpg', mimeType: 'image/jpeg' }];
    expect(composingPostOf(post({ type: 'STORY', media }))?.id).toBe('p-1');
    expect(composingPostOf(post({ type: 'status', media }))?.id).toBe('p-1');
    expect(composingPostOf(post({ type: 'STORY', media: [{ id: 'v', fileUrl: '/v.m4a', mimeType: 'audio/mp4' }] }))).toBeNull();
  });

  test('une story ou un post dont l’audience n’est pas PUBLIQUE n’est jamais support ni héros — seul le commentaire reste', () => {
    const media = [{ id: 'sm', fileUrl: '/s.jpg', mimeType: 'image/jpeg' }];
    const { visibility: _public, ...unknownAudience } = post({ media });
    for (const visibility of ['FRIENDS', 'COMMUNITY', 'PRIVATE', 'EXCEPT', 'ONLY', null, 'absent'] as const) {
      const audience = visibility === 'absent' ? {} : { visibility };
      expect(composingPostOf({ ...unknownAudience, type: 'STORY', ...audience })).toBeNull();
      const restricted = composingPostOf({ ...unknownAudience, ...audience });
      expect(restricted?.id).toBe('p-1');
      const source = postCommentCardSourceOf({ post: restricted, target: root, targetText: 'x', thread: [], readerLanguages: ['fr'], viewer });
      expect(postCommentChoiceOf(source, NO_POST_COMMENT_PICK)?.mode).toBe('commentAlone');
      expect(postCommentMessageCardSubjectOf(source, { mode: 'postAndComment', showsPost: true }, labels)).toBeNull();
      const alone = postCommentMessageCardSubjectOf(source, { mode: 'commentAlone', showsPost: true }, labels);
      expect([alone?.quoted, alone?.media]).toEqual([null, []]);
    }
  });

  test('une story échue n’est jamais support ; une story à canvas ne montre que sa vignette', () => {
    const media = [{ id: 'sm', fileUrl: '/s.jpg', mimeType: 'image/jpeg' }];
    expect(composingPostOf(post({ type: 'STORY', media, expiresAt: '2020-01-01T00:00:00.000Z' }))).toBeNull();
    expect(composingPostOf(post({ type: 'STORY', media, expiresAt: '2999-01-01T00:00:00.000Z' }))?.id).toBe('p-1');
    expect(composingPostOf(post({ type: 'STORY', media, storyEffects: { layers: [] } }))).toBeNull();
    const withThumb = composingPostOf(
      post({ type: 'STORY', storyEffects: { layers: [] }, media: [{ id: 'sm', fileUrl: '/s.mp4', mimeType: 'video/mp4', thumbnailUrl: '/t.jpg', width: 1080, height: 1920 }] }),
    );
    expect(withThumb?.media?.map((piece) => [piece.fileUrl, piece.mimeType, piece.width, piece.height])).toEqual([['/t.jpg', 'image/jpeg', 1080, 1920]]);
    const audioThumb = [{ id: 'a', fileUrl: '/a.m4a', mimeType: 'audio/mp4', thumbnailUrl: '/cover.jpg' }];
    expect(composingPostOf(post({ type: 'STORY', storyEffects: { layers: [] }, media: audioThumb }))).toBeNull();
    expect(composingPostOf(undefined)).toBeNull();
  });

  test('« Imager » s’offre dès qu’un mode compose — jamais sous un ancêtre protégé ni sans racine chargée', () => {
    const input = (target: PostComment, thread: readonly PostComment[]) => ({ post: post(), target, targetText: 'x', thread, readerLanguages: ['fr'], viewer });
    expect(postCommentImageable(input(root, []))).toBe(true);
    expect(postCommentImageable(input(reply, [root]))).toBe(true);
    expect(postCommentImageable(input(reply, []))).toBe(false);
    expect(postCommentImageable(input(reply, [{ ...root, effectFlags: 2 }]))).toBe(false);
  });

  test('une réponse sans racine chargée retombe sur la carte du commentaire seul — jamais sous un ancêtre protégé connu', () => {
    const input = (target: PostComment, thread: readonly PostComment[]) => ({ post: post(), target, targetText: 'x', thread, readerLanguages: ['fr'], viewer });
    expect(postCommentImagingOf(input(reply, [root]))).toBe('composed');
    expect(postCommentImagingOf(input(reply, []))).toBe('alone');
    expect(postCommentImagingOf(input(reply, [{ ...root, effectFlags: 2 }]))).toBeNull();
    expect(postCommentImagingOf(input({ ...reply, effectFlags: 2 }, []))).toBeNull();
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
    expect(subject?.context?.map((entry) => entry.part.text)).toEqual(['texte r3']);
    expect(subject?.reply.text).toBe('texte r2');
  });

  test('un mode qui ne s’offre plus retombe sur le défaut ; rien ne s’image ⇒ aucun choix', () => {
    expect(postCommentChoiceOf(source, { ...NO_POST_COMMENT_PICK, mode: 'postAndComment' })?.mode).toBe('threadToHere');
    const lone = postCommentCardSourceOf({ post: post(), target: comment('x', { effectFlags: 4 }), targetText: 'x', thread: [], readerLanguages: ['fr'], viewer });
    expect(postCommentChoiceOf(lone, NO_POST_COMMENT_PICK)).toBeNull();
  });
});

describe('le son d’un vocal part dans la piste du texte servi (#9687, famille audio du Prisme)', () => {
  const voice = (overrides: Partial<PostComment> = {}) =>
    comment('v', {
      content: '',
      originalLanguage: 'es',
      media: [
        {
          id: 'a-1',
          fileUrl: '/voz.m4a',
          mimeType: 'audio/mp4',
          duration: 9000,
          transcription: { text: 'Hola a todos', language: 'es' },
          translations: { en: { type: 'audio', transcription: 'Hello everyone', url: '/voice-en.m4a', durationMs: 8000 } },
        } as never,
      ],
      ...overrides,
    });
  const audioOf = (input: Parameters<typeof postCommentCardSourceOf>[0]) =>
    postCommentMessageCardSubjectOf(postCommentCardSourceOf(input), { mode: 'commentAlone', showsPost: false }, labels)?.media.find((item) => item.card.kind === 'audio');

  test('prisme [fr, en] sans traduction française : au RANG 2, la piste anglaise — sa durée avec elle', () => {
    const audio = audioOf({ post: post(), target: voice(), targetText: '', thread: [], readerLanguages: ['fr', 'en'], viewer });
    expect(audio?.url).toBe('/voice-en.m4a');
    expect(audio?.card).toMatchObject({ kind: 'audio', durationMs: 8000 });
  });

  test('aucune langue du prisme n’a de piste : l’original', () => {
    expect(audioOf({ post: post(), target: voice(), targetText: '', thread: [], readerLanguages: ['fr', 'de'], viewer })?.url).toBe('/voz.m4a');
  });

  test('la rangée visée montre son original : son vocal original, comme iOS', () => {
    expect(audioOf({ post: post(), target: voice(), targetText: '', targetShowsOriginal: true, thread: [], readerLanguages: ['fr', 'en'], viewer })?.url).toBe('/voz.m4a');
  });

  test('un vocal VOISIN du fil suit le même prisme', () => {
    const rootVoice = voice({ id: 'root' });
    const source = postCommentCardSourceOf({ post: post(), target: reply, targetText: 'texte r1', thread: [rootVoice], readerLanguages: ['fr', 'en'], viewer });
    const subject = postCommentMessageCardSubjectOf(source, { mode: 'threadToHere', showsPost: false }, labels);
    expect(subject?.media.map((item) => item.url)).toEqual(['/voice-en.m4a']);
  });
});


describe('la carte peint le texte LU, jamais la syntaxe des liens (#9687, jumelle de bdae65102a)', () => {
  const raw = 'puis [notre page](https://meeshy.me/about) et enfin [[https://meeshy.me/brut]]';
  const plain = 'puis notre page et enfin https://meeshy.me/brut';

  test('le post en tête, le commentaire visé et ses voisins du fil', () => {
    const linked = comment('r0', { parentId: 'root', createdAt: '2026-10-08T10:01:30.000Z', content: raw });
    const source = postCommentCardSourceOf({ post: post({ content: raw, translations: undefined }), target: reply, targetText: raw, thread: [root, linked, reply], readerLanguages: ['fr'], viewer });
    const withPost = postCommentMessageCardSubjectOf(source, { mode: 'threadToHere', showsPost: true }, labels);
    expect(withPost?.quoted?.text).toBe(plain);
    expect(withPost?.context?.map((entry) => `${entry.part.author} : ${entry.part.text}`)).toEqual(['ROOT : texte root', `R0 : ${plain}`]);
    expect(withPost?.reply.text).toBe(plain);
    expect(source.thread.find((entry) => entry.id === 'r0')?.text).toBe(plain);
  });
});
