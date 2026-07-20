import {
  authorSelect,
  mediaSelect,
  mediaInclude,
  commentMediaInclude,
  commentsPreviewInclude,
  repostOfInclude,
  postInclude,
} from '../postIncludes';

describe('posts/postIncludes — canonical shared selects', () => {
  describe('authorSelect', () => {
    it('exposes exactly the public author identity fields', () => {
      expect(Object.keys(authorSelect).sort()).toEqual(
        ['avatar', 'displayName', 'id', 'username'].sort(),
      );
      expect(authorSelect).toEqual({
        id: true,
        username: true,
        displayName: true,
        avatar: true,
      });
    });
  });

  describe('mediaSelect — Prisme Linguistique guarantees', () => {
    it('includes the four Prisme Linguistique fields', () => {
      // These MUST be present on every Post media response; their absence
      // is the bug R1 fixed in PostFeedService — covering it here prevents
      // a future contributor from silently re-introducing the drift.
      expect(mediaSelect).toEqual(
        expect.objectContaining({
          language: true,
          variantOf: true,
          transcription: true,
          translations: true,
        }),
      );
    });

    it('keeps the canonical file + display fields', () => {
      expect(mediaSelect).toEqual(
        expect.objectContaining({
          id: true,
          fileName: true,
          originalName: true,
          mimeType: true,
          fileSize: true,
          fileUrl: true,
          width: true,
          height: true,
          thumbnailUrl: true,
          thumbHash: true,
          duration: true,
          order: true,
          caption: true,
          alt: true,
        }),
      );
    });

    it('selects every documented field — guards against silent omission', () => {
      const expectedKeys = [
        'id',
        'fileName',
        'originalName',
        'mimeType',
        'fileSize',
        'fileUrl',
        'width',
        'height',
        'thumbnailUrl',
        'thumbHash',
        'duration',
        'order',
        'caption',
        'alt',
        'language',
        'variantOf',
        'transcription',
        'translations',
      ];
      expect(Object.keys(mediaSelect).sort()).toEqual(expectedKeys.sort());
    });
  });

  describe('mediaInclude', () => {
    it('binds mediaSelect with ascending order', () => {
      expect(mediaInclude).toEqual({
        select: mediaSelect,
        orderBy: { order: 'asc' },
      });
    });
  });

  describe('commentsPreviewInclude — legacy MongoDB compat', () => {
    it('uses OR isSet:false to surface comments missing the parentId field', () => {
      // MongoDB documents created before parentId was added to the schema have
      // no parentId field at all — a bare `parentId: null` filter excludes them.
      // PostAudioService used to drop the OR clause, silently filtering them
      // out of the `post:updated` broadcast. The shared shape MUST keep both.
      expect(commentsPreviewInclude.where).toEqual({
        // Live comments have NO `deletedAt` key on MongoDB — match on isSet,
        // not a bare null (which silently drops every undeleted comment).
        deletedAt: { isSet: false },
        OR: [{ parentId: null }, { parentId: { isSet: false } }],
      });
    });

    it('takes 3 top-liked comments per post', () => {
      expect(commentsPreviewInclude.take).toBe(3);
      expect(commentsPreviewInclude.orderBy).toEqual({ likeCount: 'desc' });
    });

    it('includes author identity on every comment preview', () => {
      expect(commentsPreviewInclude.select.author).toEqual({ select: authorSelect });
    });

    it('surfaces translations + originalLanguage so the Prisme resolver can render', () => {
      expect(commentsPreviewInclude.select).toEqual(
        expect.objectContaining({
          originalLanguage: true,
          translations: true,
        }),
      );
    });

    it('embeds the comment media preview so a comment attachment survives reload', () => {
      // The comments-with-media bug: a comment attachment (image/video/audio,
      // incl. its transcription + per-language TTS variants) showed live (via
      // the comment:added / comment:media-updated socket payloads, which DO
      // carry media) but vanished on reload, because the post-embedded comment
      // preview — the ONLY source the feed/reels comments sheet reads for
      // top-level comments — dropped the media relation. It also stripped media
      // from the post:updated broadcast contacts receive. Reuse the canonical
      // commentMediaInclude so the preview decodes identically to getComments.
      expect(commentsPreviewInclude.select.media).toBe(commentMediaInclude);
    });
  });

  describe('repostOfInclude — Prisme on reposts', () => {
    it('includes originalLanguage + translations on the reposted post', () => {
      // PostAudioService used to drop these — see R3. Reposts then rendered
      // only in the source language, breaking translation for every user
      // whose preferred language differed from the original.
      expect(repostOfInclude.select).toEqual(
        expect.objectContaining({
          originalLanguage: true,
          translations: true,
        }),
      );
    });

    it('embeds the canonical mediaInclude (Prisme on attached media too)', () => {
      expect(repostOfInclude.select.media).toBe(mediaInclude);
    });

    it('exposes the full set of repost preview fields', () => {
      expect(Object.keys(repostOfInclude.select).sort()).toEqual(
        [
          'id',
          'type',
          'content',
          'originalLanguage',
          'translations',
          'storyEffects',
          'audioUrl',
          'moodEmoji',
          'originalRepostOfId',
          'author',
          'media',
          'createdAt',
          'likeCount',
          'commentCount',
        ].sort(),
      );
    });
  });

  describe('postInclude — canonical hydration', () => {
    it('composes the four shared building blocks', () => {
      expect(postInclude).toEqual({
        author: { select: authorSelect },
        media: mediaInclude,
        comments: commentsPreviewInclude,
        repostOf: repostOfInclude,
      });
    });
  });
});
