import { describe, it, expect } from '@jest/globals';
import { isRecognizedStoryEffectsShape, remapStoryEffectsMediaIds } from '../storyEffectsMediaRemap';

describe('remapStoryEffectsMediaIds', () => {
  it('remaps mediaObjects[].postMediaId using the id map', () => {
    const effects = { mediaObjects: [{ id: 'el-1', postMediaId: 'old-1', x: 0.5 }] };
    const result = remapStoryEffectsMediaIds(effects, { 'old-1': 'new-1' });

    expect(result.changed).toBe(true);
    expect(result.effects).toEqual({ mediaObjects: [{ id: 'el-1', postMediaId: 'new-1', x: 0.5 }] });
  });

  it('remaps audioPlayerObjects[].postMediaId using the id map', () => {
    const effects = { audioPlayerObjects: [{ id: 'el-2', postMediaId: 'old-audio-1', volume: 0.8 }] };
    const result = remapStoryEffectsMediaIds(effects, { 'old-audio-1': 'new-audio-1' });

    expect(result.changed).toBe(true);
    expect(result.effects).toEqual({ audioPlayerObjects: [{ id: 'el-2', postMediaId: 'new-audio-1', volume: 0.8 }] });
  });

  it('never rewrites the client element "id" field, even if it collides with a mapped key', () => {
    const effects = { mediaObjects: [{ id: 'old-1', postMediaId: 'old-1' }] };
    const result = remapStoryEffectsMediaIds(effects, { 'old-1': 'new-1' });

    expect(result.effects).toEqual({ mediaObjects: [{ id: 'old-1', postMediaId: 'new-1' }] });
  });

  it('leaves postMediaId unchanged when it is absent from the id map', () => {
    const effects = { mediaObjects: [{ id: 'el-1', postMediaId: 'untracked-1' }] };
    const result = remapStoryEffectsMediaIds(effects, { 'old-1': 'new-1' });

    expect(result.changed).toBe(false);
    expect(result.effects).toEqual(effects);
  });

  it('no-ops when effects is undefined', () => {
    const result = remapStoryEffectsMediaIds(undefined, { 'old-1': 'new-1' });

    expect(result).toEqual({ effects: undefined, changed: false });
  });

  it('no-ops when effects has neither mediaObjects nor audioPlayerObjects', () => {
    const effects = { textObjects: [{ id: 'el-1', text: 'hello' }] };
    const result = remapStoryEffectsMediaIds(effects, { 'old-1': 'new-1' });

    expect(result.changed).toBe(false);
    expect(result.effects).toEqual(effects);
  });

  it('remaps multiple entries independently, including a mix of mapped and unmapped ids', () => {
    const effects = {
      mediaObjects: [
        { id: 'el-1', postMediaId: 'old-1' },
        { id: 'el-2', postMediaId: 'untracked' },
        { id: 'el-3', postMediaId: 'old-3' },
      ],
    };
    const result = remapStoryEffectsMediaIds(effects, { 'old-1': 'new-1', 'old-3': 'new-3' });

    expect(result.changed).toBe(true);
    expect(result.effects).toEqual({
      mediaObjects: [
        { id: 'el-1', postMediaId: 'new-1' },
        { id: 'el-2', postMediaId: 'untracked' },
        { id: 'el-3', postMediaId: 'new-3' },
      ],
    });
  });

  it('preserves unrelated storyEffects fields untouched', () => {
    const effects = {
      background: '#000000',
      thumbHash: 'abc123',
      slideDuration: 5,
      textObjects: [{ id: 'txt-1', text: 'hi' }],
      stickerObjects: [{ id: 'sticker-1', emoji: '🔥' }],
      mediaObjects: [{ id: 'el-1', postMediaId: 'old-1' }],
    };
    const result = remapStoryEffectsMediaIds(effects, { 'old-1': 'new-1' });

    expect(result.effects).toEqual({
      background: '#000000',
      thumbHash: 'abc123',
      slideDuration: 5,
      textObjects: [{ id: 'txt-1', text: 'hi' }],
      stickerObjects: [{ id: 'sticker-1', emoji: '🔥' }],
      mediaObjects: [{ id: 'el-1', postMediaId: 'new-1' }],
    });
  });

  describe('v3 canvas blobs (#4883)', () => {
    it('remaps payload.postMediaId inside scenes[].objects[]', () => {
      const effects = {
        v: 3,
        scenes: [{
          id: 's1',
          objects: [{ id: 'o1', kind: 'media', payload: { postMediaId: 'old-1' } }],
        }],
      };
      const result = remapStoryEffectsMediaIds(effects, { 'old-1': 'new-1' });

      expect(result.changed).toBe(true);
      expect(result.effects).toEqual({
        v: 3,
        scenes: [{
          id: 's1',
          objects: [{ id: 'o1', kind: 'media', payload: { postMediaId: 'new-1' } }],
        }],
      });
    });

    it('remaps payload.mediaId (sticker) alongside payload.postMediaId, across multiple scenes', () => {
      const effects = {
        v: 3,
        scenes: [
          { id: 's1', objects: [{ id: 'o1', kind: 'sticker', payload: { mediaId: 'old-1' } }] },
          { id: 's2', objects: [{ id: 'o2', kind: 'media', payload: { postMediaId: 'old-2' } }] },
        ],
      };
      const result = remapStoryEffectsMediaIds(effects, { 'old-1': 'new-1', 'old-2': 'new-2' });

      expect(result.changed).toBe(true);
      expect(result.effects).toEqual({
        v: 3,
        scenes: [
          { id: 's1', objects: [{ id: 'o1', kind: 'sticker', payload: { mediaId: 'new-1' } }] },
          { id: 's2', objects: [{ id: 'o2', kind: 'media', payload: { postMediaId: 'new-2' } }] },
        ],
      });
    });

    it('supports a repost-of-repost: remapping the immediate ancestor\'s ids is enough at each hop', () => {
      // Depth-2 chain: hop 1 already rewrote grandparent's id to parent's id;
      // this call is hop 2, remapping parent's id to this repost's own id.
      const parentEffects = {
        v: 3,
        scenes: [{ id: 's1', objects: [{ id: 'o1', kind: 'media', payload: { postMediaId: 'parent-1' } }] }],
      };
      const result = remapStoryEffectsMediaIds(parentEffects, { 'parent-1': 'grandchild-1' });

      expect(result.changed).toBe(true);
      expect(result.effects).toEqual({
        v: 3,
        scenes: [{ id: 's1', objects: [{ id: 'o1', kind: 'media', payload: { postMediaId: 'grandchild-1' } }] }],
      });
    });

    it('leaves an id unchanged when it is absent from the id map', () => {
      const effects = {
        v: 3,
        scenes: [{ id: 's1', objects: [{ id: 'o1', kind: 'media', payload: { postMediaId: 'untracked-1' } }] }],
      };
      const result = remapStoryEffectsMediaIds(effects, { 'old-1': 'new-1' });

      expect(result.changed).toBe(false);
      expect(result.effects).toEqual(effects);
    });

    it('preserves objects that carry no payload id and unrelated top-level fields', () => {
      const effects = {
        v: 3,
        sound: { source: { t: 'original' }, volume: 1 },
        scenes: [{
          id: 's1',
          objects: [
            { id: 'o1', kind: 'text', payload: { text: 'hi' } },
            { id: 'o2', kind: 'media', payload: { postMediaId: 'old-1' } },
          ],
        }],
      };
      const result = remapStoryEffectsMediaIds(effects, { 'old-1': 'new-1' });

      expect(result.changed).toBe(true);
      expect(result.effects).toEqual({
        v: 3,
        sound: { source: { t: 'original' }, volume: 1 },
        scenes: [{
          id: 's1',
          objects: [
            { id: 'o1', kind: 'text', payload: { text: 'hi' } },
            { id: 'o2', kind: 'media', payload: { postMediaId: 'new-1' } },
          ],
        }],
      });
    });
  });
});

describe('isRecognizedStoryEffectsShape', () => {
  it('recognizes a v3-native blob', () => {
    expect(isRecognizedStoryEffectsShape({ v: 3, scenes: [] })).toBe(true);
  });

  it('recognizes a document from a rank newer than v3 (read tolerantly, like the rest of this file)', () => {
    expect(isRecognizedStoryEffectsShape({ v: 4, scenes: [] })).toBe(true);
  });

  it('recognizes the legacy shape via mediaObjects, even when empty', () => {
    expect(isRecognizedStoryEffectsShape({ mediaObjects: [] })).toBe(true);
  });

  it('recognizes the legacy shape via audioPlayerObjects, even when empty', () => {
    expect(isRecognizedStoryEffectsShape({ audioPlayerObjects: [] })).toBe(true);
  });

  it('does not recognize a blob with neither a v3 marker nor either legacy media key', () => {
    expect(isRecognizedStoryEffectsShape({ textObjects: [{ id: 'el-1', text: 'hi' }] })).toBe(false);
  });

  it('does not recognize undefined, null, or a non-object value', () => {
    expect(isRecognizedStoryEffectsShape(undefined)).toBe(false);
    expect(isRecognizedStoryEffectsShape(null)).toBe(false);
    expect(isRecognizedStoryEffectsShape('not-an-object')).toBe(false);
  });
});
