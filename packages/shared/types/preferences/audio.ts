/**
 * Audio Preferences Schema
 * Paramètres audio, transcription, traduction vocale, TTS
 */

import { z } from 'zod';

export const AudioPreferenceSchema = z.object({
  // Transcription
  transcriptionEnabled: z.boolean().default(true),
  transcriptionSource: z.enum(['auto', 'mobile', 'server']).default('auto'),
  autoTranscribeIncoming: z.boolean().default(false),

  // Traduction audio
  audioTranslationEnabled: z.boolean().default(false),
  translatedAudioFormat: z.enum(['mp3', 'wav', 'ogg']).default('mp3'),

  // Text-to-Speech
  ttsEnabled: z.boolean().default(false),
  ttsVoice: z.string().optional(),
  ttsSpeed: z.number().min(0.5).max(2.0).default(1.0),
  ttsPitch: z.number().min(0.5).max(2.0).default(1.0),

  // Qualité audio
  audioQuality: z.enum(['low', 'medium', 'high', 'lossless']).default('high'),
  noiseSuppression: z.boolean().default(true),
  echoCancellation: z.boolean().default(true),

  // Voice Profile
  voiceProfileEnabled: z.boolean().default(false),
  voiceCloneQuality: z.enum(['fast', 'balanced', 'quality']).default('balanced')
});

export type AudioPreference = z.infer<typeof AudioPreferenceSchema>;

export const AUDIO_PREFERENCE_DEFAULTS: AudioPreference = {
  transcriptionEnabled: true,
  transcriptionSource: 'auto',
  autoTranscribeIncoming: false,
  audioTranslationEnabled: false,
  translatedAudioFormat: 'mp3',
  ttsEnabled: false,
  ttsSpeed: 1.0,
  ttsPitch: 1.0,
  audioQuality: 'high',
  noiseSuppression: true,
  echoCancellation: true,
  voiceProfileEnabled: false,
  voiceCloneQuality: 'balanced'
};
