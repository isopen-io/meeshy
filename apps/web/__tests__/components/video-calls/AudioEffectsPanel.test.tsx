import { render, screen } from '@testing-library/react';
import type { AudioEffectsState } from '@meeshy/shared/types/video-call';

// t() returns the key so the accessible name is deterministic.
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (k: string) => k, isLoading: false }),
}));

import { AudioEffectsPanel } from '@/components/video-calls/AudioEffectsPanel';

const effectsState: AudioEffectsState = {
  voiceCoder: {
    type: 'voice-coder',
    enabled: false,
    params: {
      pitch: 0,
      harmonization: false,
      strength: 0,
      retuneSpeed: 0,
      scale: 'chromatic',
      key: 'C',
      naturalVibrato: 0,
    },
  },
  babyVoice: { type: 'baby-voice', enabled: false, params: { pitch: 0, formant: 1.0, breathiness: 0 } },
  demonVoice: { type: 'demon-voice', enabled: false, params: { pitch: 0, distortion: 0, reverb: 0 } },
  backSound: {
    type: 'back-sound',
    enabled: false,
    params: { soundFile: '', volume: 0, loopMode: 'N_TIMES', loopValue: 1 },
  },
};

const renderPanel = () =>
  render(
    <AudioEffectsPanel
      effectsState={effectsState}
      onToggleEffect={jest.fn()}
      onUpdateParams={jest.fn()}
      availableBackSounds={[]}
    />
  );

describe('AudioEffectsPanel — info button accessibility', () => {
  it('gives every icon-only info button an accessible name', () => {
    renderPanel();
    const infoButtons = screen.getAllByRole('button', { name: 'moreInfo' });
    expect(infoButtons.length).toBeGreaterThan(0);
    infoButtons.forEach((btn) => expect(btn).toHaveAccessibleName('moreInfo'));
  });
});
