# Call Transcript History — Local Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline execution — no subagent dispatch for this plan). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a call's full multi-speaker transcript/translation history locally (encrypted,
never sent to the Meeshy server) once the call ends, reachable via long-press on the call's
message in the conversation thread — and keep it correctly swept by every erasure path that
already exists in the app.

**Architecture:** New SDK-level model (`CallTranscript`) + encrypted `GRDBCacheStore` + a
dedicated actor (`CallTranscriptStore`), mirroring the existing `.drafts`/`ConversationDraftManager`
local-only pattern but encrypted. `CallTranscriptionService` gains a persistence accumulator
separate from its live 50-segment display window. `resetForCallEnd()` saves a snapshot (merged,
not overwritten, across a crash+rejoin). The call-summary bubble's existing long-press mechanism
is redirected — through the same threaded-closure pattern already used for its `onCallBack` — to
a new detail-sheet flow that shows the transcript when one exists. Three erasure paths are wired:
logout/account-deletion (`CacheCoordinator.reset()`), the authoritative (socket-confirmed)
message-deletion path, and conversation deletion — all using `Message.callSummary?.callId` (via
the existing local messages cache) as the join from a conversation/message to its transcript, no
new index needed. A live-panel visibility fix closes a consent-transparency gap found in review.

**Tech Stack:** Swift 6, SwiftUI, UIKit (message list bridge), GRDB, XCTest — same stack as every
prior calls/messages chantier this session.

## Global Constraints

- **Spec source of truth**: `docs/superpowers/specs/2026-07-11-call-transcript-history-design.md`
  — brainstormed with the user, then revised after two independent adversarial reviews (technical
  + privacy/security) that found and fixed 9 blocking issues. Every task below implements the
  *revised* spec; do not reintroduce anything the reviews flagged (unencrypted store, unguarded
  `callId ?? ""`, overwrite-on-rejoin, `.value` on `CacheResult`, etc.).
- **Never sent to the Meeshy server. May be included in this device's own iCloud/Finder backup.**
  Every disclaimer/comment in this plan uses this exact phrasing — never "never leaves the
  device."
- **Encrypted at rest, always** (`GRDBCacheStore(..., encrypted: true)`) — this is the one
  non-negotiable correction from the privacy review; do not model this on `.drafts` (unencrypted).
- **Conversation-delete sweep — resolved without new index infrastructure (user direction).**
  Every `CallTranscript` belongs to exactly one call-summary system message
  (`Message.callSummary`, already carrying `callId`), which is already cached locally per
  conversation (`CacheCoordinator.shared.messages`, keyed by `conversationId`). No secondary
  `conversationId → [callId]` index needs to be built — the existing messages cache already *is*
  that index: enumerate `cache.messages.load(for: conversationId)`'s entries,
  `.compactMap(\.callSummary?.callId)`, invalidate each. `deleteConversation`
  (`ConversationListViewModel.swift:1473`) is an *optimistic, rollback-capable* soft delete
  (`.deleteForUser`, reverts on a 4xx) — sweeping on the optimistic apply carries a small,
  accepted, low-severity risk (a rolled-back delete doesn't un-delete the swept transcripts), the
  same risk class already accepted elsewhere for non-critical local cache invalidations. See
  Task 6.
- Do **not** touch `controlButtonsRow`, `captionsCycleButton`, `CaptionsMode`, or any other part of
  the harmonized call-control UI shipped earlier this session — this plan only adds new state and
  a new detail-sheet flow.
- TDD strict (RED-GREEN-REFACTOR), per root `CLAUDE.md`. Commit after every task.
- Build/test pattern (established this session): `xcodegen generate` after adding any new file,
  then `xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination
  "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build`, then
  `test-without-building` on the iOS 18.2 verification simulator (UDID in
  `scratchpad/tmp182_udid.txt` if still valid, else recreate per Task 1).

---

### Task 1: `CallTranscript` / `CallTranscriptSegment` — pure models

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Models/CallTranscript.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/CallTranscriptTests.swift` (new file)

**Interfaces:**
- Produces: `CallTranscript` (`Codable, Sendable, CacheIdentifiable, Equatable`, `id == callId`),
  `CallTranscriptSegment` (`Codable, Sendable, Equatable`). Task 3 stores `CallTranscript` in a
  `GRDBCacheStore<String, CallTranscript>`; Task 5 constructs both.

- [ ] **Step 1: Write the failing test**

Create `packages/MeeshySDK/Tests/MeeshySDKTests/Models/CallTranscriptTests.swift`:

```swift
import Testing
import Foundation
@testable import MeeshySDK

struct CallTranscriptTests {

    private func makeSegment(speakerId: String = "user-1", isLocal: Bool = true) -> CallTranscriptSegment {
        CallTranscriptSegment(
            speakerId: speakerId,
            speakerName: "Alice",
            isLocal: isLocal,
            text: "Bonjour",
            translatedText: "Hello",
            translatedLanguage: "en",
            capturedAt: Date(timeIntervalSince1970: 1_000)
        )
    }

    @Test func id_equalsCallId() {
        let transcript = CallTranscript(
            callId: "call-1", conversationId: "conv-1",
            callStartedAt: Date(timeIntervalSince1970: 0), segments: [makeSegment()]
        )
        #expect(transcript.id == "call-1")
    }

    @Test func codable_roundTrips() throws {
        let original = CallTranscript(
            callId: "call-1", conversationId: "conv-1",
            callStartedAt: Date(timeIntervalSince1970: 0),
            segments: [makeSegment(speakerId: "user-1", isLocal: true), makeSegment(speakerId: "user-2", isLocal: false)]
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(CallTranscript.self, from: data)
        #expect(decoded == original)
    }

    @Test func segment_codable_roundTrips_withNilTranslation() throws {
        let original = CallTranscriptSegment(
            speakerId: "user-1", speakerName: "Alice", isLocal: true,
            text: "Bonjour", translatedText: nil, translatedLanguage: nil,
            capturedAt: Date(timeIntervalSince1970: 0)
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(CallTranscriptSegment.self, from: data)
        #expect(decoded == original)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshySDKTests/CallTranscriptTests -derivedDataPath /tmp/sdk_transcript_check 2>&1 | tail -40
```

Expected: **BUILD FAILED** — `cannot find type 'CallTranscript' in scope`.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/MeeshySDK/Sources/MeeshySDK/Models/CallTranscript.swift`:

```swift
import Foundation

/// A single call's persisted multi-speaker transcript/translation history —
/// local-only, never sent to the Meeshy server (may be included in this
/// device's own iCloud/Finder backup like any other local app data). See
/// docs/superpowers/specs/2026-07-11-call-transcript-history-design.md.
public struct CallTranscript: Codable, Sendable, CacheIdentifiable, Equatable {
    public let callId: String
    public let conversationId: String
    public let callStartedAt: Date
    public let segments: [CallTranscriptSegment]
    public var id: String { callId }

    public init(callId: String, conversationId: String, callStartedAt: Date, segments: [CallTranscriptSegment]) {
        self.callId = callId
        self.conversationId = conversationId
        self.callStartedAt = callStartedAt
        self.segments = segments
    }
}

/// One utterance in a persisted call transcript. `speakerName`/`isLocal` are
/// resolved once at call-end (not stored redundantly elsewhere) since names
/// can change after the fact but the transcript should reflect who it was at
/// the time.
public struct CallTranscriptSegment: Codable, Sendable, Equatable {
    public let speakerId: String
    public let speakerName: String
    public let isLocal: Bool
    public let text: String
    public let translatedText: String?
    public let translatedLanguage: String?
    public let capturedAt: Date

    public init(speakerId: String, speakerName: String, isLocal: Bool, text: String, translatedText: String?, translatedLanguage: String?, capturedAt: Date) {
        self.speakerId = speakerId
        self.speakerName = speakerName
        self.isLocal = isLocal
        self.text = text
        self.translatedText = translatedText
        self.translatedLanguage = translatedLanguage
        self.capturedAt = capturedAt
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshySDKTests/CallTranscriptTests -derivedDataPath /tmp/sdk_transcript_check 2>&1 | tail -30
```

Expected: 3/3 tests pass. (Reminder: if the destination fails to resolve by name, use the UDID
form exactly as above — the by-name form failed earlier this session on the `MeeshySDK-Package`
scheme specifically.)

- [ ] **Step 5: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add packages/MeeshySDK/Sources/MeeshySDK/Models/CallTranscript.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Models/CallTranscriptTests.swift
git commit -m "feat(sdk/calls): add CallTranscript/CallTranscriptSegment pure models"
```

---

### Task 2: Encrypted `CacheCoordinator.callTranscripts` store + logout/account-deletion sweep

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CachePolicy.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/CacheCoordinatorResetTests.swift` (existing
  file — extend it; if no such file exists, grep `func reset()` call sites in
  `MeeshySDKTests/Cache/` first to find the actual existing reset test file name before creating
  a new one)

**Interfaces:**
- Consumes: `CallTranscript` (Task 1).
- Produces: `CachePolicy.callTranscripts`, `CacheCoordinator.callTranscripts:
  GRDBCacheStore<String, CallTranscript>` — Task 3's `CallTranscriptStore` actor wraps this.

- [ ] **Step 1: Locate the real reset test to extend (not guess a new file)**

```bash
cd /Users/smpceo/Documents/v2_meeshy
grep -rln "func testReset\|CacheCoordinator.*reset()\|\.reset()" packages/MeeshySDK/Tests/MeeshySDKTests/ | grep -i cache
```

Read whatever file(s) this finds in full before Step 2 — the existing test's exact assertion
style (probably: seed each store, call `reset()`, assert each is empty) is what the new assertion
for `callTranscripts` must match.

- [ ] **Step 2: Write the failing test**

In the file found by Step 1, add a case following its existing pattern exactly — seed
`CacheCoordinator.shared.callTranscripts` with one `CallTranscript`, call
`await CacheCoordinator.shared.reset()`, assert `callTranscripts.load(for: "call-1")` is
`.empty`/`.expired` (whichever the existing assertions check for the other stores). Use the exact
same `CallTranscript`/`CallTranscriptSegment` construction as Task 1's test factory to avoid
duplicating a builder.

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshySDKTests -derivedDataPath /tmp/sdk_transcript_check 2>&1 | tail -30
```

Expected: **BUILD FAILED** — `CacheCoordinator` has no member `callTranscripts`.

- [ ] **Step 4: Add the policy**

In `packages/MeeshySDK/Sources/MeeshySDK/Cache/CachePolicy.swift`, find the existing `public static
let drafts = CachePolicy(...)` declaration and add immediately after it:

```swift
    /// Local-only call transcripts — never sent to the Meeshy server (may be
    /// included in this device's own iCloud/Finder backup). Encrypted at rest
    /// like every other sensitive store (unlike `.drafts`, low-sensitivity
    /// typed-but-unsent text — a call transcript is categorically more
    /// sensitive, on par with or above `.callHistory`, which is also
    /// encrypted). 90-day TTL: a deliberately shorter default than the
    /// original 365-day draft this was revised from, given the product's
    /// privacy-forward positioning — see
    /// docs/superpowers/specs/2026-07-11-call-transcript-history-design.md.
    public static let callTranscripts = CachePolicy(ttl: .days(90), staleTTL: .days(90), maxItemCount: 1000, storageLocation: .grdb)
```

- [ ] **Step 5: Add the store and wire it into `reset()`**

In `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift`, find the `public let
drafts: GRDBCacheStore<String, ConversationDraft>` declaration and add immediately after it:

```swift
    public let callTranscripts: GRDBCacheStore<String, CallTranscript>
```

Find that property's initialization inside `CacheCoordinator`'s `init` (wherever `self.drafts =
GRDBCacheStore(policy: .drafts, db: db, namespace: "drafts")` — or equivalent — is assigned,
confirmed `self.`-prefixed at that call site) and add immediately after it:

```swift
        self.callTranscripts = GRDBCacheStore(policy: .callTranscripts, db: db, namespace: "calltx", encrypted: true)
```

Find `func reset()` and add `callTranscripts` to its enumeration, in the same style as every other
store already listed there (e.g. `await drafts.invalidateAll()` — match whatever call the existing
stores use exactly):

```swift
        await callTranscripts.invalidateAll()
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshySDKTests -derivedDataPath /tmp/sdk_transcript_check 2>&1 | tail -40
```

Expected: full `MeeshySDKTests` target passes, including the extended reset test and Task 1's
`CallTranscriptTests`.

- [ ] **Step 7: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/CachePolicy.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Cache/
git commit -m "feat(sdk/calls): encrypted callTranscripts store, swept on logout/account-deletion"
```

---

### Task 3: `CallTranscriptStore` actor — merge-on-save, real `CacheResult` handling

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Services/CallTranscriptStore.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Services/CallTranscriptStoreTests.swift` (new
  file — mirror `ConversationDraftManagerTests.swift`'s exact test structure/naming; read that
  file first)

**Interfaces:**
- Consumes: `CacheCoordinator.callTranscripts` (Task 2).
- Produces: `CallTranscriptStore.shared.saveMerging(_:)`, `.transcript(for:)`, `.invalidate(for:)`
  — Task 5 calls `saveMerging`, Task 6 calls `invalidate`, Task 8 calls `transcript(for:)` and
  `invalidate`.

- [ ] **Step 1: Read the pattern to mirror**

```bash
cat /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationDraftManager.swift
cat /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Tests/MeeshySDKTests/Services/ConversationDraftManagerTests.swift
```

Confirm the exact `do { try await cache.drafts.save(...) } catch { ... }` error-handling shape and
the exact `CacheResult` switch shape used for reads — this task's actor must match that shape,
not the `.value`/optional-chaining shape the original design draft (rejected by review) used.

- [ ] **Step 2: Write the failing test**

Create `packages/MeeshySDK/Tests/MeeshySDKTests/Services/CallTranscriptStoreTests.swift`,
structured like `ConversationDraftManagerTests.swift`:

```swift
import XCTest
@testable import MeeshySDK

final class CallTranscriptStoreTests: XCTestCase {

    private func makeTranscript(callId: String = "call-1", segments: [CallTranscriptSegment] = []) -> CallTranscript {
        CallTranscript(callId: callId, conversationId: "conv-1", callStartedAt: Date(timeIntervalSince1970: 0), segments: segments)
    }

    private func makeSegment(text: String, capturedAt: TimeInterval) -> CallTranscriptSegment {
        CallTranscriptSegment(speakerId: "user-1", speakerName: "Alice", isLocal: true, text: text, translatedText: nil, translatedLanguage: nil, capturedAt: Date(timeIntervalSince1970: capturedAt))
    }

    func test_saveMerging_thenTranscript_roundTrips() async {
        let transcript = makeTranscript(segments: [makeSegment(text: "Bonjour", capturedAt: 1)])
        await CallTranscriptStore.shared.saveMerging(transcript)
        let loaded = await CallTranscriptStore.shared.transcript(for: "call-1")
        XCTAssertEqual(loaded?.segments.map(\.text), ["Bonjour"])
        await CallTranscriptStore.shared.invalidate(for: "call-1")
    }

    func test_transcript_neverSaved_returnsNil() async {
        let loaded = await CallTranscriptStore.shared.transcript(for: "never-saved-call")
        XCTAssertNil(loaded)
    }

    func test_saveMerging_secondCall_mergesRatherThanOverwrites() async {
        let first = makeTranscript(segments: [makeSegment(text: "Part one", capturedAt: 1)])
        await CallTranscriptStore.shared.saveMerging(first)
        let second = makeTranscript(segments: [makeSegment(text: "Part two", capturedAt: 2)])
        await CallTranscriptStore.shared.saveMerging(second)
        let loaded = await CallTranscriptStore.shared.transcript(for: "call-1")
        XCTAssertEqual(loaded?.segments.map(\.text).sorted(), ["Part one", "Part two"])
        await CallTranscriptStore.shared.invalidate(for: "call-1")
    }

    func test_invalidate_clearsSavedEntry() async {
        await CallTranscriptStore.shared.saveMerging(makeTranscript())
        await CallTranscriptStore.shared.invalidate(for: "call-1")
        let loaded = await CallTranscriptStore.shared.transcript(for: "call-1")
        XCTAssertNil(loaded)
    }
}
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshySDKTests/CallTranscriptStoreTests -derivedDataPath /tmp/sdk_transcript_check 2>&1 | tail -30
```

Expected: **BUILD FAILED** — `cannot find 'CallTranscriptStore' in scope`.

- [ ] **Step 4: Write the minimal implementation**

Create `packages/MeeshySDK/Sources/MeeshySDK/Services/CallTranscriptStore.swift`:

```swift
import Foundation
import os

private let logger = Logger(subsystem: "me.meeshy.app", category: "calls")

/// Local-only actor for call transcripts — never a network call, mirrors
/// `ConversationDraftManager`'s shape. `saveMerging` merges with any existing
/// transcript for the same `callId` (rather than overwriting) so a
/// crash+rejoin's two separate `resetForCallEnd()` calls don't drop the
/// pre-rejoin segments. See
/// docs/superpowers/specs/2026-07-11-call-transcript-history-design.md §2/§3.
public actor CallTranscriptStore {
    public static let shared = CallTranscriptStore()

    private let cache: CacheCoordinator

    init(cache: CacheCoordinator = .shared) {
        self.cache = cache
    }

    public func saveMerging(_ transcript: CallTranscript) async {
        let merged: CallTranscript
        if let existing = await self.transcript(for: transcript.callId) {
            let byIdentity = Dictionary(grouping: existing.segments + transcript.segments) {
                "\($0.speakerId)|\($0.capturedAt.timeIntervalSince1970)|\($0.text)"
            }
            merged = CallTranscript(
                callId: transcript.callId,
                conversationId: transcript.conversationId,
                callStartedAt: existing.callStartedAt,
                segments: byIdentity.values.compactMap(\.first).sorted { $0.capturedAt < $1.capturedAt }
            )
        } else {
            merged = transcript
        }
        do {
            try await cache.callTranscripts.save([merged], for: merged.callId)
        } catch {
            logger.error("CallTranscriptStore.saveMerging failed: \(error.localizedDescription)")
        }
    }

    public func transcript(for callId: String) async -> CallTranscript? {
        switch await cache.callTranscripts.load(for: callId) {
        case .fresh(let items, _), .stale(let items, _):
            return items.first
        case .expired, .empty:
            return nil
        }
    }

    public func invalidate(for callId: String) async {
        await cache.callTranscripts.invalidate(for: callId)
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshySDKTests/CallTranscriptStoreTests -derivedDataPath /tmp/sdk_transcript_check 2>&1 | tail -30
```

Expected: 4/4 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add packages/MeeshySDK/Sources/MeeshySDK/Services/CallTranscriptStore.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Services/CallTranscriptStoreTests.swift
git commit -m "feat(sdk/calls): CallTranscriptStore actor — merge-on-save, real CacheResult handling"
```

---

### Task 4: Decouple the persistence buffer from the 50-segment live display cap

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/CallTranscriptionService.swift:134-135,
  156-161, 596-613` (`Constants`, `allSegments`, `appendSegment`, `receiveTranslatedSegment`)
- Test: `apps/ios/MeeshyTests/Unit/Services/CallTranscriptionServiceTests.swift`

**Interfaces:**
- Produces: `CallTranscriptionService.persistedSegments: [TranscriptionSegment]` (private) — Task
  5 reads this in `resetForCallEnd()`.

- [ ] **Step 1: Write the failing test**

In `apps/ios/MeeshyTests/Unit/Services/CallTranscriptionServiceTests.swift`, add (matching the
existing file's `makeSegment(...)` factory and class structure exactly — read the file first if
the factory signature differs from what's shown below):

```swift
    func test_persistedSegments_retainsBeyondLiveDisplayCap() {
        let sut = CallTranscriptionService()
        for i in 0..<60 {
            sut.receiveTranslatedSegment(
                makeSegment(text: "segment \(i)", isFinal: true, capturedAt: Date(timeIntervalSince1970: TimeInterval(i)))
            )
        }
        XCTAssertEqual(sut.displayedSegments.count, 50, "Live display stays capped at 50, unchanged.")
        XCTAssertEqual(sut.persistedSegmentsForTesting.count, 60, "The persistence accumulator must retain all 60, not just the last 50.")
    }
```

**Correction (plan review)** — use `receiveTranslatedSegment` (public, calls `appendSegment`
directly, no guard) rather than `applyRecognitionResult`, which has a
`guard isTranscribing else { return }` (`CallTranscriptionService.swift:542`) and would silently
no-op here without first calling `setTranscribingForTesting(true)`. `receiveTranslatedSegment` is
exactly the seam Task 5's own new tests already use. `isFinal: true` is required — Task 4's
`appendSegment` only feeds `persistedSegments` for final segments.

`persistedSegmentsForTesting`'s visibility must match the file's existing `#if DEBUG` test-seam
convention, already used for `setTranscribingForTesting` — read that existing block before writing
this step and place the new seam alongside it.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -30
```

Expected: **BUILD FAILED** — `persistedSegmentsForTesting` doesn't exist yet.

- [ ] **Step 3: Add the persistence accumulator**

In `apps/ios/Meeshy/Features/Main/Services/CallTranscriptionService.swift`, add a second retention
ceiling next to the existing one:

```swift
    private enum Constants {
        static let segmentRetentionLimit = 50
        /// Safety ceiling for the PERSISTENCE accumulator (`persistedSegments`)
        /// — never hit in normal use (a multi-hour call at continuous speech
        /// is still well under this), just a memory guard against pathological
        /// growth. NOT the live display cap, which stays 50 — see
        /// docs/superpowers/specs/2026-07-11-call-transcript-history-design.md §2.
        static let persistedSegmentCeiling = 2000
    }
```

Add the new stored property next to `allSegments`:

```swift
    private var allSegments: [TranscriptionSegment] = []
    /// Full-call accumulator for local persistence at call end — append-only,
    /// NOT re-sorted per append (unlike `allSegments`/`segments`, which drive
    /// the live UI and must stay cheap to re-render), bounded only by
    /// `Constants.persistedSegmentCeiling`.
    private var persistedSegments: [TranscriptionSegment] = []
```

Update `appendSegment` to also feed the new accumulator, and `receiveTranslatedSegment` stays
unchanged (it already calls `appendSegment`):

```swift
    private func appendSegment(_ segment: TranscriptionSegment) {
        allSegments.removeAll { $0.speakerId == segment.speakerId && !$0.isFinal }
        allSegments.append(segment)
        if allSegments.count > Constants.segmentRetentionLimit {
            allSegments = Array(allSegments.suffix(Constants.segmentRetentionLimit))
        }
        segments = allSegments.sorted { $0.capturedAt < $1.capturedAt }

        if segment.isFinal {
            persistedSegments.append(segment)
            if persistedSegments.count > Constants.persistedSegmentCeiling {
                persistedSegments = Array(persistedSegments.suffix(Constants.persistedSegmentCeiling))
            }
        }
    }
```

(Only `isFinal` segments are persisted — interim/partial ASR results are never meaningful in a
saved transcript; the live `allSegments`/`segments` already mix both for live display.)

Add the `#if DEBUG` test seam next to `setTranscribingForTesting`:

```swift
    #if DEBUG
    var persistedSegmentsForTesting: [TranscriptionSegment] { persistedSegments }
    #endif
```

Clear `persistedSegments` in `stopTranscribing()` alongside `allSegments.removeAll()` — **only
after** `resetForCallEnd()` (Task 5) has already read it for the snapshot, so this ordering matters
and Task 5's step must persist BEFORE calling `stopTranscribing()`, matching the existing
`resetForCallEnd()` structure (persist-then-purge).

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -20
SIM=$(cat /private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/c355ca3e-ed99-4888-959f-df7d0c24f3a5/scratchpad/tmp182_udid.txt)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/CallTranscriptionServiceTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -30
```

Expected: pass, including the new test and every pre-existing test in the file.

- [ ] **Step 5: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/Services/CallTranscriptionService.swift \
        apps/ios/MeeshyTests/Unit/Services/CallTranscriptionServiceTests.swift
git commit -m "feat(ios/calls): persistence accumulator decoupled from the 50-segment live display cap"
```

---

### Task 5: `resetForCallEnd()` persists a guarded, speaker-resolved snapshot

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/CallTranscriptionService.swift` (`resetForCallEnd`)
- Modify: `apps/ios/Meeshy/Features/Main/Services/CallManager.swift:3278` (call site)
- Modify: `apps/ios/MeeshyTests/Unit/Services/CallTranscriptionServiceTests.swift`
  (`test_resetForCallEnd_purgesSegments_evenWhenNeverTranscribingLocally` — signature changed)

**Interfaces:**
- Consumes: `CallTranscript`/`CallTranscriptSegment` (Task 1), `CallTranscriptStore.shared
  .saveMerging` (Task 3), `persistedSegments` (Task 4).
- Produces: `resetForCallEnd(callId:conversationId:callStartedAt:localUserId:localSpeakerName:
  remoteSpeakerName:)` — the sole call site is `CallManager.swift:3278`, updated in this same
  task, so no other task depends on the old no-argument signature surviving.

- [ ] **Step 1: Write the failing test — update the existing test for the new signature**

Open `apps/ios/MeeshyTests/Unit/Services/CallTranscriptionServiceTests.swift`, find
`test_resetForCallEnd_purgesSegments_evenWhenNeverTranscribingLocally`. Update its call to the new
signature (read the test's current body first — it calls `receiveTranslatedSegment` then
`resetForCallEnd()`; only the final call needs updating):

```swift
        sut.resetForCallEnd(callId: nil, conversationId: "conv-1", callStartedAt: nil, localUserId: "user-1", localSpeakerName: "Moi", remoteSpeakerName: "Bob")
```

Add a new test right after it, asserting the `callId ?? ""` bug this task fixes stays fixed:

```swift
    func test_resetForCallEnd_nilCallId_doesNotPersist_evenWithSegments() async {
        let socket = MockMessageSocketManager()
        let sut = CallTranscriptionService(socket: socket)
        sut.receiveTranslatedSegment(makeSegment(text: "Hello", speakerId: "remote-user", isFinal: true, capturedAt: Date()))
        XCTAssertFalse(sut.persistedSegmentsForTesting.isEmpty, "Sanity: segments were captured despite no local callId.")

        sut.resetForCallEnd(callId: nil, conversationId: "conv-1", callStartedAt: nil, localUserId: "user-1", localSpeakerName: "Moi", remoteSpeakerName: "Bob")
        // Give the (should-never-fire) Task { } a beat, then confirm nothing landed under an empty-string key.
        try? await Task.sleep(nanoseconds: 100_000_000)
        let loaded = await CallTranscriptStore.shared.transcript(for: "")
        XCTAssertNil(loaded, "A nil callId must never produce a persisted transcript, empty-keyed or otherwise.")
    }
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -30
```

Expected: **BUILD FAILED** — `resetForCallEnd()` doesn't accept these arguments yet.

- [ ] **Step 3: Rewrite `resetForCallEnd()`**

In `CallTranscriptionService.swift`, replace:

```swift
    func resetForCallEnd() {
        stopTranscribing()
        isShowingOverlay = false
    }
```

with:

```swift
    /// End-of-call teardown — PERSISTS before purging. `callId`/`conversationId`/
    /// `callStartedAt`/speaker names are threaded in as parameters (this
    /// service has no stored `conversationId`/`callStartDate`, and its own
    /// `callId` is nil whenever this device never called `startTranscribing`
    /// — see the `callId: String?` guard below, which fixes a real bug: a
    /// receive-only device (never transcribed locally, only received the
    /// other participant's segments) must NOT persist under an empty-string
    /// key. `CallManager` — the sole caller, always at definite end-of-call —
    /// has every value in hand at its call site.
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
            Task { await CallTranscriptStore.shared.saveMerging(snapshot) }
        }
        stopTranscribing()
        isShowingOverlay = false
    }
```

Update `stopTranscribing()` to also clear `persistedSegments` (find the existing
`allSegments.removeAll()` line and add immediately after it):

```swift
        persistedSegments.removeAll()
```

- [ ] **Step 4: Update the call site in `CallManager.swift`**

At `CallManager.swift:3278`, replace:

```swift
        transcriptionService.resetForCallEnd()
```

with:

```swift
        transcriptionService.resetForCallEnd(
            callId: currentCallId,
            conversationId: conversationId ?? "",
            callStartedAt: callStartDate,
            localUserId: AuthManager.shared.currentUser?.id ?? "",
            localSpeakerName: AuthManager.shared.currentUser?.displayName ?? AuthManager.shared.currentUser?.username ?? "",
            remoteSpeakerName: remoteUsername ?? ""
        )
```

(Confirmed during planning: at this exact line in the teardown sequence, `currentCallId`,
`conversationId`, `callStartDate`, and `remoteUsername` are all still their real, non-nil values
— they're only nilled later in the same `endCallInternal` sequence, at lines 3381/3384/3316/3383
respectively, all after this call.)

- [ ] **Step 5: Run to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -30
SIM=$(cat /private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/c355ca3e-ed99-4888-959f-df7d0c24f3a5/scratchpad/tmp182_udid.txt)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/CallTranscriptionServiceTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -40
```

Expected: all tests in the file pass, including the updated existing test and the new one.

- [ ] **Step 6: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/Services/CallTranscriptionService.swift \
        apps/ios/Meeshy/Features/Main/Services/CallManager.swift \
        apps/ios/MeeshyTests/Unit/Services/CallTranscriptionServiceTests.swift
git commit -m "fix(ios/calls): resetForCallEnd persists a guarded, speaker-resolved transcript snapshot"
```

---

### Task 6: Authoritative message-deletion sweep + conversation-delete sweep

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift`
  (`handleDeletedMessage`)
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift`
  (`deleteConversation`)
- Test: find/create the SDK test file covering `ConversationSyncEngine`'s deletion handling (grep
  first — do not assume a filename)
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift` (existing file
  — extend it; grep first to confirm the name)

**Interfaces:**
- Consumes: `CallTranscriptStore.shared.invalidate(for:)` (Task 3), `Message.callSummary` (already
  exists — `MeeshyMessage.callSummary` at `CoreModels.swift:671`; `APIMessage.callSummary` at
  `MessageModels.swift:421` is the API-layer decode source it's built from).

Two independent sweeps, both using `Message.callSummary?.callId` to resolve which local
transcripts a set of messages corresponds to — no new secondary index needed, since the existing
local messages cache (keyed by `conversationId`, already holding each message's `callSummary`) is
itself the join key from "a conversation" to "its calls" (user direction during planning).

- [ ] **Step 1: Locate the existing test coverage**

```bash
cd /Users/smpceo/Documents/v2_meeshy
grep -rln "handleDeletedMessage\|MessageDeletedEvent" packages/MeeshySDK/Tests/
```

Read whatever this finds — the existing test(s) for `handleDeletedMessage` set up the mocked cache
state this new assertion needs to build on (a pre-seeded message in `cache.messages`).

- [ ] **Step 2: Write the failing test**

In the file found by Step 1, add a case: seed `cache.messages` with a message carrying a
`callSummary` (`CallSummaryMetadata` with a known `callId`), also seed
`CallTranscriptStore.shared` with a `CallTranscript` for that same `callId`, invoke
`handleDeletedMessage` with a matching `MessageDeletedEvent`, then assert
`await CallTranscriptStore.shared.transcript(for: callId)` is `nil` afterward. Also add a negative
case: a deleted message with `callSummary == nil` must not touch `CallTranscriptStore` at all
(nothing to assert removal of, but confirm no crash / no spurious calls if the test harness can
observe that).

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshySDKTests -derivedDataPath /tmp/sdk_transcript_check 2>&1 | tail -30
```

Expected: the new assertion fails (transcript still present — nothing invalidates it yet).

- [ ] **Step 4: Wire the invalidation**

In `ConversationSyncEngine.swift`, `handleDeletedMessage(_:)` currently reads:

```swift
    private func handleDeletedMessage(_ event: MessageDeletedEvent) async {
        await cache.messages.upsertPatch(for: event.conversationId, itemId: event.messageId) { msg in
            msg.deletedAt = Date()
            msg.content = ""
        }
        _messagesDidChange.send(event.conversationId)
        // If the deleted message was the conversation's last message, the list-row
        // preview still shows the (now-deleted) text — recompute it from the most
        // recent surviving message, mirroring the gateway's `deletedAt: null` REST list.
        await recomputeLastMessagePreviewAfterDeletion(
            conversationId: event.conversationId, deletedMessageId: event.messageId)
    }
```

(Correction, plan review: the 3-line comment above `recomputeLastMessagePreviewAfterDeletion` is
part of the real file — included here so a literal find/replace against the actual source
matches.)

`MessageDeletedEvent` carries no `callId` — resolve it from the message's current (pre-wipe) state
by reading the cache **before** the patch, since the patch clears `content` but leaves `metadata`/
`callSummary` untouched (confirm this against the real `upsertPatch` mutation above — it only
touches `deletedAt`/`content`, so `callSummary` survives the patch and could be read after too;
reading before is still clearer intent and matches "resolve before it's gone" from the design):

```swift
    private func handleDeletedMessage(_ event: MessageDeletedEvent) async {
        let callId = await cache.messages.load(for: event.conversationId).snapshot()?
            .first(where: { $0.id == event.messageId })?.callSummary?.callId

        await cache.messages.upsertPatch(for: event.conversationId, itemId: event.messageId) { msg in
            msg.deletedAt = Date()
            msg.content = ""
        }
        if let callId {
            await CallTranscriptStore.shared.invalidate(for: callId)
        }
        _messagesDidChange.send(event.conversationId)
        await recomputeLastMessagePreviewAfterDeletion(
            conversationId: event.conversationId, deletedMessageId: event.messageId)
    }
```

This only fires from the socket-confirmed `message:deleted` path `handleDeletedMessage` already
exclusively serves — the app-level `ConversationViewModel.deleteMessage`'s `.local` (reversible
hide) and optimistic `.everyone` (rollback-capable) paths are untouched by this change and never
call this SDK method directly, so they cannot trigger a premature, un-rollback-able invalidation.

- [ ] **Step 5: Run to verify the message-delete sweep passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshySDKTests -derivedDataPath /tmp/sdk_transcript_check 2>&1 | tail -40
```

Expected: full `MeeshySDKTests` target green.

- [ ] **Step 6: Write the failing test for the conversation-delete sweep**

Read `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift`'s existing
`deleteConversation` and its test coverage first:

```bash
cd /Users/smpceo/Documents/v2_meeshy
grep -n "func deleteConversation\|deleteConversation" apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift
```

Add a test in that file, matching its existing `makeSUT()`/mock-store conventions: seed
`CacheCoordinator.shared.messages` for a conversation with one message carrying a `callSummary`
(known `callId`), seed `CallTranscriptStore.shared` with a transcript for that `callId`, call
`await sut.deleteConversation(conversationId:)`, then assert
`await CallTranscriptStore.shared.transcript(for: callId)` is `nil`.

- [ ] **Step 7: Run to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -20
SIM=$(cat /private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/c355ca3e-ed99-4888-959f-df7d0c24f3a5/scratchpad/tmp182_udid.txt)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/ConversationListViewModelTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -30
```

Expected: fails — the transcript is still present, nothing sweeps it yet.

- [ ] **Step 8: Wire the conversation-delete sweep**

In `ConversationListViewModel.swift`, `deleteConversation` currently reads:

```swift
    func deleteConversation(conversationId: String) async {
        guard convIndex(for: conversationId) != nil else { return }
        // `.deleteForUser` sets userState.deletedForUserAt (soft delete)
        // optimistically + dispatches deleteForMe via the outbox. The row
        // disappears because `filterConversations` hides deletedForUserAt != nil;
        // on a 4xx the store clears deletedForUserAt and the row reappears.
        try? await store.apply(.deleteForUser, for: conversationId)
    }
```

Add the sweep after the apply call:

```swift
    func deleteConversation(conversationId: String) async {
        guard convIndex(for: conversationId) != nil else { return }
        // `.deleteForUser` sets userState.deletedForUserAt (soft delete)
        // optimistically + dispatches deleteForMe via the outbox. The row
        // disappears because `filterConversations` hides deletedForUserAt != nil;
        // on a 4xx the store clears deletedForUserAt and the row reappears.
        try? await store.apply(.deleteForUser, for: conversationId)
        await sweepLocalCallTranscripts(forConversation: conversationId)
    }

    /// Every local call transcript for this conversation, swept alongside the
    /// (optimistic, rollback-capable) conversation delete. No secondary index
    /// needed — the existing local messages cache already carries each call
    /// message's `callSummary.callId`, which IS the join from "this
    /// conversation" to "its calls". Accepted, low-severity edge case: a
    /// rolled-back delete (4xx) doesn't un-sweep already-invalidated
    /// transcripts — same risk class already accepted for other local-cache-only
    /// invalidations elsewhere in the app. See
    /// docs/superpowers/specs/2026-07-11-call-transcript-history-design.md.
    private func sweepLocalCallTranscripts(forConversation conversationId: String) async {
        let messages = await CacheCoordinator.shared.messages.load(for: conversationId).snapshot() ?? []
        for callId in messages.compactMap(\.callSummary?.callId) {
            await CallTranscriptStore.shared.invalidate(for: callId)
        }
    }
```

- [ ] **Step 9: Run to verify both sweeps pass**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -30
SIM=$(cat /private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/c355ca3e-ed99-4888-959f-df7d0c24f3a5/scratchpad/tmp182_udid.txt)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/ConversationListViewModelTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -30
```

Expected: passes.

- [ ] **Step 10: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift packages/MeeshySDK/Tests/ \
        apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift \
        apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift
git commit -m "fix(calls): sweep local call transcripts on message delete (authoritative) and conversation delete"
```

---

### Task 7: Long-press routing — `BubbleCallNoticeView` → `CallDetailSheet`, threaded like `onCallBack`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleCallNoticeView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/MessageListView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`
- Test: new file `apps/ios/MeeshyTests/Unit/Views/CallDetailRoutingTests.swift`

**Interfaces:**
- Produces: `overlayState.callDetailMessage: Message?` (new plain `var` — **correction, plan
  review**: `overlayState` (`ConversationOverlayState`) is a plain `struct` behind `@State var
  overlayState`, not an `ObservableObject`; its siblings `overlayMessage`/`detailSheetMessage` are
  plain `var`s too, so this new property must **not** be `@Published`, which only compiles inside
  a class. `$overlayState.callDetailMessage` still works as a binding via `@State`'s projection,
  exactly like the existing `$overlayState.detailSheetMessage` at `ConversationView.swift:667`),
  separate from the existing `detailSheetMessage` which stays wired to `MessageMoreSheet` for
  regular messages, a `.sheet(item: $overlayState.callDetailMessage)` presenting
  `CallSummaryDetailSheet` — Task 8 extends that sheet's content with the Transcript section.

This task threads a new `onLongPress: (() -> Void)?` closure through the exact same 4-file chain
`onCallBack` already uses (confirmed during planning by reading each file) — `BubbleCallNoticeView`
→ `ThemedMessageBubble` → `MessageListViewController` → `MessageListView` → `ConversationView`.
`BubbleCallNoticeView` **keeps** its existing `highPriorityGesture` (still required to prevent the
2026-07-03 pocket-dial regression — the whole card is a `Button { onCallBack }`, and a plain
`simultaneousGesture` at an ancestor doesn't preempt that button's own tap recognition); only what
it *does* on recognition changes.

- [ ] **Step 1: Write the failing test — source-pattern guards**

Create `apps/ios/MeeshyTests/Unit/Views/CallDetailRoutingTests.swift`:

```swift
import XCTest
@testable import Meeshy

@MainActor
final class CallDetailRoutingTests: XCTestCase {

    private func source(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/\(path)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_bubbleCallNoticeView_stillHasHighPriorityGesture_butNoLongerPresentsLocalSheet() throws {
        let view = try source("Features/Main/Views/Bubble/BubbleCallNoticeView.swift")
        XCTAssertTrue(
            view.contains(".highPriorityGesture("),
            "The 2026-07-03 pocket-dial fix must survive — removing it would let a long-press " +
            "also fire the card's own Button { onCallBack } tap action."
        )
        XCTAssertFalse(
            view.contains("showDetails = true"),
            "BubbleCallNoticeView must no longer present its own local CallSummaryDetailSheet — " +
            "the long-press now routes through onLongPress to the shared decision point."
        )
    }

    func test_conversationView_onLongPress_branchesOnCallSummary_notMessageSourceSystem() throws {
        let view = try source("Features/Main/Views/ConversationView.swift")
        guard let range = view.range(of: "onLongPress: { messageId in") else {
            XCTFail("ConversationView must define the onLongPress closure"); return
        }
        let end = view.index(range.lowerBound, offsetBy: 700, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound..<end])
        XCTAssertTrue(
            body.contains("msg.callSummary != nil"),
            "onLongPress must route call messages via callSummary != nil, not the old blanket " +
            "messageSource == .system no-op — plain system notices (no callSummary) still no-op."
        )
        XCTAssertTrue(
            body.contains("overlayState.callDetailMessage = msg"),
            "A call message's long-press must populate overlayState.callDetailMessage — a new, " +
            "separate property from detailSheetMessage (which stays wired to MessageMoreSheet)."
        )
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate && cd -
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -20
SIM=$(cat /private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/c355ca3e-ed99-4888-959f-df7d0c24f3a5/scratchpad/tmp182_udid.txt)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/CallDetailRoutingTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -30
```

Expected: build succeeds (new test file compiles against existing source), both new tests FAIL
(source doesn't have the new shape yet).

- [ ] **Step 3a: `BubbleCallNoticeView` — replace local sheet with a closure**

In `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleCallNoticeView.swift`, add a new property:

```swift
    var onLongPress: (() -> Void)? = nil
```

Replace:

```swift
            .highPriorityGesture(
                LongPressGesture(minimumDuration: 0.35).onEnded { _ in
                    HapticFeedback.medium()
                    showDetails = true
                }
            )
```

with:

```swift
            .highPriorityGesture(
                LongPressGesture(minimumDuration: 0.35).onEnded { _ in
                    HapticFeedback.medium()
                    onLongPress?()
                }
            )
```

**Correction (plan review) — a second `showDetails = true` site exists and must also change.**
`BubbleCallNoticeView` sets it in two places, not one: the `highPriorityGesture` just replaced
above, AND inside `.accessibilityAction(named: "Détails de l'appel") { showDetails = true }`
(lines 74-76). Change that closure's body from `showDetails = true` to `onLongPress?()` too —
otherwise removing `@State private var showDetails` in this same step leaves that accessibility
action referencing a symbol that no longer exists, a compile error.

Remove the now-unused `@State private var showDetails = false` and the trailing
`.sheet(isPresented: $showDetails) { CallSummaryDetailSheet(...) }` block — presentation moves to
`ConversationView` (Step 3e). Leave `CallSummaryDetailSheet` itself (the struct, further down in
the same file) completely untouched — Task 8 extends it in place.

- [ ] **Step 3b: `ThemedMessageBubble` — thread the closure**

In `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift`, next to the existing
`var onCallBack: ((CallSummaryMetadata) -> Void)? = nil` (line 88), add:

```swift
    var onLongPressCallDetail: (() -> Void)? = nil
```

At the `BubbleCallNoticeView(...)` call site (line 200), add the new argument:

```swift
                BubbleCallNoticeView(notice: callNotice, accentHex: contactColor, isDark: isDark, onCallBack: onCallBack, onLongPress: onLongPressCallDetail)
```

- [ ] **Step 3c: `MessageListViewController` — capture and pass through**

In `apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift`, next to
`var onCallBack: ((CallSummaryMetadata) -> Void)?` (line 136), add:

```swift
    var onCallDetailRequest: ((String) -> Void)?
```

In the cell-configuration closure, next to `let callBackHandler = self.onCallBack` (line 520),
add:

```swift
            let callDetailHandler = self.onCallDetailRequest
```

At the `ThemedMessageBubble(...)` construction (around line 568-609), find `onCallBack:
callBackHandler,` (line 602) and add immediately after it:

```swift
                        onLongPressCallDetail: { callDetailHandler?(messageId) },
```

- [ ] **Step 3d: `MessageListView` — forward the property**

In `apps/ios/Meeshy/Features/Main/Views/MessageListView.swift`, add a new property alongside the
existing `var onLongPress: ((String) -> Void)?` (near line 290):

```swift
    var onCallDetailRequest: ((String) -> Void)?
```

In both `makeUIViewController` and `updateUIViewController`, next to each existing `vc.onCallBack
= { [weak conversationViewModel] summary in conversationViewModel?.callBack(for: summary) }`
(lines 367-369 and 419-421), add:

```swift
        vc.onCallDetailRequest = onCallDetailRequest
```

- [ ] **Step 3e: `ConversationView` — the decision point + new `overlayState` property + sheet**

Find `overlayState`'s definition (near `var detailSheetMessage: Message? = nil`, line 40) and add
a **plain property, not `@Published`** — `ConversationOverlayState` is a plain `struct` held via
`@State var overlayState`, exactly like its sibling `detailSheetMessage`; `@Published` only
compiles inside a class and would break this build:

```swift
    var callDetailMessage: Message? = nil
```

Find the existing `.sheet(item: $overlayState.detailSheetMessage) { msg in ... }` (line 667) and
add a new, separate sheet modifier immediately after its closing brace (Task 8 fills in the
`CallSummaryDetailSheet` construction's new transcript-aware initializer; for this task, wire the
existing initializer signature as-is). **Correction (plan review) — the original draft's
`onCallBack` closure was broken**: it referenced `resolvedCalleeName`, which is `private` on a
different file (`ConversationView+Header.swift:70`, inaccessible here), and reimplemented the
callback logic incorrectly (empty `userId` when the current user was the original initiator). The
codebase already has the correct, existing mechanism — `ConversationViewModel.callBack(for:)`
(`ConversationViewModel.swift:1877`), the same one `MessageListView.swift:368,420` already uses
for the regular call-back button:

```swift
            .sheet(item: $overlayState.callDetailMessage) { msg in
                if let summary = msg.callSummary {
                    CallSummaryDetailSheet(
                        summary: summary,
                        isOutgoing: summary.initiatorId == viewModel.currentUserIdForView,
                        accentHex: accentColor,
                        timestamp: msg.createdAt,
                        onCallBack: { s in viewModel.callBack(for: s) }
                    )
                }
            }
```

At the `MessageListView(...)` instantiation (around line 987), add a new argument alongside the
existing `onLongPress: { messageId in ... }` (found earlier at ~line 1087):

```swift
                onCallDetailRequest: { messageId in
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    overlayState.callDetailMessage = msg
                },
```

Find `ConversationView.swift`'s existing `onLongPress: { messageId in ... }` closure and change
its system-message branch from the old no-op guard to:

```swift
                onLongPress: { messageId in
                    guard overlayState.longPressEnabled else { return }
                    guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                    if msg.callSummary != nil {
                        overlayState.callDetailMessage = msg
                    } else if msg.messageSource != .system {
                        overlayState.overlayMessage = msg
                        overlayState.showOverlayMenu = true
                    }
                },
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -30
SIM=$(cat /private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/c355ca3e-ed99-4888-959f-df7d0c24f3a5/scratchpad/tmp182_udid.txt)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/CallDetailRoutingTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -30
```

Expected: both tests pass, build succeeds across all 5 modified files.

- [ ] **Step 5: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleCallNoticeView.swift \
        apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift \
        apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift \
        apps/ios/Meeshy/Features/Main/Views/MessageListView.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
        apps/ios/MeeshyTests/Unit/Views/CallDetailRoutingTests.swift
git commit -m "feat(ios/calls): route call-message long-press through the shared decision point"
```

---

### Task 8: `CallSummaryDetailSheet` — Transcript section, gated on availability

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleCallNoticeView.swift`
  (`CallSummaryDetailSheet`, lines ~292-504)
- Modify: `apps/ios/Meeshy/Localizable.xcstrings`
- Test: `apps/ios/MeeshyTests/Unit/Views/CallSummaryTranscriptSectionTests.swift` (new file)

**Interfaces:**
- Consumes: `CallTranscriptStore.shared.transcript(for:)` (Task 3), `CallTranscript`/
  `CallTranscriptSegment` (Task 1).

- [ ] **Step 1: Write the failing test**

Create `apps/ios/MeeshyTests/Unit/Views/CallSummaryTranscriptSectionTests.swift`:

```swift
import XCTest
@testable import Meeshy

@MainActor
final class CallSummaryTranscriptSectionTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/Bubble/BubbleCallNoticeView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_callSummaryDetailSheet_looksUpTranscript_bySummaryCallId() throws {
        let view = try source()
        guard let range = view.range(of: "struct CallSummaryDetailSheet: View {") else {
            XCTFail("CallSummaryDetailSheet not found"); return
        }
        let end = view.index(range.lowerBound, offsetBy: 3000, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound..<end])
        XCTAssertTrue(
            body.contains("CallTranscriptStore.shared.transcript(for: summary.callId)"),
            "The sheet must look up a local transcript keyed by the call's own callId."
        )
    }

    func test_transcriptSection_hasDeleteAction_notOnlyMessageDeletion() throws {
        let view = try source()
        XCTAssertTrue(
            view.contains("CallTranscriptStore.shared.invalidate(for:"),
            "The detail sheet must offer a direct, discoverable delete action for the transcript " +
            "— independent of deleting the call message itself (privacy review finding)."
        )
    }

    func test_disclaimer_mentionsMeeshyServerNotDevice_andInterlocutorWords() throws {
        let view = try source()
        XCTAssertTrue(
            view.contains("call.transcript.disclaimer"),
            "The disclaimer string key must exist and be shown alongside the Transcript section."
        )
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -20
SIM=$(cat /private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/c355ca3e-ed99-4888-959f-df7d0c24f3a5/scratchpad/tmp182_udid.txt)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/CallSummaryTranscriptSectionTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -30
```

Expected: all 3 fail (none of the new content exists yet).

- [ ] **Step 3: Add the Transcript section**

In `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleCallNoticeView.swift`'s
`CallSummaryDetailSheet`, add new state and a `.task`. **Correction (plan review)** —
`transcript` needs an explicit `= nil`: an optional `@State` with no initializer either fails to
compile or gets pulled into the struct's synthesized memberwise initializer as a required
parameter, which would silently break Task 7's `CallSummaryDetailSheet(summary:isOutgoing
:accentHex:timestamp:onCallBack:)` call site (that task runs first and has no `transcript:`
argument):

```swift
    @State private var transcript: CallTranscript? = nil
    @State private var showOriginalText = false
    @State private var showDeleteConfirmation = false
```

In `body`, inside the `VStack(spacing: 20)`, add the section after `details`:

```swift
                if let transcript {
                    transcriptSection(transcript)
                }
```

Add `.task(id: summary.callId) { transcript = await CallTranscriptStore.shared.transcript(for: summary.callId) }` to the outer `ScrollView` modifier chain, alongside the existing
`.adaptiveSheetGlassBackground()`/`.presentationDetents(...)`.

Add the new views:

```swift
    private func transcriptSection(_ transcript: CallTranscript) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(String(localized: "calls.detail.transcript", defaultValue: "Transcription", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                Spacer()
                Button {
                    withAnimation { showOriginalText.toggle() }
                } label: {
                    Image(systemName: showOriginalText ? "character.bubble.fill" : "captions.bubble.fill")
                        .foregroundColor(Color(hex: accentHex))
                }
                .accessibilityLabel(showOriginalText
                    ? String(localized: "call.control.translation.showTranslated", defaultValue: "Afficher la traduction", bundle: .main)
                    : String(localized: "call.control.translation.showOriginal", defaultValue: "Afficher le texte original", bundle: .main))
            }

            VStack(alignment: .leading, spacing: 10) {
                // id: \.offset, not \.capturedAt (recommended, plan review) — saveMerging's dedup
                // key deliberately allows two segments to share a capturedAt (different
                // speaker/text at the same instant), which would collide as a ForEach id.
                ForEach(Array(transcript.segments.enumerated()), id: \.offset) { _, segment in
                    transcriptRow(segment, callStartedAt: transcript.callStartedAt)
                }
            }
            .padding(12)
            .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous), tint: tint.opacity(0.1))

            HStack(spacing: 6) {
                Image(systemName: "info.circle")
                    .font(.caption2)
                Text(String(localized: "call.transcript.disclaimer", defaultValue: "Transcription locale à cet appareil, jamais envoyée au serveur Meeshy — peut figurer dans une sauvegarde iCloud/Finder de cet appareil. Inclut les paroles de votre interlocuteur, telles que reçues pendant l'appel.", bundle: .main))
                    .font(.caption2)
            }
            .foregroundColor(theme.textMuted)

            Button(role: .destructive) {
                showDeleteConfirmation = true
            } label: {
                Text(String(localized: "call.transcript.delete", defaultValue: "Supprimer ce transcript", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
            }
            .alert(String(localized: "call.transcript.delete.confirm.title", defaultValue: "Supprimer ce transcript ?", bundle: .main), isPresented: $showDeleteConfirmation) {
                Button(String(localized: "call.transcript.delete", defaultValue: "Supprimer ce transcript", bundle: .main), role: .destructive) {
                    Task {
                        await CallTranscriptStore.shared.invalidate(for: transcript.callId)
                        self.transcript = nil
                    }
                }
                Button(String(localized: "story.composer.cancelAction", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
            } message: {
                Text(String(localized: "call.transcript.delete.confirm.message", defaultValue: "Cette action est définitive.", bundle: .main))
            }
        }
    }

    private func transcriptRow(_ segment: CallTranscriptSegment, callStartedAt: Date) -> some View {
        let elapsed = segment.capturedAt.timeIntervalSince(callStartedAt)
        let elapsedLabel = CallManager.formatDuration(max(0, elapsed))
        let speakerColor = segment.isLocal ? MeeshyColors.indigo400 : MeeshyColors.brandPrimary
        let displayText = segment.isLocal ? segment.text : (showOriginalText ? segment.text : (segment.translatedText ?? segment.text))
        return VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Text(segment.speakerName)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(speakerColor)
                Spacer()
                Text(elapsedLabel)
                    .font(.caption2.monospacedDigit())
                    .foregroundColor(theme.textMuted)
            }
            Text(displayText)
                .font(.callout)
                .foregroundColor(theme.textPrimary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(segment.speakerName), \(elapsedLabel) : \(displayText)")
    }
```

Add the required `import MeeshySDK` if not already present at the top of the file (for
`CallTranscriptStore`/`CallTranscript`/`CallTranscriptSegment`).

- [ ] **Step 4: Add the xcstrings keys**

Open `apps/ios/Meeshy/Localizable.xcstrings`, insert alphabetically (`call.transcript.*` sorts
right after the existing `call.transcript.you` key found during design research — locate it first
with `grep -n '"call.transcript.you"'`):

```json
    "call.transcript.delete" : {
      "extractionState" : "manual",
      "localizations" : {
        "de" : { "stringUnit" : { "state" : "translated", "value" : "Dieses Transkript löschen" } },
        "en" : { "stringUnit" : { "state" : "translated", "value" : "Delete this transcript" } },
        "es" : { "stringUnit" : { "state" : "translated", "value" : "Eliminar esta transcripción" } },
        "fr" : { "stringUnit" : { "state" : "translated", "value" : "Supprimer ce transcript" } },
        "pt-BR" : { "stringUnit" : { "state" : "translated", "value" : "Excluir esta transcrição" } }
      }
    },
    "call.transcript.delete.confirm.message" : {
      "extractionState" : "manual",
      "localizations" : {
        "de" : { "stringUnit" : { "state" : "translated", "value" : "Diese Aktion ist endgültig." } },
        "en" : { "stringUnit" : { "state" : "translated", "value" : "This action is permanent." } },
        "es" : { "stringUnit" : { "state" : "translated", "value" : "Esta acción es definitiva." } },
        "fr" : { "stringUnit" : { "state" : "translated", "value" : "Cette action est définitive." } },
        "pt-BR" : { "stringUnit" : { "state" : "translated", "value" : "Esta ação é definitiva." } }
      }
    },
    "call.transcript.delete.confirm.title" : {
      "extractionState" : "manual",
      "localizations" : {
        "de" : { "stringUnit" : { "state" : "translated", "value" : "Dieses Transkript löschen?" } },
        "en" : { "stringUnit" : { "state" : "translated", "value" : "Delete this transcript?" } },
        "es" : { "stringUnit" : { "state" : "translated", "value" : "¿Eliminar esta transcripción?" } },
        "fr" : { "stringUnit" : { "state" : "translated", "value" : "Supprimer ce transcript ?" } },
        "pt-BR" : { "stringUnit" : { "state" : "translated", "value" : "Excluir esta transcrição?" } }
      }
    },
    "call.transcript.disclaimer" : {
      "extractionState" : "manual",
      "localizations" : {
        "de" : { "stringUnit" : { "state" : "translated", "value" : "Transkription lokal auf diesem Gerät, niemals an den Meeshy-Server gesendet — kann in einem iCloud/Finder-Backup dieses Geräts enthalten sein. Enthält die während des Anrufs empfangenen Worte Ihres Gesprächspartners." } },
        "en" : { "stringUnit" : { "state" : "translated", "value" : "Transcription local to this device, never sent to the Meeshy server — may be included in this device's iCloud/Finder backup. Includes your interlocutor's words as received during the call." } },
        "es" : { "stringUnit" : { "state" : "translated", "value" : "Transcripción local en este dispositivo, nunca enviada al servidor de Meeshy — puede incluirse en una copia de seguridad de iCloud/Finder de este dispositivo. Incluye las palabras de tu interlocutor tal como se recibieron durante la llamada." } },
        "fr" : { "stringUnit" : { "state" : "translated", "value" : "Transcription locale à cet appareil, jamais envoyée au serveur Meeshy — peut figurer dans une sauvegarde iCloud/Finder de cet appareil. Inclut les paroles de votre interlocuteur, telles que reçues pendant l'appel." } },
        "pt-BR" : { "stringUnit" : { "state" : "translated", "value" : "Transcrição local neste aparelho, nunca enviada ao servidor Meeshy — pode estar incluída em um backup iCloud/Finder deste aparelho. Inclui as palavras do seu interlocutor, conforme recebidas durante a chamada." } }
      }
    },
    "calls.detail.transcript" : {
      "extractionState" : "manual",
      "localizations" : {
        "de" : { "stringUnit" : { "state" : "translated", "value" : "Transkription" } },
        "en" : { "stringUnit" : { "state" : "translated", "value" : "Transcript" } },
        "es" : { "stringUnit" : { "state" : "translated", "value" : "Transcripción" } },
        "fr" : { "stringUnit" : { "state" : "translated", "value" : "Transcription" } },
        "pt-BR" : { "stringUnit" : { "state" : "translated", "value" : "Transcrição" } }
      }
    },
```

Validate JSON: `python3 -c "import json; json.load(open('apps/ios/Meeshy/Localizable.xcstrings'))" && echo OK`.

- [ ] **Step 5: Run to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -30
SIM=$(cat /private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/c355ca3e-ed99-4888-959f-df7d0c24f3a5/scratchpad/tmp182_udid.txt)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/CallSummaryTranscriptSectionTests \
  -only-testing:MeeshyTests/LocalizationConsistencyTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -40
```

Expected: both suites pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleCallNoticeView.swift \
        apps/ios/Meeshy/Localizable.xcstrings \
        apps/ios/MeeshyTests/Unit/Views/CallSummaryTranscriptSectionTests.swift
git commit -m "feat(ios/calls): Transcript section in the call detail sheet — gated, deletable, disclaimed"
```

---

### Task 9: Live panel visible on passive receipt, not gated on the local toggle

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/CallView.swift`
- Test: `apps/ios/MeeshyTests/Unit/Views/CallViewAccessibilityTests.swift` (or
  `CallSignalIndicatorTests.swift` — whichever already hosts source-pattern guards for
  `showTranscript`; grep first)

**Interfaces:**
- Consumes: `CallTranscriptionService.segments` (existing `@Published`).

This closes the consent-transparency gap from the privacy review: today `showTranscript` only
flips true from `advanceCaptionsMode()` (the local user's own tap). A device that never taps its
own button but receives the other participant's segments accumulates them silently with no visible
panel. Per the user's resolution during review, the existing live multi-speaker panel is the
transparency mechanism — so it must actually appear whenever content is being captured, not only
when the local toggle was used.

- [ ] **Step 1: Write the failing test**

```bash
cd /Users/smpceo/Documents/v2_meeshy
grep -n "showTranscript" apps/ios/MeeshyTests/Unit/Views/CallViewAccessibilityTests.swift apps/ios/MeeshyTests/Unit/Services/CallSignalIndicatorTests.swift
```

Add to whichever file the grep shows already has related coverage (or `CallSignalIndicatorTests`'s
`CallHangupFastPathTests` class per this session's established convention if neither does):

```swift
    func test_showTranscript_autoRevealsOnFirstPassiveSegment_notOnlyLocalToggle() throws {
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "adaptiveOnChange(of: transcriptionService.segments.isEmpty)") else {
            XCTFail("CallView must observe transcriptionService.segments.isEmpty to auto-reveal the panel")
            return
        }
        let end = view.index(range.lowerBound, offsetBy: 400, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound..<end])
        XCTAssertTrue(
            body.contains("showTranscript = true"),
            "The panel must become visible the first time segments arrive, even if the local " +
            "captionsCycleButton was never tapped — closes the consent-transparency gap where a " +
            "device silently accumulates the other participant's words with nothing shown."
        )
    }
```

- [ ] **Step 2: Run test to verify it fails**

```bash
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -20
SIM=$(cat /private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/c355ca3e-ed99-4888-959f-df7d0c24f3a5/scratchpad/tmp182_udid.txt)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/CallHangupFastPathTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -30
```

Expected: fails — the modifier doesn't exist yet.

- [ ] **Step 3: Add the auto-reveal**

In `CallView.swift`, near the other `.adaptiveOnChange` modifiers on `connectedView` (alongside
the `lastError` one added earlier this session), add:

```swift
        .adaptiveOnChange(of: transcriptionService.segments.isEmpty) { wasEmpty, isEmpty in
            // First segment ever received this call (local OR remote) reveals
            // the panel even if this device's own captionsCycleButton was
            // never tapped — a device must never silently accumulate the
            // other participant's words with nothing visible. See
            // docs/superpowers/specs/2026-07-11-call-transcript-history-design.md §4.
            if wasEmpty, !isEmpty, !showTranscript {
                showTranscript = true
            }
        }
```

- [ ] **Step 4: Run to verify it passes**

```bash
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -30
SIM=$(cat /private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/c355ca3e-ed99-4888-959f-df7d0c24f3a5/scratchpad/tmp182_udid.txt)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/CallHangupFastPathTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -40
```

Expected: passes, and no pre-existing test in the class regresses (the modifier is additive — it
only ever turns `showTranscript` on, never off, so the existing manual-toggle tests are
unaffected).

- [ ] **Step 5: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/Views/CallView.swift \
        apps/ios/MeeshyTests/Unit/Services/CallSignalIndicatorTests.swift
git commit -m "fix(ios/calls): live transcript panel auto-reveals on first segment, not only local toggle"
```

(Adjust the `git add` test-file path if Step 1's grep found the coverage belongs in
`CallViewAccessibilityTests.swift` instead.)

---

### Task 10: Full suite + clean build

**Files:** none (verification only).

- [ ] **Step 1: Regenerate + full build**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate && cd -
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -30
```

Expected: **BUILD SUCCEEDED**.

- [ ] **Step 2: Full SDK suite**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK
xcodebuild test -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath /tmp/sdk_transcript_check 2>&1 | tail -60
```

Expected: green (or the same pre-existing failures unrelated to this plan's files that this
session has hit before on this scheme — diagnose anything NEW before proceeding).

- [ ] **Step 3: Every app-side suite touched by this plan**

```bash
cd /Users/smpceo/Documents/v2_meeshy
SIM=$(cat /private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/c355ca3e-ed99-4888-959f-df7d0c24f3a5/scratchpad/tmp182_udid.txt)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/CallTranscriptionServiceTests \
  -only-testing:MeeshyTests/CallDetailRoutingTests \
  -only-testing:MeeshyTests/CallSummaryTranscriptSectionTests \
  -only-testing:MeeshyTests/CallHangupFastPathTests \
  -only-testing:MeeshyTests/LocalizationConsistencyTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -80
```

Expected: all green.

- [ ] **Step 4: Verify no unrelated churn**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git status --short
```

Only `apps/ios/Meeshy.xcodeproj/project.pbxproj` and the 4 `Info.plist` files are expected beyond
this plan's own commits. Check the pbxproj diff content before staging (established policy this
session): it should contain only the new files from Tasks 1/3/6/7/8/9 plus a build-number bump —
if it contains anything else, don't commit it (another session's in-progress work may have been
swept in by the full regeneration).

```bash
git diff apps/ios/Meeshy.xcodeproj/project.pbxproj
```

- [ ] **Step 5: Commit the version bump, if clean**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy.xcodeproj/project.pbxproj \
        apps/ios/Meeshy/Info.plist \
        apps/ios/MeeshyNotificationExtension/Info.plist \
        apps/ios/MeeshyShareExtension/Info.plist \
        apps/ios/MeeshyWidgets/Info.plist
git commit -m "chore(ios): bump build number (call transcript history verification pass)"
```

---

### Task 11: Manual device QA (not blocking — requires two real devices) + documented follow-up

**Files:** none — verification checklist.

Cannot be executed autonomously — requires two physical devices on a real call. Leave as an open
checklist for the user; Tasks 1-10 are already fully verified by the simulator build + test suite.

- [ ] **Step 1: Asymmetric activation**

Two-device call. Only device B activates captions. Confirm device A's transcript panel becomes
visible (read-only, no original/translated control needed since A never activated its own
transcription) once B's words start arriving — this is Task 9's fix; confirm it's not jarring
(panel popping in) and that it doesn't fight with manual toggling if A later also activates their
own button.

- [ ] **Step 2: End-to-end persistence**

End the call from Step 1. Long-press the resulting call message on device A. Confirm: the
Transcript section appears with B's segments correctly attributed and timestamped from call start;
the original/translated toggle works; the disclaimer text is legible; "Supprimer ce transcript"
removes it and the section disappears on next open.

- [ ] **Step 3: No transcript, no section**

A call where neither device ever activates captions — confirm the detail sheet shows exactly
today's content (type/duration/data/quality/call-back), no empty Transcript placeholder.

- [ ] **Step 4: Rejoin merge**

Force-quit mid-call (with captions active), relaunch, use the "Rejoindre" header indicator (shipped
earlier this session) to rejoin, keep talking, end normally. Confirm the persisted transcript
contains segments from BOTH before and after the rejoin, not just the second half.

- [ ] **Step 5: Erasure paths**

Log out and back in (or delete account, on a disposable test account) — confirm no transcripts
survive. Delete a call message (real deletion, not local hide) from either device — confirm its
transcript is also gone from both. Delete a conversation containing a call with a transcript —
confirm the transcript is swept too (Task 6, Steps 6-9).

Once all 5 steps pass, this plan is fully closed out — no follow-up items remain (the earlier
conversation-delete-sweep gap identified during planning was resolved by Task 6, using the
existing local messages cache as the join from a conversation to its calls, per the user's
direction during planning — no new index infrastructure was needed).

**Explicit non-goal, confirmed out of scope for this plan**: the user separately raised, while
this plan was being written, a distinct and materially larger feature — the call-summary system
message being created at call *start* (not just at call end), showing a live "call in progress"
state clickable to rejoin, and transitioning through cancelled/missed/completed states as the
call resolves. This is a real product idea but a different one from "persist the transcript of a
call that already has its (end-of-call) summary message" — it changes when/how the summary
message itself is created and updated, which this plan does not touch. It needs its own
brainstorm (current call-summary creation is server-side, at a terminal call state only — the
exact lifecycle this would need to hook is unresearched) before any implementation.
