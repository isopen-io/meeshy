/**
 * AUDIO EFFECTS TIMELINE - Types pour le tracking des effets audio
 *
 * Système de tracking des effets audio appliqués pendant un enregistrement.
 * Permet de tracer l'historique complet des effets et de leurs paramètres
 * tout au long de l'enregistrement.
 *
 * @package @meeshy/shared
 */

import type {
  AudioEffectType,
  VoiceCoderParams,
  BabyVoiceParams,
  DemonVoiceParams,
  BackSoundParams,
} from './video-call.js';

/**
 * Action effectuée sur un effet audio
 */
export type AudioEffectAction = 'activate' | 'deactivate' | 'update';

/**
 * Union des paramètres de tous les effets audio
 */
export type AudioEffectParamsUnion =
  | VoiceCoderParams
  | BabyVoiceParams
  | DemonVoiceParams
  | BackSoundParams;

/**
 * Événement horodaté d'un effet audio pendant un enregistrement
 *
 * Chaque événement capture un changement d'état:
 * - activation: effet activé avec paramètres initiaux (toujours à zéro)
 * - deactivate: effet désactivé
 * - update: modification d'un ou plusieurs paramètres
 */
export interface AudioEffectEvent {
  /**
   * Timestamp en millisecondes depuis le début de l'enregistrement
   * @example 0 = début, 5000 = 5 secondes après le début
   */
  readonly timestamp: number;

  /**
   * Type d'effet concerné
   */
  readonly effectType: AudioEffectType;

  /**
   * Action effectuée sur l'effet
   */
  readonly action: AudioEffectAction;

  /**
   * Paramètres de l'effet au moment de l'événement
   *
   * - Pour 'activate': paramètres initiaux (TOUJOURS à zéro)
   * - Pour 'update': nouveaux paramètres (peut être partiel)
   * - Pour 'deactivate': undefined
   */
  readonly params?: Partial<AudioEffectParamsUnion>;
}

/**
 * Timeline complète des effets audio pour un enregistrement
 *
 * Structure optimisée pour:
 * - Reconstruction de l'état à n'importe quel moment
 * - Lecture/replay des effets
 * - Analyse de l'utilisation des effets
 * - Export/partage de configurations
 */
export interface AudioEffectsTimeline {
  /**
   * Version du format de timeline (pour évolution future)
   * Format: "MAJOR.MINOR"
   */
  readonly version: string;

  /**
   * Timestamp de création (ISO 8601)
   */
  readonly createdAt: string;

  /**
   * Durée totale de l'enregistrement en millisecondes
   */
  readonly duration: number;

  /**
   * Fréquence d'échantillonnage audio en Hz
   * @example 48000, 44100
   */
  readonly sampleRate: number;

  /**
   * Nombre de canaux audio
   * @example 1 (mono), 2 (stereo)
   */
  readonly channels: number;

  /**
   * Liste chronologique de tous les événements d'effets
   * Triée par timestamp croissant
   */
  readonly events: readonly AudioEffectEvent[];

  /**
   * Métadonnées additionnelles optionnelles
   */
  readonly metadata?: {
    /**
     * Nombre total d'effets différents utilisés
     */
    readonly totalEffectsUsed?: number;

    /**
     * Nombre total de changements de paramètres
     */
    readonly totalParameterChanges?: number;

    /**
     * Effets actifs à la fin de l'enregistrement
     */
    readonly finalActiveEffects?: readonly AudioEffectType[];

    /**
     * Notes ou tags additionnels
     */
    readonly tags?: readonly string[];
  };
}

/**
 * État d'un effet à un instant donné
 * Résultat de la reconstruction de la timeline
 */
export interface AudioEffectSnapshot {
  readonly effectType: AudioEffectType;
  readonly enabled: boolean;
  readonly params: AudioEffectParamsUnion;
  readonly lastUpdateTimestamp: number;
}

/**
 * État complet de tous les effets à un instant donné
 */
export interface AudioEffectsSnapshot {
  readonly timestamp: number;
  readonly effects: readonly AudioEffectSnapshot[];
}

/**
 * Statistiques d'utilisation des effets dans une timeline
 */
export interface AudioEffectsStats {
  /**
   * Durée totale où au moins un effet était actif (ms)
   */
  readonly totalActiveTime: number;

  /**
   * Statistiques par effet
   */
  readonly byEffect: {
    readonly [K in AudioEffectType]?: {
      /**
       * Nombre d'activations
       */
      readonly activationCount: number;

      /**
       * Durée totale d'activation (ms)
       */
      readonly totalDuration: number;

      /**
       * Nombre de modifications de paramètres
       */
      readonly parameterChanges: number;

      /**
       * Valeurs moyennes des paramètres numériques
       */
      readonly averageParams?: Record<string, number>;
    };
  };
}

/**
 * Constantes pour la version de timeline
 */
export const AUDIO_EFFECTS_TIMELINE_VERSION = '1.0';

/**
 * Paramètres par défaut (zéro) pour chaque type d'effet
 * Utilisés lors de l'activation initiale d'un effet
 */
export const ZERO_EFFECT_PARAMS: {
  readonly [K in AudioEffectType]: K extends 'voice-coder'
    ? VoiceCoderParams
    : K extends 'baby-voice'
    ? BabyVoiceParams
    : K extends 'demon-voice'
    ? DemonVoiceParams
    : BackSoundParams;
} = {
  'voice-coder': {
    pitch: 0,
    harmonization: false,
    strength: 0,
    retuneSpeed: 0,
    scale: 'chromatic',
    key: 'C',
    naturalVibrato: 0,
  },
  'baby-voice': {
    pitch: 0,
    formant: 1.0,
    breathiness: 0,
  },
  'demon-voice': {
    pitch: 0,
    distortion: 0,
    reverb: 0,
  },
  'back-sound': {
    soundFile: '',
    volume: 0,
    loopMode: 'N_TIMES',
    loopValue: 1,
  },
};

/**
 * Type guard pour vérifier si une timeline est valide
 */
export function isValidAudioEffectsTimeline(data: any): data is AudioEffectsTimeline {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.version === 'string' &&
    typeof data.createdAt === 'string' &&
    typeof data.duration === 'number' &&
    typeof data.sampleRate === 'number' &&
    typeof data.channels === 'number' &&
    Array.isArray(data.events) &&
    data.events.every((event: any) =>
      typeof event === 'object' &&
      event !== null &&
      typeof event.timestamp === 'number' &&
      typeof event.effectType === 'string' &&
      typeof event.action === 'string'
    )
  );
}

/**
 * Reconstruit l'état des effets à un timestamp donné
 *
 * @param timeline Timeline complète
 * @param targetTimestamp Timestamp cible en ms
 * @returns État de tous les effets au timestamp donné
 */
export function reconstructEffectsStateAt(
  timeline: AudioEffectsTimeline,
  targetTimestamp: number
): AudioEffectsSnapshot {
  const effectStates = new Map<AudioEffectType, AudioEffectSnapshot>();

  // Initialiser tous les effets comme désactivés
  const allEffects: AudioEffectType[] = ['voice-coder', 'baby-voice', 'demon-voice', 'back-sound'];
  for (const effectType of allEffects) {
    effectStates.set(effectType, {
      effectType,
      enabled: false,
      params: ZERO_EFFECT_PARAMS[effectType],
      lastUpdateTimestamp: 0,
    });
  }

  // Rejouer tous les événements jusqu'au timestamp cible
  for (const event of timeline.events) {
    if (event.timestamp > targetTimestamp) {
      break;
    }

    const currentState = effectStates.get(event.effectType)!;

    switch (event.action) {
      case 'activate':
        effectStates.set(event.effectType, {
          effectType: event.effectType,
          enabled: true,
          params: (event.params || ZERO_EFFECT_PARAMS[event.effectType]) as AudioEffectParamsUnion,
          lastUpdateTimestamp: event.timestamp,
        });
        break;

      case 'deactivate':
        effectStates.set(event.effectType, {
          ...currentState,
          enabled: false,
          lastUpdateTimestamp: event.timestamp,
        });
        break;

      case 'update':
        if (currentState.enabled && event.params) {
          effectStates.set(event.effectType, {
            ...currentState,
            params: { ...currentState.params, ...event.params } as AudioEffectParamsUnion,
            lastUpdateTimestamp: event.timestamp,
          });
        }
        break;
    }
  }

  return {
    timestamp: targetTimestamp,
    effects: Array.from(effectStates.values()),
  };
}

/**
 * Type mutable pour construction interne des stats
 */
type MutableEffectsStats = {
  totalActiveTime: number;
  byEffect: {
    [K in AudioEffectType]?: {
      activationCount: number;
      totalDuration: number;
      parameterChanges: number;
      averageParams?: Record<string, number>;
    };
  };
};

/**
 * Calcule les statistiques d'utilisation d'une timeline
 *
 * @param timeline Timeline complète
 * @returns Statistiques détaillées
 */
export function calculateEffectsStats(timeline: AudioEffectsTimeline): AudioEffectsStats {
  const stats: MutableEffectsStats = {
    totalActiveTime: 0,
    byEffect: {},
  };

  // Track l'état actuel de chaque effet
  const activeEffects = new Map<AudioEffectType, { startTime: number; paramSum: Map<string, number[]> }>();

  let anyEffectActiveStart: number | null = null;

  for (const event of timeline.events) {
    const { effectType, action, timestamp, params: _params } = event;

    if (!stats.byEffect[effectType]) {
      stats.byEffect[effectType] = {
        activationCount: 0,
        totalDuration: 0,
        parameterChanges: 0,
        averageParams: {},
      };
    }

    const effectStats = stats.byEffect[effectType]!;

    switch (action) {
      case 'activate':
        effectStats.activationCount++;
        activeEffects.set(effectType, {
          startTime: timestamp,
          paramSum: new Map(),
        });

        // Track any effect active
        if (activeEffects.size === 1) {
          anyEffectActiveStart = timestamp;
        }
        break;

      case 'deactivate':
        const activeState = activeEffects.get(effectType);
        if (activeState) {
          effectStats.totalDuration += timestamp - activeState.startTime;
          activeEffects.delete(effectType);
        }

        // Track any effect active
        if (activeEffects.size === 0 && anyEffectActiveStart !== null) {
          stats.totalActiveTime += timestamp - anyEffectActiveStart;
          anyEffectActiveStart = null;
        }
        break;

      case 'update':
        effectStats.parameterChanges++;
        break;
    }
  }

  // Si des effets sont toujours actifs à la fin
  for (const [effectType, activeState] of activeEffects.entries()) {
    const effectStats = stats.byEffect[effectType]!;
    effectStats.totalDuration += timeline.duration - activeState.startTime;
  }

  if (anyEffectActiveStart !== null) {
    stats.totalActiveTime += timeline.duration - anyEffectActiveStart;
  }

  return stats as AudioEffectsStats;
}

/**
 * Crée une nouvelle timeline vide
 *
 * @param sampleRate Fréquence d'échantillonnage
 * @param channels Nombre de canaux
 * @returns Timeline initialisée
 */
export function createEmptyTimeline(sampleRate: number, channels: number): AudioEffectsTimeline {
  return {
    version: AUDIO_EFFECTS_TIMELINE_VERSION,
    createdAt: new Date().toISOString(),
    duration: 0,
    sampleRate,
    channels,
    events: [],
  };
}
