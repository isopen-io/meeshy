import * as Tone from 'tone';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAudioEffects } from '../use-audio-effects';
import { createAudioEffectProcessor } from '@/utils/audio-effects';
import type { AudioEffectType } from '@meeshy/shared/types/video-call';

jest.mock('@/utils/audio-effects', () => ({
  createAudioEffectProcessor: jest.fn(),
}));

/**
 * `rebuildAudioGraph()` (in `use-audio-effects.ts`) rewires the Web Audio
 * graph on every `effectsState` change, even when the change only concerns
 * ONE effect. Processors are chained (input -> effect A -> effect B ->
 * destination), so a toggle on effect B genuinely shifts effect A's outgoing
 * wire — the graph-edge rebuild is unavoidable and cheap. But the previous
 * implementation ALSO called the processor's full lifecycle `disconnect()`
 * (which, for `VoiceCoderProcessor`, stops its pitch-detection rAF loop) and
 * `setActive()` on EVERY processor regardless of whether that processor's own
 * enabled bit changed — producing a wasted stop/restart cycle of background
 * work for processors that never actually toggled.
 */
const mockCreateAudioEffectProcessor = createAudioEffectProcessor as jest.Mock;

type MockProcessor = {
  inputNode: { __id: string };
  outputNode: { connect: jest.Mock; disconnect: jest.Mock };
  connect: jest.Mock;
  disconnect: jest.Mock;
  updateParams: jest.Mock;
  destroy: jest.Mock;
  setActive?: jest.Mock;
};

function makeMockProcessor(type: AudioEffectType): MockProcessor {
  return {
    inputNode: { __id: `${type}-input` },
    outputNode: { connect: jest.fn(), disconnect: jest.fn() },
    connect: jest.fn(),
    disconnect: jest.fn(),
    updateParams: jest.fn(),
    destroy: jest.fn(),
    ...(type === 'voice-coder' ? { setActive: jest.fn() } : {}),
  };
}

function makeFakeInputStream(): MediaStream {
  return {
    getAudioTracks: () => [{ getSettings: () => ({ channelCount: 2 }) }],
  } as unknown as MediaStream;
}

describe('useAudioEffects rebuildAudioGraph', () => {
  let processorsByType: Map<AudioEffectType, MockProcessor>;

  beforeEach(() => {
    jest.clearAllMocks();
    processorsByType = new Map();
    mockCreateAudioEffectProcessor.mockImplementation((type: AudioEffectType) => {
      const processor = makeMockProcessor(type);
      processorsByType.set(type, processor);
      return processor;
    });

    const rawContext = (Tone.context as any).rawContext;
    rawContext.createMediaStreamSource = jest.fn(() => ({ channelCount: 2, connect: jest.fn() }));
    rawContext.createChannelSplitter = jest.fn(() => ({ connect: jest.fn() }));
    rawContext.createChannelMerger = jest.fn(() => ({ connect: jest.fn() }));
    rawContext.createMediaStreamDestination = jest.fn(() => ({ stream: {} as MediaStream }));
  });

  async function renderInitializedHook() {
    const inputStream = makeFakeInputStream();
    const hook = renderHook(() => useAudioEffects({ inputStream }));
    await waitFor(() => expect(hook.result.current.outputStream).not.toBeNull());
    return hook;
  }

  it('does not re-invoke disconnect() on a processor whose own enabled bit is unchanged by an unrelated toggle', async () => {
    const { result } = await renderInitializedHook();

    await act(async () => {
      result.current.toggleEffect('voice-coder');
    });
    await waitFor(() => expect(processorsByType.get('voice-coder')).toBeDefined());

    const voiceCoder = processorsByType.get('voice-coder')!;
    voiceCoder.disconnect.mockClear();
    (voiceCoder.setActive as jest.Mock).mockClear();

    await act(async () => {
      result.current.toggleEffect('back-sound');
    });
    await waitFor(() => expect(processorsByType.get('back-sound')).toBeDefined());

    expect(voiceCoder.disconnect).not.toHaveBeenCalled();
    expect(voiceCoder.setActive).not.toHaveBeenCalled();
  });

  it('does not re-invoke setActive() on a processor while only its params change', async () => {
    const { result } = await renderInitializedHook();

    await act(async () => {
      result.current.toggleEffect('voice-coder');
    });
    await waitFor(() => expect(processorsByType.get('voice-coder')).toBeDefined());

    const voiceCoder = processorsByType.get('voice-coder')!;
    voiceCoder.disconnect.mockClear();
    (voiceCoder.setActive as jest.Mock).mockClear();

    await act(async () => {
      result.current.updateEffectParams('voice-coder', { pitch: 3 });
    });

    expect(voiceCoder.disconnect).not.toHaveBeenCalled();
    expect(voiceCoder.setActive).not.toHaveBeenCalled();
  });

  it('still rewires the Web Audio graph edges of an unchanged processor when a neighbor toggles', async () => {
    const { result } = await renderInitializedHook();

    await act(async () => {
      result.current.toggleEffect('voice-coder');
    });
    await waitFor(() => expect(processorsByType.get('voice-coder')).toBeDefined());

    const voiceCoder = processorsByType.get('voice-coder')!;
    voiceCoder.outputNode.disconnect.mockClear();

    await act(async () => {
      result.current.toggleEffect('back-sound');
    });
    await waitFor(() => expect(processorsByType.get('back-sound')).toBeDefined());

    expect(voiceCoder.outputNode.disconnect).toHaveBeenCalled();
  });

  it('fully quiesces a processor (disconnect + setActive(false)) when its own enabled bit flips off', async () => {
    const { result } = await renderInitializedHook();

    await act(async () => {
      result.current.toggleEffect('voice-coder');
    });
    await waitFor(() => expect(processorsByType.get('voice-coder')).toBeDefined());

    const voiceCoder = processorsByType.get('voice-coder')!;
    voiceCoder.disconnect.mockClear();
    (voiceCoder.setActive as jest.Mock).mockClear();

    await act(async () => {
      result.current.toggleEffect('voice-coder');
    });

    expect(voiceCoder.disconnect).toHaveBeenCalledTimes(1);
    expect(voiceCoder.setActive).toHaveBeenCalledWith(false);
  });

  it('fully activates a newly-enabled processor (disconnect + setActive(true))', async () => {
    const { result } = await renderInitializedHook();

    await act(async () => {
      result.current.toggleEffect('voice-coder');
    });
    await waitFor(() => expect(processorsByType.get('voice-coder')).toBeDefined());

    const voiceCoder = processorsByType.get('voice-coder')!;
    expect(voiceCoder.setActive).toHaveBeenCalledWith(true);
  });
});
