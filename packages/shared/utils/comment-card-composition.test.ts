import { describe, expect, it } from 'vitest';
import { MESSAGE_EFFECT_FLAGS } from '../types/message-effect-flags.js';
import {
  POST_COMMENT_CARD_LIMITS,
  postCommentCardBlocks,
  postCommentCardChoosable,
  postCommentCardDefaultMode,
  postCommentCardExcerpt,
  postCommentCardFallsBackToCommentAlone,
  postCommentCardInitialChoice,
  postCommentCardModes,
  postCommentCardShowsPostByDefault,
  postCommentCardSubject,
  type PostCommentCardBlock,
  type PostCommentCardComment,
  type PostCommentCardMediaKind,
  type PostCommentCardMode,
  type PostCommentCardPost,
  type PostCommentCardSource,
} from './comment-card-composition.js';

/**
 * **Imager un commentaire de POST** (#9687, jumelle de #9686) — les témoins
 * de `PostCommentCardCompositionTests.swift`, portés cas pour cas.
 */

type Media = { readonly id: string; readonly kind: PostCommentCardMediaKind };
type Comment = PostCommentCardComment<Media>;

const viewer = { id: 'me', displayName: 'Moi' };
const t0 = 1_800_000_000_000;
const at = (minutes: number): number => t0 + minutes * 60_000;

const makePost = (overrides: { content?: string; type?: string | null; media?: readonly Media[]; visibility?: string | null } = {}): PostCommentCardPost<Media> => ({
  type: overrides.type ?? null,
  visibility: overrides.visibility === undefined ? 'PUBLIC' : overrides.visibility,
  hasStoryCanvas: false,
  createdAt: at(0),
  author: { id: 'awa', displayName: 'Awa', username: 'awa' },
  text: overrides.content ?? 'Le coucher de soleil à Dakar',
  media: overrides.media ?? [],
});

const makeComment = (id: string, author: string, text: string, minute: number, options: { parent?: string; flags?: number; media?: readonly Media[] } = {}): Comment => ({
  id,
  parentId: options.parent ?? null,
  createdAt: at(minute),
  effectFlags: options.flags ?? 0,
  author: { id: author.toLowerCase(), displayName: author, username: author.toLowerCase() },
  text,
  media: options.media ?? [],
});

const root = makeComment('root', 'Bob', 'Magnifique !', 1);
const r1 = makeComment('r1', 'Cleo', 'Tu étais où ?', 2, { parent: 'root' });
const r2 = makeComment('r2', 'Bob', 'Sur la corniche', 3, { parent: 'root' });
const r3 = makeComment('r3', 'Dan', 'J’y vais demain', 4, { parent: 'root' });
const later = makeComment('r4', 'Eve', 'Écrit après', 9, { parent: 'root' });

const source = (params: { post?: PostCommentCardPost<Media> | null; target: Comment; thread?: readonly Comment[] }): PostCommentCardSource<Media> => ({
  post: params.post === undefined ? makePost() : params.post,
  target: params.target,
  thread: params.thread ?? [root, r1, r2, r3, later],
  viewer,
});

const ids = (blocks: readonly PostCommentCardBlock[]): readonly string[] =>
  blocks.map((block) => (block.kind === 'post' ? 'post' : block.kind === 'comment' ? block.id : `+${block.count}`));

const blocks = (from: PostCommentCardSource<Media>, mode: PostCommentCardMode, options: { showsPost?: boolean; chosen?: readonly string[] } = {}) =>
  ids(postCommentCardBlocks(from, { mode, showsPost: options.showsPost ?? postCommentCardShowsPostByDefault(mode), chosen: new Set(options.chosen ?? []) }));

const subject = (from: PostCommentCardSource<Media>, mode: PostCommentCardMode, options: { showsPost?: boolean; chosen?: readonly string[] } = {}) =>
  postCommentCardSubject(from, {
    mode,
    showsPost: options.showsPost ?? postCommentCardShowsPostByDefault(mode),
    chosen: new Set(options.chosen ?? []),
    foldedLabel: (count) => `+${count} réponses`,
  });

describe('commentaire de premier niveau', () => {
  it('offre « Post + commentaire » d’abord, puis le commentaire seul', () => {
    const from = source({ target: root });
    expect(postCommentCardModes(from)).toEqual(['postAndComment', 'commentAlone']);
    expect(postCommentCardDefaultMode(from)).toBe('postAndComment');
  });

  it('« Post + commentaire » met le post au-dessus du commentaire', () => {
    expect(blocks(source({ target: root }), 'postAndComment')).toEqual(['post', 'root']);
  });

  it('« Commentaire seul » est le commentaire seul', () => {
    expect(blocks(source({ target: root }), 'commentAlone')).toEqual(['root']);
  });

  it('le post quitte la tête d’un toucher, dans chaque mode', () => {
    expect(blocks(source({ target: root }), 'postAndComment', { showsPost: false })).toEqual(['root']);
    expect(blocks(source({ target: r2 }), 'postRootAndReply', { showsPost: false })).toEqual(['root', 'r2']);
    expect(blocks(source({ target: r2 }), 'threadToHere', { showsPost: true })).toEqual(['post', 'root', 'r1', 'r2']);
  });

  it('sans post, seul le commentaire seul s’offre', () => {
    expect(postCommentCardModes(source({ post: null, target: root }))).toEqual(['commentAlone']);
  });
});

describe('réponse', () => {
  it('offre le fil d’abord, puis post + racine + réponse, puis le choix', () => {
    const from = source({ target: r2 });
    expect(postCommentCardModes(from)).toEqual(['threadToHere', 'postRootAndReply', 'chosenReplies']);
    expect(postCommentCardDefaultMode(from)).toBe('threadToHere');
  });

  it('« Fil jusqu’ici » : la racine puis les réponses jusqu’à celle-ci, jamais ce qui vient après', () => {
    expect(blocks(source({ target: r2 }), 'threadToHere')).toEqual(['root', 'r1', 'r2']);
  });

  it('« Fil jusqu’ici » garde l’ordre chronologique, quel que soit l’ordre chargé', () => {
    expect(blocks(source({ target: r3, thread: [r3, later, r1, root, r2] }), 'threadToHere')).toEqual(['root', 'r1', 'r2', 'r3']);
  });

  it('« Fil jusqu’ici » suit une chaîne d’ancêtres imbriquée', () => {
    const nested = makeComment('n1', 'Fay', 'Réponse à Cleo', 5, { parent: 'r1' });
    expect(blocks(source({ target: nested, thread: [root, r1, nested] }), 'threadToHere')).toEqual(['root', 'r1', 'n1']);
  });

  it('« Post + racine + réponse » est le post, la racine et cette réponse', () => {
    expect(blocks(source({ target: r3 }), 'postRootAndReply')).toEqual(['post', 'root', 'r3']);
  });

  it('« Choisir les réponses » garde l’ordre chronologique, et la réponse visée toujours en dernier', () => {
    const from = source({ target: r3 });
    expect(blocks(from, 'chosenReplies', { chosen: ['r2', 'root'] })).toEqual(['root', 'r2', 'r3']);
    expect(blocks(from, 'chosenReplies', { chosen: [] })).toEqual(['r3']);
    expect(blocks(from, 'chosenReplies', { chosen: ['r3'] })).toEqual(['r3']);
  });

  it('les cases sont l’arbre sans la réponse visée, dans l’ordre', () => {
    expect(postCommentCardChoosable(source({ target: r2 })).map((comment) => comment.id)).toEqual(['root', 'r1', 'r3', 'r4']);
  });

  it('les cases cochées à l’ouverture sont le fil jusqu’ici', () => {
    expect([...postCommentCardInitialChoice(source({ target: r2 }))].sort()).toEqual(['r1', 'root']);
  });

  it('une réponse dont la racine n’est pas chargée n’offre rien', () => {
    expect(postCommentCardModes(source({ target: r2, thread: [r1, r2] }))).toEqual([]);
  });
});

describe('protections', () => {
  it('un commentaire protégé ne s’image jamais', () => {
    const ephemeral = makeComment('x', 'Bob', 'Secret', 1, { flags: MESSAGE_EFFECT_FLAGS.EPHEMERAL });
    expect(postCommentCardModes(source({ target: ephemeral }))).toEqual([]);
    expect(subject(source({ target: ephemeral }), 'postAndComment')).toBeNull();
  });

  it('une réponse sous un ancêtre protégé ne s’image dans aucun mode', () => {
    const viewOnce = makeComment('root', 'Bob', 'Vue unique', 1, { flags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE });
    const from = source({ target: r2, thread: [viewOnce, r1, r2] });
    expect(postCommentCardModes(from)).toEqual([]);
    expect(blocks(from, 'postRootAndReply')).toEqual([]);
  });

  it('une réponse voisine protégée reste hors du fil, et hors du choix', () => {
    const blurred = makeComment('r1', 'Cleo', 'Flouté', 2, { parent: 'root', flags: MESSAGE_EFFECT_FLAGS.BLURRED });
    const from = source({ target: r2, thread: [root, blurred, r2, r3] });
    expect(blocks(from, 'threadToHere')).toEqual(['root', 'r2']);
    expect(blocks(from, 'chosenReplies', { chosen: ['r1', 'root'] })).toEqual(['root', 'r2']);
  });

  it('une story ou un statut SANS média ne se met pas en tête', () => {
    for (const type of ['STORY', 'STATUS']) {
      const from = source({ post: makePost({ type }), target: root });
      expect({ type, modes: postCommentCardModes(from) }).toEqual({ type, modes: ['commentAlone'] });
      expect({ type, blocks: blocks(from, 'commentAlone', { showsPost: true }) }).toEqual({ type, blocks: ['root'] });
    }
  });

  it('une story ou un statut AVEC média se met en tête : son média est le héros de la carte', () => {
    const photo: Media = { id: 'pic', kind: 'image' };
    for (const type of ['STORY', 'STATUS']) {
      const from = source({ post: makePost({ type, media: [photo] }), target: root });
      expect({ type, modes: postCommentCardModes(from) }).toEqual({ type, modes: ['postAndComment', 'commentAlone'] });
      const card = subject(from, 'postAndComment');
      expect(card?.media.map((item) => ({ id: item.media.id, hero: item.hero }))).toEqual([{ id: 'pic', hero: true }]);
    }
    const canvas = { ...makePost({ media: [photo] }), hasStoryCanvas: true };
    expect(postCommentCardModes(source({ post: canvas, target: root }))).toContain('postAndComment');
  });

  it('une story dont le média n’est ni photo ni vidéo (audio seul) ne se met pas en tête', () => {
    const voice: Media = { id: 'v', kind: 'audio' };
    expect(postCommentCardModes(source({ post: makePost({ type: 'STORY', media: [voice] }), target: root }))).toEqual(['commentAlone']);
  });

  it('le média du post est le héros ; ceux des commentaires ne le sont pas', () => {
    const photo: Media = { id: 'pic', kind: 'image' };
    const mine = makeComment('mine', 'Bob', 'Regardez', 1, { media: [{ id: 'c1', kind: 'image' }] });
    const card = subject(source({ post: makePost({ media: [photo] }), target: mine, thread: [mine] }), 'postAndComment');
    expect(card?.media.map((item) => [item.media.id, item.hero])).toEqual([['pic', true], ['c1', false]]);
  });

  it('un post qui n’a qu’une photo se met en tête avec sa vignette', () => {
    const photo: Media = { id: 'pic', kind: 'image' };
    const card = subject(source({ post: makePost({ content: '  ', media: [photo] }), target: root }), 'postAndComment');
    expect(card?.quoted?.author).toBe('Awa');
    expect(card?.quoted?.text).toBe('📷');
    expect(card?.media.map((item) => item.media.id)).toEqual(['pic']);
  });

  it('sous son héros, le support ne garde qu’un extrait court : deux lignes, 140 caractères', () => {
    const photo: Media = { id: 'pic', kind: 'image' };
    const lines = makePost({ content: 'un\ndeux\ntrois\nquatre', media: [photo] });
    expect(subject(source({ post: lines, target: root }), 'postAndComment')?.quoted?.text).toBe('un\ndeux…');
    const words = Array.from({ length: 60 }, () => 'mot').join(' ');
    const long = subject(source({ post: makePost({ content: words, media: [photo] }), target: root }), 'postAndComment')?.quoted?.text ?? '';
    expect(long.endsWith('mot…')).toBe(true);
    expect([...long].length).toBeLessThanOrEqual(POST_COMMENT_CARD_LIMITS.heroExcerptCharacters + 1);
    expect(subject(source({ post: makePost({ content: 'un\ndeux\ntrois\nquatre' }), target: root }), 'postAndComment')?.quoted?.text).toBe('un\ndeux\ntrois\nquatre');
  });
});

describe('bornes', () => {
  it('le texte du post se coupe aux lignes et aux caractères, lisiblement', () => {
    const long = Array.from({ length: 6 }, () => 'ligne').join('\n');
    expect(postCommentCardExcerpt(long)).toBe('ligne\nligne\nligne\nligne…');
    const words = Array.from({ length: 120 }, () => 'mot').join(' ');
    const cut = postCommentCardExcerpt(words);
    expect(cut.endsWith('mot…')).toBe(true);
    expect([...cut].length).toBeLessThanOrEqual(POST_COMMENT_CARD_LIMITS.maxPostCharacters + 1);
    expect(postCommentCardExcerpt('Court')).toBe('Court');
  });

  it('un long fil replie son milieu, en gardant la racine et les dernières réponses', () => {
    const replies = Array.from({ length: 9 }, (_, index) => makeComment(`m${index + 1}`, `U${index + 1}`, `Réponse ${index + 1}`, index + 2, { parent: 'root' }));
    const from = source({ target: replies[8]!, thread: [root, ...replies] });
    expect(blocks(from, 'threadToHere')).toEqual(['root', '+5', 'm6', 'm7', 'm8', 'm9']);
    const withPost = blocks(from, 'threadToHere', { showsPost: true });
    expect(withPost).toEqual(['post', 'root', '+6', 'm7', 'm8', 'm9']);
    expect(withPost.length).toBe(POST_COMMENT_CARD_LIMITS.maxBlocks);
  });

  it('au plus quatre médias, la vignette du post gardée', () => {
    const photo: Media = { id: 'pic', kind: 'image' };
    const replies = Array.from({ length: 5 }, (_, index) =>
      makeComment(`m${index + 1}`, `U${index + 1}`, `R${index + 1}`, index + 2, { parent: 'root', media: [{ id: `c${index + 1}`, kind: 'image' }] }),
    );
    const card = subject(source({ post: makePost({ media: [photo] }), target: replies[4]!, thread: [root, ...replies] }), 'threadToHere', { showsPost: true });
    expect(card?.media.length).toBe(POST_COMMENT_CARD_LIMITS.maxMedia);
    expect(card?.media[0]?.media.id).toBe('pic');
    expect(card?.media[card.media.length - 1]?.media.id).toBe('c5');
  });
});

describe('la carte', () => {
  it('deux blocs : le premier en citation, le second en réponse', () => {
    const card = subject(source({ target: root }), 'postAndComment');
    expect(card?.quoted).toEqual({ author: 'Awa', text: 'Le coucher de soleil à Dakar', handle: 'awa' });
    expect(card?.reply).toEqual({ author: 'Bob', text: 'Magnifique !', handle: 'bob' });
    expect(card?.sentAt).toBe(root.createdAt);
    expect(card?.quotedAt).toBe(at(0));
  });

  it('un bloc : le commentaire, sans citation', () => {
    const card = subject(source({ target: root }), 'commentAlone');
    expect(card?.quoted).toBeNull();
    expect(card?.reply.text).toBe('Magnifique !');
  });

  it('un fil cite sa tête, garde chaque commentaire à son niveau et répond par le dernier', () => {
    const card = subject(source({ target: r2 }), 'threadToHere');
    expect(card?.quoted?.text).toBe('Magnifique !');
    expect(card?.context.map((entry) => [entry.part.author, entry.part.text, entry.depth])).toEqual([['Cleo', 'Tu étais où ?', 1]]);
    expect(card?.reply).toEqual({ author: 'Bob', text: 'Sur la corniche', handle: 'bob' });
    expect(card?.replyDepth).toBe(1);
  });

  it('l’imbrication suit la chaîne des ancêtres, pas la liste à plat', () => {
    const deep = makeComment('d1', 'Fay', 'Réponse à Cleo', 5, { parent: 'r1' });
    const deeper = makeComment('d2', 'Gus', 'Réponse à Fay', 6, { parent: 'd1' });
    const card = subject(source({ target: deeper, thread: [root, r1, deep, deeper] }), 'threadToHere');
    expect(card?.context.map((entry) => entry.depth)).toEqual([1, 2]);
    expect(card?.replyDepth).toBe(3);
  });

  it('avec le post en tête, la racine devient un commentaire du fil au niveau 0', () => {
    const card = subject(source({ target: r2 }), 'postRootAndReply');
    expect(card?.quoted?.author).toBe('Awa');
    expect(card?.context.map((entry) => [entry.part.text, entry.depth])).toEqual([['Magnifique !', 0]]);
    expect(card?.replyDepth).toBe(1);
  });

  it('un commentaire de premier niveau reste au niveau 0, sans contexte', () => {
    const card = subject(source({ target: root }), 'postAndComment');
    expect(card?.context).toEqual([]);
    expect(card?.replyDepth).toBe(0);
  });

  it('un fil replié dit combien de réponses sont repliées', () => {
    const replies = Array.from({ length: 9 }, (_, index) => makeComment(`m${index + 1}`, `U${index + 1}`, `R${index + 1}`, index + 2, { parent: 'root' }));
    const card = subject(source({ target: replies[8]!, thread: [root, ...replies] }), 'threadToHere');
    const folded = card?.context.find((entry) => entry.folded);
    expect(folded?.part.text).toBe('+5 réponses');
    expect(folded?.depth).toBe(1);
  });

  it('le lecteur est nommé comme il se nomme', () => {
    const mine: Comment = { ...makeComment('mine', 'x', 'Je confirme', 1), author: { id: 'me', displayName: 'moi-pseudo', username: 'moi' } };
    expect(subject(source({ target: mine }), 'commentAlone')?.reply.author).toBe('Moi');
  });

  it('un commentaire sans texte s’écrit par les symboles de ses médias', () => {
    const voice = makeComment('r1', 'Cleo', ' ', 2, { parent: 'root', media: [{ id: 'a', kind: 'audio' }, { id: 'v', kind: 'video' }] });
    const card = subject(source({ target: r2, thread: [root, voice, r2] }), 'threadToHere');
    expect(card?.context.map((entry) => `${entry.part.author} : ${entry.part.text}`)).toEqual(['Cleo : 🎤 🎬']);
    expect(card?.reply.text).toBe('Sur la corniche');
  });

  it('un commentaire en vol ne s’image pas, et n’entre pas dans le fil', () => {
    expect(postCommentCardModes(source({ target: { ...root, inFlight: true } }))).toEqual([]);
    expect(blocks(source({ target: r2, thread: [root, { ...r1, inFlight: true }, r2] }), 'threadToHere')).toEqual(['root', 'r2']);
  });
});

describe('le repli « commentaire seul »', () => {
  const viewOnce = { flags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE };

  it('une réponse dont la racine n’est pas chargée s’image seule', () => {
    const from = source({ target: r1, thread: [] });
    expect(postCommentCardModes(from)).toEqual([]);
    expect(postCommentCardFallsBackToCommentAlone(from)).toBe(true);
  });

  it('jamais quand un ancêtre CONNU est protégé', () => {
    const target = makeComment('t', 'Dan', 'Moi', 3, { parent: 'mid' });
    const middle = makeComment('mid', 'Cleo', 'Entre deux', 2, { parent: 'missing' });
    const protectedMiddle = makeComment('mid', 'Cleo', 'Entre deux', 2, { parent: 'missing', ...viewOnce });
    expect(postCommentCardFallsBackToCommentAlone(source({ target: r1, thread: [makeComment('root', 'Bob', 'Vue unique', 1, viewOnce)] }))).toBe(false);
    expect(postCommentCardFallsBackToCommentAlone(source({ target, thread: [middle] }))).toBe(true);
    expect(postCommentCardFallsBackToCommentAlone(source({ target, thread: [protectedMiddle] }))).toBe(false);
  });

  it('jamais quand un mode compose, ni pour un commentaire protégé', () => {
    expect(postCommentCardFallsBackToCommentAlone(source({ target: r1 }))).toBe(false);
    expect(postCommentCardFallsBackToCommentAlone(source({ target: makeComment('x', 'Bob', 'Secret', 1, { parent: 'missing', ...viewOnce }), thread: [] }))).toBe(false);
  });
});

describe('l’audience du support', () => {
  it('seul un support PUBLIC se met en tête — toute audience restreinte, ou inconnue, laisse le commentaire seul', () => {
    expect(postCommentCardModes(source({ post: makePost({ visibility: 'public' }), target: root }))).toEqual(['postAndComment', 'commentAlone']);
    for (const visibility of ['FRIENDS', 'COMMUNITY', 'PRIVATE', 'EXCEPT', 'ONLY', '', null]) {
      const from = source({ post: makePost({ visibility, media: [{ id: 'pic', kind: 'image' }] }), target: root });
      expect(postCommentCardModes(from)).toEqual(['commentAlone']);
      expect(postCommentCardModes(source({ post: makePost({ visibility }), target: r2 }))).toEqual(['threadToHere', 'chosenReplies']);
      expect(subject(from, 'postAndComment')).toBeNull();
    }
  });
});
