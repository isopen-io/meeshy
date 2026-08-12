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
 *
 * `CallStatusIndicator` (components/video-calls/CallStatusIndicator.tsx) duplicated
 * `CallQualityOverlay`'s connection-quality badge — from a LESS accurate local
 * `getQualityFromState()` reading the raw `RTCPeerConnectionState` instead of the
 * real `qualityStats` — and duplicated the participant-name label `VideoStream`
 * already renders on the video tile itself, while stacking at the exact same
 * `absolute top-4 right-4` position as `CallQualityOverlay`: two black
 * rounded-corner boxes rendered on top of each other the moment the connection
 * degraded or stats were opened. Its `callDuration` prop was dead (destructured
 * as `_callDuration`, never read). Removed outright. See Vague 117.
 */
import fs from 'fs';
import path from 'path';

const indexPath = path.join(__dirname, '../../../components/video-calls/index.ts');
const deadHookPath = path.join(__dirname, '../../../components/video-calls/hooks/useWebRTC.ts');
const deadFiltersHookPath = path.join(__dirname, '../../../components/video-calls/hooks/useVideoFilters.ts');
const deadStatusIndicatorPath = path.join(__dirname, '../../../components/video-calls/CallStatusIndicator.tsx');

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

  // Vague 117: CallStatusIndicator duplicated CallQualityOverlay's connection-quality
  // badge (from a LESS accurate local getQualityFromState() instead of real
  // qualityStats) and VideoStream's own participant-name label, while stacking at the
  // exact same `absolute top-4 right-4` position as CallQualityOverlay — two
  // black rounded-corner boxes rendered on top of each other. Its `callDuration`
  // prop was dead (destructured as `_callDuration`, never read). Removed outright
  // rather than left to rot a third time. See tasks/calls-fonctionnel-todo.md.
  it('does not export the dead/duplicated CallStatusIndicator', () => {
    const indexSource = fs.readFileSync(indexPath, 'utf-8');
    expect(indexSource).not.toMatch(/CallStatusIndicator/);
  });

  it('does not ship the dead CallStatusIndicator file', () => {
    expect(fs.existsSync(deadStatusIndicatorPath)).toBe(false);
  });
});
