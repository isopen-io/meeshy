import { authorSelect, mediaSelect, mediaInclude } from '../postIncludes';

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
});
