'use client';

import React, { memo } from 'react';
import type { AudioEffectType } from '@meeshy/shared/types/video-call';
import { AudioEffectIcon } from './AudioEffectIcon';
import { getEffectName, getEffectColor } from '@/utils/audio-effects-config';

interface AudioEffectsTimelineProps {
  appliedEffects: AudioEffectType[];
  effectsTimeline: Array<{ effectType: AudioEffectType; startTime: number; endTime: number }>;
  totalDuration: number;
  onSeekToTime: (time: number) => void;
}

/**
 * Timeline visuelle des effets audio
 * Affiche les périodes d'activation de chaque effet
 */
export const AudioEffectsTimeline = memo<AudioEffectsTimelineProps>(({
  appliedEffects,
  effectsTimeline,
  totalDuration,
  onSeekToTime,
}) => {
  return (
    <div className="space-y-2">
      {appliedEffects.map((effect) => {
        const segments = effectsTimeline.filter(s => s.effectType === effect);

        return (
          <div key={effect} className="space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <AudioEffectIcon effect={effect} className="w-3.5 h-3.5" />
              <span className="font-medium text-gray-700 dark:text-gray-300">{getEffectName(effect)}</span>
              <span className="text-gray-400">({segments.length} segment{segments.length > 1 ? 's' : ''})</span>
            </div>

            {/* Barre de timeline */}
            <div className="relative h-6 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
              {segments.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-400">
                  Aucun segment
                </div>
              ) : (
                segments.map((segment, idx) => {
                  const startTimeSeconds = segment.startTime / 1000;
                  const endTimeSeconds = segment.endTime / 1000;
                  const startPercent = (startTimeSeconds / totalDuration) * 100;
                  const widthPercent = ((endTimeSeconds - startTimeSeconds) / totalDuration) * 100;

                  return (
                    <div
                      key={idx}
                      className="absolute h-full rounded cursor-pointer hover:opacity-100 transition-opacity"
                      style={{
                        left: `${startPercent}%`,
                        width: `${widthPercent}%`,
                        backgroundColor: getEffectColor(effect),
                        opacity: 0.8,
                      }}
                      title={`${startTimeSeconds.toFixed(2)}s - ${endTimeSeconds.toFixed(2)}s - Cliquez pour aller à ce moment`}
                      onClick={() => onSeekToTime(startTimeSeconds)}
                    />
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

AudioEffectsTimeline.displayName = 'AudioEffectsTimeline';
