/**
 * AUDIO EFFECTS PANEL
 * Grid layout with 4 audio effect cards
 *
 * Features:
 * - Voice Coder (auto-tune)
 * - Baby Voice
 * - Demon Voice
 * - Back Sound Code (background music)
 */

'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/hooks/useI18n';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Info, Upload, X } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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

interface AudioEffectsPanelProps {
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
  onClose?: () => void; // Optional close handler for X button
  className?: string;
}

export function AudioEffectsPanel({
  effectsState,
  onToggleEffect,
  onUpdateParams,
  onLoadPreset,
  currentPreset,
  availablePresets,
  availableBackSounds,
  onClose,
  className,
}: AudioEffectsPanelProps) {
  const { t } = useI18n('audioEffects');

  // State for mobile effect selector
  const [selectedMobileEffect, setSelectedMobileEffect] = useState<AudioEffectType | 'none'>('voice-coder');

  // Handler to disable all effects
  const handleDisableAll = () => {
    Object.values(effectsState).forEach((effect) => {
      if (effect.enabled) {
        onToggleEffect(effect.type);
      }
    });
  };

  // Helper component pour label avec tooltip
  const LabelWithTooltip = ({ label, tooltip }: { label: React.ReactNode; tooltip: string }) => (
    <div className="flex items-center gap-1">
      <Label className="text-gray-300 text-[10px] font-semibold">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="text-gray-400 hover:text-white transition-colors">
            <Info className="w-3 h-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-56 bg-gray-800 border-gray-600 text-white text-[10px] p-2 z-[10000]"
          side="bottom"
          align="center"
          sideOffset={5}
          avoidCollisions={true}
          collisionPadding={10}
        >
          {tooltip}
        </PopoverContent>
      </Popover>
    </div>
  );

  return (
    <div
      className={cn(
        'bg-gradient-to-br from-gray-900/95 via-black/95 to-purple-900/95',
        'backdrop-blur-xl rounded-lg p-2 max-h-full overflow-y-auto',
        'border border-white/10 shadow-2xl',
        'animate-in slide-in-from-bottom duration-300',
        className
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1">
          <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded-md flex items-center justify-center">
            <span className="text-sm">🎭</span>
          </div>
          <div>
            <h3 className="text-white text-sm font-bold">{t('title')}</h3>
            <p className="text-gray-400 text-[11px]">{t('subtitle')}</p>
          </div>
        </div>

        {/* Close button - visible when onClose handler is provided */}
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 w-7 p-0 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            aria-label="Close audio effects panel"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Mobile Effect Selector - visible only on mobile */}
      <div className="md:hidden mb-2">
        <Label className="text-gray-300 text-xs mb-1 block">{t('selectEffect')}</Label>
        <Select
          value={selectedMobileEffect}
          onValueChange={(value) => {
            if (value === 'disable-all') {
              handleDisableAll();
              setSelectedMobileEffect('none');
            } else {
              setSelectedMobileEffect(value as AudioEffectType);
            }
          }}
        >
          <SelectTrigger className="bg-gray-800 border-gray-600 text-white h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="voice-coder">🎤 {t('voiceCoder.title')}</SelectItem>
            <SelectItem value="back-sound">🎶 {t('backSound.title')}</SelectItem>
            <SelectItem value="baby-voice">👶 {t('babyVoice.title')}</SelectItem>
            <SelectItem value="demon-voice">😈 {t('demonVoice.title')}</SelectItem>
            <SelectItem value="disable-all" className="text-red-400 font-medium">❌ {t('disableAll')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {/* Voice Coder Effect */}
        <Card className={cn(
          "bg-gradient-to-br from-blue-900/40 to-blue-800/20 border-blue-500/30 p-1.5 hover:border-blue-400/50 transition-[color,box-shadow] duration-300 hover:shadow-lg hover:shadow-blue-500/20",
          "hidden md:block",
          selectedMobileEffect === 'voice-coder' && "!block"
        )}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <span className="text-sm">🎤</span>
              <Label className="text-white font-medium text-[11px]">{t('voiceCoder.title')}</Label>
              {/* Tooltip Info - visible sur mobile */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="text-gray-400 hover:text-white transition-colors">
                    <Info className="w-3 h-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 bg-gray-800 border-gray-600 text-white text-xs p-2">
                  <div className="space-y-1">
                    <p className="font-semibold">Perfect Voice - Auto-Tune</p>
                    <p className="text-gray-300">Correction automatique de la justesse de votre voix pour chanter juste.</p>
                    <div className="pt-1 space-y-0.5 text-[10px]">
                      <p><strong>Rapidité:</strong> Vitesse de correction</p>
                      <p><strong>Gamme:</strong> Notes autorisées</p>
                      <p><strong>Force:</strong> Intensité de l'effet</p>
                      <p><strong>Expression:</strong> Garde le naturel</p>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <Switch
              checked={effectsState.voiceCoder.enabled}
              onCheckedChange={() => onToggleEffect('voice-coder')}
              className="scale-75"
            />
          </div>

          <div className={cn('space-y-1', !effectsState.voiceCoder.enabled && 'opacity-50')}>
            {/* Preset Selector */}
            {availablePresets && onLoadPreset && (
              <div>
                <LabelWithTooltip
                  label={t('voiceCoder.quickConfig.label')}
                  tooltip={t('voiceCoder.quickConfig.tooltip')}
                />
                <Select
                  value={currentPreset || 'correction-subtile'}
                  onValueChange={(value: VoiceCoderPreset) => onLoadPreset(value)}
                  disabled={!effectsState.voiceCoder.enabled}
                >
                  <SelectTrigger className="mt-1 bg-gray-800 border-gray-600 text-white h-6 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(availablePresets).map(([key, preset]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex flex-col">
                          <span className="font-medium">{preset.name}</span>
                          <span className="text-[10px] text-gray-400">{preset.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">
                      <div className="flex flex-col">
                        <span className="font-medium">{t("presets.custom")}</span>
                        <span className="text-[10px] text-gray-400">{t("presets.customDescription")}</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Sliders principaux en grille 2x2 */}
            <div className="grid grid-cols-2 gap-2">
              {/* Rapidité de correction */}
              <div>
                <LabelWithTooltip
                  label={`${t('voiceCoder.retuneSpeed.label')} (${effectsState.voiceCoder.params.retuneSpeed}%)`}
                  tooltip={t('voiceCoder.retuneSpeed.tooltip')}
                />
                <Slider
                  value={[effectsState.voiceCoder.params.retuneSpeed]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={([value]) =>
                    onUpdateParams('voice-coder', { retuneSpeed: value })
                  }
                  disabled={!effectsState.voiceCoder.enabled}
                  className="mt-1"
                />
              </div>

              {/* Force de l'effet */}
              <div>
                <LabelWithTooltip
                  label={`${t('voiceCoder.strength.label')} (${effectsState.voiceCoder.params.strength}%)`}
                  tooltip={t('voiceCoder.strength.tooltip')}
                />
                <Slider
                  value={[effectsState.voiceCoder.params.strength]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={([value]) =>
                    onUpdateParams('voice-coder', { strength: value })
                  }
                  disabled={!effectsState.voiceCoder.enabled}
                  className="mt-1"
                />
              </div>

              {/* Expression naturelle */}
              <div>
                <LabelWithTooltip
                  label={`${t('voiceCoder.naturalVibrato.label')} (${effectsState.voiceCoder.params.naturalVibrato}%)`}
                  tooltip={t('voiceCoder.naturalVibrato.tooltip')}
                />
                <Slider
                  value={[effectsState.voiceCoder.params.naturalVibrato]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={([value]) =>
                    onUpdateParams('voice-coder', { naturalVibrato: value })
                  }
                  disabled={!effectsState.voiceCoder.enabled}
                  className="mt-1"
                />
              </div>

              {/* Hauteur globale */}
              <div>
                <LabelWithTooltip
                  label={`${t('voiceCoder.pitch.label')} (${effectsState.voiceCoder.params.pitch > 0 ? '+' : ''}${effectsState.voiceCoder.params.pitch})`}
                  tooltip={t("voiceCoder.pitch.tooltip")}
                />
                <Slider
                  value={[effectsState.voiceCoder.params.pitch]}
                  min={-12}
                  max={12}
                  step={1}
                  onValueChange={([value]) =>
                    onUpdateParams('voice-coder', { pitch: value })
                  }
                  disabled={!effectsState.voiceCoder.enabled}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Gamme & Tonalité */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-gray-300 text-[10px]">{t("voiceCoder.scale.label")}</Label>
                <Select
                  value={effectsState.voiceCoder.params.scale}
                  onValueChange={(value: 'chromatic' | 'major' | 'minor' | 'pentatonic') =>
                    onUpdateParams('voice-coder', { scale: value })
                  }
                  disabled={!effectsState.voiceCoder.enabled}
                >
                  <SelectTrigger className="mt-1 bg-gray-800 border-gray-600 text-white h-6 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chromatic">{t("voiceCoder.scale.chromatic")}</SelectItem>
                    <SelectItem value="major">{t("voiceCoder.scale.major")}</SelectItem>
                    <SelectItem value="minor">{t("voiceCoder.scale.minor")}</SelectItem>
                    <SelectItem value="pentatonic">{t("voiceCoder.scale.pentatonic")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-gray-300 text-[10px]">{t("voiceCoder.key.label")}</Label>
                <Select
                  value={effectsState.voiceCoder.params.key}
                  onValueChange={(value: 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B') =>
                    onUpdateParams('voice-coder', { key: value })
                  }
                  disabled={!effectsState.voiceCoder.enabled}
                >
                  <SelectTrigger className="mt-1 bg-gray-800 border-gray-600 text-white h-6 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="C">Do (C)</SelectItem>
                    <SelectItem value="C#">Do# (C#)</SelectItem>
                    <SelectItem value="D">Ré (D)</SelectItem>
                    <SelectItem value="D#">Ré# (D#)</SelectItem>
                    <SelectItem value="E">Mi (E)</SelectItem>
                    <SelectItem value="F">Fa (F)</SelectItem>
                    <SelectItem value="F#">Fa# (F#)</SelectItem>
                    <SelectItem value="G">Sol (G)</SelectItem>
                    <SelectItem value="G#">Sol# (G#)</SelectItem>
                    <SelectItem value="A">La (A)</SelectItem>
                    <SelectItem value="A#">La# (A#)</SelectItem>
                    <SelectItem value="B">Si (B)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Harmonisation */}
            <div className="flex items-center justify-between">
              <LabelWithTooltip
                label={t("voiceCoder.harmonization.label")}
                tooltip={t("voiceCoder.harmonization.tooltip")}
              />
              <Switch
                checked={effectsState.voiceCoder.params.harmonization}
                onCheckedChange={(checked) =>
                  onUpdateParams('voice-coder', { harmonization: checked })
                }
                disabled={!effectsState.voiceCoder.enabled}
              />
            </div>
          </div>
        </Card>

        {/* Background Ambiance Effect */}
        <Card className={cn(
          "bg-gradient-to-br from-green-900/40 to-green-800/20 border-green-500/30 p-1.5 hover:border-green-400/50 transition-[color,box-shadow] duration-300 hover:shadow-lg hover:shadow-green-500/20",
          "hidden md:block",
          selectedMobileEffect === 'back-sound' && "!block"
        )}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <span className="text-lg">🎶</span>
              <Label className="text-white font-medium text-[11px]">{t('backSound.title')}</Label>
            </div>
            <Switch
              checked={effectsState.backSound.enabled}
              onCheckedChange={() => onToggleEffect('back-sound')}
            />
          </div>

          <div className={cn('space-y-1', !effectsState.backSound.enabled && 'opacity-50')}>
            <div>
              <LabelWithTooltip
                label={t("backSound.uploadLabel")}
                tooltip={t("backSound.uploadDescription")}
              />
              <label
                htmlFor="audio-file-upload"
                className={cn(
                  'flex items-center justify-center gap-1 w-full mt-1 py-1.5 px-2',
                  'bg-gray-800 border border-gray-600 rounded-md',
                  'text-white text-[10px] cursor-pointer',
                  'hover:bg-gray-700 hover:border-gray-500 transition-colors',
                  !effectsState.backSound.enabled && 'opacity-50 pointer-events-none'
                )}
              >
                <Upload className="w-3 h-3" />
                <span>{t("backSound.uploadButton")}</span>
              </label>
              <input
                id="audio-file-upload"
                type="file"
                accept="audio/mp3,audio/wav,audio/mpeg,audio/x-wav"
                className="hidden"
                disabled={!effectsState.backSound.enabled}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const url = URL.createObjectURL(file);
                    onUpdateParams('back-sound', { soundFile: url });
                  }
                }}
              />
            </div>

            <div>
              <LabelWithTooltip
                label={`${t("backSound.volume.label")} (${effectsState.backSound.params.volume}%)`}
                tooltip={t("backSound.volume.tooltip")}
              />
              <Slider
                value={[effectsState.backSound.params.volume]}
                min={0}
                max={100}
                step={5}
                onValueChange={([value]) =>
                  onUpdateParams('back-sound', { volume: value })
                }
                disabled={!effectsState.backSound.enabled}
                className="mt-1"
              />
            </div>

            <div>
              <LabelWithTooltip
                label={t("backSound.loopMode.label")}
                tooltip={t("backSound.loopMode.tooltip") || "Select playback mode"}
              />
              <Select
                value={effectsState.backSound.params.loopMode}
                onValueChange={(value: 'N_TIMES' | 'N_MINUTES') =>
                  onUpdateParams('back-sound', { loopMode: value })
                }
                disabled={!effectsState.backSound.enabled}
              >
                <SelectTrigger className="mt-1 bg-gray-800 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="N_TIMES">{t("backSound.loopMode.nTimes")}</SelectItem>
                  <SelectItem value="N_MINUTES">{t("backSound.loopMode.nMinutes")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-gray-300 text-xs">
                {effectsState.backSound.params.loopMode === 'N_TIMES' ? t('backSound.loopValue.labelTimes') : t('backSound.loopValue.labelMinutes')} ({effectsState.backSound.params.loopValue})
              </Label>
              <Slider
                value={[effectsState.backSound.params.loopValue]}
                min={1}
                max={effectsState.backSound.params.loopMode === 'N_TIMES' ? 10 : 60}
                step={1}
                onValueChange={([value]) =>
                  onUpdateParams('back-sound', { loopValue: value })
                }
                disabled={!effectsState.backSound.enabled}
                className="mt-1"
              />
            </div>
          </div>
        </Card>

        {/* Baby Voice Effect */}
        <Card className={cn(
          "bg-gradient-to-br from-pink-900/40 to-pink-800/20 border-pink-500/30 p-1.5 hover:border-pink-400/50 transition-[color,box-shadow] duration-300 hover:shadow-lg hover:shadow-pink-500/20",
          "hidden md:block",
          selectedMobileEffect === 'baby-voice' && "!block"
        )}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <span className="text-lg">👶</span>
              <Label className="text-white font-medium text-[11px]">{t('babyVoice.title')}</Label>
            </div>
            <Switch
              checked={effectsState.babyVoice.enabled}
              onCheckedChange={() => onToggleEffect('baby-voice')}
            />
          </div>

          <div className={cn('space-y-1', !effectsState.babyVoice.enabled && 'opacity-50')}>
            <div>
              <LabelWithTooltip
                label={`${t("babyVoice.pitch.label")} (+${effectsState.babyVoice.params.pitch})`}
                tooltip={t("babyVoice.pitch.tooltip")}
              />
              <Slider
                value={[effectsState.babyVoice.params.pitch]}
                min={6}
                max={12}
                step={1}
                onValueChange={([value]) =>
                  onUpdateParams('baby-voice', { pitch: value })
                }
                disabled={!effectsState.babyVoice.enabled}
                className="mt-1"
              />
            </div>

            <div>
              <LabelWithTooltip
                label={`${t("babyVoice.formant.label")} (${effectsState.babyVoice.params.formant.toFixed(1)}x)`}
                tooltip={t("babyVoice.formant.tooltip")}
              />
              <Slider
                value={[effectsState.babyVoice.params.formant * 10]}
                min={12}
                max={15}
                step={1}
                onValueChange={([value]) =>
                  onUpdateParams('baby-voice', { formant: value / 10 })
                }
                disabled={!effectsState.babyVoice.enabled}
                className="mt-1"
              />
            </div>

            <div>
              <LabelWithTooltip
                label={`${t("babyVoice.breathiness.label")} (${effectsState.babyVoice.params.breathiness}%)`}
                tooltip={t("babyVoice.breathiness.tooltip")}
              />
              <Slider
                value={[effectsState.babyVoice.params.breathiness]}
                min={0}
                max={100}
                step={5}
                onValueChange={([value]) =>
                  onUpdateParams('baby-voice', { breathiness: value })
                }
                disabled={!effectsState.babyVoice.enabled}
                className="mt-1"
              />
            </div>
          </div>
        </Card>

        {/* Demon Voice Effect */}
        <Card className={cn(
          "bg-gradient-to-br from-red-900/40 to-red-800/20 border-red-500/30 p-1.5 hover:border-red-400/50 transition-[color,box-shadow] duration-300 hover:shadow-lg hover:shadow-red-500/20",
          "hidden md:block",
          selectedMobileEffect === 'demon-voice' && "!block"
        )}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <span className="text-lg">😈</span>
              <Label className="text-white font-medium text-[11px]">{t('demonVoice.title')}</Label>
            </div>
            <Switch
              checked={effectsState.demonVoice.enabled}
              onCheckedChange={() => onToggleEffect('demon-voice')}
            />
          </div>

          <div className={cn('space-y-1', !effectsState.demonVoice.enabled && 'opacity-50')}>
            <div>
              <LabelWithTooltip
                label={`${t("demonVoice.pitch.label")} (${effectsState.demonVoice.params.pitch})`}
                tooltip={t("demonVoice.pitch.tooltip")}
              />
              <Slider
                value={[effectsState.demonVoice.params.pitch]}
                min={-12}
                max={-8}
                step={1}
                onValueChange={([value]) =>
                  onUpdateParams('demon-voice', { pitch: value })
                }
                disabled={!effectsState.demonVoice.enabled}
                className="mt-1"
              />
            </div>

            <div>
              <LabelWithTooltip
                label={`${t("demonVoice.distortion.label")} (${effectsState.demonVoice.params.distortion}%)`}
                tooltip={t("demonVoice.distortion.tooltip")}
              />
              <Slider
                value={[effectsState.demonVoice.params.distortion]}
                min={0}
                max={100}
                step={5}
                onValueChange={([value]) =>
                  onUpdateParams('demon-voice', { distortion: value })
                }
                disabled={!effectsState.demonVoice.enabled}
                className="mt-1"
              />
            </div>

            <div>
              <LabelWithTooltip
                label={`${t("demonVoice.reverb.label")} (${effectsState.demonVoice.params.reverb}%)`}
                tooltip={t("demonVoice.reverb.tooltip")}
              />
              <Slider
                value={[effectsState.demonVoice.params.reverb]}
                min={0}
                max={100}
                step={5}
                onValueChange={([value]) =>
                  onUpdateParams('demon-voice', { reverb: value })
                }
                disabled={!effectsState.demonVoice.enabled}
                className="mt-1"
              />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
