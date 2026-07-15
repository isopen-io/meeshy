import { describe, it, expect } from '@jest/globals';
import { remapStoryEffectsMediaIds } from '../storyEffectsMediaRemap';

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
});
