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

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/hooks/useI18n';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, ChevronLeft, ChevronRight, RotateCcw, Upload, Settings, Mic2, Baby, Skull, Music, Sliders } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

type EffectTileType = 'reset' | AudioEffectType;

// Component for effect icons
const EffectIcon: React.FC<{ effect: AudioEffectType | 'reset'; className?: string }> = ({ effect, className = 'w-4 h-4' }) => {
  switch (effect) {
    case 'voice-coder':
      return <Mic2 className={className} />;
    case 'baby-voice':
      return <Baby className={className} />;
    case 'demon-voice':
      return <Skull className={className} />;
    case 'back-sound':
      return <Music className={className} />;
    case 'reset':
      return <RotateCcw className={className} />;
    default:
      return null;
  }
};

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
  const [selectedEffect, setSelectedEffect] = useState<EffectTileType | null>(null);
  const [scrollPosition, setScrollPosition] = useState(0);

  // Handler to disable all effects
  const handleResetAll = () => {
    Object.values(effectsState).forEach((effect) => {
      if (effect.enabled) {
        onToggleEffect(effect.type);
      }
    });
    setSelectedEffect(null);
  };

  // Effect tiles configuration
  const effectTiles: Array<{
    id: EffectTileType;
    title: string;
    color: string;
    gradient: string;
  }> = [
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

  // Get effect status
  const getEffectStatus = (id: EffectTileType) => {
    if (id === 'reset') return null;
    return effectsState[id as AudioEffectType];
  };

  // Scroll handlers
  const scrollLeft = () => {
    const container = document.getElementById('effects-carousel');
    if (container) {
      container.scrollBy({ left: -200, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    const container = document.getElementById('effects-carousel');
    if (container) {
      container.scrollBy({ left: 200, behavior: 'smooth' });
    }
  };

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
        {/* Scroll Left Button */}
        <button
          onClick={scrollLeft}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-black/80 hover:bg-black rounded-full flex items-center justify-center text-white shadow-lg"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Tiles Container */}
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
              <Card
                key={tile.id}
                className={cn(
                  'relative flex-shrink-0 w-28 h-28 sm:w-32 sm:h-32 p-2 sm:p-3 cursor-pointer transition-all duration-300',
                  `bg-gradient-to-br ${tile.gradient}`,
                  'hover:scale-105 hover:shadow-xl',
                  isSelected && 'ring-2 ring-white scale-105',
                  isActive && 'ring-2 ring-green-400 shadow-lg shadow-' + tile.color + '-500/50'
                )}
              >
                {/* Point vert pulsant en haut à droite si actif */}
                {tile.id !== 'reset' && isActive && (
                  <div className="absolute top-2 right-2 flex items-center justify-center">
                    <div className="relative">
                      {/* Cercle externe pulsant */}
                      <div className="absolute inset-0 w-3 h-3 bg-green-400 rounded-full animate-ping opacity-75"></div>
                      {/* Cercle interne fixe */}
                      <div className="relative w-3 h-3 bg-green-400 rounded-full"></div>
                    </div>
                  </div>
                )}

                {/* Badge ON/OFF en haut à gauche */}
                {tile.id !== 'reset' && (
                  <div className={cn(
                    "absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-bold",
                    isActive
                      ? "bg-green-500/90 text-white"
                      : "bg-gray-700/80 text-gray-300"
                  )}>
                    {isActive ? 'ON' : 'OFF'}
                  </div>
                )}

                {/* Clic sur toute la tuile: ouvrir la config */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    if (tile.id === 'reset') {
                      handleResetAll();
                    } else {
                      // Clic: ouvrir/fermer config
                      setSelectedEffect(isSelected ? null : tile.id);
                    }
                  }}
                  className="flex flex-col items-center justify-center h-full text-white"
                >
                  {/* Icon - plus grand si actif */}
                  <div className={cn(
                    "transition-all duration-300"
                  )}>
                    <EffectIcon
                      effect={tile.id}
                      className={cn(
                        "transition-all duration-300 text-white",
                        isActive ? "w-10 h-10 sm:w-12 sm:h-12" : "w-8 h-8 sm:w-10 sm:h-10"
                      )}
                    />
                  </div>

                  {/* Title - Caché sur mobile, visible sur desktop */}
                  <div className="hidden sm:block text-center mt-2">
                    <p className={cn(
                      "text-xs font-semibold leading-tight transition-all",
                      isActive && "text-white drop-shadow-lg"
                    )}>
                      {tile.title}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Scroll Right Button */}
        <button
          onClick={scrollRight}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-black/80 hover:bg-black rounded-full flex items-center justify-center text-white shadow-lg"
        >
          <ChevronRight className="w-4 w-4" />
        </button>
      </div>

      {/* Effect Details Panel */}
      {selectedEffect && selectedEffect !== 'reset' && (
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
      )}

      {!selectedEffect && (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm text-center px-4">
          <p>{t('selectEffectPrompt') || 'Click on an effect to configure it'}</p>
        </div>
      )}
    </div>
  );
}

// Voice Coder Details Component
function VoiceCoderDetails({
  effect,
  onToggle,
  onUpdateParams,
  onLoadPreset,
  currentPreset,
  availablePresets,
}: {
  effect: AudioEffectsState['voiceCoder'];
  onToggle: () => void;
  onUpdateParams: (params: Partial<VoiceCoderParams>) => void;
  onLoadPreset?: (preset: VoiceCoderPreset) => void;
  currentPreset?: VoiceCoderPreset;
  availablePresets?: Record<string, { name: string; description: string; params: VoiceCoderParams }>;
}) {
  const { t } = useI18n('audioEffects');

  return (
    <Card className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 border-blue-500/30 p-4">
      <div className="space-y-4">
        {/* Header with toggle */}
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-white font-bold text-base flex items-center gap-2">
              <span className="text-2xl">🎤</span>
              {t('voiceCoder.title')}
            </h4>
            <p className="text-gray-400 text-xs mt-1">
              Auto-tune et correction de justesse
            </p>
          </div>
          <Switch checked={effect.enabled} onCheckedChange={onToggle} />
        </div>

        <div className={cn('space-y-3', !effect.enabled && 'opacity-50 pointer-events-none')}>
          {/* Preset Selector */}
          {availablePresets && onLoadPreset && (
            <div>
              <Label className="text-white text-sm mb-2 block">{t('voiceCoder.quickConfig.label')}</Label>
              <Select
                value={currentPreset || 'correction-subtile'}
                onValueChange={(value: VoiceCoderPreset) => onLoadPreset(value)}
              >
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(availablePresets).map(([key, preset]) => (
                    <SelectItem key={key} value={key}>
                      {preset.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">{t('presets.custom')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Sliders with precise control (0.01 step where applicable) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-white text-xs mb-1 block">
                { t('voiceCoder.retuneSpeed.label') }: {effect.params.retuneSpeed}%
              </Label>
              <Slider
                value={[effect.params.retuneSpeed]}
                min={0}
                max={100}
                step={0.01}
                onValueChange={([value]) => onUpdateParams({ retuneSpeed: Math.round(value * 100) / 100 })}
              />
            </div>

            <div>
              <Label className="text-white text-xs mb-1 block">
                {t('voiceCoder.strength.label')}: {effect.params.strength}%
              </Label>
              <Slider
                value={[effect.params.strength]}
                min={0}
                max={100}
                step={0.01}
                onValueChange={([value]) => onUpdateParams({ strength: Math.round(value * 100) / 100 })}
              />
            </div>

            <div>
              <Label className="text-white text-xs mb-1 block">
                {t('voiceCoder.naturalVibrato.label')}: {effect.params.naturalVibrato}%
              </Label>
              <Slider
                value={[effect.params.naturalVibrato]}
                min={0}
                max={100}
                step={0.01}
                onValueChange={([value]) => onUpdateParams({ naturalVibrato: Math.round(value * 100) / 100 })}
              />
            </div>

            <div>
              <Label className="text-white text-xs mb-1 block">
                {t('voiceCoder.pitch.label')}: {effect.params.pitch > 0 ? '+' : ''}{effect.params.pitch}
              </Label>
              <Slider
                value={[effect.params.pitch]}
                min={-12}
                max={12}
                step={0.01}
                onValueChange={([value]) => onUpdateParams({ pitch: Math.round(value * 100) / 100 })}
              />
            </div>
          </div>

          {/* Scale and Key */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-white text-xs mb-1 block">{t('voiceCoder.scale.label')}</Label>
              <Select
                value={effect.params.scale}
                onValueChange={(value: 'chromatic' | 'major' | 'minor' | 'pentatonic') =>
                  onUpdateParams({ scale: value })
                }
              >
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chromatic">{t('voiceCoder.scale.chromatic')}</SelectItem>
                  <SelectItem value="major">{t('voiceCoder.scale.major')}</SelectItem>
                  <SelectItem value="minor">{t('voiceCoder.scale.minor')}</SelectItem>
                  <SelectItem value="pentatonic">{t('voiceCoder.scale.pentatonic')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-white text-xs mb-1 block">{t('voiceCoder.key.label')}</Label>
              <Select
                value={effect.params.key}
                onValueChange={(value) => onUpdateParams({ key: value as any })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map((key) => (
                    <SelectItem key={key} value={key}>
                      {key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Harmonization */}
          <div className="flex items-center justify-between p-2 bg-gray-800/50 rounded">
            <Label className="text-white text-sm">Harmonisation</Label>
            <Switch
              checked={effect.params.harmonization}
              onCheckedChange={(checked) => onUpdateParams({ harmonization: checked })}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

// Back Sound Details Component
function BackSoundDetails({
  effect,
  onToggle,
  onUpdateParams,
  availableBackSounds,
}: {
  effect: AudioEffectsState['backSound'];
  onToggle: () => void;
  onUpdateParams: (params: Partial<BackSoundParams>) => void;
  availableBackSounds: readonly { id: string; name: string; url: string }[];
}) {
  const { t } = useI18n('audioEffects');

  return (
    <Card className="bg-gradient-to-br from-green-900/40 to-green-800/20 border-green-500/30 p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-white font-bold text-base flex items-center gap-2">
              <span className="text-2xl">🎶</span>
              {t('backSound.title')}
            </h4>
            <p className="text-gray-400 text-xs mt-1">
              Musique de fond
            </p>
          </div>
          <Switch checked={effect.enabled} onCheckedChange={onToggle} />
        </div>

        <div className={cn('space-y-3', !effect.enabled && 'opacity-50 pointer-events-none')}>
          {/* Upload */}
          <div>
            <Label className="text-white text-sm mb-2 block">{t('backSound.uploadLabel')}</Label>
            <label className="flex items-center justify-center gap-2 w-full py-2 px-3 bg-gray-800 border border-gray-600 rounded-md text-white text-sm cursor-pointer hover:bg-gray-700">
              <Upload className="w-4 h-4" />
              <span>{t('backSound.uploadButton')}</span>
              <input
                type="file"
                accept="audio/mp3,audio/wav,audio/mpeg,audio/x-wav"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const url = URL.createObjectURL(file);
                    onUpdateParams({ soundFile: url });
                  }
                }}
              />
            </label>
          </div>

          {/* Volume */}
          <div>
            <Label className="text-white text-xs mb-1 block">
              {t('backSound.volume.label')}: {effect.params.volume}%
            </Label>
            <Slider
              value={[effect.params.volume]}
              min={0}
              max={100}
              step={0.01}
              onValueChange={([value]) => onUpdateParams({ volume: Math.round(value * 100) / 100 })}
            />
          </div>

          {/* Loop Mode */}
          <div>
            <Label className="text-white text-sm mb-2 block">{t('backSound.loopMode.label')}</Label>
            <Select
              value={effect.params.loopMode}
              onValueChange={(value: 'N_TIMES' | 'N_MINUTES') => onUpdateParams({ loopMode: value })}
            >
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="N_TIMES">Nombre de fois</SelectItem>
                <SelectItem value="N_MINUTES">Durée (minutes)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Loop Value */}
          <div>
            <Label className="text-white text-xs mb-1 block">
              {effect.params.loopMode === 'N_TIMES' ? 'Répétitions' : 'Minutes'}: {effect.params.loopValue}
            </Label>
            <Slider
              value={[effect.params.loopValue]}
              min={1}
              max={effect.params.loopMode === 'N_TIMES' ? 10 : 60}
              step={1}
              onValueChange={([value]) => onUpdateParams({ loopValue: value })}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

// Baby Voice Details Component
function BabyVoiceDetails({
  effect,
  onToggle,
  onUpdateParams,
}: {
  effect: AudioEffectsState['babyVoice'];
  onToggle: () => void;
  onUpdateParams: (params: Partial<BabyVoiceParams>) => void;
}) {
  const { t } = useI18n('audioEffects');

  return (
    <Card className="bg-gradient-to-br from-pink-900/40 to-pink-800/20 border-pink-500/30 p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-white font-bold text-base flex items-center gap-2">
              <span className="text-2xl">👶</span>
              {t('babyVoice.title')}
            </h4>
            <p className="text-gray-400 text-xs mt-1">
              Voix enfantine
            </p>
          </div>
          <Switch checked={effect.enabled} onCheckedChange={onToggle} />
        </div>

        <div className={cn('space-y-3', !effect.enabled && 'opacity-50 pointer-events-none')}>
          <div>
            <Label className="text-white text-xs mb-1 block">
              {t('effects.baby-voice.params.pitch.label')}: +{effect.params.pitch}
            </Label>
            <Slider
              value={[effect.params.pitch]}
              min={6}
              max={12}
              step={0.01}
              onValueChange={([value]) => onUpdateParams({ pitch: Math.round(value * 100) / 100 })}
            />
          </div>

          <div>
            <Label className="text-white text-xs mb-1 block">
              {t('effects.baby-voice.params.formant.label')}: {effect.params.formant.toFixed(2)}x
            </Label>
            <Slider
              value={[effect.params.formant * 100]}
              min={120}
              max={150}
              step={0.01}
              onValueChange={([value]) => onUpdateParams({ formant: Math.round(value * 100) / 10000 })}
            />
          </div>

          <div>
            <Label className="text-white text-xs mb-1 block">
              {t('effects.baby-voice.params.breathiness.label')}: {effect.params.breathiness}%
            </Label>
            <Slider
              value={[effect.params.breathiness]}
              min={0}
              max={100}
              step={0.01}
              onValueChange={([value]) => onUpdateParams({ breathiness: Math.round(value * 100) / 100 })}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

// Demon Voice Details Component
function DemonVoiceDetails({
  effect,
  onToggle,
  onUpdateParams,
}: {
  effect: AudioEffectsState['demonVoice'];
  onToggle: () => void;
  onUpdateParams: (params: Partial<DemonVoiceParams>) => void;
}) {
  const { t } = useI18n('audioEffects');

  return (
    <Card className="bg-gradient-to-br from-red-900/40 to-red-800/20 border-red-500/30 p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-white font-bold text-base flex items-center gap-2">
              <span className="text-2xl">😈</span>
              {t('demonVoice.title')}
            </h4>
            <p className="text-gray-400 text-xs mt-1">
              Voix démoniaque
            </p>
          </div>
          <Switch checked={effect.enabled} onCheckedChange={onToggle} />
        </div>

        <div className={cn('space-y-3', !effect.enabled && 'opacity-50 pointer-events-none')}>
          <div>
            <Label className="text-white text-xs mb-1 block">
              {t('effects.demon-voice.params.pitch.label')}: {effect.params.pitch}
            </Label>
            <Slider
              value={[effect.params.pitch]}
              min={-12}
              max={-8}
              step={0.01}
              onValueChange={([value]) => onUpdateParams({ pitch: Math.round(value * 100) / 100 })}
            />
          </div>

          <div>
            <Label className="text-white text-xs mb-1 block">
              {t('effects.demon-voice.params.distortion.label')}: {effect.params.distortion}%
            </Label>
            <Slider
              value={[effect.params.distortion]}
              min={0}
              max={100}
              step={0.01}
              onValueChange={([value]) => onUpdateParams({ distortion: Math.round(value * 100) / 100 })}
            />
          </div>

          <div>
            <Label className="text-white text-xs mb-1 block">
              {t('effects.demon-voice.params.reverb.label')}: {effect.params.reverb}%
            </Label>
            <Slider
              value={[effect.params.reverb]}
              min={0}
              max={100}
              step={0.01}
              onValueChange={([value]) => onUpdateParams({ reverb: Math.round(value * 100) / 100 })}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
