/**
 * video-transcode-plan unit tests
 *
 * All functions are pure — no mocking required.
 *
 * @jest-environment node
 */

import {
  targetVideoBitrateKbps,
  planVideoTranscode,
  buildVideoTranscodeArgs,
  VIDEO_TRANSCODE_DEFAULTS,
} from '../../../services/attachments/video-transcode-plan';

describe('targetVideoBitrateKbps', () => {
  it('returns 600 for 480p', () => expect(targetVideoBitrateKbps(480)).toBe(600));
  it('returns 600 for anything ≤ 480', () => expect(targetVideoBitrateKbps(360)).toBe(600));
  it('returns 1200 for 720p', () => expect(targetVideoBitrateKbps(720)).toBe(1200));
  it('returns 1200 for 481', () => expect(targetVideoBitrateKbps(481)).toBe(1200));
  it('returns 2200 for 1280p', () => expect(targetVideoBitrateKbps(1280)).toBe(2200));
  it('returns 2200 for 721', () => expect(targetVideoBitrateKbps(721)).toBe(2200));
  it('returns 4000 for 1920p', () => expect(targetVideoBitrateKbps(1920)).toBe(4000));
  it('returns 4000 for 1281', () => expect(targetVideoBitrateKbps(1281)).toBe(4000));
  it('returns 6000 for anything > 1920', () => expect(targetVideoBitrateKbps(4096)).toBe(6000));
});

describe('planVideoTranscode', () => {
  const BIG = VIDEO_TRANSCODE_DEFAULTS.minSizeBytes + 1;
  const SMALL = VIDEO_TRANSCODE_DEFAULTS.minSizeBytes - 1;

  it('returns null for files below minSizeBytes', () => {
    expect(planVideoTranscode({ sizeBytes: SMALL })).toBeNull();
  });

  it('returns null for efficient h264 within resolution and bitrate', () => {
    const result = planVideoTranscode({
      sizeBytes: BIG,
      width: 1000,
      height: 600,
      bitrateBps: 1_000_000,
      videoCodec: 'h264',
    });
    expect(result).toBeNull();
  });

  it('returns null for avc1 codec (alias for h264)', () => {
    const result = planVideoTranscode({
      sizeBytes: BIG,
      width: 500,
      height: 400,
      bitrateBps: 500_000,
      videoCodec: 'avc1',
    });
    expect(result).toBeNull();
  });

  it('returns plan when video is oversized', () => {
    const result = planVideoTranscode({
      sizeBytes: BIG,
      width: 3840,
      height: 2160,
      videoCodec: 'h264',
    });
    expect(result).not.toBeNull();
    expect(result!.maxLongSide).toBe(VIDEO_TRANSCODE_DEFAULTS.maxLongSide);
  });

  it('returns plan when bitrate exceeds target × margin', () => {
    const result = planVideoTranscode({
      sizeBytes: BIG,
      width: 1000,
      height: 500,
      bitrateBps: 100_000_000,
      videoCodec: 'h264',
    });
    expect(result).not.toBeNull();
  });

  it('returns plan for non-h264 codec (hevc)', () => {
    const result = planVideoTranscode({
      sizeBytes: BIG,
      width: 1000,
      height: 600,
      bitrateBps: 500_000,
      videoCodec: 'hevc',
    });
    expect(result).not.toBeNull();
  });

  it('returns plan for vp9 codec', () => {
    const result = planVideoTranscode({
      sizeBytes: BIG,
      videoCodec: 'vp9',
    });
    expect(result).not.toBeNull();
  });

  it('uses maxLongSide when no dimensions provided', () => {
    const result = planVideoTranscode({
      sizeBytes: BIG,
      videoCodec: 'hevc',
    });
    expect(result).not.toBeNull();
    expect(result!.maxLongSide).toBe(VIDEO_TRANSCODE_DEFAULTS.maxLongSide);
  });

  it('caps cappedLongSide to maxLongSide when source is larger', () => {
    const result = planVideoTranscode({
      sizeBytes: BIG,
      width: 4096,
      height: 2160,
      videoCodec: 'vp9',
    });
    expect(result!.maxLongSide).toBe(VIDEO_TRANSCODE_DEFAULTS.maxLongSide);
  });

  it('respects custom options', () => {
    const result = planVideoTranscode(
      { sizeBytes: BIG, videoCodec: 'hevc', width: 500, height: 300 },
      { maxLongSide: 720, audioBitrateKbps: 64, crf: 28 }
    );
    expect(result).not.toBeNull();
    expect(result!.maxLongSide).toBe(720);
    expect(result!.targetAudioBitrateKbps).toBe(64);
    expect(result!.crf).toBe(28);
  });

  it('returns null when custom minSizeBytes is large enough to skip', () => {
    const result = planVideoTranscode(
      { sizeBytes: 500_000 },
      { minSizeBytes: 1_000_000 }
    );
    expect(result).toBeNull();
  });

  it('plan includes correct targetVideoBitrateKbps', () => {
    const result = planVideoTranscode({
      sizeBytes: BIG,
      width: 1920,
      height: 1080,
      videoCodec: 'vp9',
    });
    expect(result!.targetVideoBitrateKbps).toBe(targetVideoBitrateKbps(1280));
  });
});

describe('buildVideoTranscodeArgs', () => {
  const plan = {
    maxLongSide: 1280,
    targetVideoBitrateKbps: 2200,
    targetAudioBitrateKbps: 96,
    crf: 26,
  };

  it('includes input and output paths', () => {
    const args = buildVideoTranscodeArgs('/tmp/input.mp4', '/tmp/output.mp4', plan);
    expect(args).toContain('/tmp/input.mp4');
    expect(args).toContain('/tmp/output.mp4');
  });

  it('uses libx264 codec', () => {
    const args = buildVideoTranscodeArgs('/in', '/out', plan);
    expect(args).toContain('libx264');
  });

  it('sets crf from plan', () => {
    const args = buildVideoTranscodeArgs('/in', '/out', plan);
    const crfIdx = args.indexOf('-crf');
    expect(args[crfIdx + 1]).toBe('26');
  });

  it('sets maxrate from plan', () => {
    const args = buildVideoTranscodeArgs('/in', '/out', plan);
    const idx = args.indexOf('-maxrate');
    expect(args[idx + 1]).toBe('2200k');
  });

  it('sets audio bitrate from plan', () => {
    const args = buildVideoTranscodeArgs('/in', '/out', plan);
    const idx = args.indexOf('-b:a');
    expect(args[idx + 1]).toBe('96k');
  });

  it('includes +faststart for progressive playback', () => {
    const args = buildVideoTranscodeArgs('/in', '/out', plan);
    expect(args).toContain('+faststart');
  });

  it('includes aac audio codec', () => {
    const args = buildVideoTranscodeArgs('/in', '/out', plan);
    expect(args).toContain('aac');
  });

  it('includes -y flag to overwrite output', () => {
    const args = buildVideoTranscodeArgs('/in', '/out', plan);
    expect(args).toContain('-y');
  });

  it('scale filter uses maxLongSide from plan', () => {
    const args = buildVideoTranscodeArgs('/in', '/out', plan);
    const vfArg = args[args.indexOf('-vf') + 1];
    expect(vfArg).toContain('1280');
  });
});
