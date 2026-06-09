import {
  planVideoTranscode,
  buildVideoTranscodeArgs,
  targetVideoBitrateKbps,
  VIDEO_TRANSCODE_DEFAULTS,
} from '../video-transcode-plan';

const MB = 1024 * 1024;

describe('targetVideoBitrateKbps', () => {
  it('follows a conservative H.264 ladder', () => {
    expect(targetVideoBitrateKbps(360)).toBe(600);
    expect(targetVideoBitrateKbps(720)).toBe(1200);
    expect(targetVideoBitrateKbps(1280)).toBe(2200);
    expect(targetVideoBitrateKbps(1920)).toBe(4000);
    expect(targetVideoBitrateKbps(3840)).toBe(6000);
  });
});

describe('planVideoTranscode', () => {
  it('skips tiny files', () => {
    expect(planVideoTranscode({ sizeBytes: 1 * MB, width: 1920, height: 1080 })).toBeNull();
  });

  it('skips an already-efficient h264 clip within the cap', () => {
    expect(
      planVideoTranscode({
        sizeBytes: 10 * MB,
        width: 1280,
        height: 720,
        videoCodec: 'h264',
        bitrateBps: 2_000_000,
      })
    ).toBeNull();
  });

  it('transcodes an oversized resolution even if h264', () => {
    const plan = planVideoTranscode({
      sizeBytes: 50 * MB,
      width: 3840,
      height: 2160,
      videoCodec: 'h264',
      bitrateBps: 3_000_000,
    });
    expect(plan).not.toBeNull();
    expect(plan!.maxLongSide).toBe(1280);
    expect(plan!.targetVideoBitrateKbps).toBe(2200);
  });

  it('transcodes an over-bitrate clip within the cap', () => {
    const plan = planVideoTranscode({
      sizeBytes: 50 * MB,
      width: 1280,
      height: 720,
      videoCodec: 'h264',
      bitrateBps: 8_000_000, // way over the 1200k target
    });
    expect(plan).not.toBeNull();
  });

  it('transcodes a non-h264 codec (e.g. hevc/vp9) to h264', () => {
    expect(
      planVideoTranscode({ sizeBytes: 20 * MB, width: 1280, height: 720, videoCodec: 'hevc', bitrateBps: 1_000_000 })
    ).not.toBeNull();
    expect(
      planVideoTranscode({ sizeBytes: 20 * MB, width: 640, height: 480, videoCodec: 'vp9', bitrateBps: 400_000 })
    ).not.toBeNull();
  });

  it('uses the capped long side to pick the target bitrate (portrait)', () => {
    const plan = planVideoTranscode({
      sizeBytes: 50 * MB,
      width: 1080,
      height: 1920, // portrait → long side 1920 > cap
      videoCodec: 'hevc',
    });
    expect(plan!.targetVideoBitrateKbps).toBe(targetVideoBitrateKbps(VIDEO_TRANSCODE_DEFAULTS.maxLongSide));
  });
});

describe('buildVideoTranscodeArgs', () => {
  const plan = { maxLongSide: 1280, targetVideoBitrateKbps: 2200, targetAudioBitrateKbps: 96, crf: 26 };

  it('produces a valid H.264 + AAC + faststart argv', () => {
    const args = buildVideoTranscodeArgs('/in.mov', '/out.mp4', plan);
    expect(args[0]).toBe('-i');
    expect(args[1]).toBe('/in.mov');
    expect(args).toContain('libx264');
    expect(args).toContain('-movflags');
    expect(args[args.indexOf('-movflags') + 1]).toBe('+faststart');
    expect(args[args.length - 1]).toBe('/out.mp4');
    expect(args).toContain('-maxrate');
    expect(args[args.indexOf('-maxrate') + 1]).toBe('2200k');
    expect(args[args.indexOf('-bufsize') + 1]).toBe('4400k');
    expect(args[args.indexOf('-b:a') + 1]).toBe('96k');
  });

  it('caps both dimensions to a fit-within box with even sizes', () => {
    const args = buildVideoTranscodeArgs('/in.mp4', '/out.mp4', plan);
    const vf = args[args.indexOf('-vf') + 1];
    expect(vf).toContain("force_original_aspect_ratio=decrease");
    expect(vf).toContain('trunc(iw/2)*2');
    expect(vf).toContain('min(1280,iw)');
    expect(vf).toContain('min(1280,ih)');
  });
});
