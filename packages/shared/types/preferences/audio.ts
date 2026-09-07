/**
 * Audio Preferences Schema
 * Paramètres audio, transcription, traduction vocale, TTS
 */

import { z } from 'zod';
import { VOICE_CLONING_QUALITY_PRESETS } from '../voice-api';

/**
 * Le preset de qualité du clonage vocal FIN (`voiceCloningQualityPreset`) est le
 * même type que `VoiceCloningQualityPreset` (`../voice-api.ts`), qui gouverne
 * déjà `VoiceProfileService.registerProfile()` et les presets ZMQ
 * (`services/gateway/src/types/translation.types.ts`). Ne pas en redéclarer un
 * second : `voiceCloneQuality` ci-dessous porte 'quality' (pas 'high_quality')
 * pour une raison différente — c'est le préréglage SIMPLE déjà exposé par
 * l'écran web (`audio-settings.tsx`), distinct des cinq réglages fins
 * `voiceCloning*` (#3735).
 */

export const AudioPreferenceSchema = z.object({
  // Transcription
  transcriptionEnabled: z.boolean().default(true),
  transcriptionSource: z.enum(['auto', 'mobile', 'server']).default('auto'),
  autoTranscribeIncoming: z.boolean().default(false),

  // Traduction audio
  audioTranslationEnabled: z.boolean().default(true),
  translatedAudioFormat: z.enum(['mp3', 'wav', 'ogg']).default('mp3'),

  // Text-to-Speech
  ttsEnabled: z.boolean().default(true),
  ttsVoice: z.string().optional(),
  ttsSpeed: z.number().min(0.5).max(2.0).default(1.0),
  ttsPitch: z.number().min(0.5).max(2.0).default(1.0),

  // Qualité audio
  audioQuality: z.enum(['low', 'medium', 'high', 'lossless']).default('high'),
  noiseSuppression: z.boolean().default(true),
  echoCancellation: z.boolean().default(true),

  // Voice Profile
  voiceProfileEnabled: z.boolean().default(false),
  voiceCloneQuality: z.enum(['fast', 'balanced', 'quality']).default('balanced'),

  /**
   * Réglages fins du clonage vocal (Chatterbox TTS), écrits par
   * `VoiceProfileService.registerProfile()`/`updateSettings()` (#3735) et lus
   * à la composition de la requête TTS
   * (`MessageTranslationService.processAudioAttachment()` →
   * `AudioProcessRequest.voiceCloneParams.chatterbox`). Bornes alignées sur
   * `validateChatterboxParams` (`services/gateway/src/types/translation.types.ts`).
   */
  voiceCloningExaggeration: z.number().min(0).max(1).default(0.5),
  voiceCloningCfgWeight: z.number().min(0).max(1).default(0.5),
  voiceCloningTemperature: z.number().min(0.1).max(2).default(1.0),
  voiceCloningTopP: z.number().min(0).max(1).default(0.9),
  voiceCloningQualityPreset: z.enum(VOICE_CLONING_QUALITY_PRESETS).default('balanced'),

  /**
   * Le canal de COMPATIBILITÉ ASCENDANTE, déclaré (#4589).
   *
   * Les sept blocs de préférences du SDK iOS le portent
   * (`PreferenceModels.swift`), et iOS encode le bloc ENTIER comme corps de
   * requête (`UserPreferencesManager`, `try encoder.encode(privacy)`). Il
   * arrivait donc sur chaque écriture, et le mode *strip* de Zod le retirait :
   * mesuré sur staging le 2026-08-31, un `PATCH {"extras":{"sonde":"4589"}}`
   * rendait `success: true` et la relecture ne rendait RIEN. Le canal de
   * compatibilité ascendante d'iOS n'a jamais fonctionné.
   *
   * Le déclarer a deux effets, et le second est celui qui compte : il rend au
   * client son aller-retour, et il permet à la frontière de REFUSER tout le
   * reste (`.strict()` dans `submittedFrom`) sans casser les trois clients.
   * Une porte de sortie nommée est ce qui autorise à fermer les autres.
   *
   * Facultatif et SANS défaut : il ne doit apparaître dans un document servi
   * que si quelque chose y a été stocké — sinon les sept catégories gagneraient
   * un `extras: {}` que ni le web ni Android n'attendent.
   */
  extras: z.record(z.string(), z.unknown()).optional(),
});

export type AudioPreference = z.infer<typeof AudioPreferenceSchema>;

export const AUDIO_PREFERENCE_DEFAULTS: AudioPreference = {
  transcriptionEnabled: true,
  transcriptionSource: 'auto',
  autoTranscribeIncoming: false,
  audioTranslationEnabled: true,
  translatedAudioFormat: 'mp3',
  ttsEnabled: true,
  ttsSpeed: 1.0,
  ttsPitch: 1.0,
  audioQuality: 'high',
  noiseSuppression: true,
  echoCancellation: true,
  voiceProfileEnabled: false,
  voiceCloneQuality: 'balanced',
  voiceCloningExaggeration: 0.5,
  voiceCloningCfgWeight: 0.5,
  voiceCloningTemperature: 1.0,
  voiceCloningTopP: 0.9,
  voiceCloningQualityPreset: 'balanced'
};
