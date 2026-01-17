/**
 * USE AUDIO EFFECTS
 * Hook for managing audio effects state and selection
 */

import { useState, useCallback } from 'react';
import type { AudioEffectType, AudioEffectsState } from '@meeshy/shared/types/video-call';

type EffectTileType = 'reset' | AudioEffectType;

interface EffectTile {
  id: EffectTileType;
  title: string;
  color: string;
  gradient: string;
}

export const useAudioEffects = (effectsState: AudioEffectsState, onToggleEffect: (type: AudioEffectType) => void) => {
  const [selectedEffect, setSelectedEffect] = useState<EffectTileType | null>(null);

  const handleResetAll = useCallback(() => {
    Object.values(effectsState).forEach((effect) => {
      if (effect.enabled) {
        onToggleEffect(effect.type);
      }
    });
    setSelectedEffect(null);
  }, [effectsState, onToggleEffect]);

  const handleEffectClick = useCallback((tileId: EffectTileType, isSelected: boolean) => {
    if (tileId === 'reset') {
      handleResetAll();
    } else {
      setSelectedEffect(isSelected ? null : tileId);
    }
  }, [handleResetAll]);

  const getEffectStatus = useCallback((id: EffectTileType) => {
    if (id === 'reset') return null;
    return effectsState[id as AudioEffectType];
  }, [effectsState]);

  return {
    selectedEffect,
    setSelectedEffect,
    handleResetAll,
    handleEffectClick,
    getEffectStatus,
  };
};

export const useEffectTiles = (t: (key: string) => string): EffectTile[] => {
  return [
    {
      id: 'reset',
      title: t('resetAll') || 'Reset All',
      color: 'gray',
      gradient: 'from-gray-700 to-gray-900',
    },
    {
      id: 'voice-coder',
      title: t('voiceCoder.title') || 'Voice Coder',
      color: 'blue',
      gradient: 'from-blue-600 to-blue-800',
    },
    {
      id: 'back-sound',
      title: t('backSound.title') || 'Background',
      color: 'green',
      gradient: 'from-green-600 to-green-800',
    },
    {
      id: 'baby-voice',
      title: t('babyVoice.title') || 'Baby Voice',
      color: 'pink',
      gradient: 'from-pink-600 to-pink-800',
    },
    {
      id: 'demon-voice',
      title: t('demonVoice.title') || 'Demon Voice',
      color: 'red',
      gradient: 'from-red-600 to-red-800',
    },
  ];
};
