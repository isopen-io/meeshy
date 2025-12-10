'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface AudioWaveformProps {
  isRecording: boolean;
  audioLevel?: number;
  className?: string;
}

/**
 * Composant de visualisation d'onde audio animée
 * Affiche des barres animées qui réagissent au niveau audio
 */
export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  isRecording,
  audioLevel = 0.7,
  className = '',
}) => {
  const bars = 20;
  const baseHeight = 3;
  const maxHeight = 32;

  return (
    <div className={`flex items-center justify-center gap-0.5 h-10 ${className}`}>
      {Array.from({ length: bars }).map((_, index) => {
        // Créer un pattern de vague avec offset pour chaque barre
        const phaseOffset = (index / bars) * Math.PI * 2;
        const delay = index * 0.05; // Délai progressif pour effet de vague

        return (
          <motion.div
            key={index}
            className={`w-1 rounded-full ${
              isRecording
                ? 'bg-gradient-to-t from-red-500 to-red-300'
                : 'bg-gray-300 dark:bg-gray-600'
            }`}
            animate={
              isRecording
                ? {
                    height: [
                      baseHeight,
                      baseHeight + (maxHeight - baseHeight) * audioLevel * 0.3,
                      baseHeight + (maxHeight - baseHeight) * audioLevel,
                      baseHeight + (maxHeight - baseHeight) * audioLevel * 0.3,
                      baseHeight,
                    ],
                  }
                : { height: baseHeight }
            }
            transition={{
              duration: 1.2,
              repeat: isRecording ? Infinity : 0,
              ease: 'easeInOut',
              delay: isRecording ? delay : 0,
            }}
          />
        );
      })}
    </div>
  );
};
