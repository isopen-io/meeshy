# Call Transcript History — Local Persistence — Design

> Extends "Live Call Captions" (`docs/superpowers/specs/2026-07-10-live-call-transcription-design.md`,
> `docs/superpowers/specs/2026-07-11-call-control-buttons-harmonization-design.md`). Brainstormed
> interactively with the user, 2026-07-11, then put through two independent adversarial reviews
> (technical + privacy/security) at the user's explicit request before any implementation. Both
> reviews returned real, code-verified blocking findings — this revision folds every one of them
> in. Where a review changed something the user had already approved, that's called out explicitly
> rather than silently rewritten.

## Problem

Live captions during a call already work well (multi-speaker rendering, 3-state cyclic
translation toggle, scrollable in-call panel). But the transcript is **purely ephemeral**:
`CallTranscriptionService.resetForCallEnd()` unconditionally clears every captured segment, and
the live panel caps retained segments at `Constants.segmentRetentionLimit = 50`. Once the call
ends, or once a long call exceeds 50 segments, that history is gone.

The user wants "toute l'histoire de transcription et traduction de la conversation" maintained
and reviewable after the fact, reached the same way one reviews an audio/video attachment's
transcription today: via long-press on the message.

## Constraints established during brainstorming + adversarial review

- **Never sent to the Meeshy server.** The whole "Live Call Captions" feature exists specifically
  because audio is never sent server-side for transcription (privacy decision,
  `CallTranscriptionService.startTranscribing`'s `supportsOnDeviceRecognition` guard). The user
  explicitly chose local-only over server storage (with or without E2E encryption) for the
  *already-transcribed text* too.
- **Correction (technical + privacy review, convergent finding):** "local-only" does **not** mean
  "never leaves the device." The GRDB database lives in Application Support, which iOS includes in
  standard iCloud/Finder device backups by default — nothing in the SDK excludes it
  (`isExcludedFromBackupKey` is not set anywhere in the codebase; the file only carries
  `.completeUntilFirstUserAuthentication` data protection, which is unrelated). A backup **is** a
  transfer to a server (Apple's), even though it is never the *Meeshy* server. Every claim and the
  user-facing disclaimer in this spec now says "never sent to the Meeshy server" — not "never
  leaves the device."
- **Correction (privacy review, blocking):** the store must be encrypted at rest
  (`GRDBCacheStore(..., encrypted: true)`), matching every other sensitive store in
  `CacheCoordinator` (`conversations`, `messages`, `profiles`, `callHistory`, etc.). `.drafts` — the
  pattern this design was originally modeled on — is the *one* unencrypted store in the whole SDK,
  and it holds low-sensitivity typed-but-unsent text. A call transcript is categorically more
  sensitive than `callHistory` (which **is** encrypted): it is verbatim private speech, including
  the other participant's. Storing it as the one plaintext exception, exempt from the
  account-deletion crypto-shred (`DatabaseEncryption.destroyKey()`), is a regression, not a
  reasonable simplification.
- **Correction (privacy review, blocking):** the store must be swept by every existing erasure
  flow, not just message deletion (original §3 only covered one path — see Design §3 for the full
  list this revision adds).
- **Full retention during the live call**, not capped at 50. **Correction (technical review,
  blocking):** this is *not* a one-line constant bump — see Design §2.
- **Entry point: long-press on the call message**, landing on a detail view appropriate to the
  message's type — call facts (already shown today) *and* transcript/translation history if one
  exists on this device.
- **Correction (privacy review, blocking) — consent asymmetry.** If the other participant activates
  *their* captions, their words (already relayed to you live today, unchanged) will now be
  durably kept on *your* device. The user's resolution: the existing multi-speaker live panel
  already shows both sides in real time and *is* the transparency mechanism — no separate consent
  dialog is needed. But today that panel is gated on **your own** toggle (`showTranscript`), so if
  only the other participant activates captions, segments accumulate silently on your device via
  `receiveTranslatedSegment` while you see no panel at all — the "you can already see it happening
  live" premise is false in that case. Design §4 closes this gap: the panel becomes visible
  whenever segments are being captured or received, not only when *you* tapped your own button.
- **Disclaimer, updated**: local, never sent to the Meeshy server, may be included in this device's
  iCloud/Finder backups, includes the other participant's words as relayed live during the call,
  deletable at any time from this same view.

## Design

### 1. One long-press decision point, not two competing gesture recognizers

Today, two independent long-press mechanisms exist:

- `BubbleSwipeContainer`'s generic `simultaneousGesture(LongPressGesture...)` (`MessageListView.swift`),
  wired in `ConversationView.swift`'s `onLongPress: { messageId in ... }`, which explicitly
  no-ops for system messages.
- `BubbleCallNoticeView`'s own `.highPriorityGesture(LongPressGesture(minimumDuration: 0.35)...)`,
  presenting `CallSummaryDetailSheet` via a local `@State private var showDetails`.

The `highPriorityGesture` is **not** an accidental duplicate — it was added after a 2026-07-03
audit specifically to stop a long-press from *also* triggering the card's `Button { onCallBack }`
tap action (the entire call-notice card is itself a tap-to-callback button). Removing it outright
would resurface that pocket-dial bug, since `simultaneousGesture` does not preempt a child's own
gesture recognition.

**What changes**: `BubbleCallNoticeView` keeps its `highPriorityGesture` (still required) but stops
presenting its own local sheet. Instead it calls a new `onLongPress: (() -> Void)?` closure that
routes to the same decision point every other message's long-press already goes through.

**Correction (technical review) — two things the first draft got wrong**:

1. `overlayState` already has `detailSheetMessage: Message?` (`ConversationView.swift:40`),
   presented via `.sheet(item: $overlayState.detailSheetMessage) { msg in MessageMoreSheet(...) }`
   (line 667) — this is the **regular-message** detail flow, already populated from several
   existing call sites. Reusing this property for calls would mean branching message-type-specific
   content inside that one closure. To keep the two flows independent and avoid touching that
   existing, multi-call-site property, this design adds a **new, separate**
   `@Published var callDetailMessage: Message?` on `overlayState`, with its own
   `.sheet(item: $overlayState.callDetailMessage) { msg in CallDetailSheet(...) }`.
2. Wiring `BubbleCallNoticeView`'s new closure to `ConversationView` is not a one-line parent
   binding — the message list is UIKit-hosted (`MessageListView: UIViewControllerRepresentable` →
   `MessageListViewController` → `UICollectionView`). The closure has to thread through
   `BubbleCallNoticeView` (new parameter) → `ThemedMessageBubble` (new parameter — it instantiates
   `BubbleCallNoticeView` today with no such closure) → the cell configuration in
   `MessageListViewController.swift` (~line 559), where `longPressHandler` and the cell's
   `messageId` are already in scope. Three files, tractable, but not "the parent just wires it."

```swift
onLongPress: { messageId in
    guard overlayState.longPressEnabled else { return }
    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
    if msg.callSummary != nil {
        overlayState.callDetailMessage = msg      // → CallDetailSheet (new)
    } else if msg.messageSource != .system {
        overlayState.overlayMessage = msg
        overlayState.showOverlayMenu = true        // unchanged
    }
    // Plain system notices (messageSource == .system, no callSummary) stay a
    // no-op, exactly as today — only call messages gain a detail view.
}
```

### 2. Capture: a persistence buffer separate from the live display window

**Correction (technical review, blocking) — the original "bump `segmentRetentionLimit` to 2000"
was wrong on two counts**: (a) it's `Constants.segmentRetentionLimit`, and it is *also* the buffer
`resetForCallEnd()` persists from — so a call exceeding it would silently truncate the very
history this feature promises to keep, the opposite of the goal; (b) `appendSegment` re-sorts the
**entire** array on every final segment and feeds an **eager** `VStack` (not `LazyVStack`) inside
the live `ScrollView` — at a materially higher cap, that's a real per-segment cost during the call
on both speakers' devices, not a free constant bump.

**Fix**: keep the live display window small (existing `50`, unchanged — the in-call UX doesn't
need more, and this fully sidesteps the sort/render cost question). Add a **separate**, append-only
accumulator that is *not* re-sorted, *not* `@Published`, and *not* bounded by the display cap —
only trimmed by a generous hard ceiling (`persistedSegmentCeiling = 2000`) as a memory safety net
for pathological multi-hour calls. This accumulator, not the display list, is what
`resetForCallEnd()` persists.

**Correction (technical review, blocking) — `callId ?? ""` is a real bug, not a hypothetical.**
`allSegments` can be non-empty with `callId == nil`: a device that never called `startTranscribing`
(never activated its own captions) still receives the other participant's segments via
`receiveTranslatedSegment` → `appendSegment` — `resetForCallEnd()`'s own existing comment says so
explicitly ("purge INCONDITIONNELLE, y compris si ce device n'a jamais transcrit lui-même"), and
`test_resetForCallEnd_purgesSegments_evenWhenNeverTranscribingLocally` exercises exactly this path.
Writing `callId: callId ?? ""` in that case creates a transcript keyed on `""`, unreachable by
`summary.callId` lookups, silently colliding across every such call. The write must be guarded
on a real `callId`, not defaulted.

**Correction (technical review, blocking) — `speakerName`/`isLocal` don't exist on
`TranscriptionSegment` and can't be synthesized by a bare `.map(CallTranscriptSegment.init)`.**
`TranscriptionSegment` has `speakerId`, not a name, and no "is this me" flag — both are resolved
today at *render* time in `CallView.transcriptSegmentRow` from `AuthManager.currentUser` and
`callManager.remoteUsername`. `CallManager` has to pass both into the snapshot construction; it
already holds them at the point `resetForCallEnd()` is called (`CallManager.swift:3278` — well
before `remoteUsername`/`conversationId`/`callStartDate`/`currentCallId` are nilled later in the
same teardown sequence, confirmed by reading the surrounding code).

```swift
// CallTranscriptionService
func resetForCallEnd(callId: String?, conversationId: String, callStartedAt: Date?, localUserId: String, localSpeakerName: String, remoteSpeakerName: String) {
    if let callId, !persistedSegments.isEmpty {
        let snapshot = CallTranscript(
            callId: callId,
            conversationId: conversationId,
            callStartedAt: callStartedAt ?? Date(),
            segments: persistedSegments.map { seg in
                CallTranscriptSegment(
                    speakerId: seg.speakerId,
                    speakerName: seg.speakerId == localUserId ? localSpeakerName : remoteSpeakerName,
                    isLocal: seg.speakerId == localUserId,
                    text: seg.text,
                    translatedText: seg.translatedText,
                    translatedLanguage: seg.translatedLanguage,
                    capturedAt: seg.capturedAt
                )
            }
        )
        Task { await CallTranscriptStore.shared.saveMerging(snapshot) }   // see §3 — merge, not overwrite
    }
    stopTranscribing()
    isShowingOverlay = false
}
```

Call site: `transcriptionService.resetForCallEnd(callId: currentCallId, conversationId: conversationId ?? "", callStartedAt: callStartDate, localUserId: AuthManager.shared.currentUser?.id ?? "", localSpeakerName: AuthManager.shared.currentUser?.displayName ?? "…", remoteSpeakerName: remoteUsername ?? "…")`.

No segments captured (captions never activated by either side this call) → nothing written.

**Correction (technical review, recommended) — rejoin after crash can double-save.**
`CallManager.rejoinActiveCall` (delivered earlier this session) reuses the same `callId`. Sequence:
disconnect → `resetForCallEnd` saves part 1 → rejoin → more segments → `resetForCallEnd` saves part
2. `GRDBCacheStore.save` replaces the value at a key wholesale, so a naive second `save` would
silently drop part 1. `CallTranscriptStore.saveMerging` (§3) loads any existing transcript for that
`callId` first and concatenates, sorted by `capturedAt`, before writing — no data lost across a
rejoin.

### 3. Local-only persistence — encrypted, swept by every erasure path, mergeable

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
    public let speakerName: String
    public let isLocal: Bool
    public let text: String
    public let translatedText: String?
    public let translatedLanguage: String?
    public let capturedAt: Date
}
```

`CacheCoordinator` gains a **new, encrypted** store — the corrected policy and store init:

```swift
/// Local-only call transcripts — never synced to the server. Encrypted at rest
/// like every other sensitive store (unlike `.drafts`, which this was
/// originally modeled on before adversarial review — a transcript is
/// materially more sensitive than typed-but-unsent text). See
/// docs/superpowers/specs/2026-07-11-call-transcript-history-design.md.
public static let callTranscripts = CachePolicy(ttl: .days(90), staleTTL: .days(90), maxItemCount: 1000, storageLocation: .grdb)
```

```swift
public let callTranscripts = GRDBCacheStore<String, CallTranscript>(policy: .callTranscripts, db: db, namespace: "calltx", encrypted: true)
```

**Correction (privacy review, recommended) — TTL reduced from the original draft's 365 days to
90.** The original 365-day figure had no product justification beyond "it's a memory, not a
draft." Given the product's privacy-forward positioning (E2EE conversations, strictly on-device
transcription, no server fallback), defaulting to a full year of retained verbatim voice content
is out of step. 90 days (matching the general "recent history" horizon used elsewhere) is the new
default; revisit if the user wants it configurable in Settings later — out of scope for this pass.

**Correction (technical review, blocking) — the store actor must use `GRDBCacheStore`'s real
signatures**, not the invented ones in the first draft (`save` is `async throws`; `load` returns
`CacheResult<[Value]>`, not an optional single value; `.value` is deprecated and banned by this
codebase's Instant App Principles — every `CacheResult` must be switched over its 4 cases):

```swift
public actor CallTranscriptStore {
    public static let shared = CallTranscriptStore()
    private let cache: CacheCoordinator

    public func saveMerging(_ transcript: CallTranscript) async {
        let existing = await transcript(for: transcript.callId)
        let merged: CallTranscript
        if let existing {
            let byKey = Dictionary(grouping: existing.segments + transcript.segments) { "\($0.speakerId)|\($0.capturedAt.timeIntervalSince1970)|\($0.text)" }
            merged = CallTranscript(callId: transcript.callId, conversationId: transcript.conversationId,
                                     callStartedAt: existing.callStartedAt,
                                     segments: byKey.values.compactMap(\.first).sorted { $0.capturedAt < $1.capturedAt })
        } else {
            merged = transcript
        }
        do { try await cache.callTranscripts.save([merged], for: merged.callId) }
        catch { Logger.calls.error("CallTranscriptStore.saveMerging failed: \(error.localizedDescription)") }
    }

    public func transcript(for callId: String) async -> CallTranscript? {
        switch await cache.callTranscripts.load(for: callId) {
        case .fresh(let items, _), .stale(let items, _): return items.first
        case .expired, .empty: return nil
        }
    }

    public func invalidate(for callId: String) async {
        await cache.callTranscripts.invalidate(for: callId)
    }
}
```

**Resolved during planning (user direction) — no secondary index needed.** Every `CallTranscript`
corresponds to exactly one call-summary system message (`Message.callSummary`, already carrying
`callId`), and that message is already present in the existing local messages cache
(`CacheCoordinator.shared.messages`, keyed by `conversationId`). That cache *is* the join from "a
conversation" to "its calls" — no new `conversationId -> [callId]` index store or GRDB column
query is needed. The conversation-delete sweep (below) simply loads
`cache.messages.load(for: conversationId)`, maps `.compactMap(\.callSummary?.callId)`, and
invalidates each.

**Correction (privacy review, blocking) — a single `invalidate(for:)` on message delete is not
enough.** Three separate erasure paths must all sweep this store, not just one:

1. **Logout / account deletion.** `CacheCoordinator.reset()` (`CacheCoordinator.swift:302-341`)
   is the authoritative wipe on auth transition (`MeeshyApp.swift:603`) — its own doc comment
   warns that a disk-backed store *not* added here leaks the previous user's data to whoever logs
   in next on a shared device. `callTranscripts` must be added to this enumeration. This is the
   single most important sweep — it's the one the codebase already has a named mechanism for and
   a documented reason to use it.
2. **Conversation delete/leave.** `deleteConversation` (`ConversationListViewModel.swift:1473`) is
   an optimistic, rollback-capable soft delete (`.deleteForUser`) — sweeping on its optimistic
   apply carries a small, accepted, low-severity risk (a rolled-back delete doesn't un-sweep
   already-invalidated transcripts). Sweep by loading the conversation's local messages cache,
   extracting every `callSummary?.callId`, and invalidating each (see the resolved note above —
   no new index required).
3. **Message delete — authoritative path only.** `deleteMessage` has three call sites, only one of
   which is safe to bind to: the socket-confirmed `message:deleted` event
   (`MessageSocketManager.swift`/`ConversationSyncEngine.swift`), which fires once a deletion is
   server-confirmed, from *any* device. The other two — `.local` (a reversible per-device hide via
   `LocallyHiddenMessagesStore`, undoable) and the optimistic `.everyone` path (which rolls back on
   network failure) — must **not** trigger invalidation, or an undo/rollback resurrects a message
   whose transcript was already destroyed. `MessageDeletedEvent` only carries `messageId`/
   `conversationId`, not `callId` — the handler must resolve `message.callSummary?.callId` from the
   still-present local message *before* it's removed from the view model.

**Correction (privacy review, blocking) — a direct, discoverable delete action, independent of
message deletion.** Relying solely on "delete the call message" is not a real privacy control: call
messages don't currently expose a delete action through the new `CallDetailSheet` flow (§1 routes
them away from `MessageOverlayMenu`, which is where "Supprimer" lives), and deleting a *message*
is not a gesture a user would associate with "erase this sensitive recording." §4 adds an explicit
**"Supprimer ce transcript"** action directly in the transcript section, independent of the
message's own lifecycle.

### 4. The detail view: call facts + transcript, gated on availability, live-visible regardless of local toggle

`CallSummaryDetailSheet`'s existing content (type, timestamp, duration, data, network quality,
call-back) is now presented from the new `CallDetailSheet` (§1), unchanged. A "Transcript" section
is appended, populated via `CallTranscriptStore.shared.transcript(for: summary.callId)` in
`.task(id:)`. Three states — loading (no flash for the common fast case), not found (section
doesn't render), found:

- Scrollable segment list. **Correction (technical review, blocking) — this is new UI, not
  literal reuse.** The live panel's `transcriptSegmentRow` reads *live-only* state
  (`callManager.remoteUsername`, `callManager.callStartDate`, `AuthManager.currentUser`, a local
  `@State`) that's nil by the time this sheet is reopened later, and hardcodes `.white` foreground
  (built for a dark glass-over-video overlay — invisible in Light Mode on a themed sheet). The new
  view is written against the **persisted** fields (`speakerName`, `isLocal`, `capturedAt`,
  `CallTranscript.callStartedAt`) and is theme-aware; it reuses the live view's visual *language*
  (name + color per speaker, original/translated toggle) but is new code.
- Global original/translated toggle, mirroring the live `captionsCycleButton`'s two content states.
- Per-segment timestamp relative to `callStartedAt`.
- **"Supprimer ce transcript"** action (see §3) — a plain destructive button in the section, with a
  confirmation alert given it's irreversible.
- Disclaimer, corrected per the Constraints section above: *"Transcription locale à cet appareil,
  jamais envoyée au serveur Meeshy — peut figurer dans une sauvegarde iCloud/Finder de cet appareil.
  Inclut les paroles de votre interlocuteur, telles que reçues pendant l'appel."*

**Correction (privacy review, blocking, resolved per the user's answer) — live-panel visibility
must not be gated on the local toggle.** Today `showTranscript`/`transcriptionService
.isShowingOverlay` only flip true when *this* device's own `captionsCycleButton` is tapped —
segments arriving passively from an interlocutor who activated *their* captions never surface any
panel here, even though they're being accumulated for later persistence. The live panel must
become visible whenever the persistence accumulator (§2) is non-empty, regardless of whether the
local toggle was ever tapped — read-only in that case (no original/translated control, since this
device never opted into transcribing anything itself; showing the interlocutor's side is enough to
make "this is being captured" genuinely visible in the moment, which is what the user's answer
relies on).

## Non-goals

- No server persistence, no cross-device sync — never sent to the Meeshy server (may be included
  in this device's own iCloud/Finder backup, encrypted at rest either way — see Constraints).
- No group-call support — mirrors the existing Live Call Captions scope (1:1 calls only).
- No per-segment editing or deletion — a transcript is deleted wholesale (§3/§4's explicit action),
  never edited.
- No change to the live in-call transcript UX beyond: the persistence-vs-display buffer split
  (§2) and the toggle-independent visibility fix (§4). The cyclic captions button, multi-speaker
  rendering, and video/audio layouts already shipped are otherwise untouched.
- No Android/Web equivalent — the whole capture pipeline is Apple `SFSpeechRecognizer`-only.
- No configurable retention (fixed 90-day TTL for this pass, see §3).

## Testing

- `CallTranscriptTests` (pure model): `Codable` round-trip, `id == callId`.
- `CallTranscriptStoreTests`: `saveMerging` then `transcript(for:)` round-trips; a second
  `saveMerging` for the same `callId` **merges** rather than overwrites (rejoin scenario, §2);
  `invalidate(for:)` clears a saved entry; a never-saved `callId` returns `nil`. Confirms the store
  is instantiated with `encrypted: true`.
- `CacheCoordinator.reset()` test: asserts `callTranscripts` is included in the sweep (extends the
  existing reset test, doesn't replace it).
- `CallTranscriptionServiceTests`: **updates the existing**
  `test_resetForCallEnd_purgesSegments_evenWhenNeverTranscribingLocally` for the new signature, and
  adds a case asserting a `nil` `callId` with non-empty segments does **not** call
  `CallTranscriptStore.saveMerging` (the bug this revision fixes).
- Source-pattern guards: `CallTranscriptionService`'s live display cap stays `50`; the persistence
  accumulator is capped separately at `2000` and is not `@Published`/not re-sorted per append;
  `BubbleCallNoticeView` no longer presents `CallSummaryDetailSheet` via local `@State`;
  `ConversationView.swift`'s `onLongPress` branches on `msg.callSummary != nil`; the message-delete
  invalidation hook is wired to the socket-confirmed path only, not `.local`/optimistic paths.
- Manual device QA (queued, not blocking the rest): 2-device call, only one side activates
  captions — confirm the *other* device's panel becomes visible read-only anyway; end the call,
  long-press the resulting call message, confirm the transcript section, disclaimer, and delete
  action; delete the transcript and confirm it's gone; delete the call message and confirm the
  transcript is also gone; log out and back in (or reinstall) and confirm no transcript survives.
