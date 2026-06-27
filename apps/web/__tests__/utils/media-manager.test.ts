/**
 * Tests for utils/media-manager.ts
 */

import MediaManager from '@/utils/media-manager';

const makeMockMedia = () => ({
  pause: jest.fn(),
  currentTime: 0,
}) as unknown as HTMLAudioElement;

// Reset singleton state before each test
beforeEach(() => {
  MediaManager.getInstance().stopAll();
});

// ─── singleton ────────────────────────────────────────────────────────────────

describe('getInstance', () => {
  it('returns the same instance each time', () => {
    expect(MediaManager.getInstance()).toBe(MediaManager.getInstance());
  });
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('returns null when no media is registered', () => {
    expect(MediaManager.getInstance().getCurrentMedia()).toBeNull();
  });

  it('isPlaying returns false for any media when nothing is playing', () => {
    const media = makeMockMedia();
    expect(MediaManager.getInstance().isPlaying(media)).toBe(false);
  });
});

// ─── play ─────────────────────────────────────────────────────────────────────

describe('play', () => {
  it('registers the new media as current', () => {
    const media = makeMockMedia();
    MediaManager.getInstance().play(media, 'audio');
    const current = MediaManager.getInstance().getCurrentMedia();
    expect(current?.media).toBe(media);
    expect(current?.type).toBe('audio');
  });

  it('isPlaying returns true for the currently registered media', () => {
    const media = makeMockMedia();
    MediaManager.getInstance().play(media, 'audio');
    expect(MediaManager.getInstance().isPlaying(media)).toBe(true);
  });

  it('pauses the previous media when a new one starts playing', () => {
    const first = makeMockMedia();
    const second = makeMockMedia();
    MediaManager.getInstance().play(first, 'audio');
    MediaManager.getInstance().play(second, 'video');
    expect(first.pause).toHaveBeenCalled();
  });

  it('resets currentTime to 0 on the previous media', () => {
    const first = makeMockMedia();
    (first as any).currentTime = 5;
    const second = makeMockMedia();
    MediaManager.getInstance().play(first, 'audio');
    MediaManager.getInstance().play(second, 'audio');
    expect(first.currentTime).toBe(0);
  });

  it('does not pause when the same media plays again', () => {
    const media = makeMockMedia();
    MediaManager.getInstance().play(media, 'audio');
    MediaManager.getInstance().play(media, 'audio');
    expect(media.pause).not.toHaveBeenCalled();
  });

  it('records the correct media type', () => {
    const media = makeMockMedia();
    MediaManager.getInstance().play(media, 'video');
    expect(MediaManager.getInstance().getCurrentMedia()?.type).toBe('video');
  });
});

// ─── stop ─────────────────────────────────────────────────────────────────────

describe('stop', () => {
  it('clears the current media when the registered media is stopped', () => {
    const media = makeMockMedia();
    MediaManager.getInstance().play(media, 'audio');
    MediaManager.getInstance().stop(media);
    expect(MediaManager.getInstance().getCurrentMedia()).toBeNull();
  });

  it('is a no-op when stopping a different media than the current one', () => {
    const first = makeMockMedia();
    const second = makeMockMedia();
    MediaManager.getInstance().play(first, 'audio');
    MediaManager.getInstance().stop(second);
    expect(MediaManager.getInstance().getCurrentMedia()?.media).toBe(first);
  });

  it('isPlaying returns false after stopping', () => {
    const media = makeMockMedia();
    MediaManager.getInstance().play(media, 'audio');
    MediaManager.getInstance().stop(media);
    expect(MediaManager.getInstance().isPlaying(media)).toBe(false);
  });
});

// ─── stopAll ──────────────────────────────────────────────────────────────────

describe('stopAll', () => {
  it('pauses the current media', () => {
    const media = makeMockMedia();
    MediaManager.getInstance().play(media, 'audio');
    MediaManager.getInstance().stopAll();
    expect(media.pause).toHaveBeenCalled();
  });

  it('clears current media reference', () => {
    const media = makeMockMedia();
    MediaManager.getInstance().play(media, 'audio');
    MediaManager.getInstance().stopAll();
    expect(MediaManager.getInstance().getCurrentMedia()).toBeNull();
  });

  it('is a no-op when no media is registered', () => {
    expect(() => MediaManager.getInstance().stopAll()).not.toThrow();
  });
});
