/**
 * Effets audio d'un appel — sortis de `video-call.ts` (hors budget de taille,
 * #8063) et ré-exportés par lui : les imports existants ne changent pas.
 */

/**
 * Types d'effets audio disponibles
 */
export type AudioEffectType = 'voice-coder' | 'baby-voice' | 'demon-voice' | 'back-sound';

/**
 * Mode de loop pour le back sound
 */
export type LoopMode = 'N_TIMES' | 'N_MINUTES';

/**
 * Paramètres pour l'effet Voice Coder (auto-tune)
 */
export interface VoiceCoderParams {
  readonly pitch: number;           // -12 à +12 semitones (transpose)
  readonly harmonization: boolean;  // Ajouter harmonies
  readonly strength: number;        // 0-100%, intensité correction (mix)
  readonly retuneSpeed: number;     // 0-100%, vitesse de correction (0=lent/naturel, 100=rapide/robotique)
  readonly scale: 'chromatic' | 'major' | 'minor' | 'pentatonic'; // Gamme musicale
  readonly key: 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B'; // Tonalité
  readonly naturalVibrato: number;  // 0-100%, préservation du vibrato naturel
}

/**
 * Presets pour Perfect Voice
 */
export type VoiceCoderPreset =
  | 'voix-naturelle'
  | 'pop-star'
  | 'effet-robot'
  | 'correction-subtile'
  | 'custom';

/**
 * Paramètres pour l'effet Baby Voice
 */
export interface BabyVoiceParams {
  readonly pitch: number;           // +6 à +12 semitones
  readonly formant: number;         // 1.2-1.5x shift formantique
  readonly breathiness: number;     // 0-100%, ajout de souffle
}

/**
 * Paramètres pour l'effet Demon Voice
 */
export interface DemonVoiceParams {
  readonly pitch: number;           // -8 à -12 semitones
  readonly distortion: number;      // 0-100%, saturation
  readonly reverb: number;          // 0-100%, echo cathedral
}

/**
 * Paramètres pour l'effet Back Sound Code
 */
export interface BackSoundParams {
  readonly soundFile: string;       // Nom du fichier son
  readonly volume: number;          // 0-100%
  readonly loopMode: LoopMode;      // Mode de loop
  readonly loopValue: number;       // Nombre de fois ou minutes
}

/**
 * Union des paramètres d'effets audio
 */
export type AudioEffectParams =
  | VoiceCoderParams
  | BabyVoiceParams
  | DemonVoiceParams
  | BackSoundParams;

/**
 * Configuration d'un effet audio
 */
export interface AudioEffect {
  readonly type: AudioEffectType;
  readonly enabled: boolean;
  readonly params: AudioEffectParams;
}

/**
 * État des effets audio
 */
export interface AudioEffectsState {
  readonly voiceCoder: AudioEffect & { params: VoiceCoderParams };
  readonly babyVoice: AudioEffect & { params: BabyVoiceParams };
  readonly demonVoice: AudioEffect & { params: DemonVoiceParams };
  readonly backSound: AudioEffect & { params: BackSoundParams };
}
