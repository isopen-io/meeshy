/**
 * AUDIO EFFECTS CAROUSEL
 * Horizontal scrolling carousel with effect tiles
 *
 * Features:
 * - Reset tile (first)
 * - Effect tiles with status
 * - Click to expand details
 * - Precise sliders (0.01 step)
 * - Same UI on desktop and mobile
 */

'use client';

import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import type {
  AudioEffectsState,
  VoiceCoderParams,
  BabyVoiceParams,
  DemonVoiceParams,
  BackSoundParams,
  AudioEffectType,
  VoiceCoderPreset,
} from '@meeshy/shared/types/video-call';

import { EffectCard } from './audio-effects/EffectCard';
import { CarouselNavigation } from './audio-effects/CarouselNavigation';
import { EffectDetailsPreview } from './audio-effects/EffectDetailsPreview';
import { useAudioEffects, useEffectTiles } from './audio-effects/hooks/useAudioEffects';

interface AudioEffectsCarouselProps {
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
  onClose?: () => void;
  className?: string;
}

export function AudioEffectsCarousel({
  effectsState,
  onToggleEffect,
  onUpdateParams,
  onLoadPreset,
  currentPreset,
  availablePresets,
  availableBackSounds,
  onClose,
  className,
}: AudioEffectsCarouselProps) {
  const { t } = useI18n('audioEffects');
  const effectTiles = useEffectTiles(t);
  const {
    selectedEffect,
    handleEffectClick,
    getEffectStatus,
  } = useAudioEffects(effectsState, onToggleEffect);

  return (
    <div
      className={cn(
        'bg-gradient-to-br from-gray-900/95 via-black/95 to-purple-900/95',
        'backdrop-blur-xl rounded-lg p-3 max-h-[90vh] overflow-hidden flex flex-col',
        'border border-white/10 shadow-2xl',
        'animate-in slide-in-from-bottom duration-300',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-md flex items-center justify-center">
            <span className="text-lg">🎭</span>
          </div>
          <div>
            <h3 className="text-white text-sm font-bold">{t('title') || 'Audio Effects'}</h3>
            <p className="text-gray-400 text-[10px]">{t('subtitle') || 'Customize your voice'}</p>
          </div>
        </div>

        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 rounded-full hover:bg-white/10 text-gray-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Carousel */}
      <div className="relative mb-3">
        <CarouselNavigation containerId="effects-carousel" />

        <div
          id="effects-carousel"
          className="flex gap-3 overflow-x-auto scrollbar-hide px-10 py-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {effectTiles.map((tile) => {
            const status = getEffectStatus(tile.id);
            const isActive = status?.enabled || false;
            const isSelected = selectedEffect === tile.id;

            return (
              <EffectCard
                key={tile.id}
                id={tile.id}
                title={tile.title}
                gradient={tile.gradient}
                isActive={isActive}
                isSelected={isSelected}
                onClick={() => handleEffectClick(tile.id, isSelected)}
              />
            );
          })}
        </div>
      </div>

      {/* Effect Details Panel */}
      <EffectDetailsPreview
        selectedEffect={selectedEffect}
        effectsState={effectsState}
        onToggleEffect={onToggleEffect}
        onUpdateParams={onUpdateParams}
        onLoadPreset={onLoadPreset}
        currentPreset={currentPreset}
        availablePresets={availablePresets}
        availableBackSounds={availableBackSounds}
        emptyMessage={t('selectEffectPrompt') || 'Click on an effect to configure it'}
      />
    </div>
  );
}
