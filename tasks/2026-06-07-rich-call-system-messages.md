# Rich Call System Messages — Plan (2026-06-07)

Branch: `claude/magical-dirac-Rlv8Z`

## Goal (from user)
Call/system messages must be:
1. Distinct color with a **double outline** (double contour) — set apart from chat bubbles.
2. Visible **audio/video call icon**.
3. Missed/passed calls **actionable**: call back, join/open active call.
4. **Direction indicator** (outgoing/emitted vs incoming/received) + missed state.
5. **Data spent per call** (KB/MB/GB) + **duration** + **general network quality**.
6. iOS **and** web parity.
7. Real measured stats (bytes/quality) reported by client → persisted → injected into the message.

## State-of-the-art design (researched)
- Centered, no avatar/tail; distinguished via **double contour** + accent tint.
- Direction via arrow orientation: outgoing = `phone.arrow.up.right`, incoming = `phone.arrow.down.left`; **red reserved for missed** (`phone.down.fill`). Video = `video.fill` family, same semantics.
- Whole row tappable = call back; explicit **"Join"** button when call still active/joinable.
- Data usage formatted decimal `.byteCount` (KB/MB/GB), marked `~` when estimated. Quality tiers Excellent/Good/Fair/Poor → green/lime/amber/red.
- A11y: combined VoiceOver label, hint "Double-tap to call back", 44pt targets, Dynamic Type.

## Layers
- L1 Shared: Prisma fields; `ConnectionQualityStats` bytes; `call-summary.ts` structured metadata + formatter (+tests); `GatewayMessage.metadata`; quality-report schema bytes.
- L2 Gateway: persist stats from quality reports; inject metadata into summary message; forward `metadata` through REST + socket serializers.
- L3 SDK Swift: `APIMessage.metadata` + `MeeshyMessage.callSummary` typed model + pure formatters (+tests).
- L4 iOS UI: `BubbleContent.callNotice`; `BubbleCallNoticeView`; `BubbleCallbacks` → `CallManager.startCall`; iOS reports cumulative bytes.
- L5 Web: render call system message bubble + call-back action.

## Review (done)

Shipped end-to-end, in 5 commits (shared → gateway → SDK → iOS → web):

- **L1 Shared**: `Message.metadata` + `CallSession.bytesSent/bytesReceived/networkQuality`
  schema fields; `ConnectionQualityStats` byte counters; `buildCallSummaryMetadata()`
  + `formatCallDataSize()` (measured-or-estimated data, decimal KB/MB/GB);
  `GatewayMessage`/`Message` gain `metadata`. **27 pure-logic tests pass.**
- **L2 Gateway**: `persistCallStats()` stores cumulative bytes + quality from
  `call:quality-report`; `createCallSummaryMessage()` injects the structured
  metadata; REST history + socket broadcast now forward `messageSource` +
  `metadata` (the socket broadcast previously stripped both — fixed, so realtime
  summaries render rich).
- **L3 SDK**: `CallSummaryMetadata` value type + pure formatters (Swift Testing);
  `APIMessage`/`MeeshyMessage` decode it; persisted via a new `callSummaryJson`
  GRDB column + migration so the bubble survives cache reloads.
- **L4 iOS**: `BubbleCallNoticeView` — double-contour card, direction-aware glyph
  (audio/video, outgoing/incoming/missed), duration·data·quality line,
  tap-to-call-back → `CallManager.startCall`. `CallStats` gains `bytesReceived`;
  `WebRTCService` reports a per-tick stats delegate; `CallManager` emits
  `call:quality-report` with real cumulative bytes + quality tier.
- **L5 Web**: `CallSystemMessage` parity component + branch in `BubbleMessage`;
  transformer + socket converter carry `messageSource`/`metadata`; i18n for
  en/fr/es/pt.

### Verified here
- Shared pure logic: 27/27 vitest pass.
- Changed shared type files: `tsc --noEmit` clean (the only errors are
  pre-existing target-config artifacts in untouched files).
- All locale JSON valid.

### Needs CI / device verification (no toolchain in this container)
- Swift build + SDK/iOS XCTest (no Swift toolchain here).
- Gateway `tsc`/jest require `prisma generate` (blocked by sandbox network) to
  pick up the new `Message.metadata` + `CallSession` scalar fields.
- Web `tsc`/Jest (web deps not installed here).

### Notes
- Direction is resolved per-viewer from `initiatorId` (same summary row shows
  "Sortant" to the caller, "Entrant" to the callee).
- Data spent prefers measured WebRTC bytes; falls back to a duration×bitrate
  estimate prefixed with "~". Network quality is hidden when never measured.
- Call summaries are terminal, so the actionable affordance is "call back"
  (re-initiate same media type) — there is no "join" for an ended call.
