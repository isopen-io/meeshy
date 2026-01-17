'use client';

import React, { memo } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VolumeControlProps {
  volume: number;
  isMuted: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
}

export const VolumeControl = memo<VolumeControlProps>(function VolumeControl({
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute
}) {
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onVolumeChange(parseFloat(e.target.value));
  };

  return (
    <div className="hidden sm:flex items-center gap-1">
      <Button
        onClick={onToggleMute}
        size="sm"
        variant="ghost"
        className="w-8 h-8 p-0"
      >
        {isMuted || volume === 0 ? (
          <VolumeX className="w-4 h-4" />
        ) : (
          <Volume2 className="w-4 h-4" />
        )}
      </Button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.1"
        value={isMuted ? 0 : volume}
        onChange={handleVolumeChange}
        className="w-16 h-1 accent-purple-600"
      />
    </div>
  );
});
