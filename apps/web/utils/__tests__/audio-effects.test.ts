import * as Tone from 'tone';
import { snapToScale, SCALES, BackSoundProcessor } from '../audio-effects';
import type { BackSoundParams } from '@meeshy/shared/types/video-call';

/**
 * snapToScale corrects a detected MIDI pitch to the nearest note of a musical
 * scale. "Nearest" is on the pitch CIRCLE (mod 12), so a note near the top of an
 * octave can be closer to a scale note in the octave ABOVE than to any note in
 * its own octave — the octave wrap-around must be considered.
 */
describe('snapToScale', () => {
  it('snaps B up to the C of the next octave on a pentatonic scale (octave wrap)', () => {
    // B4 = MIDI 71 (noteInOctave 11). Pentatonic = [0,2,4,7,9].
    // Linear-only distance picks 9 (A4, MIDI 69, distance 2). The true nearest
    // note on the pitch circle is C5 (MIDI 72): 0 of the next octave, distance 1.
    expect(snapToScale(71, SCALES.pentatonic)).toBe(72);
  });

  it('leaves an in-scale note unchanged', () => {
    // A4 = MIDI 69, which is 9 — already in the pentatonic scale.
    expect(snapToScale(69, SCALES.pentatonic)).toBe(69);
  });

  it('is a no-op for the chromatic scale (every note present)', () => {
    expect(snapToScale(71, SCALES.chromatic)).toBe(71);
    expect(snapToScale(60, SCALES.chromatic)).toBe(60);
  });

  it('snaps to the nearest in-octave note when no wrap is closer', () => {
    // MIDI 65 (F, noteInOctave 5) on pentatonic [0,2,4,7,9]:
    // nearest is 4 (distance 1) vs 7 (distance 2) → MIDI 64.
    expect(snapToScale(65, SCALES.pentatonic)).toBe(64);
  });

  it('applies transpose after snapping', () => {
    expect(snapToScale(71, SCALES.pentatonic, 2)).toBe(74);
  });
});

/**
 * BackSoundProcessor mixes a looping background track into the outgoing call
 * audio. It must reach the peer through the effect chain (playerGain →
 * outputNode) only — never the local speakers, or the user hears their own
 * background track directly (and, on a speakerphone/laptop without
 * headphones, the mic re-captures it into a second, echoed copy of the same
 * outgoing stream).
 */
describe('BackSoundProcessor.loadSound', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const params: BackSoundParams = {
    soundFile: 'ambience.mp3',
    volume: 50,
    loopMode: 'N_MINUTES',
    loopValue: 5,
  };

  it('never routes the background player to the local audio destination', async () => {
    const processor = new BackSoundProcessor(params);

    await processor.loadSound('https://cdn.example.com/ambience.mp3');

    const playerInstance = (Tone.Player as unknown as jest.Mock).mock.results[0].value;
    expect(playerInstance.toDestination).not.toHaveBeenCalled();
  });

  it('connects the loaded player into the effect chain (playerGain)', async () => {
    const processor = new BackSoundProcessor(params);

    await processor.loadSound('https://cdn.example.com/ambience.mp3');

    const playerInstance = (Tone.Player as unknown as jest.Mock).mock.results[0].value;
    expect(playerInstance.connect).toHaveBeenCalledTimes(1);
    expect(playerInstance.connect).toHaveBeenCalledWith((processor as any).playerGain);
  });
});
