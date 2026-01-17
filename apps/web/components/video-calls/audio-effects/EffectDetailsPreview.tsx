/**
 * EFFECT DETAILS PREVIEW
 * Container for displaying effect configuration panels
 */

'use client';

import React from 'react';
import type { AudioEffectsState, AudioEffectType, VoiceCoderParams, VoiceCoderPreset, BackSoundParams, BabyVoiceParams, DemonVoiceParams } from '@meeshy/shared/types/video-call';
import { VoiceCoderDetails } from './effect-details/VoiceCoderDetails';
import { BackSoundDetails } from './effect-details/BackSoundDetails';
import { BabyVoiceDetails } from './effect-details/BabyVoiceDetails';
import { DemonVoiceDetails } from './effect-details/DemonVoiceDetails';

type EffectTileType = 'reset' | AudioEffectType;

interface EffectDetailsPreviewProps {
  selectedEffect: EffectTileType | null;
  effectsState: AudioEffectsState;
  onToggleEffect: (type: AudioEffectType) => void;
  onUpdateParams: <T extends AudioEffectType>(
    type: T,
    params: Partial<
      T extends 'voice-coder'
        ? VoiceCoderParams
        : T extends 'baby-voice'
        ? BabyVoiceParams
        : T extends 'demon-voice'
        ? DemonVoiceParams
        : BackSoundParams
    >
  ) => void;
  onLoadPreset?: (preset: VoiceCoderPreset) => void;
  currentPreset?: VoiceCoderPreset;
  availablePresets?: Record<string, { name: string; description: string; params: VoiceCoderParams }>;
  availableBackSounds: readonly { id: string; name: string; url: string }[];
  emptyMessage?: string;
}

export const EffectDetailsPreview = React.memo<EffectDetailsPreviewProps>(({
  selectedEffect,
  effectsState,
  onToggleEffect,
  onUpdateParams,
  onLoadPreset,
  currentPreset,
  availablePresets,
  availableBackSounds,
  emptyMessage = 'Click on an effect to configure it',
}) => {
  if (!selectedEffect || selectedEffect === 'reset') {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm text-center px-4">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {selectedEffect === 'voice-coder' && (
        <VoiceCoderDetails
          effect={effectsState.voiceCoder}
          onToggle={() => onToggleEffect('voice-coder')}
          onUpdateParams={(params) => onUpdateParams('voice-coder', params)}
          onLoadPreset={onLoadPreset}
          currentPreset={currentPreset}
          availablePresets={availablePresets}
        />
      )}

      {selectedEffect === 'back-sound' && (
        <BackSoundDetails
          effect={effectsState.backSound}
          onToggle={() => onToggleEffect('back-sound')}
          onUpdateParams={(params) => onUpdateParams('back-sound', params)}
          availableBackSounds={availableBackSounds}
        />
      )}

      {selectedEffect === 'baby-voice' && (
        <BabyVoiceDetails
          effect={effectsState.babyVoice}
          onToggle={() => onToggleEffect('baby-voice')}
          onUpdateParams={(params) => onUpdateParams('baby-voice', params)}
        />
      )}

      {selectedEffect === 'demon-voice' && (
        <DemonVoiceDetails
          effect={effectsState.demonVoice}
          onToggle={() => onToggleEffect('demon-voice')}
          onUpdateParams={(params) => onUpdateParams('demon-voice', params)}
        />
      )}
    </div>
  );
});

EffectDetailsPreview.displayName = 'EffectDetailsPreview';
