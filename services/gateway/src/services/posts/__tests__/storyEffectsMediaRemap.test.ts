import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { remapStoryEffectsMediaIds } from '../storyEffectsMediaRemap';
import { enhancedLogger } from '../../../utils/logger-enhanced';

// The mocked `child()` closes over a single `log` object created when this
// factory module is first required — every caller (this test AND the
// production module) gets the SAME instance, so `enhancedLogger.child(...)`
// below retrieves the exact object `storyEffectsMediaRemap.ts` logs through.
jest.mock('../../../utils/logger-enhanced', () => {
  const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { enhancedLogger: { child: () => log } };
});

const mockLog = enhancedLogger.child({ module: 'test' }) as unknown as {
  warn: jest.Mock;
  info: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
};

describe('remapStoryEffectsMediaIds', () => {
  beforeEach(() => {
    mockLog.warn.mockClear();
  });

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
    const v3MediaObject = (postMediaId: string) => ({
      id: 'obj-1',
      kind: 'media',
      anchor: { t: 'free', x: 0.5, y: 0.5 },
      plane: 'content',
      z: 0,
      transform: { scale: 1, rotation: 0, opacity: 1 },
      payload: { postMediaId, mediaURL: 'https://example.com/a.jpg' },
    });
    const v3Blob = (postMediaId: string) => ({
      v: 3,
      scenes: [{ id: 's1', objects: [v3MediaObject(postMediaId)] }],
    });

    it('remaps payload.postMediaId inside scenes[].objects[] — the reported bug', () => {
      const effects = v3Blob('old-1');
      const result = remapStoryEffectsMediaIds(effects, { 'old-1': 'new-1' });

      expect(result.changed).toBe(true);
      expect(result.effects).toEqual(v3Blob('new-1'));
    });

    it('remaps payload.mediaId (the sticker/claim key) inside scenes[].objects[]', () => {
      const effects = {
        v: 3,
        scenes: [{
          id: 's1',
          objects: [{
            id: 'sticker-1',
            kind: 'sticker',
            anchor: { t: 'free', x: 0.5, y: 0.5 },
            plane: 'fg',
            z: 0,
            transform: { scale: 1, rotation: 0, opacity: 1 },
            payload: { mediaId: 'old-2' },
          }],
        }],
      };
      const result = remapStoryEffectsMediaIds(effects, { 'old-2': 'new-2' });

      expect(result.changed).toBe(true);
      expect(result.effects).toEqual({
        ...effects,
        scenes: [{ ...effects.scenes[0], objects: [{ ...effects.scenes[0].objects[0], payload: { mediaId: 'new-2' } }] }],
      });
    });

    it('remaps an AUDIO object payload.postMediaId — not only claim-bearing kinds', () => {
      const effects = {
        v: 3,
        scenes: [{
          id: 's1',
          objects: [{
            id: 'audio-1',
            kind: 'audio',
            anchor: { t: 'free', x: 0.5, y: 0.5 },
            plane: 'content',
            z: 0,
            transform: { scale: 1, rotation: 0, opacity: 1 },
            payload: { postMediaId: 'old-audio' },
          }],
        }],
      };
      const result = remapStoryEffectsMediaIds(effects, { 'old-audio': 'new-audio' });

      expect(result.changed).toBe(true);
      expect(result.effects).toEqual({
        ...effects,
        scenes: [{ ...effects.scenes[0], objects: [{ ...effects.scenes[0].objects[0], payload: { postMediaId: 'new-audio' } }] }],
      });
    });

    it('leaves a v3 blob untouched when no id in the map matches', () => {
      const effects = v3Blob('untracked');
      const result = remapStoryEffectsMediaIds(effects, { 'old-1': 'new-1' });

      expect(result.changed).toBe(false);
      expect(result.effects).toEqual(effects);
    });

    it('does not log a warning for a recognized v3 blob, remapped or not', () => {
      remapStoryEffectsMediaIds(v3Blob('old-1'), { 'old-1': 'new-1' });
      remapStoryEffectsMediaIds(v3Blob('untracked'), { 'old-1': 'new-1' });

      expect(mockLog.warn).not.toHaveBeenCalled();
    });

    it('rewrites a repost-of-repost chain — each hop points only at its own media, never an ancestor', () => {
      const root = v3Blob('root-media');

      const hop1 = remapStoryEffectsMediaIds(root, { 'root-media': 'repost1-media' });
      expect(hop1.effects).toEqual(v3Blob('repost1-media'));

      const hop2 = remapStoryEffectsMediaIds(hop1.effects, { 'repost1-media': 'repost2-media' });
      expect(hop2.effects).toEqual(v3Blob('repost2-media'));
      expect(JSON.stringify(hop2.effects)).not.toContain('root-media');
      expect(JSON.stringify(hop2.effects)).not.toContain('repost1-media');
    });
  });

  describe('versioned-but-unrecognized storyEffects (#4883)', () => {
    it('logs a warning instead of silently reporting "nothing to change"', () => {
      const effects = { v: 2, mediaObjects: undefined };
      const result = remapStoryEffectsMediaIds(effects, { 'old-1': 'new-1' });

      expect(result.changed).toBe(false);
      expect(result.effects).toEqual(effects);
      expect(mockLog.warn).toHaveBeenCalledWith(
        expect.stringContaining('not recognized as v3-or-newer'),
        expect.objectContaining({ versionMarker: 2 }),
      );
    });

    it('does not warn for a legacy (unversioned) blob with nothing to remap', () => {
      const effects = { textObjects: [{ id: 'el-1', text: 'hello' }] };
      remapStoryEffectsMediaIds(effects, { 'old-1': 'new-1' });

      expect(mockLog.warn).not.toHaveBeenCalled();
    });
  });
});
