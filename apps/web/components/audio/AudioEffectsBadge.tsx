/**
 * AUDIO EFFECTS BADGE
 * Badge affiché sur les messages audio qui ont des effets appliqués
 * Permet de voir la timeline des effets en cliquant
 */

'use client';

import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { AudioEffectsTimeline } from '@meeshy/shared/types/audio-effects-timeline';
import { AudioEffectsTimelineView } from './AudioEffectsTimelineView';

interface AudioEffectsBadgeProps {
  timeline: AudioEffectsTimeline;
  className?: string;
}

export function AudioEffectsBadge({ timeline, className }: AudioEffectsBadgeProps) {
  const { t } = useI18n('audioEffects');
  const [isOpen, setIsOpen] = useState(false);

  // Compter le nombre d'effets différents utilisés
  const effectsUsed = timeline.metadata?.totalEffectsUsed || 0;

  if (effectsUsed === 0) {
    return null; // Pas d'effets, pas de badge
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
            'bg-gradient-to-r from-purple-500/20 to-pink-500/20',
            'border border-purple-500/30',
            'hover:from-purple-500/30 hover:to-pink-500/30',
            'transition-all duration-200',
            'group',
            className
          )}
          title={t('badge.clickToView')}
        >
          <Sparkles className="w-3 h-3 text-purple-400 group-hover:text-purple-300 transition-colors" />
          <span className="text-[10px] font-medium text-purple-300 group-hover:text-purple-200 transition-colors">
            {effectsUsed} {t('timeline.effectsUsed')}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-96 p-0 bg-gray-900/95 backdrop-blur-xl border-purple-500/30"
        side="top"
        align="start"
        sideOffset={8}
      >
        <AudioEffectsTimelineView timeline={timeline} />
      </PopoverContent>
    </Popover>
  );
}
