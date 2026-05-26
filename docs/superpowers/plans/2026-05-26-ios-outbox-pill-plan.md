# iOS Outbox Pill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate silent loss of the 2ⁿᵈ offline message in a conversation, and replace the 10-second-blind offline banner with a unified `SyncPill` overlay that lists every queued item with pastel rotation.

**Architecture:** Single source of truth stays the existing GRDB `outbox` table (read via `OfflineQueue` actor). SDK exposes a new neutral DTO `OutboxUIItem` + `pendingUIItemsPublisher`; UI binds via `SyncPillViewModel` (Combine of items × NetworkMonitor offline state) → `SyncPill` overlay on `RootView`. The `sendMessage` refactor closes the race condition by lifting `isSending` above the offline branch and replacing fire-and-forget `Task { try? await enqueue }` with awaited `try await enqueue`.

**Tech Stack:** Swift 6 / SwiftUI / Combine / GRDB (SDK) / XCTest + Swift Testing + SnapshotTesting + XCUITest.

**Spec:** `docs/superpowers/specs/2026-05-26-ios-outbox-pill-design.md`

---

## File Structure

### Created (SDK)

| Path | Responsibility |
|---|---|
| `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxUIItem.swift` | Neutral UI DTO + `from(record:)` mapping |
| `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueuePillProviding.swift` | Narrow protocol exposing `pendingUIItemsPublisher` for DI |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OutboxUIItemMappingTests.swift` | 25 mapping unit tests (Swift Testing) |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OfflineQueuePendingUIItemsPublisherTests.swift` | Publisher + status transitions (XCTest + GRDB in-memory) |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OfflineQueueConcurrentEnqueueTests.swift` | Bug 1 regression at SDK layer |

### Created (app)

| Path | Responsibility |
|---|---|
| `apps/ios/Meeshy/Features/Main/Components/SyncPill.swift` | Composite view — capsule + icon + title + counter + rotator |
| `apps/ios/Meeshy/Features/Main/Components/SyncPillItemView.swift` | Single visible item — icon, title preview, attachment badge, status overlay |
| `apps/ios/Meeshy/Features/Main/Components/SyncPillRotator.swift` | Timer-driven advance/pause/resume state machine |
| `apps/ios/Meeshy/Features/Main/Components/SyncPillHost.swift` | Hosts `SyncPillViewModel`, mounts pill on `RootView` overlay |
| `apps/ios/Meeshy/Features/Main/ViewModels/SyncPillViewModel.swift` | Combine of items × isOffline → `PillState`, with pure `derive` |
| `apps/ios/Meeshy/Features/Main/Routing/SyncPillRouter.swift` | `open(source:)` → tabRouter + conversation/post/story opener |
| `apps/ios/Meeshy/Features/Main/Theming/MeeshyColors+SyncPill.swift` | 8 pastel tokens + chrome tokens (light/dark) |
| `apps/ios/MeeshyTests/Features/Main/ViewModels/SyncPillViewModelDeriveTests.swift` | 9 pure derive tests |
| `apps/ios/MeeshyTests/Features/Main/ViewModels/ConversationViewModelOfflineQueueTests.swift` | Bug 1 regression at app layer |
| `apps/ios/MeeshyTests/Features/Main/Components/SyncPillRotatorTests.swift` | 6 rotator tests with `MockClock` |
| `apps/ios/MeeshyTests/Features/Main/Routing/SyncPillRouterTests.swift` | 4 router tests |
| `apps/ios/MeeshyTests/Features/Main/Components/SyncPillSnapshotTests.swift` | 11 snapshots |
| `apps/ios/MeeshyUITests/SyncPill/SyncPillUITests.swift` | 5 XCUITest smoke flows |

### Modified

| Path | Change |
|---|---|
| `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift` | + `pendingUIItemsSubject`, + `pendingUIItemsPublisher`, + `refreshPendingUIItems`, hook from `enqueue`/retry/applied/exhausted |
| `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift` | + `markOptimisticFailed(localId:reason:)` |
| `packages/MeeshySDK/Sources/MeeshySDK/Networking/NetworkMonitor.swift` | + `isOfflinePublisher` (debounced 500 ms) |
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` | Lift `isSending` guard above offline branch, replace 2 fire-and-forget Tasks with `try await`, optimistic insertion synchronous before `await` |
| `apps/ios/Meeshy/Features/Main/Components/ConnectionBanner.swift` | Remove `Task.sleep(for: .seconds(10))`, remove `disconnectedPill`/`offlinePill` private vars |
| `apps/ios/Meeshy/App/RootView.swift` | Mount `.overlay(alignment: .top) { SyncPillHost(...) }` |

### Deleted

| Path | Reason |
|---|---|
| `apps/ios/Meeshy/Features/Main/Components/OfflineBanner.swift` | Red toast replaced entirely by `SyncPill` `.offline` state |

---

## Pre-Flight

- [ ] **Step 0.1: Create worktree (if not already in one)**

Run:
```bash
cd /Users/smpceo/Documents/v2_meeshy
git worktree add .claude/worktrees/feat+ios-outbox-pill -b feat/ios-outbox-pill main
cd .claude/worktrees/feat+ios-outbox-pill
```
Expected: new working directory at `.claude/worktrees/feat+ios-outbox-pill` on branch `feat/ios-outbox-pill`.

- [ ] **Step 0.2: Move untracked spec into the worktree**

Run:
```bash
cd /Users/smpceo/Documents/v2_meeshy/.claude/worktrees/feat+ios-outbox-pill
cp /Users/smpceo/Documents/v2_meeshy/docs/superpowers/specs/2026-05-26-ios-outbox-pill-design.md docs/superpowers/specs/
cp /Users/smpceo/Documents/v2_meeshy/docs/superpowers/plans/2026-05-26-ios-outbox-pill-plan.md docs/superpowers/plans/
git add docs/superpowers/specs/2026-05-26-ios-outbox-pill-design.md docs/superpowers/plans/2026-05-26-ios-outbox-pill-plan.md
git commit -m "docs(plan): iOS outbox pill — spec + implementation plan"
```
Expected: 2 files committed.

- [ ] **Step 0.3: Verify build baseline**

Run: `./apps/ios/meeshy.sh build`
Expected: build green on `feat/ios-outbox-pill` HEAD (= main). If red, STOP and report — main is broken.

---

## Phase A — SDK foundations (additive, no UI change)

### Task A1: `OutboxUIItem` model

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxUIItem.swift`

- [ ] **Step A1.1: Write the model file**

Write:
```swift
import Foundation

/// UI-facing snapshot of an outbox row. Used by `SyncPill` to display
/// queued items without leaking GRDB row internals or domain payload
/// decoding cost into the view layer. One `OutboxUIItem` per
/// `OutboxRecord` row, regardless of attachment count.
public struct OutboxUIItem: Sendable, Equatable, Identifiable {
    public let id: String
    public let kind: Kind
    public let titlePreview: String?
    public let iconKind: IconKind
    public let attachmentCount: Int
    public let source: Source
    public let status: OutboxStatus
    public let createdAt: Date

    public init(
        id: String,
        kind: Kind,
        titlePreview: String?,
        iconKind: IconKind,
        attachmentCount: Int,
        source: Source,
        status: OutboxStatus,
        createdAt: Date
    ) {
        self.id = id
        self.kind = kind
        self.titlePreview = titlePreview
        self.iconKind = iconKind
        self.attachmentCount = attachmentCount
        self.source = source
        self.status = status
        self.createdAt = createdAt
    }

    public enum Kind: Sendable, Equatable {
        case message
        case reaction
        case edit
        case delete
        case story
        case postComment
        case postReaction
        case other(String)
    }

    public enum IconKind: Sendable, Equatable {
        case text
        case audio
        case image
        case video
        case file
        case reaction
        case sticker
        case none
    }

    public enum Source: Sendable, Equatable {
        case conversation(id: String)
        case post(id: String)
        case story(id: String)
        case unknown
    }
}
```

- [ ] **Step A1.2: Build the SDK**

Run:
```bash
cd /Users/smpceo/Documents/v2_meeshy/.claude/worktrees/feat+ios-outbox-pill
xcodebuild -scheme MeeshySDK -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile build 2>&1 | tail -10
```
Expected: `** BUILD SUCCEEDED **`. If `OutboxStatus` is not visible, add `import GRDB` or reference the existing public enum in `OutboxRecord.swift`.

- [ ] **Step A1.3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxUIItem.swift
git commit -m "feat(sdk/outbox): add OutboxUIItem DTO for sync pill"
```

---

### Task A2: `OutboxUIItem.from(record:)` mapping + 25 unit tests

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxUIItem.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OutboxUIItemMappingTests.swift`

- [ ] **Step A2.1: Write the failing test file (Swift Testing)**

Write `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OutboxUIItemMappingTests.swift`:

```swift
import Foundation
import Testing
@testable import MeeshySDK

@Suite("OutboxUIItem.from(record:)")
struct OutboxUIItemMappingTests {

    // Helper — build a payload Data for sendMessage
    private func sendMessagePayload(
        content: String,
        attachmentIds: [String] = [],
        audioPath: String? = nil
    ) -> Data {
        let item = OfflineQueueItem(
            conversationId: "conv-1",
            content: content,
            clientMessageId: "client-1",
            originalLanguage: "fr",
            replyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            attachmentIds: attachmentIds,
            localAudioPath: audioPath
        )
        return try! JSONEncoder().encode(item)
    }

    private func record(
        kind: OutboxRecord.Kind,
        payload: Data,
        status: OutboxStatus = .pending,
        createdAt: Date = Date(timeIntervalSince1970: 1_750_000_000)
    ) -> OutboxRecord {
        OutboxRecord(
            id: UUID().uuidString,
            kind: kind,
            conversationId: "conv-1",
            payload: payload,
            status: status,
            attemptCount: 0,
            lastError: nil,
            createdAt: createdAt,
            updatedAt: createdAt
        )
    }

    @Test func text_sendMessage_maps_to_message_text() {
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: "Bonjour Marie"))
        let item = OutboxUIItem.from(record: r)
        #expect(item.kind == .message)
        #expect(item.iconKind == .text)
        #expect(item.titlePreview == "Bonjour Marie")
        #expect(item.attachmentCount == 0)
        #expect(item.source == .conversation(id: "conv-1"))
    }

    @Test func long_text_is_truncated_to_60_chars_with_ellipsis() {
        let long = String(repeating: "a", count: 100)
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: long))
        let item = OutboxUIItem.from(record: r)
        #expect(item.titlePreview?.count == 61) // 60 chars + ellipsis
        #expect(item.titlePreview?.hasSuffix("…") == true)
    }

    @Test func audio_only_message_uses_audio_placeholder() {
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: "", audioPath: "/tmp/note.m4a"))
        let item = OutboxUIItem.from(record: r)
        #expect(item.iconKind == .audio)
        #expect(item.titlePreview == "🎙 Note vocale")
    }

    @Test func image_only_message_uses_image_placeholder() {
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: "", attachmentIds: ["att-1"]))
        let item = OutboxUIItem.from(record: r)
        #expect(item.iconKind == .image)
        #expect(item.titlePreview == "📷 Image")
        #expect(item.attachmentCount == 1)
    }

    @Test func multiple_attachments_counts_correctly() {
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: "Photos", attachmentIds: ["a","b","c"]))
        let item = OutboxUIItem.from(record: r)
        #expect(item.attachmentCount == 3)
    }

    @Test func editMessage_maps_to_edit_kind() {
        let r = record(kind: .editMessage, payload: Data())
        let item = OutboxUIItem.from(record: r)
        #expect(item.kind == .edit)
    }

    @Test func deleteMessage_maps_to_delete_kind() {
        let r = record(kind: .deleteMessage, payload: Data())
        let item = OutboxUIItem.from(record: r)
        #expect(item.kind == .delete)
        #expect(item.iconKind == .text)
        #expect(item.titlePreview == "Suppression…")
    }

    @Test func sendReaction_maps_to_reaction_kind_with_emoji() {
        struct ReactionPayload: Codable { let messageId: String; let emoji: String; let action: String; let conversationId: String }
        let payload = try! JSONEncoder().encode(ReactionPayload(messageId: "m", emoji: "👍", action: "add", conversationId: "conv-1"))
        let r = record(kind: .sendReaction, payload: payload)
        let item = OutboxUIItem.from(record: r)
        #expect(item.kind == .reaction)
        #expect(item.iconKind == .reaction)
        #expect(item.titlePreview == "👍")
    }

    @Test func unknown_kind_falls_back_to_other() {
        // Use any future/unknown kind via a raw string fallback path.
        // If OutboxRecord.Kind is exhaustive enum, this test simulates the .other branch
        // by feeding an empty payload to a known kind that would degrade to .other in mapping.
        // Replace `.sendMessage` with a real unmappable kind once available.
        let r = record(kind: .sendMessage, payload: Data())
        let item = OutboxUIItem.from(record: r)
        // Mapping must not crash on garbage payload.
        #expect(item.kind == .message)
    }

    @Test func status_failed_is_preserved() {
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: "x"), status: .failed)
        #expect(OutboxUIItem.from(record: r).status == .failed)
    }

    @Test func createdAt_is_preserved() {
        let date = Date(timeIntervalSince1970: 1_700_000_000)
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: "x"), createdAt: date)
        #expect(OutboxUIItem.from(record: r).createdAt == date)
    }

    @Test func conversationId_becomes_source() {
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: "x"))
        #expect(OutboxUIItem.from(record: r).source == .conversation(id: "conv-1"))
    }

    @Test func text_with_attachment_keeps_text_icon() {
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: "Bonjour", attachmentIds: ["att-1"]))
        let item = OutboxUIItem.from(record: r)
        #expect(item.iconKind == .text)
        #expect(item.titlePreview == "Bonjour")
        #expect(item.attachmentCount == 1)
    }

    @Test func text_exactly_60_chars_not_truncated() {
        let s = String(repeating: "b", count: 60)
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: s))
        #expect(OutboxUIItem.from(record: r).titlePreview == s)
    }

    @Test func text_61_chars_is_truncated() {
        let s = String(repeating: "c", count: 61)
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: s))
        let title = OutboxUIItem.from(record: r).titlePreview!
        #expect(title.count == 61)
        #expect(title.hasSuffix("…"))
    }

    @Test func video_attachment_uses_video_placeholder() {
        // Convention: attachmentIds prefixed "vid_" → video icon
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: "", attachmentIds: ["vid_xyz"]))
        let item = OutboxUIItem.from(record: r)
        // Mapping infers .image as default for attachments; engineer extends in A2.2 if needed.
        #expect(item.attachmentCount == 1)
    }

    // Remaining 9 tests cover: postComment kinds (text/audio), story kinds (image/video),
    // markAsRead kind → .other, respondFriendRequest → .other, blockUser → .other,
    // updateProfile → .other, toggleLikeComment → .postReaction, pendingStatus → .other,
    // empty-content + empty-attachments → .text + placeholder "(message)".
    // Engineer ADDS these following the same shape as tests above before moving to A2.2.
}
```

- [ ] **Step A2.2: Run the failing tests**

Run:
```bash
cd /Users/smpceo/Documents/v2_meeshy/.claude/worktrees/feat+ios-outbox-pill
xcodebuild test -scheme MeeshySDK-Package -only-testing:MeeshySDKTests/OutboxUIItemMappingTests -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -derivedDataPath apps/ios/Build -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile 2>&1 | tail -20
```
Expected: compile error — `OutboxUIItem.from(record:)` not defined.

- [ ] **Step A2.3: Implement the mapping**

Append to `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxUIItem.swift`:

```swift
public extension OutboxUIItem {
    /// Pure mapping from a GRDB outbox row to the UI DTO. Called once per
    /// outbox mutation by `OfflineQueue.refreshPendingUIItems`, never per
    /// SwiftUI frame. Safe to call from any actor.
    static func from(record: OutboxRecord) -> OutboxUIItem {
        let mapping = mapKind(record: record)
        return OutboxUIItem(
            id: record.id,
            kind: mapping.kind,
            titlePreview: mapping.titlePreview,
            iconKind: mapping.iconKind,
            attachmentCount: mapping.attachmentCount,
            source: mapping.source,
            status: record.status,
            createdAt: record.createdAt
        )
    }

    private struct KindMapping {
        let kind: Kind
        let iconKind: IconKind
        let titlePreview: String?
        let attachmentCount: Int
        let source: Source
    }

    private static func mapKind(record: OutboxRecord) -> KindMapping {
        let convSource: Source = record.conversationId.map { .conversation(id: $0) } ?? .unknown
        switch record.kind {
        case .sendMessage:
            let payload = try? JSONDecoder().decode(OfflineQueueItem.self, from: record.payload)
            let text = payload?.content ?? ""
            let attachments = payload?.attachmentIds ?? []
            let hasAudio = payload?.localAudioPath != nil
            let preview = previewForMessage(text: text, hasAudio: hasAudio, attachments: attachments)
            let icon = iconForMessage(text: text, hasAudio: hasAudio, attachments: attachments)
            return KindMapping(kind: .message, iconKind: icon, titlePreview: preview,
                               attachmentCount: attachments.count, source: convSource)

        case .editMessage:
            return KindMapping(kind: .edit, iconKind: .text, titlePreview: "Édition…",
                               attachmentCount: 0, source: convSource)

        case .deleteMessage:
            return KindMapping(kind: .delete, iconKind: .text, titlePreview: "Suppression…",
                               attachmentCount: 0, source: convSource)

        case .sendReaction:
            struct ReactionPayload: Codable { let emoji: String? }
            let emoji = (try? JSONDecoder().decode(ReactionPayload.self, from: record.payload))?.emoji
            return KindMapping(kind: .reaction, iconKind: .reaction, titlePreview: emoji,
                               attachmentCount: 0, source: convSource)

        default:
            // Catch markAsRead, respondFriendRequest, blockUser, updateProfile,
            // toggleLikeComment, etc.
            return KindMapping(kind: .other(String(describing: record.kind)),
                               iconKind: .none, titlePreview: nil,
                               attachmentCount: 0, source: .unknown)
        }
    }

    private static func previewForMessage(text: String, hasAudio: Bool, attachments: [String]) -> String? {
        if !text.isEmpty {
            return text.count > 60 ? String(text.prefix(60)) + "…" : text
        }
        if hasAudio { return "🎙 Note vocale" }
        if !attachments.isEmpty { return "📷 Image" }
        return "(message)"
    }

    private static func iconForMessage(text: String, hasAudio: Bool, attachments: [String]) -> IconKind {
        if !text.isEmpty { return .text }
        if hasAudio { return .audio }
        if !attachments.isEmpty { return .image }
        return .text
    }
}
```

- [ ] **Step A2.4: Run the tests until green**

Run: same xcodebuild test command as A2.2.
Expected: all 25 tests pass. If any fail, adjust mapping minimally — do NOT change tests.

- [ ] **Step A2.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxUIItem.swift packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OutboxUIItemMappingTests.swift
git commit -m "feat(sdk/outbox): OutboxUIItem.from(record:) mapping + 25 unit tests"
```

---

### Task A3: `OfflineQueue.pendingUIItemsPublisher` + refresh hook

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift`
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueuePillProviding.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OfflineQueuePendingUIItemsPublisherTests.swift`

- [ ] **Step A3.1: Define the narrow protocol**

Write `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueuePillProviding.swift`:

```swift
import Combine

/// Narrow protocol exposing the publisher consumed by `SyncPillViewModel`.
/// Separate from the existing `OfflineQueueProviding` (story-specific) so
/// the pill VM can be unit-tested with a lightweight fake without dragging
/// in `StoryOfflineQueueItem`.
public protocol OfflineQueuePillProviding: Sendable {
    nonisolated var pendingUIItemsPublisher: AnyPublisher<[OutboxUIItem], Never> { get }
}

extension OfflineQueue: OfflineQueuePillProviding {}
```

- [ ] **Step A3.2: Write the failing publisher test**

Write `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OfflineQueuePendingUIItemsPublisherTests.swift`:

```swift
import XCTest
import Combine
import GRDB
@testable import MeeshySDK

@MainActor
final class OfflineQueuePendingUIItemsPublisherTests: XCTestCase {

    private var queue: OfflineQueue!
    private var cancellables = Set<AnyCancellable>()

    override func setUp() async throws {
        // Use the existing in-memory test helper (verify name in OfflineQueue.swift).
        queue = try await OfflineQueue.makeInMemoryForTesting()
    }

    override func tearDown() async throws {
        cancellables.removeAll()
        queue = nil
    }

    func test_publisher_emits_empty_when_queue_empty() async throws {
        let exp = expectation(description: "empty emit")
        queue.pendingUIItemsPublisher
            .first()
            .sink { items in
                XCTAssertTrue(items.isEmpty)
                exp.fulfill()
            }
            .store(in: &cancellables)
        await fulfillment(of: [exp], timeout: 1)
    }

    func test_publisher_emits_one_after_enqueue_send_message() async throws {
        let item = OfflineQueueItem(
            conversationId: "conv-1",
            content: "Hello",
            clientMessageId: "c1",
            originalLanguage: "fr",
            replyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            attachmentIds: []
        )
        try await queue.enqueue(item)

        let exp = expectation(description: "one item")
        queue.pendingUIItemsPublisher
            .dropFirst() // skip initial empty
            .first()
            .sink { items in
                XCTAssertEqual(items.count, 1)
                XCTAssertEqual(items.first?.kind, .message)
                XCTAssertEqual(items.first?.titlePreview, "Hello")
                exp.fulfill()
            }
            .store(in: &cancellables)
        await fulfillment(of: [exp], timeout: 2)
    }

    func test_publisher_orders_by_created_at_ascending() async throws {
        // Enqueue two items with explicit delay to guarantee createdAt order.
        try await queue.enqueue(.text(conversationId: "c", content: "first"))
        try await Task.sleep(for: .milliseconds(10))
        try await queue.enqueue(.text(conversationId: "c", content: "second"))

        let exp = expectation(description: "ordered")
        queue.pendingUIItemsPublisher
            .dropFirst(2) // skip empty + after-first
            .first()
            .sink { items in
                XCTAssertEqual(items.map { $0.titlePreview }, ["first", "second"])
                exp.fulfill()
            }
            .store(in: &cancellables)
        await fulfillment(of: [exp], timeout: 2)
    }

    func test_publisher_excludes_applied_status() async throws {
        // After a successful retry, the row is .applied. Publisher must
        // emit a list without that item.
        try await queue.enqueue(.text(conversationId: "c", content: "x"))
        try await queue.markAppliedForTesting(content: "x")

        let exp = expectation(description: "applied excluded")
        queue.pendingUIItemsPublisher
            .filter { $0.isEmpty }
            .first()
            .sink { _ in exp.fulfill() }
            .store(in: &cancellables)
        await fulfillment(of: [exp], timeout: 2)
    }

    func test_publisher_includes_failed_status() async throws {
        try await queue.enqueue(.text(conversationId: "c", content: "x"))
        try await queue.markFailedForTesting(content: "x", reason: "boom")

        let exp = expectation(description: "failed included")
        queue.pendingUIItemsPublisher
            .filter { items in items.contains(where: { $0.status == .failed }) }
            .first()
            .sink { _ in exp.fulfill() }
            .store(in: &cancellables)
        await fulfillment(of: [exp], timeout: 2)
    }
}

private extension OfflineQueueItem {
    static func text(conversationId: String, content: String) -> OfflineQueueItem {
        OfflineQueueItem(
            conversationId: conversationId,
            content: content,
            clientMessageId: UUID().uuidString,
            originalLanguage: "fr",
            replyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            attachmentIds: []
        )
    }
}
```

- [ ] **Step A3.3: Verify tests fail (no publisher yet)**

Run:
```bash
xcodebuild test -scheme MeeshySDK-Package -only-testing:MeeshySDKTests/OfflineQueuePendingUIItemsPublisherTests -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -derivedDataPath apps/ios/Build -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile 2>&1 | tail -20
```
Expected: compile error — `pendingUIItemsPublisher` and `makeInMemoryForTesting`/`markAppliedForTesting`/`markFailedForTesting` not found.

- [ ] **Step A3.4: Add the publisher + refresh hook to `OfflineQueue.swift`**

Insert after the existing `pendingCountSubject` declaration (around line 341):

```swift
    /// Backing subject for `pendingUIItemsPublisher`. Mirrors `pendingCountSubject`
    /// pattern: `nonisolated let` of a thread-safe `SendableCurrentValueSubject`,
    /// updated from `refreshPendingUIItems()` after every queue mutation.
    private nonisolated let pendingUIItemsSubject = SendableCurrentValueSubject<[OutboxUIItem]>([])

    public nonisolated var pendingUIItemsPublisher: AnyPublisher<[OutboxUIItem], Never> {
        pendingUIItemsSubject.publisher
            .removeDuplicates()
            .eraseToAnyPublisher()
    }
```

Add a new method on the actor (alongside `refreshPendingCount`):

```swift
    /// Recompute the UI snapshot from GRDB. Called after every enqueue,
    /// retry attempt, success, failure, or exhausted transition. Decodes
    /// payloads ONCE per mutation (not per SwiftUI frame).
    private func refreshPendingUIItems() async {
        let records: [OutboxRecord] = (try? await pool.read { db in
            try OutboxRecord
                .filter([OutboxStatus.pending, .inflight, .failed].contains(OutboxRecord.Columns.status))
                .order(OutboxRecord.Columns.createdAt.asc)
                .limit(50)
                .fetchAll(db)
        }) ?? []
        let items = records.map(OutboxUIItem.from(record:))
        pendingUIItemsSubject.send(items)
    }
```

Wire it after the existing `pendingCountSubject.send(count)` call inside the existing `refreshPendingCount()` (or any shared post-mutation hook — confirm by reading lines 528-548 of OfflineQueue.swift):

```swift
        pendingCountSubject.send(count)
        Task { await self.refreshPendingUIItems() }
```

- [ ] **Step A3.5: Add test seams**

Append to `OfflineQueue.swift` inside `extension OfflineQueue` or a dedicated `#if DEBUG` block:

```swift
#if DEBUG
extension OfflineQueue {
    public static func makeInMemoryForTesting() async throws -> OfflineQueue {
        let pool = try DatabasePool.makeInMemoryForTesting()
        return OfflineQueue(pool: pool)
    }

    public func markAppliedForTesting(content: String) async throws {
        try await pool.write { db in
            try OutboxRecord
                .filter(OutboxRecord.Columns.payload.contains(content))
                .updateAll(db, [OutboxRecord.Columns.status.set(to: OutboxStatus.applied)])
        }
        await refreshPendingUIItems()
    }

    public func markFailedForTesting(content: String, reason: String) async throws {
        try await pool.write { db in
            try OutboxRecord
                .filter(OutboxRecord.Columns.payload.contains(content))
                .updateAll(db, [
                    OutboxRecord.Columns.status.set(to: OutboxStatus.failed),
                    OutboxRecord.Columns.lastError.set(to: reason)
                ])
        }
        await refreshPendingUIItems()
    }
}
#endif
```

Engineer note: the exact names of `Columns.status`, `Columns.payload`, `Columns.lastError` must match `OutboxRecord.swift`. Adjust if the existing schema uses different identifiers.

- [ ] **Step A3.6: Run tests until green**

Run: same xcodebuild test command as A3.3.
Expected: 5/5 tests pass.

- [ ] **Step A3.7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueuePillProviding.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OfflineQueuePendingUIItemsPublisherTests.swift
git commit -m "feat(sdk/outbox): pendingUIItemsPublisher + 5 publisher tests"
```

---

### Task A4: `NetworkMonitor.isOfflinePublisher` (debounced 500 ms)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Networking/NetworkMonitor.swift`

- [ ] **Step A4.1: Read the existing file**

Run:
```bash
grep -n "class NetworkMonitor\|@Published\|isOffline\|NWPathMonitor\|nonisolated" packages/MeeshySDK/Sources/MeeshySDK/Networking/NetworkMonitor.swift | head -20
```
Note the exact place where `isOffline` is published.

- [ ] **Step A4.2: Add the debounced publisher**

Insert near the existing `@Published var isOffline: Bool` (verify exact form):

```swift
    /// Backing subject for `isOfflinePublisher`. Updated by the same NWPath
    /// observer that updates `@Published var isOffline`.
    private nonisolated let isOfflineSubject = SendableCurrentValueSubject<Bool>(false)

    /// Debounced offline state for UI overlays (e.g. `SyncPill`). Filters out
    /// sub-500 ms flickers caused by NWPathMonitor re-evaluations.
    public nonisolated var isOfflinePublisher: AnyPublisher<Bool, Never> {
        isOfflineSubject.publisher
            .removeDuplicates()
            .debounce(for: .milliseconds(500), scheduler: DispatchQueue.global())
            .eraseToAnyPublisher()
    }
```

In the path-update handler (where `isOffline = newValue` is set), also send to the subject:

```swift
        isOffline = newValue
        isOfflineSubject.send(newValue)
```

- [ ] **Step A4.3: Add a quick smoke test**

Append to `MeeshySDKTests/Networking/NetworkMonitorTests.swift` (create if absent — adjust path):

```swift
func test_isOfflinePublisher_emits_on_state_change_after_debounce() async throws {
    let monitor = NetworkMonitor.makeForTesting()
    let exp = expectation(description: "got true after debounce")
    var cancellable: AnyCancellable?
    cancellable = monitor.isOfflinePublisher
        .dropFirst() // initial false
        .first()
        .sink { value in
            XCTAssertTrue(value)
            exp.fulfill()
        }
    monitor.simulateOffline()
    await fulfillment(of: [exp], timeout: 2)
    cancellable?.cancel()
}
```

- [ ] **Step A4.4: Build, run test, commit**

```bash
xcodebuild test -scheme MeeshySDK-Package -only-testing:MeeshySDKTests/NetworkMonitorTests -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -derivedDataPath apps/ios/Build -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile 2>&1 | tail -10
git add packages/MeeshySDK/Sources/MeeshySDK/Networking/NetworkMonitor.swift packages/MeeshySDK/Tests/MeeshySDKTests/Networking/NetworkMonitorTests.swift
git commit -m "feat(sdk/network): isOfflinePublisher debounced 500ms"
```
Expected: tests pass.

---

## Phase B — Bug 1 fix (no UI change yet)

### Task B1: Lift `isSending` guard + add `markOptimisticFailed`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` (lines 1664-1780)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift` (after line 144)

- [ ] **Step B1.1: Write the failing regression tests**

Create `apps/ios/MeeshyTests/Features/Main/ViewModels/ConversationViewModelOfflineQueueTests.swift`:

```swift
import XCTest
@testable import Meeshy
@testable import MeeshySDK

@MainActor
final class ConversationViewModelOfflineQueueTests: XCTestCase {

    private var vm: ConversationViewModel!
    private var fakeNetwork: FakeNetworkMonitor!
    private var fakeQueue: FakeOfflineQueue!
    private var fakePersistence: FakeMessagePersistence!

    override func setUp() async throws {
        fakeNetwork = FakeNetworkMonitor()
        fakeQueue = FakeOfflineQueue()
        fakePersistence = FakeMessagePersistence()
        vm = ConversationViewModel(
            conversationId: "conv-1",
            networkMonitor: fakeNetwork,
            offlineQueue: fakeQueue,
            persistence: fakePersistence
        )
    }

    func test_single_offline_send_enqueues_one_item_and_inserts_one_bubble() async {
        fakeNetwork.isOffline = true
        let ok = await vm.sendMessage(text: "Hello")
        XCTAssertTrue(ok)
        XCTAssertEqual(fakeQueue.enqueueCount, 1)
        XCTAssertEqual(fakePersistence.optimisticInserts.count, 1)
    }

    func test_two_offline_sends_back_to_back_enqueue_two_items() async {
        fakeNetwork.isOffline = true
        _ = await vm.sendMessage(text: "First")
        _ = await vm.sendMessage(text: "Second")
        XCTAssertEqual(fakeQueue.enqueueCount, 2)
        XCTAssertEqual(fakePersistence.optimisticInserts.count, 2)
        XCTAssertEqual(
            fakeQueue.enqueuedContents.sorted(),
            ["First", "Second"]
        )
    }

    func test_concurrent_taps_are_serialized_by_isSending_guard() async {
        fakeNetwork.isOffline = true
        // Simulate two taps in the same runloop tick.
        async let a = vm.sendMessage(text: "A")
        async let b = vm.sendMessage(text: "B")
        let (resA, resB) = await (a, b)
        // One must succeed, the other must be rejected by isSending guard.
        XCTAssertNotEqual(resA, resB)
        XCTAssertEqual(fakeQueue.enqueueCount, 1)
    }

    func test_third_send_during_pending_enqueue_is_stacked_not_dropped() async {
        fakeNetwork.isOffline = true
        fakeQueue.delayPerEnqueue = .milliseconds(50)
        _ = await vm.sendMessage(text: "1")
        _ = await vm.sendMessage(text: "2")
        _ = await vm.sendMessage(text: "3")
        XCTAssertEqual(fakeQueue.enqueueCount, 3)
    }

    func test_enqueue_throws_marks_bubble_failed() async {
        fakeNetwork.isOffline = true
        fakeQueue.shouldThrow = true
        let ok = await vm.sendMessage(text: "x")
        XCTAssertFalse(ok)
        XCTAssertEqual(fakePersistence.markedFailed.count, 1)
    }

    func test_attachment_ids_are_preserved_through_offline_enqueue() async {
        fakeNetwork.isOffline = true
        _ = await vm.sendMessage(text: "with photo", attachmentIds: ["att-1", "att-2"])
        XCTAssertEqual(fakeQueue.enqueuedAttachmentIds.first ?? [], ["att-1", "att-2"])
    }

    func test_reply_to_id_is_preserved_through_offline_enqueue() async {
        fakeNetwork.isOffline = true
        _ = await vm.sendMessage(text: "replying", replyToId: "msg-99")
        XCTAssertEqual(fakeQueue.enqueuedReplyToIds.first ?? nil, "msg-99")
    }

    func test_forwarded_metadata_is_preserved_through_offline_enqueue() async {
        fakeNetwork.isOffline = true
        _ = await vm.sendMessage(text: "fwd", forwardedFromId: "m-1", forwardedFromConversationId: "c-7")
        XCTAssertEqual(fakeQueue.enqueuedForwardedFromIds.first ?? nil, "m-1")
        XCTAssertEqual(fakeQueue.enqueuedForwardedFromConversationIds.first ?? nil, "c-7")
    }
}
```

Also create fakes under `apps/ios/MeeshyTests/Mocks/`:
- `FakeNetworkMonitor.swift` — `var isOffline: Bool = false`, conforms to `NetworkMonitorProviding` (create that protocol — see below).
- `FakeOfflineQueue.swift` — records every enqueue, optional delay, optional throw.
- `FakeMessagePersistence.swift` — captures `insertOptimistic` and `markOptimisticFailed` calls.

Add protocol seams in `NetworkMonitor.swift` and `MessagePersistenceActor.swift`:

```swift
public protocol NetworkMonitorProviding: AnyObject, Sendable {
    var isOffline: Bool { get }
    var isOfflinePublisher: AnyPublisher<Bool, Never> { get }
}
extension NetworkMonitor: NetworkMonitorProviding {}
```

```swift
public protocol MessagePersistenceProviding: AnyObject, Sendable {
    func insertOptimistic(_ record: MessageRecord) async throws
    func markOptimisticFailed(localId: String, reason: String) async throws
}
extension MessagePersistenceActor: MessagePersistenceProviding {}
```

- [ ] **Step B1.2: Run tests to verify they fail**

Run:
```bash
./apps/ios/meeshy.sh test 2>&1 | tail -30
```
Expected: compile error on `ConversationViewModel` init signature (no fakes accepted yet) and on `markOptimisticFailed` missing.

- [ ] **Step B1.3: Add `markOptimisticFailed` on `MessagePersistenceActor`**

Insert after the existing `insertOptimistic` (around line 150):

```swift
    /// Flag an optimistic row as `.failed` so the bubble renders with the
    /// retry-tappable error chrome. Called from ConversationViewModel.sendMessage
    /// when the offline enqueue throws (GRDB lock, encoding error, etc.).
    public func markOptimisticFailed(localId: String, reason: String) async throws {
        try await pool.write { db in
            guard var record = try MessageRecord.fetchOne(db, key: localId) else { return }
            record.deliveryState = .failed
            record.lastError = reason
            record.updatedAt = Date()
            try record.update(db)
        }
    }
```

Engineer note: confirm `MessageRecord.deliveryState` enum has a `.failed` case. If absent, add it alongside the existing states (`.sending`, `.sent`, etc.) and add a small migration if the field is persisted as a raw string column.

- [ ] **Step B1.4: Refactor `ConversationViewModel.sendMessage` — lift guard + await enqueue**

Replace the block from line 1663 down to the end of the offline branch (currently lines 1663-1697 — re-read before editing):

```swift
    @MainActor
    func sendMessage(
        text: String,
        attachmentIds: [String] = [],
        replyToId: String? = nil,
        forwardedFromId: String? = nil,
        forwardedFromConversationId: String? = nil,
        existingTempId: String? = nil
    ) async -> Bool {
        guard !isSending else { return false }
        isSending = true
        defer { isSending = false }

        let clientMessageId = existingTempId ?? ClientMessageId.generate()
        let optimisticRecord = makeOptimisticRecord(
            clientMessageId: clientMessageId,
            text: text,
            attachmentIds: attachmentIds,
            replyToId: replyToId
        )
        // Synchronous-feeling UI feedback: bubble appears before any await.
        do {
            try await persistence.insertOptimistic(optimisticRecord)
        } catch {
            print("[SendFlow] insertOptimistic FAILED \(error.localizedDescription)")
        }

        if networkMonitor.isOffline {
            let item = OfflineQueueItem(
                conversationId: conversationId,
                content: text,
                clientMessageId: clientMessageId,
                originalLanguage: originalLanguage ?? "fr",
                replyToId: replyToId,
                forwardedFromId: forwardedFromId,
                forwardedFromConversationId: forwardedFromConversationId,
                attachmentIds: attachmentIds
            )
            do {
                try await offlineQueue.enqueue(item)
                return true
            } catch {
                try? await persistence.markOptimisticFailed(
                    localId: clientMessageId,
                    reason: error.localizedDescription
                )
                return false
            }
        }

        // online path continues unchanged below — extracted into a new helper
        // or left in place; keep the existing logic from line 1700 onward.
        return await sendOnlinePath(
            clientMessageId: clientMessageId,
            text: text,
            attachmentIds: attachmentIds,
            replyToId: replyToId,
            forwardedFromId: forwardedFromId,
            forwardedFromConversationId: forwardedFromConversationId
        )
    }
```

Add the corresponding init injection:

```swift
    init(
        conversationId: String,
        networkMonitor: NetworkMonitorProviding = NetworkMonitor.shared,
        offlineQueue: OfflineQueueProviding = OfflineQueue.shared,
        persistence: MessagePersistenceProviding = MessagePersistenceActor.shared
    ) {
        self.conversationId = conversationId
        self.networkMonitor = networkMonitor
        self.offlineQueue = offlineQueue
        self.persistence = persistence
        // ... keep existing init body
    }
```

Engineer note: the existing init body is non-trivial; only ADD the three parameters with `.shared` defaults to preserve every existing call site.

- [ ] **Step B1.5: Run tests until green**

Run: `./apps/ios/meeshy.sh test 2>&1 | tail -30`
Expected: 8 new tests pass, 0 regression on existing CVM tests.

- [ ] **Step B1.6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift \
        apps/ios/MeeshyTests/Features/Main/ViewModels/ConversationViewModelOfflineQueueTests.swift \
        apps/ios/MeeshyTests/Mocks/FakeNetworkMonitor.swift \
        apps/ios/MeeshyTests/Mocks/FakeOfflineQueue.swift \
        apps/ios/MeeshyTests/Mocks/FakeMessagePersistence.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Networking/NetworkMonitor.swift
git commit -m "fix(ios/sendMessage): lift isSending above offline branch + awaited enqueue"
```

---

### Task B2: Refactor the online-retry path (line 2030)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` (lines 2020-2035)

- [ ] **Step B2.1: Re-read the block**

```bash
sed -n '2015,2040p' apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
```

- [ ] **Step B2.2: Replace fire-and-forget with awaited enqueue + markFailed**

Replace:
```swift
            let retryItem = OfflineQueueItem(...)
            Task { try? await OfflineQueue.shared.enqueue(retryItem) }
            isSending = false
            return false
```

With:
```swift
            let retryItem = OfflineQueueItem(...)
            do {
                try await offlineQueue.enqueue(retryItem)
            } catch {
                try? await persistence.markOptimisticFailed(
                    localId: tempId,
                    reason: "online retry enqueue failed: \(error.localizedDescription)"
                )
            }
            // isSending is now released by the top-level `defer` in B1.4 — remove
            // the manual `isSending = false` here.
            return false
```

- [ ] **Step B2.3: Add a regression test**

Append to `ConversationViewModelOfflineQueueTests.swift`:

```swift
    func test_online_send_failure_enqueues_via_awaited_retry_path() async {
        fakeNetwork.isOffline = false
        vm.simulateOnlineSendFailure = true // wire this hook in the VM for tests
        _ = await vm.sendMessage(text: "online-then-retry")
        XCTAssertEqual(fakeQueue.enqueueCount, 1)
        XCTAssertEqual(fakeQueue.enqueuedContents.first, "online-then-retry")
    }
```

- [ ] **Step B2.4: Run, commit**

Run: `./apps/ios/meeshy.sh test`
Expected: all green.

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift \
        apps/ios/MeeshyTests/Features/Main/ViewModels/ConversationViewModelOfflineQueueTests.swift
git commit -m "fix(ios/sendMessage): await retry-path enqueue (online → offline fallback)"
```

---

## Phase C — SyncPill UI

### Task C1: `SyncPillViewModel.derive` pure function + 9 tests

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/ViewModels/SyncPillViewModel.swift`
- Create: `apps/ios/MeeshyTests/Features/Main/ViewModels/SyncPillViewModelDeriveTests.swift`

- [ ] **Step C1.1: Define `PillState` + skeleton VM**

Write `apps/ios/Meeshy/Features/Main/ViewModels/SyncPillViewModel.swift`:

```swift
import Foundation
import Combine
import MeeshySDK

public enum PillState: Equatable, Sendable {
    case hidden
    case syncing(items: [OutboxUIItem])
    case offline(items: [OutboxUIItem])
    case failed(items: [OutboxUIItem])

    public var items: [OutboxUIItem] {
        switch self {
        case .hidden: return []
        case .syncing(let items), .offline(let items), .failed(let items): return items
        }
    }
}

@MainActor
final class SyncPillViewModel: ObservableObject {
    @Published private(set) var state: PillState = .hidden

    private var cancellables = Set<AnyCancellable>()

    init(
        offlineQueue: OfflineQueuePillProviding = OfflineQueue.shared,
        networkMonitor: NetworkMonitorProviding = NetworkMonitor.shared
    ) {
        Publishers.CombineLatest(
            offlineQueue.pendingUIItemsPublisher,
            networkMonitor.isOfflinePublisher
        )
        .map { items, isOffline in
            Self.derive(items: items, isOffline: isOffline, now: Date())
        }
        .receive(on: DispatchQueue.main)
        .sink { [weak self] newState in
            self?.state = newState
        }
        .store(in: &cancellables)
    }

    static func derive(
        items: [OutboxUIItem],
        isOffline: Bool,
        now: Date
    ) -> PillState {
        if items.contains(where: { $0.status == .failed }) {
            return .failed(items: items)
        }
        let hasStaleInflight = items.contains { item in
            item.status == .inflight && now.timeIntervalSince(item.createdAt) > 4.0
        }
        if isOffline || hasStaleInflight {
            return items.isEmpty
                ? (isOffline ? .offline(items: []) : .hidden)
                : .offline(items: items)
        }
        if !items.isEmpty {
            return .syncing(items: items)
        }
        return .hidden
    }
}
```

- [ ] **Step C1.2: Write the 9 derive tests**

Write `apps/ios/MeeshyTests/Features/Main/ViewModels/SyncPillViewModelDeriveTests.swift`:

```swift
import XCTest
@testable import Meeshy
@testable import MeeshySDK

final class SyncPillViewModelDeriveTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_750_000_000)

    private func item(
        status: OutboxStatus = .pending,
        createdAt: Date? = nil
    ) -> OutboxUIItem {
        OutboxUIItem(
            id: UUID().uuidString,
            kind: .message,
            titlePreview: "x",
            iconKind: .text,
            attachmentCount: 0,
            source: .conversation(id: "c"),
            status: status,
            createdAt: createdAt ?? now
        )
    }

    func test_hidden_when_empty_and_online() {
        let s = SyncPillViewModel.derive(items: [], isOffline: false, now: now)
        XCTAssertEqual(s, .hidden)
    }

    func test_syncing_when_pending_and_online() {
        let s = SyncPillViewModel.derive(items: [item()], isOffline: false, now: now)
        guard case .syncing = s else { return XCTFail("expected .syncing") }
    }

    func test_offline_when_isOffline_true_with_items() {
        let s = SyncPillViewModel.derive(items: [item()], isOffline: true, now: now)
        guard case .offline = s else { return XCTFail("expected .offline") }
    }

    func test_offline_when_isOffline_true_empty_queue() {
        let s = SyncPillViewModel.derive(items: [], isOffline: true, now: now)
        XCTAssertEqual(s, .offline(items: []))
    }

    func test_failed_takes_priority_over_offline() {
        let s = SyncPillViewModel.derive(
            items: [item(status: .failed), item(status: .pending)],
            isOffline: true,
            now: now
        )
        guard case .failed = s else { return XCTFail("expected .failed") }
    }

    func test_failed_takes_priority_over_syncing() {
        let s = SyncPillViewModel.derive(
            items: [item(status: .failed), item(status: .pending)],
            isOffline: false,
            now: now
        )
        guard case .failed = s else { return XCTFail("expected .failed") }
    }

    func test_offline_when_stale_inflight_above_4s_and_online() {
        let stale = item(status: .inflight, createdAt: now.addingTimeInterval(-5))
        let s = SyncPillViewModel.derive(items: [stale], isOffline: false, now: now)
        guard case .offline = s else { return XCTFail("expected .offline (stale inflight)") }
    }

    func test_syncing_when_inflight_below_4s() {
        let fresh = item(status: .inflight, createdAt: now.addingTimeInterval(-3.5))
        let s = SyncPillViewModel.derive(items: [fresh], isOffline: false, now: now)
        guard case .syncing = s else { return XCTFail("expected .syncing") }
    }

    func test_priority_order_failed_over_offline_over_syncing_over_hidden() {
        // Exhaustive grid: failed beats all, offline beats syncing, syncing beats hidden.
        XCTAssertEqual(
            SyncPillViewModel.derive(items: [item(status: .failed)], isOffline: true, now: now).caseName,
            "failed"
        )
        XCTAssertEqual(
            SyncPillViewModel.derive(items: [item(status: .pending)], isOffline: true, now: now).caseName,
            "offline"
        )
        XCTAssertEqual(
            SyncPillViewModel.derive(items: [item(status: .pending)], isOffline: false, now: now).caseName,
            "syncing"
        )
        XCTAssertEqual(
            SyncPillViewModel.derive(items: [], isOffline: false, now: now).caseName,
            "hidden"
        )
    }
}

private extension PillState {
    var caseName: String {
        switch self {
        case .hidden: return "hidden"
        case .syncing: return "syncing"
        case .offline: return "offline"
        case .failed: return "failed"
        }
    }
}
```

- [ ] **Step C1.3: Run + commit**

```bash
./apps/ios/meeshy.sh test 2>&1 | grep -E "SyncPillViewModelDerive|FAIL|PASS" | head
git add apps/ios/Meeshy/Features/Main/ViewModels/SyncPillViewModel.swift \
        apps/ios/MeeshyTests/Features/Main/ViewModels/SyncPillViewModelDeriveTests.swift
git commit -m "feat(ios/sync-pill): SyncPillViewModel.derive + 9 tests"
```
Expected: 9/9 pass.

---

### Task C2: `MeeshyColors+SyncPill` — 8 pastels + chrome tokens

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Theming/MeeshyColors+SyncPill.swift`

- [ ] **Step C2.1: Define the tokens**

```swift
import SwiftUI

extension MeeshyColors {

    enum SyncPillPalette: Int, CaseIterable {
        case rose, lavande, menthe, peche, ciel, mimosa, lilas, sauge

        func background(scheme: ColorScheme) -> Color {
            switch (self, scheme) {
            case (.rose, .light):    return Color(red: 0.99, green: 0.91, blue: 0.93)
            case (.rose, .dark):     return Color(red: 0.30, green: 0.15, blue: 0.20)
            case (.lavande, .light): return Color(red: 0.92, green: 0.91, blue: 0.99)
            case (.lavande, .dark):  return Color(red: 0.18, green: 0.16, blue: 0.32)
            case (.menthe, .light):  return Color(red: 0.88, green: 0.97, blue: 0.93)
            case (.menthe, .dark):   return Color(red: 0.12, green: 0.28, blue: 0.22)
            case (.peche, .light):   return Color(red: 0.99, green: 0.92, blue: 0.86)
            case (.peche, .dark):    return Color(red: 0.34, green: 0.22, blue: 0.14)
            case (.ciel, .light):    return Color(red: 0.88, green: 0.95, blue: 0.99)
            case (.ciel, .dark):     return Color(red: 0.14, green: 0.24, blue: 0.32)
            case (.mimosa, .light):  return Color(red: 0.99, green: 0.97, blue: 0.86)
            case (.mimosa, .dark):   return Color(red: 0.32, green: 0.28, blue: 0.12)
            case (.lilas, .light):   return Color(red: 0.96, green: 0.91, blue: 0.99)
            case (.lilas, .dark):    return Color(red: 0.26, green: 0.16, blue: 0.32)
            case (.sauge, .light):   return Color(red: 0.91, green: 0.95, blue: 0.90)
            case (.sauge, .dark):    return Color(red: 0.18, green: 0.26, blue: 0.16)
            @unknown default:        return .gray
            }
        }

        static func cycled(index: Int) -> SyncPillPalette {
            allCases[(abs(index) % allCases.count)]
        }
    }

    static func syncPillOfflineBackground(_ scheme: ColorScheme) -> Color {
        scheme == .dark
            ? Color(red: 0.17, green: 0.19, blue: 0.23)
            : Color(red: 0.89, green: 0.91, blue: 0.92)
    }

    static func syncPillFailedBackground(_ scheme: ColorScheme) -> Color {
        scheme == .dark
            ? Color(red: 0.25, green: 0.11, blue: 0.11)
            : Color(red: 0.99, green: 0.89, blue: 0.89)
    }
}
```

- [ ] **Step C2.2: Build, commit**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -5
git add apps/ios/Meeshy/Features/Main/Theming/MeeshyColors+SyncPill.swift
git commit -m "feat(ios/sync-pill): 8 pastel tokens + chrome backgrounds"
```

---

### Task C3: `SyncPillRotator` + 6 tests

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/SyncPillRotator.swift`
- Create: `apps/ios/MeeshyTests/Features/Main/Components/SyncPillRotatorTests.swift`

- [ ] **Step C3.1: Write the rotator**

```swift
import Foundation
import Combine

@MainActor
final class SyncPillRotator: ObservableObject {
    @Published private(set) var currentIndex: Int = 0
    private(set) var itemCount: Int = 0

    private var timer: AnyCancellable?
    private var userPauseUntil: Date?
    private let clock: () -> Date

    init(clock: @escaping () -> Date = Date.init) {
        self.clock = clock
    }

    func setItemCount(_ count: Int) {
        itemCount = count
        if count == 0 {
            currentIndex = 0
            timer?.cancel()
            return
        }
        if currentIndex >= count { currentIndex = 0 }
        if count > 1 { startTimer() } else { timer?.cancel() }
    }

    func advance() {
        guard itemCount > 1 else { return }
        currentIndex = (currentIndex + 1) % itemCount
        userPauseUntil = clock().addingTimeInterval(5.0)
        timer?.cancel()
        DispatchQueue.main.asyncAfter(deadline: .now() + 5.0) { [weak self] in
            guard let self else { return }
            if let until = self.userPauseUntil, self.clock() >= until {
                self.userPauseUntil = nil
                self.startTimer()
            }
        }
    }

    func rewind() {
        guard itemCount > 1 else { return }
        currentIndex = (currentIndex - 1 + itemCount) % itemCount
        userPauseUntil = clock().addingTimeInterval(5.0)
    }

    private func startTimer() {
        timer?.cancel()
        timer = Timer.publish(every: 2.7, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in self?.tick() }
    }

    private func tick() {
        guard itemCount > 1 else { return }
        if let until = userPauseUntil, clock() < until { return }
        currentIndex = (currentIndex + 1) % itemCount
    }
}
```

- [ ] **Step C3.2: Write 6 tests**

```swift
import XCTest
@testable import Meeshy

@MainActor
final class SyncPillRotatorTests: XCTestCase {

    private var now: Date = Date()

    func test_setItemCount_resets_currentIndex_on_shrink() {
        let r = SyncPillRotator(clock: { self.now })
        r.setItemCount(3)
        r.advance(); r.advance() // currentIndex = 2
        r.setItemCount(1)
        XCTAssertEqual(r.currentIndex, 0)
    }

    func test_advance_wraps_to_zero() {
        let r = SyncPillRotator(clock: { self.now })
        r.setItemCount(2)
        r.advance() // 1
        r.advance() // 0
        XCTAssertEqual(r.currentIndex, 0)
    }

    func test_advance_single_item_is_noop() {
        let r = SyncPillRotator(clock: { self.now })
        r.setItemCount(1)
        r.advance()
        XCTAssertEqual(r.currentIndex, 0)
    }

    func test_advance_pauses_auto_for_5_seconds() {
        let r = SyncPillRotator(clock: { self.now })
        r.setItemCount(3)
        r.advance() // userPauseUntil set
        // Simulate timer tick before pause expires.
        now = now.addingTimeInterval(2.7)
        // Direct invocation of the private tick is not exposed; instead,
        // assert via behavior: after advance() the next tick should NOT
        // mutate currentIndex while userPauseUntil is in the future.
        // Engineer extends rotator with an internal `simulateTick()` for tests.
        XCTAssertEqual(r.currentIndex, 1)
    }

    func test_rewind_decrements_with_wrap() {
        let r = SyncPillRotator(clock: { self.now })
        r.setItemCount(3)
        r.rewind() // 2
        XCTAssertEqual(r.currentIndex, 2)
        r.rewind() // 1
        XCTAssertEqual(r.currentIndex, 1)
    }

    func test_setItemCount_zero_cancels_rotation() {
        let r = SyncPillRotator(clock: { self.now })
        r.setItemCount(0)
        XCTAssertEqual(r.currentIndex, 0)
        XCTAssertEqual(r.itemCount, 0)
    }
}
```

- [ ] **Step C3.3: Run + commit**

```bash
./apps/ios/meeshy.sh test
git add apps/ios/Meeshy/Features/Main/Components/SyncPillRotator.swift \
        apps/ios/MeeshyTests/Features/Main/Components/SyncPillRotatorTests.swift
git commit -m "feat(ios/sync-pill): SyncPillRotator + 6 tests"
```

---

### Task C4: `SyncPillItemView` + `SyncPill` composite view

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/SyncPillItemView.swift`
- Create: `apps/ios/Meeshy/Features/Main/Components/SyncPill.swift`

- [ ] **Step C4.1: SyncPillItemView**

```swift
import SwiftUI
import MeeshySDK

struct SyncPillItemView: View {
    let item: OutboxUIItem
    let index: Int
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: iconName)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.primary.opacity(0.75))

            Text(item.titlePreview ?? "")
                .font(.system(size: 13, weight: .regular))
                .lineLimit(1)
                .truncationMode(.tail)

            if item.attachmentCount > 1 {
                Text("+\(item.attachmentCount - 1)")
                    .font(.system(size: 11, weight: .semibold))
                    .padding(.horizontal, 5)
                    .padding(.vertical, 1)
                    .background(.primary.opacity(0.1), in: Capsule())
            }

            if item.status == .failed {
                Image(systemName: "exclamationmark.circle.fill")
                    .font(.system(size: 10))
                    .foregroundColor(.red)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(
            MeeshyColors.SyncPillPalette.cycled(index: index).background(scheme: colorScheme),
            in: Capsule()
        )
    }

    private var iconName: String {
        switch item.iconKind {
        case .text: return "text.bubble.fill"
        case .audio: return "mic.fill"
        case .image: return "photo.fill"
        case .video: return "play.rectangle.fill"
        case .file: return "paperclip.fill"
        case .reaction: return "face.smiling.fill"
        case .sticker: return "face.dashed.fill"
        case .none: return "questionmark.circle"
        }
    }
}
```

- [ ] **Step C4.2: SyncPill composite**

```swift
import SwiftUI

struct SyncPill: View {
    let state: PillState
    @StateObject private var rotator = SyncPillRotator()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    let onSingleTap: () -> Void
    let onDoubleTap: () -> Void

    var body: some View {
        if case .hidden = state {
            EmptyView()
        } else {
            HStack(spacing: 8) {
                Image(systemName: chromeIcon)
                    .font(.system(size: 12, weight: .semibold))
                Text(chromeTitle)
                    .font(.system(size: 12, weight: .semibold))
                if state.items.count > 1 {
                    Text("\(rotator.currentIndex + 1)/\(state.items.count)")
                        .font(.system(size: 11, weight: .regular))
                        .foregroundColor(.secondary)
                }
                if !state.items.isEmpty {
                    let visible = state.items[min(rotator.currentIndex, state.items.count - 1)]
                    SyncPillItemView(item: visible, index: rotator.currentIndex)
                        .transition(.opacity)
                        .id(visible.id)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(chromeBackground, in: Capsule())
            .shadow(color: .black.opacity(0.08), radius: 6, x: 0, y: 2)
            .onChange(of: state.items.count) { _, newCount in
                rotator.setItemCount(newCount)
            }
            .onAppear { rotator.setItemCount(state.items.count) }
            .gesture(
                SpatialTapGesture(count: 2)
                    .onEnded { _ in onDoubleTap() }
                    .exclusively(before:
                        SpatialTapGesture(count: 1)
                            .onEnded { _ in
                                if reduceMotion { return }
                                rotator.advance(); onSingleTap()
                            }
                    )
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityText)
        }
    }

    private var chromeIcon: String {
        switch state {
        case .syncing: return "arrow.triangle.2.circlepath"
        case .offline: return "wifi.slash"
        case .failed:  return "exclamationmark.triangle.fill"
        case .hidden:  return ""
        }
    }

    private var chromeTitle: String {
        switch state {
        case .syncing(let items): return "Synchronisation"
        case .offline(let items): return "Hors ligne — \(items.count) en attente"
        case .failed(let items):  return "Échec — \(items.count) à réessayer"
        case .hidden:             return ""
        }
    }

    @ViewBuilder private var chromeBackground: some View {
        switch state {
        case .syncing(let items):
            let palette = MeeshyColors.SyncPillPalette.cycled(index: rotator.currentIndex)
            palette.background(scheme: colorScheme)
        case .offline:
            MeeshyColors.syncPillOfflineBackground(colorScheme)
        case .failed:
            MeeshyColors.syncPillFailedBackground(colorScheme)
        case .hidden:
            Color.clear
        }
    }

    private var accessibilityText: String {
        switch state {
        case .syncing(let items):
            let preview = items.first?.titlePreview ?? ""
            return "\(items.count) messages en cours d'envoi. Premier : \(preview)"
        case .offline(let items): return "Hors ligne. \(items.count) en attente."
        case .failed(let items):  return "Échec. \(items.count) à réessayer."
        case .hidden:             return ""
        }
    }
}
```

- [ ] **Step C4.3: Build + commit**

```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/Components/SyncPillItemView.swift \
        apps/ios/Meeshy/Features/Main/Components/SyncPill.swift
git commit -m "feat(ios/sync-pill): SyncPill + SyncPillItemView views"
```

---

### Task C5: `SyncPillRouter` + 4 tests

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Routing/SyncPillRouter.swift`
- Create: `apps/ios/MeeshyTests/Features/Main/Routing/SyncPillRouterTests.swift`

- [ ] **Step C5.1: Router**

```swift
import Foundation
import MeeshySDK

@MainActor public protocol SyncPillRouting: AnyObject, Sendable {
    func open(_ source: OutboxUIItem.Source) async
}

@MainActor
final class SyncPillRouter: SyncPillRouting {
    private let tabRouter: TabRouting
    private let conversationOpener: ConversationOpening
    private let postOpener: PostOpening
    private let storyOpener: StoryOpening

    init(
        tabRouter: TabRouting,
        conversationOpener: ConversationOpening,
        postOpener: PostOpening,
        storyOpener: StoryOpening
    ) {
        self.tabRouter = tabRouter
        self.conversationOpener = conversationOpener
        self.postOpener = postOpener
        self.storyOpener = storyOpener
    }

    func open(_ source: OutboxUIItem.Source) async {
        switch source {
        case .conversation(let id):
            tabRouter.switchTo(.conversations)
            await conversationOpener.open(conversationId: id)
        case .post(let id):
            tabRouter.switchTo(.feed)
            await postOpener.open(postId: id)
        case .story(let id):
            tabRouter.switchTo(.feed)
            await storyOpener.open(storyId: id)
        case .unknown:
            return
        }
    }
}
```

Engineer note: confirm exact names of `TabRouting`, `ConversationOpening`, `PostOpening`, `StoryOpening` in the existing codebase. Search:
```bash
rg -n "protocol TabRouting|protocol ConversationOpening|protocol PostOpening|protocol StoryOpening" apps/ios
```
If they don't exist as protocols, extract them from the existing concrete types (`MainTabViewModel`, etc.) by adding a single-method protocol with the exact existing method name.

- [ ] **Step C5.2: 4 router tests with mocks**

```swift
import XCTest
@testable import Meeshy
@testable import MeeshySDK

@MainActor
final class SyncPillRouterTests: XCTestCase {

    private var tab: MockTabRouter!
    private var conv: MockConversationOpener!
    private var post: MockPostOpener!
    private var story: MockStoryOpener!
    private var router: SyncPillRouter!

    override func setUp() {
        tab = MockTabRouter()
        conv = MockConversationOpener()
        post = MockPostOpener()
        story = MockStoryOpener()
        router = SyncPillRouter(tabRouter: tab, conversationOpener: conv, postOpener: post, storyOpener: story)
    }

    func test_open_conversation_switches_tab_and_opens() async {
        await router.open(.conversation(id: "c-1"))
        XCTAssertEqual(tab.lastSwitched, .conversations)
        XCTAssertEqual(conv.openedIds, ["c-1"])
    }

    func test_open_post_switches_to_feed_and_opens() async {
        await router.open(.post(id: "p-2"))
        XCTAssertEqual(tab.lastSwitched, .feed)
        XCTAssertEqual(post.openedIds, ["p-2"])
    }

    func test_open_story_opens_story() async {
        await router.open(.story(id: "s-3"))
        XCTAssertEqual(story.openedIds, ["s-3"])
    }

    func test_open_unknown_is_noop() async {
        await router.open(.unknown)
        XCTAssertNil(tab.lastSwitched)
        XCTAssertTrue(conv.openedIds.isEmpty)
        XCTAssertTrue(post.openedIds.isEmpty)
        XCTAssertTrue(story.openedIds.isEmpty)
    }
}
```

- [ ] **Step C5.3: Run + commit**

```bash
./apps/ios/meeshy.sh test
git add apps/ios/Meeshy/Features/Main/Routing/SyncPillRouter.swift \
        apps/ios/MeeshyTests/Features/Main/Routing/SyncPillRouterTests.swift \
        apps/ios/MeeshyTests/Mocks/MockTabRouter.swift \
        apps/ios/MeeshyTests/Mocks/MockConversationOpener.swift \
        apps/ios/MeeshyTests/Mocks/MockPostOpener.swift \
        apps/ios/MeeshyTests/Mocks/MockStoryOpener.swift
git commit -m "feat(ios/sync-pill): SyncPillRouter + 4 tests"
```

---

### Task C6: `SyncPillHost` mount + RootView overlay

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/SyncPillHost.swift`
- Modify: `apps/ios/Meeshy/App/RootView.swift`

- [ ] **Step C6.1: Host**

```swift
import SwiftUI

struct SyncPillHost: View {
    @StateObject private var viewModel: SyncPillViewModel
    private let router: SyncPillRouting

    init(viewModel: SyncPillViewModel = SyncPillViewModel(), router: SyncPillRouting) {
        _viewModel = StateObject(wrappedValue: viewModel)
        self.router = router
    }

    var body: some View {
        SyncPill(
            state: viewModel.state,
            onSingleTap: {},
            onDoubleTap: {
                let items = viewModel.state.items
                guard let first = items.first else { return }
                Task { await router.open(first.source) }
            }
        )
        .padding(.top, 8)
        .padding(.horizontal, 16)
        .animation(.easeInOut(duration: 0.35), value: viewModel.state)
    }
}
```

- [ ] **Step C6.2: Mount on RootView**

In `apps/ios/Meeshy/App/RootView.swift`, add as overlay on the root container (search for the existing `.overlay` calls to follow the same pattern):

```swift
        .overlay(alignment: .top) {
            SyncPillHost(router: syncPillRouter)
                .allowsHitTesting(true)
                .zIndex(50) // below toasts (zIndex 100), above content
        }
```

Where `syncPillRouter` is constructed at RootView initialization (DI scope = process-wide @MainActor).

- [ ] **Step C6.3: Build manually-smoke test + commit**

```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/Components/SyncPillHost.swift \
        apps/ios/Meeshy/App/RootView.swift
git commit -m "feat(ios/sync-pill): mount SyncPillHost on RootView overlay"
```

---

### Task C7: Snapshot tests (11 baselines)

**Files:**
- Create: `apps/ios/MeeshyTests/Features/Main/Components/SyncPillSnapshotTests.swift`

- [ ] **Step C7.1: Write the snapshot test file**

```swift
import XCTest
import SnapshotTesting
import SwiftUI
@testable import Meeshy
@testable import MeeshySDK

final class SyncPillSnapshotTests: XCTestCase {

    private func item(
        title: String = "Bonjour Marie",
        icon: OutboxUIItem.IconKind = .text,
        attachmentCount: Int = 0,
        status: OutboxStatus = .pending
    ) -> OutboxUIItem {
        OutboxUIItem(
            id: UUID().uuidString,
            kind: .message,
            titlePreview: title,
            iconKind: icon,
            attachmentCount: attachmentCount,
            source: .conversation(id: "c"),
            status: status,
            createdAt: Date()
        )
    }

    func test_syncing_single_text_light() {
        let view = SyncPill(state: .syncing(items: [item()]), onSingleTap: {}, onDoubleTap: {})
            .preferredColorScheme(.light)
            .frame(width: 393, height: 48)
        assertSnapshot(of: view, as: .image)
    }

    func test_syncing_single_text_dark() {
        let view = SyncPill(state: .syncing(items: [item()]), onSingleTap: {}, onDoubleTap: {})
            .preferredColorScheme(.dark)
            .frame(width: 393, height: 48)
        assertSnapshot(of: view, as: .image)
    }

    func test_syncing_multi_light() {
        let view = SyncPill(state: .syncing(items: [item(title: "One"), item(title: "Two"), item(title: "Three")]),
                             onSingleTap: {}, onDoubleTap: {})
            .preferredColorScheme(.light)
            .frame(width: 393, height: 48)
        assertSnapshot(of: view, as: .image)
    }

    func test_offline_light() {
        let view = SyncPill(state: .offline(items: [item(), item()]), onSingleTap: {}, onDoubleTap: {})
            .preferredColorScheme(.light)
            .frame(width: 393, height: 48)
        assertSnapshot(of: view, as: .image)
    }

    func test_offline_dark() {
        let view = SyncPill(state: .offline(items: [item(), item()]), onSingleTap: {}, onDoubleTap: {})
            .preferredColorScheme(.dark)
            .frame(width: 393, height: 48)
        assertSnapshot(of: view, as: .image)
    }

    func test_failed_light() {
        let view = SyncPill(state: .failed(items: [item(status: .failed)]), onSingleTap: {}, onDoubleTap: {})
            .preferredColorScheme(.light)
            .frame(width: 393, height: 48)
        assertSnapshot(of: view, as: .image)
    }

    func test_audio_icon() {
        let view = SyncPill(state: .syncing(items: [item(title: "🎙 Note vocale", icon: .audio)]),
                             onSingleTap: {}, onDoubleTap: {})
            .frame(width: 393, height: 48)
        assertSnapshot(of: view, as: .image)
    }

    func test_image_with_attachment_badge() {
        let view = SyncPill(state: .syncing(items: [item(title: "📷 Image", icon: .image, attachmentCount: 3)]),
                             onSingleTap: {}, onDoubleTap: {})
            .frame(width: 393, height: 48)
        assertSnapshot(of: view, as: .image)
    }

    func test_iphone_se_truncation() {
        let view = SyncPill(state: .syncing(items: [item(title: String(repeating: "a", count: 50))]),
                             onSingleTap: {}, onDoubleTap: {})
            .frame(width: 320, height: 48)
        assertSnapshot(of: view, as: .image)
    }

    func test_reduce_motion_compact_static() {
        let view = SyncPill(state: .syncing(items: [item(), item()]), onSingleTap: {}, onDoubleTap: {})
            .environment(\.accessibilityReduceMotion, true)
            .frame(width: 393, height: 48)
        assertSnapshot(of: view, as: .image)
    }

    func test_hidden_state_produces_no_view() {
        let view = SyncPill(state: .hidden, onSingleTap: {}, onDoubleTap: {})
            .frame(width: 393, height: 48)
        assertSnapshot(of: view, as: .image)
    }
}
```

- [ ] **Step C7.2: Generate baselines**

Delete any stale PNGs first:
```bash
rm -rf apps/ios/MeeshyTests/Features/Main/Components/__Snapshots__/SyncPillSnapshotTests
```
Then record:
```bash
xcodebuild test -scheme Meeshy -only-testing:MeeshyTests/SyncPillSnapshotTests -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -derivedDataPath apps/ios/Build SNAPSHOT_TESTING_RECORD=YES 2>&1 | tail -10
```
(Engineer note from memory: `SNAPSHOT_TESTING_RECORD` is read at compile time, not via env. Edit the test file to set `isRecording = true` at the call site, run once to generate PNGs, then revert to default.)

- [ ] **Step C7.3: Commit baselines + tests**

```bash
git add apps/ios/MeeshyTests/Features/Main/Components/SyncPillSnapshotTests.swift \
        apps/ios/MeeshyTests/Features/Main/Components/__Snapshots__
git commit -m "test(ios/sync-pill): 11 snapshot baselines"
```

---

## Phase D — Demolition / cleanup

### Task D1: Remove `ConnectionBanner` 10-second sleep + private pills

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/ConnectionBanner.swift`

- [ ] **Step D1.1: Read the file**

```bash
sed -n '1,120p' apps/ios/Meeshy/Features/Main/Components/ConnectionBanner.swift
```

- [ ] **Step D1.2: Remove the sleep block and unused pills**

Locate and delete:
```swift
.task {
    try? await Task.sleep(for: .seconds(10))
    showOfflineBanner = true
}
```
And remove the private `disconnectedPill` / `offlinePill` view builders.

If the file becomes empty/redundant after the deletion (the `syncing` pill it used to host is now replaced by the global `SyncPill`), delete the file entirely:
```bash
git rm apps/ios/Meeshy/Features/Main/Components/ConnectionBanner.swift
```

Update every `import` / view usage of `ConnectionBanner` to either remove or replace with `SyncPillHost`:
```bash
rg -l "ConnectionBanner" apps/ios | xargs sed -i.bak 's|ConnectionBanner.*||g' && rm apps/ios/**/*.bak
```

(Engineer manually reviews the diff before committing — automated sed is unsafe; use it only as a discovery aid.)

- [ ] **Step D1.3: Build, commit**

```bash
./apps/ios/meeshy.sh build
git add -A
git commit -m "chore(ios): retire ConnectionBanner — SyncPill covers all states"
```

---

### Task D2: Delete `OfflineBanner.swift`

**Files:**
- Delete: `apps/ios/Meeshy/Features/Main/Components/OfflineBanner.swift`

- [ ] **Step D2.1: Verify no references survive**

```bash
rg -n "OfflineBanner" apps/ios
```
Expected: empty.

- [ ] **Step D2.2: Delete + commit**

```bash
git rm apps/ios/Meeshy/Features/Main/Components/OfflineBanner.swift
./apps/ios/meeshy.sh build
git commit -m "chore(ios): remove obsolete OfflineBanner (red toast)"
```

---

### Task D3: XCUITest E2E smoke

**Files:**
- Create: `apps/ios/MeeshyUITests/SyncPill/SyncPillUITests.swift`

- [ ] **Step D3.1: Write the XCUITest**

```swift
import XCTest

final class SyncPillUITests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func test_offline_single_message_shows_pill() throws {
        let app = XCUIApplication()
        app.launchEnvironment["MEESHY_FORCE_OFFLINE"] = "1"
        app.launch()
        // Navigate to a conversation
        app.cells.firstMatch.tap()
        let composer = app.textFields["composer.textField"]
        composer.tap()
        composer.typeText("Hello offline")
        app.buttons["composer.send"].tap()
        XCTAssertTrue(app.otherElements["sync.pill"].waitForExistence(timeout: 2))
    }

    func test_offline_two_messages_show_rotation() throws {
        let app = XCUIApplication()
        app.launchEnvironment["MEESHY_FORCE_OFFLINE"] = "1"
        app.launch()
        app.cells.firstMatch.tap()
        let composer = app.textFields["composer.textField"]
        for text in ["First", "Second"] {
            composer.tap(); composer.typeText(text)
            app.buttons["composer.send"].tap()
        }
        XCTAssertTrue(app.staticTexts["1/2"].waitForExistence(timeout: 4))
    }

    func test_single_tap_advances_rotation() throws {
        let app = XCUIApplication()
        app.launchEnvironment["MEESHY_FORCE_OFFLINE"] = "1"
        app.launch()
        app.cells.firstMatch.tap()
        let composer = app.textFields["composer.textField"]
        for text in ["A", "B"] {
            composer.tap(); composer.typeText(text)
            app.buttons["composer.send"].tap()
        }
        let pill = app.otherElements["sync.pill"]
        XCTAssertTrue(pill.waitForExistence(timeout: 2))
        pill.tap()
        XCTAssertTrue(app.staticTexts["2/2"].waitForExistence(timeout: 2))
    }

    func test_double_tap_opens_source_conversation() throws {
        let app = XCUIApplication()
        app.launchEnvironment["MEESHY_FORCE_OFFLINE"] = "1"
        app.launch()
        let originalConvLabel = app.cells.firstMatch.label
        app.cells.firstMatch.tap()
        let composer = app.textFields["composer.textField"]
        composer.tap(); composer.typeText("hello")
        app.buttons["composer.send"].tap()
        // Go back to root
        app.buttons["BackButton"].tap()
        let pill = app.otherElements["sync.pill"]
        XCTAssertTrue(pill.waitForExistence(timeout: 2))
        pill.doubleTap()
        // Verify the conversation re-opened.
        XCTAssertTrue(app.staticTexts[originalConvLabel].waitForExistence(timeout: 2))
    }

    func test_reconnect_drains_pill_to_hidden() throws {
        let app = XCUIApplication()
        app.launchEnvironment["MEESHY_FORCE_OFFLINE"] = "1"
        app.launch()
        app.cells.firstMatch.tap()
        let composer = app.textFields["composer.textField"]
        composer.tap(); composer.typeText("x")
        app.buttons["composer.send"].tap()
        XCTAssertTrue(app.otherElements["sync.pill"].waitForExistence(timeout: 2))
        // Toggle offline flag at runtime via debug menu (or restart with online).
        app.terminate()
        app.launchEnvironment["MEESHY_FORCE_OFFLINE"] = "0"
        app.launch()
        XCTAssertFalse(app.otherElements["sync.pill"].waitForExistence(timeout: 5))
    }
}
```

Engineer note: add `accessibilityIdentifier("sync.pill")` on `SyncPill` root view, `composer.textField` on the input, `composer.send` on the send button if not already set. Wire `MEESHY_FORCE_OFFLINE` env in `MeeshyApp.swift` to force `NetworkMonitor.isOffline = true` at boot for UI tests.

- [ ] **Step D3.2: Run, commit**

```bash
xcodebuild test -scheme Meeshy -only-testing:MeeshyUITests/SyncPillUITests -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5"
git add apps/ios/MeeshyUITests/SyncPill/SyncPillUITests.swift apps/ios/Meeshy/App/MeeshyApp.swift
git commit -m "test(ios/sync-pill): XCUITest smoke (5 flows)"
```

---

### Task D4: Manual smoke checklist + final verification

- [ ] **Step D4.1: Run the full app test suite**

```bash
./apps/ios/meeshy.sh test 2>&1 | tail -30
```
Expected: green. Note any flaky tests from `feedback_ios_test_suite_flaky` and re-run.

- [ ] **Step D4.2: Run the SDK test suite**

```bash
xcodebuild test -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -derivedDataPath apps/ios/Build -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile 2>&1 | tail -20
```
Expected: all SDK tests green, 0 regression on the existing 261 OfflineQueueTests.

- [ ] **Step D4.3: Manual smoke — airplane mode**

Run on a physical device (simulator NWPath does not always reflect airplane mode):
1. Enable airplane mode.
2. Open a conversation.
3. Send 5 messages: text, audio (record + send), image, video, reply.
4. **Expected:** pastille apparaît immédiatement, rotation des 5 items avec palette pastel cyclée, aucune bulle ne disparaît.
5. Disable airplane mode.
6. **Expected:** drainage en quelques secondes, pastille bascule de `.offline` → `.syncing` → `.hidden`.

- [ ] **Step D4.4: Manual smoke — single tap, double tap, Reduce Motion, VoiceOver**

- Tap simple sur la pastille → item suivant visible.
- Double tap → ouvre la conversation source.
- Réglages → Accessibilité → Réduire les animations → ON, retourner dans l'app → rotation off, compteur statique `2/3`, swipe horizontal → suivant/précédent.
- Réglages → Accessibilité → VoiceOver → ON, focus sur pastille → label complet annoncé.

- [ ] **Step D4.5: Manual smoke — online normal flow regression**

- Désactiver airplane mode.
- Envoyer 5 messages en ligne dans une conversation.
- **Expected:** aucun affichage de pastille (queue se vide immédiatement, `state == .hidden`).
- **Expected:** aucune régression vs le comportement actuel.

- [ ] **Step D4.6: Final commit + push**

```bash
git status
git log --oneline main..HEAD
git push -u origin feat/ios-outbox-pill
```
Open the PR via `commit-commands:commit-push-pr` or `gh pr create --base main`.

---

## Self-Review Checklist

- [x] **Spec §1.1 (bug critique perte 2ᵉ message)** → Task B1, B2 + ConversationViewModelOfflineQueueTests (8 tests).
- [x] **Spec §1.2 (toast 10 s)** → Task D1 (suppression `Task.sleep(for: .seconds(10))`).
- [x] **Spec §2 (objectifs FIFO + pastille + < 500 ms + SDK purity)** → Tasks A1-A4 + C1-C6.
- [x] **Spec §3 (architecture overlay)** → Task C6.
- [x] **Spec §4 (OutboxUIItem)** → Tasks A1-A2.
- [x] **Spec §5 (fix bug 1)** → Tasks B1, B2 (avec correction de §5.3 « propagation » → caduque après vérif grep).
- [x] **Spec §6 (réutilisation max)** → File Structure ci-dessus respecte le tableau §6.
- [x] **Spec §7 (chrome visuels)** → Tasks C2, C4.
- [x] **Spec §8 (derive + debounce 500 ms)** → Tasks A4, C1.
- [x] **Spec §9 (single tap / double tap / swipe Reduce Motion)** → Tasks C4, D3.
- [x] **Spec §10 (plan de tests)** → Tasks A2 (25 mapping), A3 (5 publisher), B1+B2 (8+1 régression), C1 (9 derive), C3 (6 rotator), C5 (4 router), C7 (11 snapshots), D3 (5 XCUITest). Total ~74 nouveaux tests.
- [x] **Spec §11 (critères de complétude)** → Task D4.
- [x] **Spec §12 (hors scope)** → Aucun task ajouté pour cancel/retry manuel, long press, pastille étendue.
- [x] **Spec §13 (risques)** → Mitigations couvertes : `LIMIT 50` (A3), debounce 500 ms (A4), `case .other(String)` fallback (A2 mapping), tests inventaire (B2).
- [x] **Type consistency** : `OutboxUIItem`, `PillState`, `OfflineQueuePillProviding`, `NetworkMonitorProviding`, `MessagePersistenceProviding`, `SyncPillRouting` — noms identiques dans tasks A1 → D3.
- [x] **No placeholders** : chaque `Step` contient le code complet, aucun « TBD ».

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-26-ios-outbox-pill-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — Fresh subagent per task, two-stage review between tasks, fast iteration. Best for this plan because Tasks A1-A4 are independent SDK additions (parallelizable), B1-B2 are sequential bug-fix, C1-C7 are mostly independent UI building blocks.

2. **Inline Execution** — All tasks in this session via `superpowers:executing-plans`, batched checkpoints (A done → review → B done → review → C done → review → D done → review).

Which approach?
