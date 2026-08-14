import {
  getCallMediaConstraints,
  stopPreauthorizedStream,
  AUDIO_CONSTRAINTS,
} from '../call-media-constraints';

describe('getCallMediaConstraints', () => {
  it('requests audio only (video: false) for an audio call', () => {
    const constraints = getCallMediaConstraints('audio');

    expect(constraints.audio).toEqual(AUDIO_CONSTRAINTS);
    expect(constraints.video).toBe(false);
  });

  it('requests audio and video for a video call', () => {
    const constraints = getCallMediaConstraints('video');

    expect(constraints.audio).toEqual(AUDIO_CONSTRAINTS);
    expect(constraints.video).toBeTruthy();
    expect(typeof constraints.video).toBe('object');
  });
});

describe('stopPreauthorizedStream', () => {
  it('stops every track and clears the window handoff', () => {
    const stopA = jest.fn();
    const stopB = jest.fn();
    const stream = { getTracks: () => [{ stop: stopA }, { stop: stopB }] } as unknown as MediaStream;
    (window as any).__preauthorizedMediaStream = stream;

    stopPreauthorizedStream(stream);

    expect(stopA).toHaveBeenCalled();
    expect(stopB).toHaveBeenCalled();
    expect((window as any).__preauthorizedMediaStream).toBeUndefined();
  });

  it('is a no-op when the stream is null', () => {
    expect(() => stopPreauthorizedStream(null)).not.toThrow();
  });

  it('does not clear the window handoff when it has since been overwritten by a different call flow', () => {
    // Cross-call race: an outbound call (use-video-call.ts) acquires streamA and
    // publishes it to the global handoff. Before its failure path runs, an unrelated
    // inbound call (CallManager.tsx) accepts and overwrites the SAME global with its
    // own streamB, which VideoCallInterface is about to consume. The outbound flow's
    // cleanup must only stop/clear ITS OWN stream — never the live one it no longer owns.
    const stopA = jest.fn();
    const stopB = jest.fn();
    const streamA = { getTracks: () => [{ stop: stopA }] } as unknown as MediaStream;
    const streamB = { getTracks: () => [{ stop: stopB }] } as unknown as MediaStream;

    (window as any).__preauthorizedMediaStream = streamA;
    (window as any).__preauthorizedMediaStream = streamB;

    stopPreauthorizedStream(streamA);

    expect(stopA).toHaveBeenCalled();
    expect(stopB).not.toHaveBeenCalled();
    expect((window as any).__preauthorizedMediaStream).toBe(streamB);
  });
});
