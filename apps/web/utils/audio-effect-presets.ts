import type { VoiceCoderParams } from '@meeshy/shared/types/video-call';

export const BACK_SOUNDS: readonly { id: string; name: string; url: string }[] = [
  // { id: 'ambient-1', name: 'Ambient Space', url: '/sounds/ambient-space.mp3' },
  // { id: 'lofi-1', name: 'Lo-Fi Chill', url: '/sounds/lofi-chill.mp3' },
  // { id: 'nature-1', name: 'Forest Rain', url: '/sounds/forest-rain.mp3' },
  // { id: 'beats-1', name: 'Light Beats', url: '/sounds/light-beats.mp3' },
];

export const VOICE_CODER_PRESETS: Record<string, { name: string; description: string; params: VoiceCoderParams }> = {
  'voix-naturelle': {
    name: 'Voix Naturelle',
    description: 'Correction très subtile pour un son naturel',
    params: {
      pitch: 0,
      harmonization: false,
      strength: 30,
      retuneSpeed: 20,
      scale: 'chromatic',
      key: 'C',
      naturalVibrato: 70,
    },
  },
  'pop-star': {
    name: 'Pop Star',
    description: 'Effet moderne pour voix pop parfaite',
    params: {
      pitch: 0,
      harmonization: true,
      strength: 70,
      retuneSpeed: 60,
      scale: 'major',
      key: 'C',
      naturalVibrato: 30,
    },
  },
  'effet-robot': {
    name: 'Effet Robot',
    description: 'Correction instantanée style T-Pain',
    params: {
      pitch: 0,
      harmonization: false,
      strength: 90,
      retuneSpeed: 95,
      scale: 'chromatic',
      key: 'C',
      naturalVibrato: 5,
    },
  },
  'correction-subtile': {
    name: 'Correction Subtile',
    description: 'Amélioration discrète et agréable',
    params: {
      pitch: 0,
      harmonization: false,
      strength: 40,
      retuneSpeed: 35,
      scale: 'major',
      key: 'C',
      naturalVibrato: 60,
    },
  },
};
