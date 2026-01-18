/**
 * Video Preferences Schema
 * Appels vidéo, codec, qualité, layout
 */

import { z } from 'zod';

export const VideoPreferenceSchema = z.object({
  // Qualité vidéo
  videoQuality: z.enum(['low', 'medium', 'high', 'auto']).default('auto'),
  videoBitrate: z.number().min(100).max(5000).optional(),
  videoFrameRate: z.enum(['15', '24', '30', '60']).default('30'),
  videoResolution: z.enum(['480p', '720p', '1080p', 'auto']).default('auto'),

  // Codec
  videoCodec: z.enum(['VP8', 'VP9', 'H264', 'H265', 'AV1']).default('VP8'),

  // Camera
  defaultCamera: z.string().optional(),
  mirrorLocalVideo: z.boolean().default(true),

  // Layout
  videoLayout: z.enum(['grid', 'speaker', 'sidebar']).default('speaker'),
  showSelfView: z.boolean().default(true),
  selfViewPosition: z
    .enum(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
    .default('bottom-right'),

  // Features
  backgroundBlurEnabled: z.boolean().default(false),
  virtualBackgroundEnabled: z.boolean().default(false),
  virtualBackgroundUrl: z.string().optional(),

  // Optimisations
  hardwareAccelerationEnabled: z.boolean().default(true),
  adaptiveBitrateEnabled: z.boolean().default(true),

  // Auto-comportements
  autoStartVideo: z.boolean().default(true),
  autoMuteOnJoin: z.boolean().default(false)
});

export type VideoPreference = z.infer<typeof VideoPreferenceSchema>;

export const VIDEO_PREFERENCE_DEFAULTS: VideoPreference = {
  videoQuality: 'auto',
  videoFrameRate: '30',
  videoResolution: 'auto',
  videoCodec: 'VP8',
  mirrorLocalVideo: true,
  videoLayout: 'speaker',
  showSelfView: true,
  selfViewPosition: 'bottom-right',
  backgroundBlurEnabled: false,
  virtualBackgroundEnabled: false,
  hardwareAccelerationEnabled: true,
  adaptiveBitrateEnabled: true,
  autoStartVideo: true,
  autoMuteOnJoin: false
};
