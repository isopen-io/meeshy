/**
 * CALL MEDIA CONSTRAINTS
 *
 * Single source of truth for the `getUserMedia` constraints used across the
 * calling feature. Both the caller (use-video-call.ts) and the callee
 * (CallManager.tsx's handleAcceptCall) MUST gate video acquisition on the
 * call's actual media type — an audio-only call must never activate the
 * camera or transmit video, for either party.
 */

export type CallMediaType = 'audio' | 'video';

export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 640, max: 1280 },
  height: { ideal: 480, max: 720 },
  frameRate: { ideal: 24, max: 30 },
  facingMode: 'user',
};

export function getCallMediaConstraints(type: CallMediaType): MediaStreamConstraints {
  return {
    audio: AUDIO_CONSTRAINTS,
    video: type === 'video' ? VIDEO_CONSTRAINTS : false,
  };
}

/**
 * Stops every track on a pre-authorized stream and clears the global handoff
 * used by VideoCallInterface's Safari-compatible pre-authorization path.
 * Must be called on any failure between acquiring the stream and the
 * VideoCallInterface mount that would otherwise consume it — leaving the
 * mic/camera hot after a failed join is a privacy regression of its own.
 */
export function stopPreauthorizedStream(stream: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
  delete (window as any).__preauthorizedMediaStream;
}
