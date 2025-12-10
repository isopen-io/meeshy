/**
 * USE AUDIO EFFECTS TIMELINE HOOK
 *
 * Hook pour tracker les effets audio appliqués pendant un enregistrement.
 * Construit une timeline complète de tous les événements d'effets.
 *
 * Features:
 * - Enregistrement automatique des activations/désactivations
 * - Tracking des changements de paramètres en temps réel
 * - Initialisation à zéro lors de l'activation d'un effet
 * - Export de la timeline pour stockage avec l'audio
 *
 * @example
 * ```typescript
 * const { startTracking, stopTracking, recordActivation, recordUpdate, getTimeline } = useAudioEffectsTimeline();
 *
 * // Démarrer le tracking au début de l'enregistrement
 * startTracking({ sampleRate: 48000, channels: 1 });
 *
 * // Activer un effet (paramètres toujours à zéro)
 * recordActivation('voice-coder');
 *
 * // Modifier les paramètres
 * recordUpdate('voice-coder', { pitch: 5, strength: 70 });
 *
 * // Désactiver un effet
 * recordDeactivation('voice-coder');
 *
 * // Récupérer la timeline finale
 * const timeline = stopTracking();
 * ```
 */

'use client';

import { useCallback, useRef, useState } from 'react';
import type {
  AudioEffectsTimeline,
  AudioEffectEvent,
  AudioEffectAction,
  AudioEffectParamsUnion,
  ZERO_EFFECT_PARAMS,
} from '@meeshy/shared/types/audio-effects-timeline';
import type { AudioEffectType } from '@meeshy/shared/types/video-call';
import { AUDIO_EFFECTS_TIMELINE_VERSION } from '@meeshy/shared/types/audio-effects-timeline';
import { logger } from '@/utils/logger';

/**
 * État d'un effet au moment du démarrage de l'enregistrement
 */
export interface InitialEffectState {
  effectType: AudioEffectType;
  enabled: boolean;
  params?: Partial<AudioEffectParamsUnion>;
}

/**
 * Options pour démarrer le tracking
 */
export interface StartTrackingOptions {
  /** Fréquence d'échantillonnage audio en Hz */
  sampleRate: number;
  /** Nombre de canaux audio */
  channels: number;
  /** Effets déjà actifs au moment du démarrage (optionnel) */
  initialEffects?: InitialEffectState[];
}

/**
 * Paramètres par défaut (zéro) pour chaque type d'effet
 */
const ZERO_PARAMS: typeof ZERO_EFFECT_PARAMS = {
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
    loopMode: 'N_TIMES' as const,
    loopValue: 1,
  },
};

/**
 * Hook pour tracker une timeline d'effets audio
 */
export function useAudioEffectsTimeline() {
  // État du tracking
  const [isTracking, setIsTracking] = useState(false);

  // Timestamp de début d'enregistrement
  const startTimeRef = useRef<number>(0);

  // Options de tracking
  const trackingOptionsRef = useRef<StartTrackingOptions | null>(null);

  // Événements enregistrés
  const eventsRef = useRef<AudioEffectEvent[]>([]);

  // Effets actuellement actifs (pour éviter les doublons)
  const activeEffectsRef = useRef<Set<AudioEffectType>>(new Set());

  /**
   * Calcule le timestamp relatif depuis le début de l'enregistrement
   */
  const getCurrentTimestamp = useCallback((): number => {
    if (!isTracking || startTimeRef.current === 0) {
      logger.warn('[useAudioEffectsTimeline]', 'Tracking not started');
      return 0;
    }
    return Date.now() - startTimeRef.current;
  }, [isTracking]);

  /**
   * Ajoute un événement à la timeline
   */
  const addEvent = useCallback(
    (
      effectType: AudioEffectType,
      action: AudioEffectAction,
      params?: Partial<AudioEffectParamsUnion>
    ) => {
      if (!isTracking) {
        logger.warn('[useAudioEffectsTimeline]', 'Cannot add event: tracking not started');
        return;
      }

      const timestamp = getCurrentTimestamp();

      const event: AudioEffectEvent = {
        timestamp,
        effectType,
        action,
        ...(params !== undefined && { params }),
      };

      eventsRef.current.push(event);

      logger.debug('[useAudioEffectsTimeline]', 'Event recorded', {
        effectType,
        action,
        timestamp,
        totalEvents: eventsRef.current.length,
      });
    },
    [isTracking, getCurrentTimestamp]
  );

  /**
   * Démarre le tracking d'une nouvelle timeline
   */
  const startTracking = useCallback((options: StartTrackingOptions) => {
    if (isTracking) {
      logger.warn('[useAudioEffectsTimeline]', 'Already tracking, stopping previous session');
      stopTracking();
    }

    startTimeRef.current = Date.now();
    trackingOptionsRef.current = options;
    eventsRef.current = [];
    activeEffectsRef.current.clear();
    setIsTracking(true);

    // IMPORTANT: Enregistrer les effets initiaux à timestamp=0
    // Cela capture les effets qui étaient actifs AVANT le début de l'enregistrement
    if (options.initialEffects && options.initialEffects.length > 0) {
      logger.info('[useAudioEffectsTimeline]', 'Recording initial effects at t=0', {
        count: options.initialEffects.length,
        effects: options.initialEffects.map(e => e.effectType)
      });

      for (const effect of options.initialEffects) {
        if (effect.enabled) {
          // Créer un événement d'activation à timestamp=0
          const event: AudioEffectEvent = {
            timestamp: 0,
            effectType: effect.effectType,
            action: 'activate',
            params: effect.params || ZERO_PARAMS[effect.effectType],
          };

          eventsRef.current.push(event);
          activeEffectsRef.current.add(effect.effectType);

          logger.debug('[useAudioEffectsTimeline]', 'Initial effect recorded', {
            effectType: effect.effectType,
            params: event.params
          });
        }
      }
    }

    logger.info('[useAudioEffectsTimeline]', 'Tracking started', {
      ...options,
      initialEffectsCount: options.initialEffects?.length || 0
    });
  }, [isTracking]);

  /**
   * Arrête le tracking et retourne la timeline finale
   */
  const stopTracking = useCallback((): AudioEffectsTimeline | null => {
    if (!isTracking || !trackingOptionsRef.current) {
      logger.warn('[useAudioEffectsTimeline]', 'Cannot stop: tracking not started');
      return null;
    }

    const duration = getCurrentTimestamp();

    // IMPORTANT: Ajouter automatiquement des événements 'deactivate' pour tous les effets encore actifs
    // Cela garantit que les graphiques affichent correctement les effets jusqu'à la fin
    const stillActiveEffects = Array.from(activeEffectsRef.current);
    if (stillActiveEffects.length > 0) {
      logger.info('[useAudioEffectsTimeline]', 'Auto-closing active effects at end of recording', {
        effects: stillActiveEffects,
        timestamp: duration
      });

      for (const effectType of stillActiveEffects) {
        const deactivateEvent: AudioEffectEvent = {
          timestamp: duration,
          effectType,
          action: 'deactivate',
        };
        eventsRef.current.push(deactivateEvent);

        logger.debug('[useAudioEffectsTimeline]', 'Auto-deactivated effect', {
          effectType,
          timestamp: duration
        });
      }
    }

    const timeline: AudioEffectsTimeline = {
      version: AUDIO_EFFECTS_TIMELINE_VERSION,
      createdAt: new Date(startTimeRef.current).toISOString(),
      duration,
      sampleRate: trackingOptionsRef.current.sampleRate,
      channels: trackingOptionsRef.current.channels,
      events: [...eventsRef.current], // Clone pour immuabilité
      metadata: {
        totalEffectsUsed: new Set(eventsRef.current.map(e => e.effectType)).size,
        totalParameterChanges: eventsRef.current.filter(e => e.action === 'update').length,
        finalActiveEffects: [], // Plus aucun effet actif après auto-close
      },
    };

    logger.info('[useAudioEffectsTimeline]', 'Tracking stopped', {
      duration,
      totalEvents: eventsRef.current.length,
      totalEffects: timeline.metadata?.totalEffectsUsed,
      autoClosedEffects: stillActiveEffects.length,
    });

    // Reset
    setIsTracking(false);
    startTimeRef.current = 0;
    trackingOptionsRef.current = null;
    eventsRef.current = [];
    activeEffectsRef.current.clear();

    return timeline;
  }, [isTracking, getCurrentTimestamp]);

  /**
   * Enregistre l'activation d'un effet
   * IMPORTANT: Les paramètres sont toujours initialisés à zéro
   */
  const recordActivation = useCallback(
    (effectType: AudioEffectType) => {
      if (activeEffectsRef.current.has(effectType)) {
        logger.warn('[useAudioEffectsTimeline]', 'Effect already active, ignoring activation', {
          effectType,
        });
        return;
      }

      // Toujours utiliser les paramètres à zéro lors de l'activation
      const zeroParams = ZERO_PARAMS[effectType];

      addEvent(effectType, 'activate', zeroParams);
      activeEffectsRef.current.add(effectType);

      logger.debug('[useAudioEffectsTimeline]', 'Effect activated with zero params', {
        effectType,
        params: zeroParams,
      });
    },
    [addEvent]
  );

  /**
   * Enregistre la désactivation d'un effet
   */
  const recordDeactivation = useCallback(
    (effectType: AudioEffectType) => {
      if (!activeEffectsRef.current.has(effectType)) {
        logger.warn('[useAudioEffectsTimeline]', 'Effect not active, ignoring deactivation', {
          effectType,
        });
        return;
      }

      addEvent(effectType, 'deactivate');
      activeEffectsRef.current.delete(effectType);

      logger.debug('[useAudioEffectsTimeline]', 'Effect deactivated', { effectType });
    },
    [addEvent]
  );

  /**
   * Enregistre une mise à jour des paramètres
   */
  const recordUpdate = useCallback(
    (effectType: AudioEffectType, params: Partial<AudioEffectParamsUnion>) => {
      if (!activeEffectsRef.current.has(effectType)) {
        logger.warn(
          '[useAudioEffectsTimeline]',
          'Cannot update inactive effect, ignoring update',
          { effectType }
        );
        return;
      }

      addEvent(effectType, 'update', params);

      logger.debug('[useAudioEffectsTimeline]', 'Effect params updated', {
        effectType,
        params,
      });
    },
    [addEvent]
  );

  /**
   * Récupère la timeline courante (sans arrêter le tracking)
   */
  const getTimeline = useCallback((): AudioEffectsTimeline | null => {
    if (!isTracking || !trackingOptionsRef.current) {
      return null;
    }

    const duration = getCurrentTimestamp();

    return {
      version: AUDIO_EFFECTS_TIMELINE_VERSION,
      createdAt: new Date(startTimeRef.current).toISOString(),
      duration,
      sampleRate: trackingOptionsRef.current.sampleRate,
      channels: trackingOptionsRef.current.channels,
      events: [...eventsRef.current],
      metadata: {
        totalEffectsUsed: new Set(eventsRef.current.map(e => e.effectType)).size,
        totalParameterChanges: eventsRef.current.filter(e => e.action === 'update').length,
        finalActiveEffects: Array.from(activeEffectsRef.current),
      },
    };
  }, [isTracking, getCurrentTimestamp]);

  /**
   * Réinitialise complètement le tracking
   */
  const reset = useCallback(() => {
    setIsTracking(false);
    startTimeRef.current = 0;
    trackingOptionsRef.current = null;
    eventsRef.current = [];
    activeEffectsRef.current.clear();

    logger.debug('[useAudioEffectsTimeline]', 'Timeline reset');
  }, []);

  /**
   * Vérifie si un effet est actuellement actif
   */
  const isEffectActive = useCallback((effectType: AudioEffectType): boolean => {
    return activeEffectsRef.current.has(effectType);
  }, []);

  return {
    // État
    isTracking,

    // Contrôles principaux
    startTracking,
    stopTracking,
    reset,

    // Enregistrement d'événements
    recordActivation,
    recordDeactivation,
    recordUpdate,

    // Getters
    getTimeline,
    isEffectActive,

    // Stats en temps réel
    get totalEvents() {
      return eventsRef.current.length;
    },
    get activeEffects() {
      return Array.from(activeEffectsRef.current);
    },
  };
}
