/**
 * BACK SOUND DETAILS
 * Configuration panel for background sound effect
 */

'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import type { AudioEffectsState, BackSoundParams } from '@meeshy/shared/types/video-call';

interface BackSoundDetailsProps {
  effect: AudioEffectsState['backSound'];
  onToggle: () => void;
  onUpdateParams: (params: Partial<BackSoundParams>) => void;
  availableBackSounds?: readonly { id: string; name: string; url: string }[];
}

export const BackSoundDetails = React.memo<BackSoundDetailsProps>(({
  effect,
  onToggle,
  onUpdateParams,
}) => {
  const { t } = useI18n('audioEffects');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      onUpdateParams({ soundFile: url });
    }
  };

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
          <div>
            <Label className="text-white text-sm mb-2 block">{t('backSound.uploadLabel')}</Label>
            <label className="flex items-center justify-center gap-2 w-full py-2 px-3 bg-gray-800 border border-gray-600 rounded-md text-white text-sm cursor-pointer hover:bg-gray-700">
              <Upload className="w-4 h-4" />
              <span>{t('backSound.uploadButton')}</span>
              <input
                type="file"
                accept="audio/mp3,audio/wav,audio/mpeg,audio/x-wav"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          </div>

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
});

BackSoundDetails.displayName = 'BackSoundDetails';
