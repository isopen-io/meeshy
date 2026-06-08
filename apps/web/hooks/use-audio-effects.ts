'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type * as ToneTypes from 'tone';
import { logger } from '@/utils/logger';
import type { AudioEffectProcessor } from '@/utils/audio-effects';
import { BACK_SOUNDS, VOICE_CODER_PRESETS } from '@/utils/audio-effect-presets';
import type {
  AudioEffectType,
  VoiceCoderParams,
  BabyVoiceParams,
  DemonVoiceParams,
  BackSoundParams,
  AudioEffectsState,
  VoiceCoderPreset,
} from '@meeshy/shared/types/video-call';

// Lazy-load Tone.js and audio-effects module (combined ~1 MB) only when the
// audio pipeline is first initialized. This keeps Tone out of the main bundle.
let _lazyModules: { tone: typeof ToneTypes; effects: typeof import('@/utils/audio-effects') } | null = null;
async function loadAudioModules() {
  if (!_lazyModules) {
    const [tone, effects] = await Promise.all([
      import('tone'),
      import('@/utils/audio-effects'),
    ]);
    _lazyModules = { tone, effects };
  }
  return _lazyModules;
}

const DEFAULT_VOICE_CODER: VoiceCoderParams = {
  pitch: 0,
  harmonization: false,
  strength: 0,
  retuneSpeed: 0,
  scale: 'chromatic',
  key: 'C',
  naturalVibrato: 0,
};

const DEFAULT_BABY_VOICE: BabyVoiceParams = {
  pitch: 0,
  formant: 1.0,
  breathiness: 0,
};

const DEFAULT_DEMON_VOICE: DemonVoiceParams = {
  pitch: 0,
  distortion: 0,
  reverb: 0,
};

const DEFAULT_BACK_SOUND: BackSoundParams = {
  soundFile: '',
  volume: 0,
  loopMode: 'N_TIMES',
  loopValue: 1,
};

export interface UseAudioEffectsOptions {
  inputStream: MediaStream | null;
  onOutputStreamReady?: (stream: MediaStream) => void;
}

export function useAudioEffects({ inputStream, onOutputStreamReady }: UseAudioEffectsOptions) {
  const inputNodeRef = useRef<ToneTypes.ToneAudioNode | null>(null);
  const mediaStreamDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const processorsRef = useRef<Map<AudioEffectType, AudioEffectProcessor>>(new Map());

  const [outputStream, setOutputStream] = useState<MediaStream | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentPreset, setCurrentPreset] = useState<VoiceCoderPreset>('correction-subtile');

  const [effectsState, setEffectsState] = useState<AudioEffectsState>({
    voiceCoder: { type: 'voice-coder', enabled: false, params: DEFAULT_VOICE_CODER },
    babyVoice: { type: 'baby-voice', enabled: false, params: DEFAULT_BABY_VOICE },
    demonVoice: { type: 'demon-voice', enabled: false, params: DEFAULT_DEMON_VOICE },
    backSound: { type: 'back-sound', enabled: false, params: DEFAULT_BACK_SOUND },
  });

  const initializeAudioPipeline = useCallback(async () => {
    if (!inputStream || isInitialized) return;

    try {
      const { tone: Tone } = await loadAudioModules();

      await Tone.start();
      logger.debug('[useAudioEffects]', 'Tone.js started', { sampleRate: Tone.context.sampleRate });

      const audioContext = Tone.context.rawContext as AudioContext;
      const source = audioContext.createMediaStreamSource(inputStream);

      const inputChannels =
        source.channelCount ||
        inputStream.getAudioTracks()[0]?.getSettings?.()?.channelCount ||
        1;

      let effectiveSource: AudioNode = source;
      if (inputChannels < 2) {
        const splitter = audioContext.createChannelSplitter(1);
        const merger = audioContext.createChannelMerger(2);
        source.connect(splitter);
        splitter.connect(merger, 0, 0);
        splitter.connect(merger, 0, 1);
        effectiveSource = merger;
        logger.info('[useAudioEffects]', 'Mono input upmixed to stereo');
      }

      const gainNode = new Tone.Gain(1);
      inputNodeRef.current = gainNode as unknown as ToneTypes.ToneAudioNode;
      effectiveSource.connect((gainNode as any).input);

      mediaStreamDestinationRef.current = audioContext.createMediaStreamDestination();
      mediaStreamDestinationRef.current.channelCount = 2;
      mediaStreamDestinationRef.current.channelCountMode = 'explicit';

      (gainNode as any).connect(mediaStreamDestinationRef.current);

      const newOutputStream = mediaStreamDestinationRef.current.stream;
      setOutputStream(newOutputStream);
      onOutputStreamReady?.(newOutputStream);
      setIsInitialized(true);
      logger.info('[useAudioEffects]', 'Audio pipeline initialized');
    } catch (error) {
      logger.error('[useAudioEffects]', 'Failed to initialize audio pipeline', { error });
    }
  }, [inputStream, onOutputStreamReady, isInitialized]);

  const rebuildAudioGraph = useCallback(() => {
    if (!inputNodeRef.current || !mediaStreamDestinationRef.current) return;

    logger.debug('[useAudioEffects]', 'Rebuilding audio graph');

    (inputNodeRef.current as any).disconnect();
    processorsRef.current.forEach((processor) => processor.disconnect());

    const enabledEffects = Object.values(effectsState).filter((effect) => effect.enabled);

    if (enabledEffects.length === 0) {
      (inputNodeRef.current as any).connect(mediaStreamDestinationRef.current);
      return;
    }

    let currentNode: any = inputNodeRef.current;
    for (const effect of enabledEffects) {
      const processor = processorsRef.current.get(effect.type);
      if (processor) {
        currentNode.connect(processor.inputNode);
        currentNode = processor.outputNode;
      }
    }
    currentNode.connect(mediaStreamDestinationRef.current);
  }, [effectsState]);

  const toggleEffect = useCallback((effectType: AudioEffectType) => {
    const VOICE_EFFECTS: AudioEffectType[] = ['voice-coder', 'baby-voice', 'demon-voice'];

    setEffectsState((prev) => {
      const effectKey = getEffectKey(effectType);
      const newEnabled = !prev[effectKey].enabled;

      let result = { ...prev };
      if (VOICE_EFFECTS.includes(effectType) && newEnabled) {
        for (const voiceType of VOICE_EFFECTS) {
          if (voiceType !== effectType) {
            const key = getEffectKey(voiceType);
            if (prev[key].enabled) {
              result = { ...result, [key]: { ...prev[key], enabled: false } } as AudioEffectsState;
            }
          }
        }
      }
      return { ...result, [effectKey]: { ...prev[effectKey], enabled: newEnabled } } as AudioEffectsState;
    });
  }, []);

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
        const newParams = { ...prev[effectKey].params, ...params };
        processorsRef.current.get(effectType)?.updateParams(newParams);
        if (effectType === 'voice-coder') setCurrentPreset('custom');
        return { ...prev, [effectKey]: { ...prev[effectKey], params: newParams } };
      });
    },
    []
  );

  const loadPreset = useCallback((preset: VoiceCoderPreset) => {
    if (preset === 'custom') return;
    const presetConfig = VOICE_CODER_PRESETS[preset];
    if (!presetConfig) return;

    setCurrentPreset(preset);
    setEffectsState((prev) => ({
      ...prev,
      voiceCoder: { ...prev.voiceCoder, params: presetConfig.params },
    }));
    processorsRef.current.get('voice-coder')?.updateParams(presetConfig.params);
  }, []);

  const getOrCreateProcessor = useCallback(
    (effectType: AudioEffectType): AudioEffectProcessor | null => {
      const existing = processorsRef.current.get(effectType);
      if (existing) return existing;

      const effectKey = getEffectKey(effectType);
      const effectConfig = effectsState[effectKey];

      if (!_lazyModules) return null;

      try {
        const processor = _lazyModules.effects.createAudioEffectProcessor(
          effectType as any,
          effectConfig.params as any
        );
        processorsRef.current.set(effectType, processor);
        return processor;
      } catch (error) {
        logger.error('[useAudioEffects]', 'Failed to create processor', { effectType, error });
        return null;
      }
    },
    [effectsState]
  );

  useEffect(() => {
    if (inputStream && !isInitialized) {
      initializeAudioPipeline();
    }

    return () => {
      if (inputNodeRef.current) {
        (inputNodeRef.current as any).disconnect();
        (inputNodeRef.current as any).dispose?.();
        inputNodeRef.current = null;
      }
      processorsRef.current.forEach((processor) => processor.destroy());
      processorsRef.current.clear();
      if (inputStream) setIsInitialized(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputStream]);

  useEffect(() => {
    if (!isInitialized) return;
    Object.values(effectsState).forEach((effect) => {
      if (effect.enabled) getOrCreateProcessor(effect.type);
    });
    rebuildAudioGraph();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectsState, isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;
    const processor = processorsRef.current.get('back-sound') as (AudioEffectProcessor & { loadSound?: (url: string) => Promise<void>; play?: () => void; stop?: () => void }) | undefined;
    if (!processor) return;

    if (effectsState.backSound.enabled) {
      const sound = BACK_SOUNDS.find((s) => s.id === effectsState.backSound.params.soundFile);
      if (sound) {
        processor.loadSound?.(sound.url)
          .then(() => processor.play?.())
          .catch((error) => logger.error('[useAudioEffects]', 'Failed to load background sound', { error }));
      }
    } else {
      processor.stop?.();
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

function getEffectKey(type: AudioEffectType): keyof AudioEffectsState {
  switch (type) {
    case 'voice-coder': return 'voiceCoder';
    case 'baby-voice': return 'babyVoice';
    case 'demon-voice': return 'demonVoice';
    case 'back-sound': return 'backSound';
  }
}
