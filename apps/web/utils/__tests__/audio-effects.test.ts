import * as Tone from 'tone';
import { snapToScale, SCALES, BackSoundProcessor, VoiceCoderProcessor } from '../audio-effects';
import type { BackSoundParams, VoiceCoderParams } from '@meeshy/shared/types/video-call';

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

/**
 * VoiceCoderProcessor runs a continuous requestAnimationFrame loop (FFT pitch
 * detection + correction) while active. `rebuildAudioGraph()` in
 * use-audio-effects.ts calls `disconnect()` on every processor on EVERY
 * effect toggle — including toggling a *different* effect — so disconnect()
 * alone can't tell this processor whether IT specifically remains enabled.
 * `setActive()` is the explicit signal the hook uses instead, and the SOLE
 * authority over starting/stopping the loop: without it, the rAF loop kept
 * running indefinitely after the user turned voice-coder off — pure
 * CPU/battery cost for the rest of the call with no audible effect. And if
 * disconnect() *also* stopped the loop as a defensive measure, every rebuild
 * triggered by an unrelated effect toggle would cancel and immediately
 * reschedule a fresh rAF chain for a voice-coder that never actually turned
 * off — the opposite failure mode, churn instead of a leak.
 */
describe('VoiceCoderProcessor.setActive', () => {
  const params: VoiceCoderParams = {
    pitch: 0,
    harmonization: false,
    strength: 50,
    retuneSpeed: 50,
    scale: 'chromatic',
    key: 'C',
    naturalVibrato: 0,
  };

  let rafSpy: jest.SpyInstance;
  let cafSpy: jest.SpyInstance;

  beforeEach(() => {
    // requestAnimationFrame never needs to actually fire for this test: only
    // whether the loop was (re)armed or torn down matters, not its output.
    rafSpy = jest.spyOn(global, 'requestAnimationFrame').mockReturnValue(1 as unknown as number);
    cafSpy = jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
    rafSpy.mockRestore();
    cafSpy.mockRestore();
  });

  it('starts the pitch-detection loop on construction', () => {
    new VoiceCoderProcessor(params);
    expect(rafSpy).toHaveBeenCalledTimes(1);
  });

  it('cancels the in-flight animation frame when deactivated', () => {
    const processor = new VoiceCoderProcessor(params);

    processor.setActive(false);

    expect(cafSpy).toHaveBeenCalledTimes(1);
  });

  it('does not schedule a second loop for a redundant setActive(false)', () => {
    const processor = new VoiceCoderProcessor(params);

    processor.setActive(false);
    processor.setActive(false);

    expect(cafSpy).toHaveBeenCalledTimes(1);
  });

  it('resumes the pitch-detection loop when reactivated', () => {
    const processor = new VoiceCoderProcessor(params);
    processor.setActive(false);
    rafSpy.mockClear();

    processor.setActive(true);

    expect(rafSpy).toHaveBeenCalledTimes(1);
  });

  it('does not schedule a duplicate loop for a redundant setActive(true)', () => {
    const processor = new VoiceCoderProcessor(params);
    rafSpy.mockClear();

    // Already active from construction — a second setActive(true) must not
    // start a concurrent second rAF chain.
    processor.setActive(true);

    expect(rafSpy).not.toHaveBeenCalled();
  });

  it('disconnect() alone does not stop the loop — setActive is the sole authority', () => {
    // disconnect() only tears down the audio-graph connection (outputNode).
    // Stopping the background rAF work is setActive(false)'s job exclusively,
    // so a bare disconnect() (e.g. as the first half of a rebuild that will
    // reconnect this same processor) must never touch it.
    const processor = new VoiceCoderProcessor(params);

    processor.disconnect();

    expect(cafSpy).not.toHaveBeenCalled();
  });

  it('rebuilding the graph for an unrelated effect leaves an active loop uninterrupted', () => {
    // This is the exact sequence use-audio-effects.ts's rebuildAudioGraph()
    // runs on EVERY effect toggle, including toggling a different effect
    // while voice-coder stays enabled: disconnect() all processors, then
    // setActive(enabled) all processors. Regression coverage for the churn
    // this used to cause: disconnect() stopped the loop, then setActive(true)
    // immediately restarted it — cancelling and rescheduling a fresh rAF
    // chain (plus a frame of dropped pitch correction) on every unrelated
    // toggle for as long as voice-coder stayed on.
    const processor = new VoiceCoderProcessor(params);
    rafSpy.mockClear();

    processor.disconnect();
    processor.setActive(true);

    expect(cafSpy).not.toHaveBeenCalled();
    expect(rafSpy).not.toHaveBeenCalled();
  });

  it('destroy() still stops the loop (it calls stopPitchDetection explicitly, ahead of disconnect())', () => {
    const processor = new VoiceCoderProcessor(params);

    processor.destroy();

    expect(cafSpy).toHaveBeenCalledTimes(1);
  });
});
