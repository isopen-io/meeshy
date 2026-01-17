/**
 * DEMON VOICE DETAILS
 * Configuration panel for demon voice effect
 */

'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import type { AudioEffectsState, DemonVoiceParams } from '@meeshy/shared/types/video-call';

interface DemonVoiceDetailsProps {
  effect: AudioEffectsState['demonVoice'];
  onToggle: () => void;
  onUpdateParams: (params: Partial<DemonVoiceParams>) => void;
}

export const DemonVoiceDetails = React.memo<DemonVoiceDetailsProps>(({
  effect,
  onToggle,
  onUpdateParams,
}) => {
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
});

DemonVoiceDetails.displayName = 'DemonVoiceDetails';
