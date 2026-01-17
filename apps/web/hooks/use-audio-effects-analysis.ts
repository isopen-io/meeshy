import { useMemo, useState } from 'react';
import type { AudioEffectType } from '@meeshy/shared/types/video-call';
import type { AudioEffectsTimeline } from '@meeshy/shared/types/audio-effects-timeline';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

type EffectsConfigType = Record<AudioEffectType, Array<{ timestamp: number; config: Record<string, number> }>>;

interface EffectSegment {
  effectType: AudioEffectType;
  startTime: number;
  endTime: number;
}

interface UseAudioEffectsAnalysisOptions {
  attachment: UploadedAttachmentResponse;
  duration: number;
  attachmentDuration?: number;
}

interface UseAudioEffectsAnalysisReturn {
  appliedEffects: AudioEffectType[];
  effectsTimeline: EffectSegment[];
  effectsConfigurations: EffectsConfigType;
  selectedEffectTab: AudioEffectType | 'overview';
  setSelectedEffectTab: (tab: AudioEffectType | 'overview') => void;
  visibleCurves: Record<string, Record<string, boolean>>;
  setVisibleCurves: React.Dispatch<React.SetStateAction<Record<string, Record<string, boolean>>>>;
  visibleOverviewCurves: Record<string, boolean>;
  setVisibleOverviewCurves: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

/**
 * Hook personnalisé pour analyser les effets audio enregistrés
 * Extrait et analyse la timeline des effets appliqués sur un audio
 * Utilisé pour la visualisation des effets post-enregistrement
 */
export function useAudioEffectsAnalysis({
  attachment,
  duration,
  attachmentDuration,
}: UseAudioEffectsAnalysisOptions): UseAudioEffectsAnalysisReturn {
  const [selectedEffectTab, setSelectedEffectTab] = useState<AudioEffectType | 'overview'>('overview');
  const [visibleCurves, setVisibleCurves] = useState<Record<string, Record<string, boolean>>>({});
  const [visibleOverviewCurves, setVisibleOverviewCurves] = useState<Record<string, boolean>>({});

  // Extraire les effets appliqués
  const appliedEffects = useMemo((): AudioEffectType[] => {
    const timeline = (attachment as any).metadata?.audioEffectsTimeline;

    if (!timeline || !timeline.events || timeline.events.length === 0) {
      return [];
    }

    const effects = new Set<AudioEffectType>();

    if (timeline.metadata?.finalActiveEffects && Array.isArray(timeline.metadata.finalActiveEffects)) {
      timeline.metadata.finalActiveEffects.forEach((effect: AudioEffectType) => effects.add(effect));
    }

    for (const event of timeline.events) {
      if (event.action === 'activate' || event.action === 'deactivate') {
        effects.add(event.effectType);
      }
    }

    return Array.from(effects);
  }, [attachment]);

  // Extraire la timeline des effets
  const effectsTimeline = useMemo((): EffectSegment[] => {
    const timeline = (attachment as any).audioEffectsTimeline || (attachment as any).metadata?.audioEffectsTimeline;

    if (!timeline || !timeline.events || timeline.events.length === 0) {
      return [];
    }

    const segments: EffectSegment[] = [];
    const activeEffects = new Map<AudioEffectType, number>();

    for (const event of timeline.events) {
      if (event.action === 'activate') {
        activeEffects.set(event.effectType, event.timestamp);
      } else if (event.action === 'deactivate') {
        const startTime = activeEffects.get(event.effectType);
        if (startTime !== undefined) {
          segments.push({
            effectType: event.effectType,
            startTime,
            endTime: event.timestamp,
          });
          activeEffects.delete(event.effectType);
        }
      }
    }

    const totalDuration = duration || attachmentDuration || 0;
    const totalDurationMs = totalDuration * 1000;

    activeEffects.forEach((startTime, effectType) => {
      segments.push({
        effectType,
        startTime,
        endTime: totalDurationMs,
      });
    });

    return segments;
  }, [attachment, duration, attachmentDuration]);

  // Extraire les configurations des effets
  const effectsConfigurations = useMemo((): EffectsConfigType => {
    const rawTimeline = (attachment as any).audioEffectsTimeline || (attachment as any).metadata?.audioEffectsTimeline;

    if (!rawTimeline || !rawTimeline.events || rawTimeline.events.length === 0) {
      return {} as EffectsConfigType;
    }

    const timeline = rawTimeline as AudioEffectsTimeline;

    const configs: Record<AudioEffectType, Array<{
      timestamp: number;
      config: Record<string, number>;
    }>> = {} as Record<AudioEffectType, Array<{ timestamp: number; config: Record<string, number> }>>;

    const lastConfigs: Record<AudioEffectType, Record<string, number>> = {} as Record<AudioEffectType, Record<string, number>>;
    const hasDeactivateEvent: Record<AudioEffectType, boolean> = {} as Record<AudioEffectType, boolean>;

    for (const event of timeline.events) {
      if ((event.action === 'activate' || event.action === 'update') && event.params) {
        if (!configs[event.effectType]) {
          configs[event.effectType] = [];
        }

        const numericConfig: Record<string, number> = {};
        Object.keys(event.params).forEach(key => {
          const value = (event.params as any)[key];
          if (typeof value === 'number') {
            numericConfig[key] = value;
          }
        });

        configs[event.effectType].push({
          timestamp: event.timestamp,
          config: numericConfig,
        });

        lastConfigs[event.effectType] = numericConfig;
      } else if (event.action === 'deactivate' && lastConfigs[event.effectType]) {
        if (!configs[event.effectType]) {
          configs[event.effectType] = [];
        }

        configs[event.effectType].push({
          timestamp: event.timestamp,
          config: lastConfigs[event.effectType],
        });

        hasDeactivateEvent[event.effectType] = true;
      }
    }

    const totalDuration = timeline.duration || 0;
    Object.keys(lastConfigs).forEach((effectType) => {
      const effect = effectType as AudioEffectType;
      if (!hasDeactivateEvent[effect] && lastConfigs[effect] && totalDuration > 0) {
        if (!configs[effect]) {
          configs[effect] = [];
        }

        configs[effect].push({
          timestamp: totalDuration,
          config: lastConfigs[effect],
        });
      }
    });

    return configs;
  }, [attachment]);

  return {
    appliedEffects,
    effectsTimeline,
    effectsConfigurations,
    selectedEffectTab,
    setSelectedEffectTab,
    visibleCurves,
    setVisibleCurves,
    visibleOverviewCurves,
    setVisibleOverviewCurves,
  };
}
