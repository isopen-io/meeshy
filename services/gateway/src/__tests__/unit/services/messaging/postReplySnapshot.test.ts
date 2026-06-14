/**
 * postReplySnapshot — helpers purs du snapshot figé d'une réponse à un post.
 *
 * Quand on répond à un post (STATUS mood / STORY / REEL / POST), les détails du
 * post cité (mood emoji, contenu, date, vignette, compteurs like/commentaire/
 * partage) sont GELÉS au moment de la réponse dans `metadata.postReplyTo`. Ces
 * tests verrouillent la capture, la normalisation et la lecture depuis
 * metadata — c'est ce qui fait survivre la citation à l'expiration du post.
 *
 * @jest-environment node
 */
import {
  buildPostReplyTo,
  normalizePostReplyTo,
  postReplyToFromMetadata,
  type PostReplySnapshotablePost,
} from '../../../../services/messaging/postReplySnapshot';

function makePost(overrides: Partial<PostReplySnapshotablePost> = {}): PostReplySnapshotablePost {
  return {
    id: 'post-1',
    type: 'STORY',
    content: 'Coucher de soleil à Douala',
    moodEmoji: null,
    reactionCount: 5,
    commentCount: 2,
    shareCount: 1,
    createdAt: new Date('2026-06-14T10:00:00.000Z'),
    media: [{ thumbnailUrl: 'https://cdn/thumb.jpg' }],
    ...overrides,
  };
}

describe('buildPostReplyTo — STATUS (mood)', () => {
  it('gèle emoji, contenu et date du mood', () => {
    const snap = buildPostReplyTo(
      makePost({ type: 'STATUS', moodEmoji: '😴', content: 'en forme', media: [], reactionCount: 0, commentCount: 0, shareCount: 0 })
    );
    expect(snap.type).toBe('STATUS');
    expect(snap.moodEmoji).toBe('😴');
    expect(snap.previewText).toBe('en forme');
    expect(snap.createdAt).toBe('2026-06-14T10:00:00.000Z');
    expect(snap.thumbnailUrl).toBeNull();
  });
});

describe('buildPostReplyTo — STORY', () => {
  it('gèle vignette, date et compteurs like/commentaire/partage capturés', () => {
    const snap = buildPostReplyTo(makePost());
    expect(snap.type).toBe('STORY');
    expect(snap.moodEmoji).toBeNull();
    expect(snap.thumbnailUrl).toBe('https://cdn/thumb.jpg');
    expect(snap.reactionCount).toBe(5);
    expect(snap.commentCount).toBe(2);
    expect(snap.shareCount).toBe(1);
    expect(snap.previewText).toBe('Coucher de soleil à Douala');
    // Forme wire directe : clé `id`, pas `postId`.
    expect(snap).toHaveProperty('id', 'post-1');
    expect(snap).not.toHaveProperty('postId');
  });

  it('tronque le previewText à 80 caractères', () => {
    expect(buildPostReplyTo(makePost({ content: 'x'.repeat(200) })).previewText).toHaveLength(80);
  });

  it('tolère compteurs/contenu/média absents (defaults sûrs)', () => {
    const snap = buildPostReplyTo(
      makePost({ content: null, reactionCount: null, commentCount: null, shareCount: null, media: [] })
    );
    expect(snap.previewText).toBe('');
    expect(snap.reactionCount).toBe(0);
    expect(snap.commentCount).toBe(0);
    expect(snap.shareCount).toBe(0);
    expect(snap.thumbnailUrl).toBeNull();
  });
});

describe('normalizePostReplyTo — relecture depuis le Json persisté', () => {
  it('survie à l\'expiration : le snapshot suffit, sans relire le post', () => {
    // Forme telle qu'elle sort de metadata.postReplyTo (JSON désérialisé) —
    // aucune dépendance au post live, qui peut avoir expiré/été supprimé.
    const persisted = {
      id: 'gone-post',
      type: 'STATUS',
      moodEmoji: '😴',
      previewText: 'message du status',
      thumbnailUrl: null,
      reactionCount: 0,
      commentCount: 0,
      shareCount: 0,
      createdAt: '2026-06-14T09:00:00.000Z',
    };
    const wire = normalizePostReplyTo(persisted);
    expect(wire?.id).toBe('gone-post');
    expect(wire?.moodEmoji).toBe('😴');
    expect(wire?.previewText).toBe('message du status');
  });

  it('retourne null pour un snapshot absent ou malformé (→ fallback live)', () => {
    expect(normalizePostReplyTo(null)).toBeNull();
    expect(normalizePostReplyTo(undefined)).toBeNull();
    expect(normalizePostReplyTo('nope')).toBeNull();
    expect(normalizePostReplyTo({})).toBeNull();
    expect(normalizePostReplyTo({ type: 'STORY' })).toBeNull(); // pas d'id
  });
});

describe('postReplyToFromMetadata — lecture depuis le blob metadata', () => {
  it('extrait metadata.postReplyTo', () => {
    const metadata = { postReplyTo: buildPostReplyTo(makePost({ type: 'STATUS', moodEmoji: '🔥' })) };
    expect(postReplyToFromMetadata(metadata)?.moodEmoji).toBe('🔥');
  });

  it('retourne null quand metadata ne porte pas de postReplyTo (ex: call-summary)', () => {
    expect(postReplyToFromMetadata({ callSummary: { direction: 'incoming' } })).toBeNull();
    expect(postReplyToFromMetadata(null)).toBeNull();
    expect(postReplyToFromMetadata({})).toBeNull();
  });
});
