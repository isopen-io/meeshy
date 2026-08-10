import * as Tone from 'tone';
import { renderHook, waitFor } from '@testing-library/react';
import { useAudioEffects } from '../use-audio-effects';

jest.mock('@/utils/audio-effects', () => ({
  createAudioEffectProcessor: jest.fn(),
}));

/**
 * The mount effect in `use-audio-effects.ts` tears down and reinitializes the
 * Web Audio pipeline whenever `inputStream` changes (e.g. swapping the mic or
 * camera source mid-call). Its cleanup calls `setIsInitialized(false)` before
 * the same effect's setup body re-runs — but React state updates from a
 * cleanup are not visible to the setup body that fires immediately after in
 * the same flush, so a setup guarded on the `isInitialized` *state* reads a
 * stale (still-`true`) closure and never calls `initializeAudioPipeline()`
 * again. The pipeline silently keeps routing through the OLD, now-detached
 * `MediaStreamAudioSourceNode` for the rest of the call.
 */
function makeFakeInputStream(): MediaStream {
  return {
    getAudioTracks: () => [{ getSettings: () => ({ channelCount: 2 }) }],
  } as unknown as MediaStream;
}

describe('useAudioEffects input stream swap', () => {
  let createMediaStreamSource: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    const rawContext = (Tone.context as any).rawContext;
    createMediaStreamSource = jest.fn(() => ({ channelCount: 2, connect: jest.fn() }));
    rawContext.createMediaStreamSource = createMediaStreamSource;
    rawContext.createChannelSplitter = jest.fn(() => ({ connect: jest.fn() }));
    rawContext.createChannelMerger = jest.fn(() => ({ connect: jest.fn() }));
    rawContext.createMediaStreamDestination = jest.fn(() => ({ stream: {} as MediaStream }));
  });

  it('reinitializes the pipeline from the new stream when inputStream is swapped mid-call', async () => {
    const streamA = makeFakeInputStream();
    const streamB = makeFakeInputStream();
    const onOutputStreamReady = jest.fn();

    const { rerender } = renderHook(
      ({ inputStream }) => useAudioEffects({ inputStream, onOutputStreamReady }),
      { initialProps: { inputStream: streamA } }
    );

    await waitFor(() => expect(createMediaStreamSource).toHaveBeenCalledTimes(1));
    expect(createMediaStreamSource).toHaveBeenCalledWith(streamA);

    rerender({ inputStream: streamB });

    await waitFor(() => expect(createMediaStreamSource).toHaveBeenCalledTimes(2));
    expect(createMediaStreamSource).toHaveBeenCalledWith(streamB);
    expect(onOutputStreamReady).toHaveBeenCalledTimes(2);
  });

  /**
   * `initializeAudioPipeline()` overwrites `mediaStreamDestinationRef.current`
   * with a brand-new `MediaStreamAudioDestinationNode` on every (re)init, but
   * the mount effect's cleanup never touched the OLD one before this fix. The
   * old node stayed wired into the (long-lived, Tone.js-shared) AudioContext
   * graph, so it kept generating audio into a `MediaStream` nobody reads from
   * anymore — a CPU/battery leak that compounds with every mic/camera switch
   * during a call, since nothing ever stops.
   */
  it('stops the previous MediaStreamAudioDestinationNode output tracks when inputStream is swapped mid-call', async () => {
    const streamA = makeFakeInputStream();
    const streamB = makeFakeInputStream();
    const rawContext = (Tone.context as any).rawContext;
    const destinationNodes: Array<{
      disconnect: jest.Mock;
      stream: { getTracks: () => Array<{ stop: jest.Mock }> };
      track: { stop: jest.Mock };
    }> = [];
    rawContext.createMediaStreamDestination = jest.fn(() => {
      const track = { stop: jest.fn() };
      const node = { disconnect: jest.fn(), stream: { getTracks: () => [track] }, track };
      destinationNodes.push(node);
      return node;
    });

    const { rerender } = renderHook(
      ({ inputStream }) => useAudioEffects({ inputStream }),
      { initialProps: { inputStream: streamA } }
    );

    await waitFor(() => expect(destinationNodes).toHaveLength(1));
    const firstDestination = destinationNodes[0];

    rerender({ inputStream: streamB });

    await waitFor(() => expect(destinationNodes).toHaveLength(2));
    expect(firstDestination.track.stop).toHaveBeenCalledTimes(1);
    expect(firstDestination.disconnect).toHaveBeenCalledTimes(1);
    expect(destinationNodes[1].track.stop).not.toHaveBeenCalled();
  });
});
