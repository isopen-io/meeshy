/**
 * Iter 69wb — a11y clavier (WCAG 2.1.1 *Keyboard* / 4.1.2 *Name, Role, Value* /
 * 2.4.7 *Focus Visible*) des segments de `AudioEffectsTimeline`, la timeline
 * cliquable rendue par `AudioEffectsPanel` (lazy-loadée par `SimpleAudioPlayer`,
 * lecture des messages audio). Avant : chaque segment était un `<div onClick>`
 * souris-only (pas de `role`, `tabIndex`, `onKeyDown`) → impossible de chercher
 * (seek) un segment au clavier. Après : `role="button"` focusable, nom
 * accessible, activable Enter/Space, clic souris préservé.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AudioEffectsTimeline } from '../../../components/audio/AudioEffectsTimeline';
import type { AudioEffectType } from '@meeshy/shared/types/video-call';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => (key === 'timeline.clickToSeek' ? 'Click to seek' : key),
  }),
}));

jest.mock('../../../components/audio/AudioEffectIcon', () => ({
  AudioEffectIcon: () => <span data-testid="effect-icon" />,
}));

jest.mock('@/utils/audio-effects-config', () => ({
  getEffectName: (effect: string) => effect,
  getEffectColor: () => '#abcdef',
}));

const VOICE_CODER = 'voice-coder' as AudioEffectType;

const buildProps = (overrides = {}) => ({
  appliedEffects: [VOICE_CODER],
  effectsTimeline: [{ effectType: VOICE_CODER, startTime: 1000, endTime: 3000 }],
  totalDuration: 10,
  onSeekToTime: jest.fn(),
  ...overrides,
});

describe('AudioEffectsTimeline segments — keyboard a11y', () => {
  it('exposes each segment as a focusable button with an accessible name', () => {
    render(<AudioEffectsTimeline {...buildProps()} />);
    const segment = screen.getByRole('button', { name: /1\.00s - 3\.00s - Click to seek/ });
    expect(segment).toHaveAttribute('tabindex', '0');
  });

  it('seeks to the segment start on Enter key', () => {
    const onSeekToTime = jest.fn();
    render(<AudioEffectsTimeline {...buildProps({ onSeekToTime })} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onSeekToTime).toHaveBeenCalledWith(1);
  });

  it('seeks to the segment start on Space key', () => {
    const onSeekToTime = jest.fn();
    render(<AudioEffectsTimeline {...buildProps({ onSeekToTime })} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
    expect(onSeekToTime).toHaveBeenCalledWith(1);
  });

  it('ignores neutral keys', () => {
    const onSeekToTime = jest.fn();
    render(<AudioEffectsTimeline {...buildProps({ onSeekToTime })} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab' });
    expect(onSeekToTime).not.toHaveBeenCalled();
  });

  it('preserves mouse click seek', () => {
    const onSeekToTime = jest.fn();
    render(<AudioEffectsTimeline {...buildProps({ onSeekToTime })} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSeekToTime).toHaveBeenCalledWith(1);
  });

  it('renders no segment button when there is no timeline data', () => {
    render(<AudioEffectsTimeline {...buildProps({ effectsTimeline: [] })} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
