## 2026-10-26 : The WebRTC call stack has two STACKED layers, not overlapping ones; the group mesh peer link is a twin to converge (#13141)

**Question.** The iOS audit of 2026-10-26 asked whether the two WebRTC layers overlap.

**Trace.** All WebRTC code is app-side (`apps/ios/Meeshy/Features/Main/Services/`); the SDK only carries signalling (`MessageSocketManager+CallSignaling`), models and audio-session coordination.

| layer | type | responsibility |
|---|---|---|
| orchestration | `CallManager` (+ extensions) | call state machine, CallKit, signalling, reconnection attempts |
| policy | `WebRTCService` (`@MainActor`) | ICE candidate buffer before the remote description, replay of a duplicate offer/answer, quality ladder, survival freeze, stats tick |
| transport | `WebRTCClientProviding` → `P2PWebRTCClient` | one `RTCPeerConnection`: perfect negotiation, SDP rules, capture, codecs, sender encoding, data channel |
| mesh | `WebRTCGroupPeerLink` + `WebRTCGroupPeerLinkFactory` (#3585) | one `RTCPeerConnection` per group member, sharing `WebRTCSharedFactory` and the local video track |

`WebRTCService` and `P2PWebRTCClient` do not overlap: the service never touches libwebrtc, the client holds no call policy, and the protocol between them is the test seam (`WebRTCClientProviding`, fallback `P2PWebRTCClient+Fallback`).

**Decision.** Keep the two stacked layers. Call policy goes in `WebRTCService`, libwebrtc in `P2PWebRTCClient`, and neither re-implements the other.

**Duplication found.** `WebRTCGroupPeerLink` re-implements, for a mesh peer, rules the 1:1 layers already hold, and they diverge:
- collision rule without the `isSettingRemoteAnswerPending` exemption;
- no `WebRTCSdpRules.validateRemoteSDP` on remote descriptions;
- a second candidate buffer (cap 64 against `QualityThresholds.iceCandidateBufferCap` = 200);
- a second ICE restart backoff (`restartBackoff`, web `peer-link.ts` parity, against `CallReliabilityPolicy.reconnectBackoffSeconds`).

Follow-up: #13180 (one pure rule per item, shared by both peer links; legitimate differences become parameters).

No product code changes with this decision.
