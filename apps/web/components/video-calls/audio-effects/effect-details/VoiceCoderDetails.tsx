/**
 * VOICE CODER DETAILS
 * Configuration panel for voice coder effect
 */

'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import type { AudioEffectsState, VoiceCoderParams, VoiceCoderPreset } from '@meeshy/shared/types/video-call';

interface VoiceCoderDetailsProps {
  effect: AudioEffectsState['voiceCoder'];
  onToggle: () => void;
  onUpdateParams: (params: Partial<VoiceCoderParams>) => void;
  onLoadPreset?: (preset: VoiceCoderPreset) => void;
  currentPreset?: VoiceCoderPreset;
  availablePresets?: Record<string, { name: string; description: string; params: VoiceCoderParams }>;
}

export const VoiceCoderDetails = React.memo<VoiceCoderDetailsProps>(({
  effect,
  onToggle,
  onUpdateParams,
  onLoadPreset,
  currentPreset,
  availablePresets,
}) => {
  const { t } = useI18n('audioEffects');

  return (
    <Card className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 border-blue-500/30 p-4">
      <div className="space-y-4">
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-white text-xs mb-1 block">
                {t('voiceCoder.retuneSpeed.label')}: {effect.params.retuneSpeed}%
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
                onValueChange={(value) => onUpdateParams({ key: value as VoiceCoderParams['key'] })}
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
});

VoiceCoderDetails.displayName = 'VoiceCoderDetails';
