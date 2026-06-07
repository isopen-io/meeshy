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

## Review
(to fill at end)
