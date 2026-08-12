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
});
