/**
 * BABY VOICE DETAILS
 * Configuration panel for baby voice effect
 */

'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import type { AudioEffectsState, BabyVoiceParams } from '@meeshy/shared/types/video-call';

interface BabyVoiceDetailsProps {
  effect: AudioEffectsState['babyVoice'];
  onToggle: () => void;
  onUpdateParams: (params: Partial<BabyVoiceParams>) => void;
}

export const BabyVoiceDetails = React.memo<BabyVoiceDetailsProps>(({
  effect,
  onToggle,
  onUpdateParams,
}) => {
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
});

BabyVoiceDetails.displayName = 'BabyVoiceDetails';
