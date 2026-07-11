# Call Transcript History — Local Persistence — Design

> Extends "Live Call Captions" (`docs/superpowers/specs/2026-07-10-live-call-transcription-design.md`,
> `docs/superpowers/specs/2026-07-11-call-control-buttons-harmonization-design.md`). Brainstormed
> interactively with the user, 2026-07-11.

## Problem

Live captions during a call already work well (multi-speaker rendering, 3-state cyclic
translation toggle, scrollable in-call panel). But the transcript is **purely ephemeral**:
`CallTranscriptionService.resetForCallEnd()` unconditionally clears every captured segment
(`allSegments.removeAll(); segments.removeAll()`), and the live panel caps retained segments at
`segmentRetentionLimit = 50`. Once the call ends, or once a long call exceeds 50 segments, that
history is gone — there is no way to revisit what was said.

The user wants "toute l'histoire de transcription et traduction de la conversation" maintained
and reviewable after the fact, reached the same way one reviews an audio/video attachment's
transcription today: via long-press on the message.

## Constraints established during brainstorming

- **Local-only, never synced to the server.** The whole "Live Call Captions" feature exists
  specifically because audio is never sent server-side for transcription (privacy decision,
  `CallTranscriptionService.startTranscribing`'s `supportsOnDeviceRecognition` guard, "jamais de
  repli sur la reconnaissance vocale serveur d'Apple... décision produit du spec"). Persisting
  the *already-transcribed text* to the server would be a materially different privacy posture
  than the feature was built around — the user explicitly rejected this. Each device keeps its
  own copy of the transcript (its own speech + whatever it received from the other participant
  in real time); there is no cross-device sync, no server storage. A device that never activated
  captions during a given call has no transcript for it, even if the other participant did.
- **Full retention during the live call**, not capped at 50 — the cap is what's being removed;
  the live panel's history is what gets persisted at call end.
- **Entry point: long-press on the call message**, exactly like every other message's long-press,
  landing on a detail view appropriate to the message's type — for a call, that view carries the
  call's facts (already shown today: type, duration, data, network quality, call-back) *and* its
  transcript/translation history if one exists on this device.
- **Explicit disclaimer**: the transcript view must tell the user the data is local-only and will
  be lost if the app is uninstalled or local data is cleared.

## Design

### 1. One long-press decision point, not two competing gesture recognizers

Today, two independent long-press mechanisms exist:

- `BubbleSwipeContainer`'s generic `simultaneousGesture(LongPressGesture...)` (`MessageListView.swift`),
  wired in `ConversationView.swift`'s `onLongPress: { messageId in ... }`, which explicitly
  no-ops for system messages: `guard msg.messageSource != .system else { return }` — with the
  comment "Le call-notice garde son propre long-press (sheet détails)".
- `BubbleCallNoticeView`'s own `.highPriorityGesture(LongPressGesture(minimumDuration: 0.35)...)`,
  which presents `CallSummaryDetailSheet` via a local `@State private var showDetails`.

The `highPriorityGesture` on `BubbleCallNoticeView` is **not** an accidental duplicate — its own
doc comment explains it was added after a 2026-07-03 audit specifically to stop a long-press from
*also* triggering the card's `Button { onCallBack }` tap action (a "pocket-dial" bug: the entire
call-notice card is itself a tap-to-callback button, so an un-prioritized long-press let both the
detail sheet AND a call-back fire on the same gesture). Removing this gesture outright to route
everything through the parent's `simultaneousGesture` would resurface that exact bug, since
`simultaneousGesture` does not preempt a child's own gesture recognition.

**What changes**: `BubbleCallNoticeView` keeps its `highPriorityGesture` (still required to
prevent the pocket-dial bug) but stops presenting its own local sheet. Instead, it calls a new
`onLongPress: (() -> Void)?` closure, wired by the parent to the *same* decision point every other
message's long-press already goes through — `ConversationView.swift`'s
`onLongPress: { messageId in ... }`. That closure's existing system-message guard changes from a
silent no-op to an explicit branch:

```swift
onLongPress: { messageId in
    guard overlayState.longPressEnabled else { return }
    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
    if msg.callSummary != nil {
        overlayState.systemMessageDetail = msg   // → SystemMessageDetailSheet (new)
    } else if msg.messageSource != .system {
        overlayState.overlayMessage = msg
        overlayState.showOverlayMenu = true       // unchanged
    }
    // Plain system notices (messageSource == .system, no callSummary — e.g. "X a
    // rejoint la conversation") have no detail to show and stay a no-op, exactly
    // as today: `BubbleSystemNoticeView` never had a long-press affordance, and
    // this change doesn't add one — only call messages (`callSummary != nil`)
    // gain a detail view.
}
```

User-visible outcome: long-press on a call message reaches its (enhanced) detail view through the
same decision point every other message's long-press uses; regular messages keep the existing
`MessageOverlayMenu`; plain system notices remain untouched (no long-press affordance, as today).
The gesture-recognizer plumbing needed to avoid the pocket-dial bug stays exactly where it has to
be — that's an implementation detail invisible to the user, not a second, competing long-press
behavior.

### 2. Capture: remove the live-call cap, persist a snapshot at call end

`CallTranscriptionService`'s `segmentRetentionLimit` (today `50`) is raised to a safety ceiling
that is never hit in normal use — `2000` — so the live panel retains the *entire* call's history,
which then becomes the source persisted at the end:

```swift
private let segmentRetentionLimit = 2000  // was 50 — a safety net against unbounded growth on
                                            // a multi-hour call, not a UX-visible truncation.
```

`resetForCallEnd()` persists before purging. `CallTranscriptionService` has no stored
`conversationId` or `callStartDate` today (only `callId`) — both live on `CallManager` instead.
Rather than duplicate that state here, both are threaded through as parameters, matching how
`startTranscribing` already takes `callId`/`localLanguage`/`localUserId` as call-site parameters
instead of pre-stored properties. `CallManager` — the sole caller of `resetForCallEnd()`, always
at definite end-of-call — already has both values in hand.

```swift
func resetForCallEnd(conversationId: String, callStartedAt: Date?) {
    if !allSegments.isEmpty {
        let snapshot = CallTranscript(
            callId: callId ?? "",
            conversationId: conversationId,
            callStartedAt: callStartedAt ?? Date(),
            segments: allSegments.map(CallTranscriptSegment.init)
        )
        Task { await CallTranscriptStore.shared.save(snapshot) }
    }
    stopTranscribing()
    isShowingOverlay = false
}
```

No segments captured (captions never activated this call) → nothing written, no empty entry.

### 3. Local-only persistence — same shape as `CacheCoordinator.drafts`

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Models/CallTranscript.swift
public struct CallTranscript: Codable, Sendable, CacheIdentifiable, Equatable {
    public let callId: String
    public let conversationId: String
    public let callStartedAt: Date
    public let segments: [CallTranscriptSegment]
    public var id: String { callId }
}

public struct CallTranscriptSegment: Codable, Sendable, Equatable {
    public let speakerId: String
    public let speakerName: String     // captured at call time — names can change later
    public let isLocal: Bool
    public let text: String            // original
    public let translatedText: String?
    public let translatedLanguage: String?
    public let capturedAt: Date
}
```

`CacheCoordinator` gains `public let callTranscripts: GRDBCacheStore<String, CallTranscript>`
with a new policy, modeled directly on `.drafts` (the only other explicitly "local-only, never
synced" policy in the codebase — `staleTTL == ttl` since SWR staleness doesn't apply to
local-only data):

```swift
/// Local-only call transcripts (never synced to the server — see
/// docs/superpowers/specs/2026-07-11-call-transcript-history-design.md). A
/// call's transcript is a personal record, not a draft — long TTL.
public static let callTranscripts = CachePolicy(ttl: .days(365), staleTTL: .days(365), maxItemCount: 1000, storageLocation: .grdb)
```

A dedicated actor, mirroring `ConversationDraftManager`'s shape exactly (no network calls, ever):

```swift
public actor CallTranscriptStore {
    public static let shared = CallTranscriptStore()
    private let cache: CacheCoordinator
    public func save(_ transcript: CallTranscript) async { await cache.callTranscripts.save([transcript], for: transcript.callId) }
    public func transcript(for callId: String) async -> CallTranscript? { await cache.callTranscripts.load(for: callId)?.value }
    public func invalidate(for callId: String) async { await cache.callTranscripts.invalidate(for: callId) }
}
```

When a call message itself is deleted from the conversation, its transcript (if any) is deleted
too via `invalidate(for:)` — an orphaned local transcript with no visible message to reach it
from serves no purpose and is a stray privacy-sensitive leftover.

### 4. The detail view: call facts + transcript, gated on availability

`CallSummaryDetailSheet` becomes the (renamed) `SystemMessageDetailSheet`'s call-message content
— everything it shows today (type, timestamp, duration, data, network quality, call-back) is
unchanged. A new "Transcript" section is appended, populated by an async lookup —
`CallTranscriptStore.shared.transcript(for: summary.callId)` — fired in `.task(id:)` when the
sheet appears. Three states:

- **Loading** (brief — local GRDB read): no visible flash for the common case (fast enough), a
  lightweight placeholder only if it takes over ~150ms.
- **No transcript found**: the section doesn't render at all — a call where nobody activated
  captions shows exactly what it shows today, no empty "Transcript" placeholder inviting a tap
  into nothing.
- **Transcript found**: a scrollable list of segments reusing the exact rendering already built
  for the live in-call panel — speaker name + color (secondary indigo for "Moi", primary indigo
  for the other participant), a global original/translated toggle mirroring the live
  `captionsCycleButton`'s two content states, and a per-segment timestamp (now relative to
  `callStartedAt`, matching the live panel's "since call start" convention). An `(i)` disclaimer
  is always visible alongside the section header: *"Transcription locale à cet appareil — perdue
  si l'application est désinstallée ou les données locales effacées."*

## Non-goals

- No server persistence, no cross-device sync, no encryption-at-rest scheme (nothing leaves the
  device, so there is nothing to encrypt in transit or protect from the server's view).
- No group-call support — this mirrors the existing Live Call Captions scope (1:1 calls only).
- No editing or per-segment deletion of a saved transcript — it's either the whole call's record
  or nothing (deleting the call message deletes it wholesale, per §3).
- No change to the live in-call UI beyond raising the retention cap — the cyclic captions button,
  multi-speaker rendering, and video/audio layouts already shipped are untouched.
- No Android/Web equivalent — the whole capture pipeline is Apple `SFSpeechRecognizer`-only, so
  this is iOS-only exactly like the rest of Live Call Captions.

## Testing

- `CallTranscriptTests` (pure model, plain XCTest/Swift Testing): `Codable` round-trip, `id ==
  callId`.
- `CallTranscriptStoreTests`: `save` then `transcript(for:)` returns the saved value; a
  never-saved `callId` returns `nil`; `invalidate(for:)` clears a saved entry. Mirrors
  `ConversationDraftManagerTests`' shape (a store the codebase already tests this exact way).
- Source-pattern guards (established convention this session): `resetForCallEnd()` calls
  `CallTranscriptStore.shared.save` only inside the `!allSegments.isEmpty` branch;
  `segmentRetentionLimit == 2000`; `BubbleCallNoticeView` no longer presents `CallSummaryDetailSheet`
  via local `@State`; `ConversationView.swift`'s `onLongPress` branches on `msg.callSummary != nil`
  instead of early-returning on `messageSource == .system`.
- Manual device QA (queued, not blocking the rest): activate captions on a real 2-device call,
  end it, long-press the resulting call message, confirm the transcript section appears with
  correct speaker attribution and the original/translated toggle; confirm a call where captions
  were never activated shows no Transcript section; confirm the disclaimer text is legible.
