/**
 * The `video-calls` barrel exports the public API surface of this component family.
 * `useWebRTC` (components/video-calls/hooks/useWebRTC.ts) is dead code: no production
 * component imports it (VideoCallInterface uses `useWebRTCP2P` from
 * `@/hooks/use-webrtc-p2p` instead), and its `switchCamera` mutates the local
 * MediaStream directly (`removeTrack`/`addTrack`) instead of calling
 * `RTCRtpSender.replaceTrack` on each peer connection's sender — unlike the correct,
 * actually-wired implementation in `VideoCallInterface.handleSwitchCamera`. Exporting
 * it from the barrel is a footgun: a future caller could import it from the public
 * surface and silently get camera switching that never reaches any peer connection.
 * See tasks/calls-fonctionnel-todo.md, Vague 33.
 *
 * `useVideoFilters` (components/video-calls/hooks/useVideoFilters.ts) was the same
 * class of dead code: a WebGL filter pipeline (temperature/brightness/contrast/
 * saturation/exposure) with zero production callers — never exported from this
 * barrel, never imported by VideoCallInterface or any other component. Removed
 * outright rather than left to rot a second time. See Vague 68.
 */
import fs from 'fs';
import path from 'path';

const indexPath = path.join(__dirname, '../../../components/video-calls/index.ts');
const deadHookPath = path.join(__dirname, '../../../components/video-calls/hooks/useWebRTC.ts');
const deadFiltersHookPath = path.join(__dirname, '../../../components/video-calls/hooks/useVideoFilters.ts');

describe('video-calls index barrel', () => {
  it('does not export the dead/buggy useWebRTC hook', () => {
    const indexSource = fs.readFileSync(indexPath, 'utf-8');
    expect(indexSource).not.toMatch(/useWebRTC/);
  });

  it('does not ship the dead useWebRTC hook file', () => {
    expect(fs.existsSync(deadHookPath)).toBe(false);
  });

  it('does not export the dead useVideoFilters hook', () => {
    const indexSource = fs.readFileSync(indexPath, 'utf-8');
    expect(indexSource).not.toMatch(/useVideoFilters/);
  });

  it('does not ship the dead useVideoFilters hook file', () => {
    expect(fs.existsSync(deadFiltersHookPath)).toBe(false);
  });
});
