/**
 * USE AUDIO EFFECTS HOOK - PROFESSIONAL IMPLEMENTATION
 * Manages Tone.js audio processing for voice effects
 *
 * Provides:
 * - Professional audio effect processing pipeline
 * - Real-time parameter updates
 * - Effect enable/disable
 * - Multiple effect chaining with Tone.js
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { logger } from '@/utils/logger';
import {
  createAudioEffectProcessor,
  VoiceCoderProcessor,
  BabyVoiceProcessor,
  DemonVoiceProcessor,
  BackSoundProcessor,
  BACK_SOUNDS,
  VOICE_CODER_PRESETS,
  type AudioEffectProcessor,
} from '@/utils/audio-effects';
import type {
  AudioEffectType,
  VoiceCoderParams,
  BabyVoiceParams,
  DemonVoiceParams,
  BackSoundParams,
  AudioEffectsState,
  VoiceCoderPreset,
} from '@meeshy/shared/types/video-call';

// Default parameters for each effect
// IMPORTANT: Tous les paramètres sont initialisés à ZÉRO lors de l'activation
// L'utilisateur doit ajuster manuellement les paramètres après activation
const DEFAULT_VOICE_CODER: VoiceCoderParams = {
  pitch: 0,
  harmonization: false,
  strength: 0, // Initialisé à zéro
  retuneSpeed: 0, // Initialisé à zéro
  scale: 'chromatic', // All notes allowed by default
  key: 'C', // C major/minor
  naturalVibrato: 0, // Initialisé à zéro
};

const DEFAULT_BABY_VOICE: BabyVoiceParams = {
  pitch: 0, // Initialisé à zéro
  formant: 1.0, // Valeur neutre (1.0 = pas de changement formantique)
  breathiness: 0, // Initialisé à zéro
};

const DEFAULT_DEMON_VOICE: DemonVoiceParams = {
  pitch: 0, // Initialisé à zéro
  distortion: 0, // Initialisé à zéro
  reverb: 0, // Initialisé à zéro
};

const DEFAULT_BACK_SOUND: BackSoundParams = {
  soundFile: '', // Pas de fichier sélectionné par défaut
  volume: 0, // Initialisé à zéro
  loopMode: 'N_TIMES',
  loopValue: 1,
};

export interface UseAudioEffectsOptions {
  inputStream: MediaStream | null;
  onOutputStreamReady?: (stream: MediaStream) => void;
}

export function useAudioEffects({ inputStream, onOutputStreamReady }: UseAudioEffectsOptions) {
  // Tone.js nodes
  const inputNodeRef = useRef<Tone.UserMedia | null>(null);
  const outputNodeRef = useRef<Tone.Destination | null>(null);
  const mediaStreamDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // Effect processors
  const processorsRef = useRef<Map<AudioEffectType, AudioEffectProcessor>>(new Map());

  // Output stream
  const [outputStream, setOutputStream] = useState<MediaStream | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Current preset for Perfect Voice
  const [currentPreset, setCurrentPreset] = useState<VoiceCoderPreset>('correction-subtile');

  // Effects state
  const [effectsState, setEffectsState] = useState<AudioEffectsState>({
    voiceCoder: {
      type: 'voice-coder',
      enabled: false,
      params: DEFAULT_VOICE_CODER,
    },
    babyVoice: {
      type: 'baby-voice',
      enabled: false,
      params: DEFAULT_BABY_VOICE,
    },
    demonVoice: {
      type: 'demon-voice',
      enabled: false,
      params: DEFAULT_DEMON_VOICE,
    },
    backSound: {
      type: 'back-sound',
      enabled: false,
      params: DEFAULT_BACK_SOUND,
    },
  });

  /**
   * Initialize Tone.js audio pipeline
   */
  const initializeAudioPipeline = useCallback(async () => {
    if (!inputStream) {
      logger.warn('[useAudioEffects]', 'No input stream available');
      return;
    }

    if (isInitialized) {
      logger.debug('[useAudioEffects]', 'Already initialized');
      return;
    }

    try {
      // Start Tone.js audio context
      await Tone.start();
      logger.debug('[useAudioEffects]', 'Tone.js started', {
        sampleRate: Tone.context.sampleRate,
      });

      // Create Tone.js UserMedia from input stream
      // We need to connect the MediaStream to Tone's context
      const audioContext = Tone.context.rawContext as AudioContext;
      const source = audioContext.createMediaStreamSource(inputStream);

      // Create Tone nodes
      inputNodeRef.current = new Tone.Gain(1) as any;

      // Connect native source to Tone input
      source.connect((inputNodeRef.current as any).input);

      // Create MediaStreamDestination for output
      mediaStreamDestinationRef.current = audioContext.createMediaStreamDestination();

      // Connect input directly to destination initially (no effects)
      if (inputNodeRef.current) {
        (inputNodeRef.current as any).connect(mediaStreamDestinationRef.current);
      }

      // Set output stream
      const newOutputStream = mediaStreamDestinationRef.current.stream;
      setOutputStream(newOutputStream);
      onOutputStreamReady?.(newOutputStream);

      setIsInitialized(true);
      logger.info('[useAudioEffects]', 'Audio pipeline initialized with Tone.js');
    } catch (error) {
      logger.error('[useAudioEffects]', 'Failed to initialize audio pipeline', { error });
    }
  }, [inputStream, onOutputStreamReady, isInitialized]);

  /**
   * Rebuild audio graph with enabled effects
   */
  const rebuildAudioGraph = useCallback(() => {
    if (!inputNodeRef.current || !mediaStreamDestinationRef.current) {
      // Silently return if nodes not initialized yet - this is expected during initialization
      return;
    }

    logger.debug('[useAudioEffects]', 'Rebuilding audio graph');

    // Disconnect everything
    inputNodeRef.current.disconnect();
    processorsRef.current.forEach((processor) => {
      processor.disconnect();
    });

    // Get enabled effects in order
    const enabledEffects = Object.values(effectsState).filter((effect) => effect.enabled);

    if (enabledEffects.length === 0) {
      // No effects enabled, connect directly
      (inputNodeRef.current as any).connect(mediaStreamDestinationRef.current);
      logger.debug('[useAudioEffects]', 'No effects enabled, direct connection');
      return;
    }

    // Chain effects: input -> effect1 -> effect2 -> ... -> destination
    let currentNode: any = inputNodeRef.current;

    for (const effect of enabledEffects) {
      const processor = processorsRef.current.get(effect.type);
      if (processor) {
        // Connect current node to processor input
        currentNode.connect(processor.inputNode);
        // Move to processor output for next connection
        currentNode = processor.outputNode;
      }
    }

    // Connect last effect to destination
    currentNode.connect(mediaStreamDestinationRef.current);

    logger.debug('[useAudioEffects]', 'Audio graph rebuilt', {
      enabledEffects: enabledEffects.map((e) => e.type),
    });
  }, [effectsState]);

  /**
   * Toggle effect on/off
   */
  const toggleEffect = useCallback((effectType: AudioEffectType) => {
    setEffectsState((prev) => {
      const effectKey = getEffectKey(effectType);
      const newEnabled = !prev[effectKey].enabled;

      logger.debug('[useAudioEffects]', 'Effect toggled', { effectType, enabled: newEnabled });

      return {
        ...prev,
        [effectKey]: {
          ...prev[effectKey],
          enabled: newEnabled,
        },
      };
    });
  }, []);

  /**
   * Update effect parameters
   */
  const updateEffectParams = useCallback(
    <T extends AudioEffectType>(
      effectType: T,
      params: Partial<
        T extends 'voice-coder'
          ? VoiceCoderParams
          : T extends 'baby-voice'
          ? BabyVoiceParams
          : T extends 'demon-voice'
          ? DemonVoiceParams
          : BackSoundParams
      >
    ) => {
      setEffectsState((prev) => {
        const effectKey = getEffectKey(effectType);
        const newParams = {
          ...prev[effectKey].params,
          ...params,
        };

        // Update processor if exists
        const processor = processorsRef.current.get(effectType);
        if (processor) {
          processor.updateParams(newParams);
        }

        // If updating voice coder params, set preset to 'custom'
        if (effectType === 'voice-coder') {
          setCurrentPreset('custom');
        }

        logger.debug('[useAudioEffects]', 'Effect params updated', { effectType, params });

        return {
          ...prev,
          [effectKey]: {
            ...prev[effectKey],
            params: newParams,
          },
        };
      });
    },
    []
  );

  /**
   * Load a preset for Perfect Voice
   */
  const loadPreset = useCallback((preset: VoiceCoderPreset) => {
    if (preset === 'custom') return;

    const presetConfig = VOICE_CODER_PRESETS[preset];
    if (!presetConfig) {
      logger.error('[useAudioEffects]', 'Invalid preset', { preset });
      return;
    }

    logger.debug('[useAudioEffects]', 'Loading preset', { preset });

    setCurrentPreset(preset);
    setEffectsState((prev) => ({
      ...prev,
      voiceCoder: {
        ...prev.voiceCoder,
        params: presetConfig.params,
      },
    }));

    // Update processor if exists
    const processor = processorsRef.current.get('voice-coder');
    if (processor) {
      processor.updateParams(presetConfig.params);
    }
  }, []);

  /**
   * Create or get processor for effect type
   */
  const getOrCreateProcessor = useCallback(
    (effectType: AudioEffectType): AudioEffectProcessor | null => {
      let processor = processorsRef.current.get(effectType);

      if (!processor) {
        const effectKey = getEffectKey(effectType);
        const effectConfig = effectsState[effectKey];

        try {
          processor = createAudioEffectProcessor(
            effectType as any,
            effectConfig.params as any
          );

          processorsRef.current.set(effectType, processor);

          logger.debug('[useAudioEffects]', 'Processor created', { effectType });
        } catch (error) {
          logger.error('[useAudioEffects]', 'Failed to create processor', {
            effectType,
            error,
          });
          return null;
        }
      }

      return processor;
    },
    [effectsState]
  );

  /**
   * Initialize audio pipeline when input stream is available
   */
  useEffect(() => {
    if (inputStream && !isInitialized) {
      initializeAudioPipeline();
    }

    return () => {
      // Cleanup on unmount or when inputStream changes
      if (inputNodeRef.current) {
        inputNodeRef.current.disconnect();
        inputNodeRef.current.dispose();
        inputNodeRef.current = null;
      }

      processorsRef.current.forEach((processor) => {
        processor.destroy();
      });
      processorsRef.current.clear();

      // Reset initialization flag when stream changes
      if (inputStream) {
        setIsInitialized(false);
      }
    };
    // Only depend on inputStream - isInitialized is used for conditional logic
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputStream]);

  /**
   * Rebuild audio graph when effects change
   */
  useEffect(() => {
    if (!isInitialized) return;

    // Create processors for enabled effects
    Object.values(effectsState).forEach((effect) => {
      if (effect.enabled) {
        getOrCreateProcessor(effect.type);
      }
    });

    // Rebuild graph
    rebuildAudioGraph();
    // Only depend on effectsState and isInitialized
    // getOrCreateProcessor and rebuildAudioGraph are stable callbacks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectsState, isInitialized]);

  /**
   * Load background sound when enabled or changed
   */
  useEffect(() => {
    if (!isInitialized) return;

    if (effectsState.backSound.enabled) {
      const processor = processorsRef.current.get('back-sound') as BackSoundProcessor | undefined;
      if (processor) {
        const sound = BACK_SOUNDS.find((s) => s.id === effectsState.backSound.params.soundFile);
        if (sound) {
          processor.loadSound(sound.url).then(() => {
            processor.play();
            logger.debug('[useAudioEffects]', 'Background sound loaded and playing', {
              soundFile: sound.name,
            });
          }).catch((error) => {
            logger.error('[useAudioEffects]', 'Failed to load background sound', { error });
          });
        }
      }
    } else {
      // Stop background sound if disabled
      const processor = processorsRef.current.get('back-sound') as BackSoundProcessor | undefined;
      if (processor) {
        processor.stop();
      }
    }
  }, [effectsState.backSound.enabled, effectsState.backSound.params.soundFile, isInitialized]);

  return {
    outputStream,
    effectsState,
    toggleEffect,
    updateEffectParams,
    loadPreset,
    currentPreset,
    availableBackSounds: BACK_SOUNDS,
    availablePresets: VOICE_CODER_PRESETS,
  };
}

/**
 * Helper to get effect key from type
 */
function getEffectKey(type: AudioEffectType): keyof AudioEffectsState {
  switch (type) {
    case 'voice-coder':
      return 'voiceCoder';
    case 'baby-voice':
      return 'babyVoice';
    case 'demon-voice':
      return 'demonVoice';
    case 'back-sound':
      return 'backSound';
  }
}
