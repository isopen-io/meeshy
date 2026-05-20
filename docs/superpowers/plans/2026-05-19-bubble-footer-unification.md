# Bubble Footer Unification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four divergent message-bubble footer render paths with one descriptor model + one view, so every bubble type shows the same footer (flags/identity leading, timestamp + delivery check trailing).

**Architecture:** A pure value-type descriptor (`BubbleFooterModel`) is built synchronously with the bubble; a single `BubbleFooter` view renders it in two styles (`.row` / `.overlay`); a single `BubbleDeliveryCheck` view renders every delivery glyph. Per-element callbacks (`BubbleFooterActions`) are passed separately so the model stays cleanly `Equatable`.

**Tech Stack:** Swift 6 / SwiftUI, iOS app target `Meeshy`, XCTest. Build via `./apps/ios/meeshy.sh build`, tests via `./apps/ios/meeshy.sh test`.

**Spec:** `docs/superpowers/specs/2026-05-19-bubble-footer-unification-design.md`

**Branch:** execute on `feat/ios-bubble-meta-fixes` (continues the footer work already committed there) or a fresh `feat/bubble-footer-unification` branch. Each task ends green-buildable.

---

## File Structure

**New files** (`apps/ios/Meeshy/Features/Main/Views/Bubble/`):
- `BubbleFooterModel.swift` — `BubbleFooterStyle`, `FooterFlag`, `SenderIdentity`, `BubbleFooterModel`, `BubbleFooterActions`, the `make(...)` builder.
- `BubbleDeliveryCheck.swift` — the unified delivery-glyph view.
- `BubbleFooter.swift` — the `BubbleFooter` view (`.row` + `.overlay`).

**New test** (`apps/ios/MeeshyTests/Unit/ViewModels/`):
- `BubbleFooterModelTests.swift` — builder gating tests.

**Modified:**
- `apps/ios/Meeshy.xcodeproj/project.pbxproj` — register the 3 new app files + 1 test file.
- `BubbleStandardLayout.swift` — `identityBarSection` → `BubbleFooter`; gating computed-props removed.
- `ConversationMediaViews.swift` — audio footer → `BubbleFooter`; `audioTranslationRow` removed.
- `BubbleMetaBadges.swift` — `BubbleMediaTimestampOverlay` → `BubbleFooter(.overlay)`.
- `ThemedMessageBubble+Media.swift` — image/carousel/video overlay → `BubbleFooter(.overlay)`.

**pbxproj note:** the project is a classic `objectVersion = 63` xcodeproj with no synchronized groups. Each new `.swift` file needs **2 fresh 24-hex-char UUIDs** and **4 entries**: a `PBXFileReference`, a `PBXBuildFile`, a child entry in the `Bubble` `PBXGroup`, and a `PBXSourcesBuildPhase` entry. Mirror an existing `Bubble/` file's 4 entries (e.g. `BubbleMetaBadges.swift`). The test file is registered the same way against the `MeeshyTests` target.

---

## Task 1: BubbleFooterModel types

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleFooterModel.swift`
- Modify: `apps/ios/Meeshy.xcodeproj/project.pbxproj`

- [ ] **Step 1: Create `BubbleFooterModel.swift`**

```swift
import Foundation
import MeeshySDK

/// Where a footer is rendered.
enum BubbleFooterStyle: Equatable, Sendable {
    case row      // below text / emoji / audio content, inside the bubble
    case overlay  // dark capsule laid over image / video media
}

/// One language flag in the footer's language switcher.
struct FooterFlag: Equatable, Sendable {
    let code: String
    let isActive: Bool
}

/// Identity shown on the leading edge of a `.row` footer. Populated for a
/// received message that heads a group; nil for sent messages and for
/// intermediate received messages.
struct SenderIdentity: Equatable, Sendable {
    let name: String
    let username: String?
    let role: MemberRole?
    let avatarURL: String?
    let accentColor: String
    let moodEmoji: String?
    let presence: PresenceState
    let storyRing: StoryRingState
}

/// Pure, synchronously-built descriptor of a bubble footer. No I/O, no async.
/// `Equatable` so `BubbleFooter` can be `.equatable()` and skip re-render.
struct BubbleFooterModel: Equatable, Sendable {
    var sender: SenderIdentity?
    var flags: [FooterFlag]
    var showsTranslate: Bool
    var timestamp: String?
    var delivery: MeeshyMessage.DeliveryStatus?
    var isOffline: Bool
    var isMe: Bool

    /// A send still in flight — clock territory (excludes `.failed`).
    var isPending: Bool {
        switch delivery {
        case .sending, .clock, .slow, .invisible: return true
        default: return false
        }
    }

    /// A send the outbox gave up on.
    var isFailed: Bool { delivery == .failed }

    static let empty = BubbleFooterModel(
        sender: nil, flags: [], showsTranslate: false,
        timestamp: nil, delivery: nil, isOffline: false, isMe: false
    )
}

/// Per-element callbacks. Kept out of `BubbleFooterModel` so the model stays
/// cleanly `Equatable`. Every callback is optional and independent — a
/// consumer wires only the elements it wants to be interactive.
struct BubbleFooterActions {
    var onFlagTap: ((String) -> Void)?
    var onTranslate: (() -> Void)?
    var onRetry: (() -> Void)?
    var onSenderTap: (() -> Void)?
    var onViewStory: (() -> Void)?

    init(
        onFlagTap: ((String) -> Void)? = nil,
        onTranslate: (() -> Void)? = nil,
        onRetry: (() -> Void)? = nil,
        onSenderTap: (() -> Void)? = nil,
        onViewStory: (() -> Void)? = nil
    ) {
        self.onFlagTap = onFlagTap
        self.onTranslate = onTranslate
        self.onRetry = onRetry
        self.onSenderTap = onSenderTap
        self.onViewStory = onViewStory
    }

    static let none = BubbleFooterActions()
}
```

- [ ] **Step 2: Register the file in `project.pbxproj`**

Add 2 fresh UUIDs and 4 entries for `BubbleFooterModel.swift` to the `Meeshy` target, in the `Bubble` group — mirror the 4 existing entries of `BubbleMetaBadges.swift`.

- [ ] **Step 3: Build**

Run: `./apps/ios/meeshy.sh build`
Expected: `Build succeeded`. If a member type (`MemberRole` / `PresenceState` / `StoryRingState`) is not `Sendable`, drop `Sendable` from `SenderIdentity` and `BubbleFooterModel` and keep only `Equatable`.

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleFooterModel.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): BubbleFooterModel — descripteur de footer de bulle"
```

---

## Task 2: BubbleFooterModel.make() builder (TDD)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleFooterModel.swift`
- Create: `apps/ios/MeeshyTests/Unit/ViewModels/BubbleFooterModelTests.swift`
- Modify: `apps/ios/Meeshy.xcodeproj/project.pbxproj`

- [ ] **Step 1: Write the failing test**

Create `apps/ios/MeeshyTests/Unit/ViewModels/BubbleFooterModelTests.swift`:

```swift
import XCTest
import MeeshySDK
@testable import Meeshy

final class BubbleFooterModelTests: XCTestCase {

    private func makeModel(
        deliveryStatus: MeeshyMessage.DeliveryStatus = .sent,
        isMe: Bool = true,
        isDirect: Bool = true,
        isLastSentMessage: Bool = false,
        isLastReceivedMessage: Bool = false,
        isOnline: Bool = true
    ) -> BubbleFooterModel {
        BubbleFooterModel.make(
            timeString: "09:41",
            deliveryStatus: deliveryStatus,
            isMe: isMe,
            isDirect: isDirect,
            isLastSentMessage: isLastSentMessage,
            isLastReceivedMessage: isLastReceivedMessage,
            isOnline: isOnline,
            sender: nil,
            flags: [],
            showsTranslate: false
        )
    }

    func test_make_directNonLastSent_hidesTimestamp() {
        XCTAssertNil(makeModel(deliveryStatus: .sent, isDirect: true, isLastSentMessage: false).timestamp)
    }

    func test_make_directLastSent_showsTimestamp() {
        XCTAssertEqual(makeModel(deliveryStatus: .sent, isDirect: true, isLastSentMessage: true).timestamp, "09:41")
    }

    func test_make_directNonLastButSending_showsTimestamp() {
        XCTAssertEqual(makeModel(deliveryStatus: .sending, isDirect: true, isLastSentMessage: false).timestamp, "09:41")
    }

    func test_make_directNonLastButFailed_showsTimestamp() {
        XCTAssertEqual(makeModel(deliveryStatus: .failed, isDirect: true, isLastSentMessage: false).timestamp, "09:41")
    }

    func test_make_groupNonLast_showsTimestamp() {
        XCTAssertEqual(makeModel(deliveryStatus: .sent, isDirect: false, isLastSentMessage: false).timestamp, "09:41")
    }

    func test_make_received_hidesDelivery() {
        XCTAssertNil(makeModel(deliveryStatus: .read, isMe: false, isLastReceivedMessage: true).delivery)
    }

    func test_make_sent_carriesDelivery() {
        XCTAssertEqual(makeModel(deliveryStatus: .delivered, isMe: true, isLastSentMessage: true).delivery, .delivered)
    }

    func test_make_offline_setsIsOffline() {
        XCTAssertTrue(makeModel(isOnline: false).isOffline)
    }

    func test_isPending_trueForSendingNotFailed() {
        XCTAssertTrue(makeModel(deliveryStatus: .sending).isPending)
        XCTAssertTrue(makeModel(deliveryStatus: .clock).isPending)
        XCTAssertFalse(makeModel(deliveryStatus: .sent).isPending)
        XCTAssertFalse(makeModel(deliveryStatus: .failed).isPending)
    }

    func test_isFailed_onlyForFailed() {
        XCTAssertTrue(makeModel(deliveryStatus: .failed).isFailed)
        XCTAssertFalse(makeModel(deliveryStatus: .sending).isFailed)
    }
}
```

Register `BubbleFooterModelTests.swift` in `project.pbxproj` against the `MeeshyTests` target (4 entries, mirror an existing `MeeshyTests/Unit/ViewModels/` test file).

- [ ] **Step 2: Run the test to verify it fails**

Run: `rm -rf apps/ios/test-results/unit-tests.xcresult && ./apps/ios/meeshy.sh test`
Expected: FAIL — compile error "type 'BubbleFooterModel' has no member 'make'".

- [ ] **Step 3: Implement the builder**

Append to `BubbleFooterModel.swift`:

```swift
extension BubbleFooterModel {
    /// Builds a footer model, applying timestamp-visibility gating.
    ///
    /// `timestamp` is non-nil only when the message should display its time:
    /// always when the send status forces it (pending / failed), always in
    /// group/public/channel conversations, and in direct conversations only
    /// for the last sent and last received message. `delivery` is non-nil
    /// only for outgoing (`isMe`) messages — the recipient side has no
    /// delivery state of its own.
    static func make(
        timeString: String,
        deliveryStatus: MeeshyMessage.DeliveryStatus,
        isMe: Bool,
        isDirect: Bool,
        isLastSentMessage: Bool,
        isLastReceivedMessage: Bool,
        isOnline: Bool,
        sender: SenderIdentity?,
        flags: [FooterFlag],
        showsTranslate: Bool
    ) -> BubbleFooterModel {
        let statusForcesTime: Bool = {
            switch deliveryStatus {
            case .sending, .clock, .slow, .invisible, .failed: return true
            case .sent, .delivered, .read: return false
            }
        }()

        let lastOfSide = isMe ? isLastSentMessage : isLastReceivedMessage
        let showsTime = statusForcesTime || !isDirect || lastOfSide

        return BubbleFooterModel(
            sender: sender,
            flags: flags,
            showsTranslate: showsTranslate,
            timestamp: showsTime ? timeString : nil,
            delivery: isMe ? deliveryStatus : nil,
            isOffline: !isOnline,
            isMe: isMe
        )
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `rm -rf apps/ios/test-results/unit-tests.xcresult && ./apps/ios/meeshy.sh test`
Expected: PASS for all `BubbleFooterModelTests`. Exit code may be non-zero from the unrelated pre-existing `test_wholeArrayMessagesWrite_countIsExact` failure — confirm the summary shows **0 unexpected** failures beyond it. If an actor-isolation error appears on `make()`, mark the `static func make` `nonisolated` — keep the test class non-`@MainActor` (pure-logic test).

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleFooterModel.swift apps/ios/MeeshyTests/Unit/ViewModels/BubbleFooterModelTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): BubbleFooterModel.make — gating de visibilité du footer"
```

---

## Task 3: BubbleDeliveryCheck view

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleDeliveryCheck.swift`
- Modify: `apps/ios/Meeshy.xcodeproj/project.pbxproj`

- [ ] **Step 1: Create `BubbleDeliveryCheck.swift`**

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// The single delivery-status glyph used by every bubble footer. Covers all
/// `DeliveryStatus` cases plus the offline-pending hourglass. Replaces
/// `BubbleMediaDeliveryCheckmark` and the per-site re-implementations.
struct BubbleDeliveryCheck: View, Equatable {
    let status: MeeshyMessage.DeliveryStatus
    /// When the device is offline and the send is still in flight, an
    /// hourglass replaces the clock.
    let isOffline: Bool
    /// Primary glyph colour (theme-aware on a `.row`, white on an `.overlay`).
    let tint: Color
    /// `.read` glyph colour — always a theme-adaptive indigo (never white,
    /// never bold): indigo400 in dark mode / on the dark overlay capsule,
    /// indigo600 in light mode. Computed by the caller.
    let readTint: Color

    private var isInFlight: Bool {
        switch status {
        case .sending, .clock, .slow: return true
        default: return false
        }
    }

    var body: some View {
        if isOffline, isInFlight {
            Image(systemName: "hourglass")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(MeeshyColors.warning)
                .accessibilityLabel("En attente hors-ligne")
        } else {
            glyph
        }
    }

    @ViewBuilder
    private var glyph: some View {
        switch status {
        case .invisible:
            EmptyView()
        case .sending:
            Image(systemName: "clock")
                .font(.system(size: 10))
                .foregroundColor(tint)
        case .clock:
            Image(systemName: "clock")
                .font(.system(size: 10))
                .foregroundColor(tint.opacity(0.7))
        case .slow:
            Image(systemName: "clock.badge.exclamationmark")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(MeeshyColors.warning)
        case .sent:
            Image(systemName: "checkmark")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(tint)
        case .delivered:
            doubleCheck(weight: .regular, size: 10, color: tint, width: 16)
        case .read:
            doubleCheck(weight: .regular, size: 11, color: readTint, width: 17)
                .accessibilityLabel("Lu")
        case .failed:
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(MeeshyColors.error)
        }
    }

    private func doubleCheck(weight: Font.Weight, size: CGFloat, color: Color, width: CGFloat) -> some View {
        ZStack(alignment: .leading) {
            Image(systemName: "checkmark").font(.system(size: size, weight: weight))
            Image(systemName: "checkmark").font(.system(size: size, weight: weight)).offset(x: 4)
        }
        .foregroundColor(color)
        .frame(width: width)
    }
}
```

- [ ] **Step 2: Register the file in `project.pbxproj`** (4 entries, `Meeshy` target, `Bubble` group).

- [ ] **Step 3: Build**

Run: `./apps/ios/meeshy.sh build`
Expected: `Build succeeded`.

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleDeliveryCheck.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): BubbleDeliveryCheck — glyphe de livraison unifié"
```

---

## Task 4: BubbleFooter view

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleFooter.swift`
- Modify: `apps/ios/Meeshy.xcodeproj/project.pbxproj`

- [ ] **Step 1: Create `BubbleFooter.swift`**

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// The single message-bubble footer. Renders a `BubbleFooterModel` — flags +
/// translate on the leading edge, timestamp + delivery check pinned trailing.
/// `Equatable` on `model` only (the actions are stateless closures), so list
/// cells stay at zero re-render via `.equatable()`.
struct BubbleFooter: View {
    let model: BubbleFooterModel
    let actions: BubbleFooterActions
    let style: BubbleFooterStyle
    let isDark: Bool

    static func == (lhs: BubbleFooter, rhs: BubbleFooter) -> Bool {
        lhs.model == rhs.model && lhs.style == rhs.style && lhs.isDark == rhs.isDark
    }

    var body: some View {
        switch style {
        case .row:     rowFooter
        case .overlay: overlayFooter
        }
    }

    // MARK: - Row style (text / emoji / audio / story-reply)

    @ViewBuilder
    private var rowFooter: some View {
        if let sender = model.sender {
            HStack(alignment: .top, spacing: 8) {
                MeeshyAvatar(
                    name: sender.name,
                    context: .messageBubble,
                    accentColor: sender.accentColor,
                    avatarURL: sender.avatarURL,
                    storyState: sender.storyRing,
                    moodEmoji: sender.moodEmoji,
                    presenceState: sender.presence,
                    enablePulse: false,
                    onTap: actions.onSenderTap,
                    onViewProfile: actions.onSenderTap,
                    onViewStory: actions.onViewStory,
                    contextMenuItems: avatarMenu(sender: sender)
                )
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        Text(sender.name)
                            .font(.system(size: 13, weight: .semibold))
                            .lineLimit(1)
                        roleBadge(sender.role)
                        metaLeading
                        Spacer(minLength: 4)
                        metaTrailing
                    }
                    if let username = sender.username {
                        Text(username)
                            .font(.system(size: 11))
                            .foregroundColor(metaColor.opacity(0.8))
                            .lineLimit(1)
                    }
                }
            }
        } else {
            HStack(spacing: 4) {
                metaLeading
                Spacer(minLength: 4)
                metaTrailing
            }
        }
    }

    // MARK: - Overlay style (image / carousel / video)

    @ViewBuilder
    private var overlayFooter: some View {
        if model.timestamp != nil || model.delivery != nil {
            HStack(spacing: 3) {
                if let timestamp = model.timestamp {
                    Text(timestamp)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.white)
                }
                deliveryView(tint: .white.opacity(0.85), readTint: MeeshyColors.indigo400)
            }
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(Capsule().fill(Color.black.opacity(0.55)))
        }
    }

    // MARK: - Shared element groups

    /// Leading affordances: language flags + translate button.
    @ViewBuilder
    private var metaLeading: some View {
        if !model.flags.isEmpty {
            HStack(spacing: 2) {
                ForEach(model.flags, id: \.code) { flag in
                    footerFlagPill(flag)
                }
            }
        }
        if model.showsTranslate, let onTranslate = actions.onTranslate {
            Button(action: { onTranslate(); HapticFeedback.light() }) {
                Image(systemName: "translate")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Color(hex: "4ECDC4"))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Traduction disponible")
        }
    }

    /// Trailing meta: timestamp + delivery check (or retry button on failure).
    @ViewBuilder
    private var metaTrailing: some View {
        if let timestamp = model.timestamp {
            Text(timestamp)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(metaColor)
        }
        if model.delivery != nil {
            if model.isFailed, let onRetry = actions.onRetry {
                Button(action: { onRetry(); HapticFeedback.light() }) {
                    HStack(spacing: 3) {
                        deliveryView(tint: metaColor, readTint: readColor)
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(MeeshyColors.error)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Renvoyer le message")
            } else {
                deliveryView(tint: metaColor, readTint: readColor)
            }
        }
    }

    @ViewBuilder
    private func deliveryView(tint: Color, readTint: Color) -> some View {
        if let delivery = model.delivery {
            BubbleDeliveryCheck(status: delivery, isOffline: model.isOffline, tint: tint, readTint: readTint)
        }
    }

    private func footerFlagPill(_ flag: FooterFlag) -> some View {
        let display = LanguageDisplay.from(code: flag.code)
        return VStack(spacing: 1) {
            Text(display?.flag ?? flag.code.uppercased())
                .font(.system(size: flag.isActive ? 12 : 10))
            if flag.isActive {
                RoundedRectangle(cornerRadius: 1)
                    .fill(Color(hex: display?.color ?? LanguageDisplay.defaultColor))
                    .frame(width: 10, height: 1.5)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { actions.onFlagTap?(flag.code) }
        .accessibilityLabel(display?.name ?? flag.code)
    }

    @ViewBuilder
    private func roleBadge(_ role: MemberRole?) -> some View {
        if let role, role != .member {
            Label {
                Text(role.displayName).font(.system(size: 11))
            } icon: {
                Image(systemName: role.icon).font(.system(size: 11))
            }
            .foregroundColor(role == .creator ? MeeshyColors.warning : MeeshyColors.indigo500)
        }
    }

    private func avatarMenu(sender: SenderIdentity) -> [AvatarContextMenuItem]? {
        var items: [AvatarContextMenuItem] = []
        if let onViewStory = actions.onViewStory, sender.storyRing != .none {
            items.append(AvatarContextMenuItem(label: "Voir la story", icon: "play.circle.fill", action: onViewStory))
        }
        if let onSenderTap = actions.onSenderTap {
            items.append(AvatarContextMenuItem(label: "Voir le profil", icon: "person.circle", action: onSenderTap))
        }
        return items.isEmpty ? nil : items
    }

    private var metaColor: Color {
        model.isMe ? .white.opacity(0.7) : (isDark ? .white.opacity(0.55) : .black.opacity(0.5))
    }

    private var readColor: Color {
        // `.read` is always indigo — never white, never bold. A lighter
        // indigo reads on dark surfaces, a deeper one on light surfaces.
        isDark ? MeeshyColors.indigo400 : MeeshyColors.indigo600
    }
}
```

- [ ] **Step 2: Register the file in `project.pbxproj`** (4 entries, `Meeshy` target, `Bubble` group).

- [ ] **Step 3: Build**

Run: `./apps/ios/meeshy.sh build`
Expected: `Build succeeded`. If `MeeshyAvatar` / `AvatarContextMenuItem` / `LanguageDisplay.defaultColor` / `MemberRole.icon` / `MemberRole.displayName` signatures differ, adjust to the real API in `packages/MeeshySDK/Sources/MeeshyUI/` — these are existing types (see `UserIdentityBar.swift` for the exact `MeeshyAvatar` call site).

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleFooter.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): BubbleFooter — vue de footer unifiée (.row + .overlay)"
```

---

## Task 5: ~~Wire BubbleFooterModel into BubbleContent~~ — FOLDED INTO TASK 6

**Decision (2026-05-19, during execution):** dropped. `BubbleContent.footer` is *not* added.
`BubbleStandardLayout` already holds every gating input (`isDirect`, `isLastSentMessage`,
`isLastReceivedMessage`, `message`, `networkIsOnline`), so it builds the footer model
itself in `resolvedFooter()` (Task 6 Step 1) via `BubbleFooterModel.make(...)`. This
avoids threading `isDirect` / `isLast*` / network state through `BubbleContentBuilder`
and `ThemedMessageBubble` — fewer files, less risk. `make()` is trivial (a switch + a few
booleans) so building it at render time still satisfies "built fast, with the bubble"
(the bubble cell is `.equatable()`-gated, so the body re-evaluates only on input change).

No `BubbleContent` / `BubbleContentBuilder` change. Skip straight to Task 6.

---

## Task 6: Migrate BubbleStandardLayout to BubbleFooter

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift`

Replace `identityBarSection(includesTranslationControls:)` with a `BubbleFooter`. Keep the audio-only injection path (the `AnyView` passed to `AudioMediaView`) — Task 7 swaps that path's content.

- [ ] **Step 1: Add a footer-builder helper**

Add to `BubbleStandardLayout` a method that builds the fully-resolved model (via
`BubbleFooterModel.make`) + actions:

```swift
private func resolvedFooter(includesTranslationControls: Bool) -> (BubbleFooterModel, BubbleFooterActions) {
    let showTranslation = includesTranslationControls && hasAnyTranslation && !isEmojiOnly
    let sender: SenderIdentity? = showIdentityBar ? SenderIdentity(
        name: content.senderName ?? "?",
        username: message.senderUsername.map { "@\($0)" },
        role: nil,
        avatarURL: message.senderAvatarURL,
        accentColor: message.senderColor ?? contactColor,
        moodEmoji: senderMoodEmoji,
        presence: presenceState,
        storyRing: senderStoryRingState
    ) : nil

    let model = BubbleFooterModel.make(
        timeString: content.meta.timeString,
        deliveryStatus: message.deliveryStatus,
        isMe: content.isMe,
        isDirect: isDirect,
        isLastSentMessage: isLastSentMessage,
        isLastReceivedMessage: isLastReceivedMessage,
        isOnline: networkIsOnline,
        sender: sender,
        flags: showTranslation
            ? buildAvailableFlags().map { FooterFlag(code: $0, isActive: $0 == secondaryLangCode) }
            : [],
        showsTranslate: showTranslation
    )

    let actions = BubbleFooterActions(
        onFlagTap: showTranslation ? { code in handleFlagTap(code) } : nil,
        onTranslate: showTranslation ? { onShowTranslationDetail?(content.messageId) } : nil,
        onRetry: { performManualRetry() },
        onSenderTap: { selectedProfileUser = .from(message: message) },
        onViewStory: onViewStory
    )
    return (model, actions)
}
```

- [ ] **Step 2: Replace `identityBarSection` usages**

Replace the `identityBarSection` computed function and its 3 call sites:

- `emojiOnlyContent` — `identityBarSection()` → `{ let (m, a) = resolvedFooter(includesTranslationControls: true); BubbleFooter(model: m, actions: a, style: .row, isDark: isDark) }` (extract into a small `@ViewBuilder var standardRowFooter`).
- `textBubbleContent` — same `standardRowFooter`.
- Audio-only branch (the `ForEach(audioAttachments)` `identityBar:` parameter) — pass `AnyView(BubbleFooter(model: m, actions: a, style: .row, isDark: isDark))` built with `resolvedFooter(includesTranslationControls: false)`.

Delete the now-unused `identityBarSection(includesTranslationControls:)` function.

- [ ] **Step 3: Delete the gating computed-properties**

Remove `shouldShowTime`, `isPendingDelivery`, and `shouldShowDelivery` from `BubbleStandardLayout` — the gating now lives in `BubbleFooterModel.make()` (Task 2), already applied in `content.footer`. Grep for any remaining references and remove them.

- [ ] **Step 4: Build**

Run: `./apps/ios/meeshy.sh build`
Expected: `Build succeeded`. If `BubbleDeliveryBadge` was rendered separately next to `identityBarSection`, remove that call — `BubbleFooter`'s `metaTrailing` now renders the offline hourglass / retry inline.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift
git commit -m "refactor(ios): BubbleStandardLayout rend BubbleFooter au lieu d'identityBarSection"
```

---

## Task 7: Migrate the audio footer to BubbleFooter

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift`

`AudioMediaView` currently builds `playerBottomContent` = `audioTranslationRow` + injected `identityBar`. Replace with a single `BubbleFooter` whose `flags` are the audio languages and whose `onFlagTap` switches `selectedAudioLangCode`.

- [ ] **Step 1: Replace `playerBottomContent` / `audioTranslationRow`**

In `AudioMediaView`, delete `audioTranslationRow` and rebuild `playerBottomContent` from the injected `identityBar` model. Change the `identityBar` parameter type from `AnyView?` to `BubbleFooterModel?` + `BubbleFooterActions?` (passed by `BubbleStandardLayout` Task 6). In `AudioMediaView`, before rendering, set the audio language flags on a copy of the model:

```swift
private var audioFooter: (BubbleFooterModel, BubbleFooterActions)? {
    guard var model = injectedFooterModel, let baseActions = injectedFooterActions else { return nil }
    if !translatedAudios.isEmpty {
        let origCode = message.originalLanguage.lowercased()
        var codes = [origCode]
        codes += translatedAudios.map { $0.targetLanguage.lowercased() }.filter { $0 != origCode }
        let active = (selectedAudioLangCode ?? origCode).lowercased()
        model.flags = codes.map { FooterFlag(code: $0, isActive: $0 == active) }
        model.showsTranslate = onShowTranslationDetail != nil
    }
    var actions = baseActions
    actions.onFlagTap = { code in
        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
            selectedAudioLangCode = (code == message.originalLanguage.lowercased()) ? nil : code
        }
        HapticFeedback.light()
    }
    actions.onTranslate = { onShowTranslationDetail?(message.id) }
    return (model, actions)
}
```

`playerBottomContent` renders `BubbleFooter(model:, actions:, style: .row, isDark: isDark)` from `audioFooter`. `hasPlayerBottomContent` becomes `audioFooter != nil`.

- [ ] **Step 2: Update `AudioMediaView` inputs and `==`**

Replace the `var identityBar: AnyView?` property with `var injectedFooterModel: BubbleFooterModel?` and `var injectedFooterActions: BubbleFooterActions?`. Keep `message.deliveryStatus` + `message.updatedAt` in `AudioMediaView.==`. Add `injectedFooterModel` to `==` (it is `Equatable`).

- [ ] **Step 3: Update the call site in `BubbleStandardLayout.mediaStandaloneView`**

Pass `injectedFooterModel` / `injectedFooterActions` instead of `identityBar: AnyView?`, built via `resolvedFooter(includesTranslationControls: false)` for the audio-sole-content case (nil otherwise).

- [ ] **Step 4: Build**

Run: `./apps/ios/meeshy.sh build`
Expected: `Build succeeded`.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift
git commit -m "refactor(ios): footer audio via BubbleFooter — audioTranslationRow supprimé"
```

---

## Task 8: Migrate the image / carousel / video overlay to BubbleFooter

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleMetaBadges.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble+Media.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift`

- [ ] **Step 1: Replace the grid overlay**

In `BubbleStandardLayout.contentStack`, the `visualMediaGrid` `.overlay` currently renders `BubbleMediaTimestampOverlay`. Replace it with:

```swift
.overlay(alignment: .bottomTrailing) {
    if !content.hasTextOrNonMediaContent {
        BubbleFooter(model: content.footer, actions: .none, style: .overlay, isDark: isDark)
            .padding(8)
            .transition(.opacity)
    }
}
```

`content.footer` already carries the gated timestamp + delivery; the `.overlay` style ignores `flags`/`sender`.

- [ ] **Step 2: Replace the carousel overlay**

In `ThemedMessageBubble+Media.swift`, `BubbleCarouselView` currently builds `BubbleMediaTimestampOverlay`. Replace its `time`/`isMe`/`messageDeliveryStatus` inputs with a single `footer: BubbleFooterModel` parameter and render `BubbleFooter(model: footer, actions: .none, style: .overlay, isDark: isDark)`. Update `carouselView` to pass `content.footer`.

- [ ] **Step 3: Delete `BubbleMediaTimestampOverlay` and `BubbleMediaDeliveryCheckmark`**

Remove both structs from `BubbleMetaBadges.swift`. Grep the project for any remaining references and replace them with `BubbleFooter(.overlay)` / `BubbleDeliveryCheck`.

- [ ] **Step 4: Build**

Run: `./apps/ios/meeshy.sh build`
Expected: `Build succeeded`.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleMetaBadges.swift apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble+Media.swift apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift
git commit -m "refactor(ios): overlay image/carrousel/vidéo via BubbleFooter(.overlay)"
```

---

## Task 9: Cleanup and final verification

**Files:**
- Modify: any file still referencing removed symbols.

- [ ] **Step 1: Dead-code sweep**

Grep for and remove anything now unused: `BubbleDeliveryBadge` (if fully replaced by `BubbleFooter`'s inline retry/hourglass), leftover `audioDeliveryCheckmark` / `timeString` helpers, the `includesTranslationControls` parameter if no longer needed. Confirm `UserIdentityBar` is untouched.

Run: `grep -rn "BubbleMediaTimestampOverlay\|BubbleMediaDeliveryCheckmark\|identityBarSection\|audioTranslationRow" apps/ios/Meeshy`
Expected: no matches.

- [ ] **Step 2: Full build**

Run: `./apps/ios/meeshy.sh build`
Expected: `Build succeeded`.

- [ ] **Step 3: Full test suite**

Run: `rm -rf apps/ios/test-results/unit-tests.xcresult && ./apps/ios/meeshy.sh test`
Expected: all `BubbleFooterModelTests` pass; **0 unexpected** failures (the pre-existing `test_wholeArrayMessagesWrite_countIsExact` failure is allowed and unrelated).

- [ ] **Step 4: Visual smoke test**

Run: `./apps/ios/meeshy.sh run`, open a conversation. Verify on simulator: audio bubble footer = one row (flags left, timestamp+check right); image footer = capsule on photo; pending message shows timestamp; received group message shows avatar+name in the footer row. Capture a screenshot for the review.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(ios): nettoyage — code de footer legacy supprimé"
```

---

## Self-Review

- **Spec coverage:** model (Task 1), `make` builder + gating (Task 2), `BubbleDeliveryCheck` with all 8 states + offline hourglass (Task 3), `BubbleFooter` `.row`/`.overlay` + per-element callbacks + 2-line identity + role badge + avatar menu (Task 4), `BubbleContent.footer` (Task 5), `BubbleStandardLayout` migration + gating removal (Task 6), audio migration incl. audio-language flags (Task 7), image/carousel/video overlay migration (Task 8), cleanup + `inlineTime` dropped implicitly since `BubbleFooter` never pins time inline (Task 9). All spec sections mapped.
- **Placeholder scan:** no TBD/TODO; every code step shows real code; migration steps name exact files and the exact replacement code.
- **Type consistency:** `BubbleFooterModel` / `BubbleFooterActions` / `FooterFlag` / `SenderIdentity` / `BubbleFooterStyle` / `BubbleDeliveryCheck` / `BubbleFooter` signatures are identical across Tasks 1-9.
- **Known adaptation points:** `MeeshyAvatar` / `AvatarContextMenuItem` / `MemberRole.icon` / `LanguageDisplay.defaultColor` exact signatures must be confirmed against `MeeshyUI` at execution (Task 4 Step 3 notes this); `BubbleContentBuilder` may need new `isDirect`/`isLast*` parameters (Task 5 Step 2 notes this).
