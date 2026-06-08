/**
 * D-video bandwidth — decide whether an uploaded video is worth transcoding and
 * to what target, then build the exact ffmpeg argv. Both functions are PURE so
 * the (tricky) decision + command can be unit-tested without spawning ffmpeg or
 * touching the filesystem.
 *
 * Rationale: videos are currently stored verbatim (up to multi-GB). Re-encoding
 * an oversized / inefficiently-coded clip to a capped-resolution H.264 mp4 with
 * `+faststart` typically cuts delivery weight 5–20× and makes it progressively
 * streamable — every viewer downloads the lighter file.
 */

export interface VideoSourceMeta {
  readonly width?: number;
  readonly height?: number;
  /** Overall/video bitrate in bits per second (from ffprobe). */
  readonly bitrateBps?: number;
  /** Source video codec, lowercased (e.g. 'h264', 'hevc', 'vp9'). */
  readonly videoCodec?: string;
  readonly sizeBytes: number;
}

export interface VideoTranscodePlan {
  /** Cap for the LONGEST side (px); aspect ratio preserved, never upscaled. */
  readonly maxLongSide: number;
  readonly targetVideoBitrateKbps: number;
  readonly targetAudioBitrateKbps: number;
  readonly crf: number;
}

export interface VideoTranscodeOptions {
  readonly maxLongSide?: number;
  readonly audioBitrateKbps?: number;
  readonly crf?: number;
  /** Below this source size, skip transcoding (encode cost not worth it). */
  readonly minSizeBytes?: number;
  /** Only transcode when source bitrate exceeds target × this margin. */
  readonly bitrateMargin?: number;
}

export const VIDEO_TRANSCODE_DEFAULTS: Required<VideoTranscodeOptions> = {
  maxLongSide: 1280, // 720p-class delivery
  audioBitrateKbps: 96,
  crf: 26,
  minSizeBytes: 2 * 1024 * 1024, // 2 MB
  bitrateMargin: 1.2,
};

/** Target video bitrate (kbps) for a capped long side — conservative H.264 ladder. */
export function targetVideoBitrateKbps(longSide: number): number {
  if (longSide <= 480) return 600;
  if (longSide <= 720) return 1200;
  if (longSide <= 1280) return 2200;
  if (longSide <= 1920) return 4000;
  return 6000;
}

/**
 * Decide whether to transcode. Returns a plan, or `null` when the source is
 * already small/efficient enough that re-encoding wouldn't pay off.
 */
export function planVideoTranscode(
  meta: VideoSourceMeta,
  options?: VideoTranscodeOptions
): VideoTranscodePlan | null {
  const o = { ...VIDEO_TRANSCODE_DEFAULTS, ...options };

  // Too small to bother (encode CPU > savings).
  if (meta.sizeBytes < o.minSizeBytes) return null;

  const longSide =
    meta.width && meta.height ? Math.max(meta.width, meta.height) : undefined;

  const cappedLongSide = longSide ? Math.min(longSide, o.maxLongSide) : o.maxLongSide;
  const targetKbps = targetVideoBitrateKbps(cappedLongSide);

  const codec = (meta.videoCodec ?? '').toLowerCase();
  const isEfficientCodec = codec === 'h264' || codec === 'avc1';
  const oversized = longSide !== undefined && longSide > o.maxLongSide;
  const overBitrate =
    meta.bitrateBps !== undefined && meta.bitrateBps / 1000 > targetKbps * o.bitrateMargin;

  // Already H.264, within the resolution cap, and not over-bitrate → leave as is.
  if (isEfficientCodec && !oversized && !overBitrate) return null;

  return {
    maxLongSide: o.maxLongSide,
    targetVideoBitrateKbps: targetKbps,
    targetAudioBitrateKbps: o.audioBitrateKbps,
    crf: o.crf,
  };
}

/**
 * Build the ffmpeg argv to apply a plan: H.264 + AAC, fit-within-box scale with
 * even dimensions, capped bitrate, and `+faststart` so the moov atom is at the
 * front for progressive playback.
 */
export function buildVideoTranscodeArgs(
  inputPath: string,
  outputPath: string,
  plan: VideoTranscodePlan
): string[] {
  const L = plan.maxLongSide;
  const scale =
    `scale='min(${L},iw)':'min(${L},ih)':force_original_aspect_ratio=decrease,` +
    `scale=trunc(iw/2)*2:trunc(ih/2)*2`;
  const v = plan.targetVideoBitrateKbps;
  return [
    '-i', inputPath,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', String(plan.crf),
    '-maxrate', `${v}k`,
    '-bufsize', `${v * 2}k`,
    '-vf', scale,
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', `${plan.targetAudioBitrateKbps}k`,
    '-movflags', '+faststart',
    '-y', outputPath,
  ];
}
