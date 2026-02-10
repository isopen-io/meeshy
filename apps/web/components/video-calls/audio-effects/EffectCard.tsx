/**
 * EFFECT CARD
 * Individual effect tile with status indicators
 */

'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { RotateCcw, Mic2, Baby, Skull, Music } from 'lucide-react';
import type { AudioEffectType } from '@meeshy/shared/types/video-call';

type EffectTileType = 'reset' | AudioEffectType;

interface EffectCardProps {
  id: EffectTileType;
  title: string;
  gradient: string;
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
}

const EffectIcon: React.FC<{ effect: EffectTileType; className?: string }> = ({ effect, className = 'w-4 h-4' }) => {
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

export const EffectCard = React.memo<EffectCardProps>(({
  id,
  title,
  gradient,
  isActive,
  isSelected,
  onClick,
}) => {
  return (
    <Card
      className={cn(
        'relative flex-shrink-0 w-28 h-28 sm:w-32 sm:h-32 p-2 sm:p-3 cursor-pointer transition-[transform,box-shadow] duration-300',
        `bg-gradient-to-br ${gradient}`,
        'hover:scale-105 hover:shadow-xl',
        isSelected && 'ring-2 ring-white scale-105',
        isActive && 'ring-2 ring-green-400 shadow-lg'
      )}
    >
      {/* Active indicator */}
      {id !== 'reset' && isActive && (
        <div className="absolute top-2 right-2 flex items-center justify-center">
          <div className="relative">
            <div className="absolute inset-0 w-3 h-3 bg-green-400 rounded-full animate-ping opacity-75"></div>
            <div className="relative w-3 h-3 bg-green-400 rounded-full"></div>
          </div>
        </div>
      )}

      {/* Status badge */}
      {id !== 'reset' && (
        <div className={cn(
          "absolute top-2 left-2 px-1.5 py-0.5 rounded text-[11px] font-bold",
          isActive
            ? "bg-green-500/90 text-white"
            : "bg-gray-700/80 text-gray-300"
        )}>
          {isActive ? 'ON' : 'OFF'}
        </div>
      )}

      {/* Card content */}
      <div
        onClick={onClick}
        className="flex flex-col items-center justify-center h-full text-white"
      >
        <div className="transition-[width,height] duration-300">
          <EffectIcon
            effect={id}
            className={cn(
              "transition-[width,height] duration-300 text-white",
              isActive ? "w-10 h-10 sm:w-12 sm:h-12" : "w-8 h-8 sm:w-10 sm:h-10"
            )}
          />
        </div>

        <div className="hidden sm:block text-center mt-2">
          <p className={cn(
            "text-xs font-semibold leading-tight transition-colors",
            isActive && "text-white drop-shadow-lg"
          )}>
            {title}
          </p>
        </div>
      </div>
    </Card>
  );
});

EffectCard.displayName = 'EffectCard';
