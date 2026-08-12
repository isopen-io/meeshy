# iOS Voice-Consent Notice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Afficher une note inline discrète sur les bulles vocales de l'utilisateur quand son consentement données vocales est OFF, l'invitant à l'activer (tap → Réglages) pour que ses audios soient transcrits + traduits.

**Architecture:** Atome SDK pur `AudioConsentNotice` (MeeshyUI) ; orchestration app (fetch consentement 1×, décision pure, threading primitif vers `AudioMediaView`, navigation Réglages). Spec : `docs/superpowers/specs/2026-06-22-ios-voice-consent-notice-design.md`.

**Tech Stack:** Swift 6 / SwiftUI, MeeshySDK/MeeshyUI, XCTest + Swift Testing, `VoiceProfileService.getConsentStatus()`.

## Global Constraints
- iOS 16+, Swift 6. Atome présentation → SDK (`MeeshyUI`) ; orchestration/décision produit → app. (SDK Purity.)
- Leaf-view rule : passer des primitifs (`let Bool`), AUCUN `@ObservedObject` sur singleton dans la cellule ; `AudioConsentNotice` Equatable.
- Détection via `VoiceProfileService.shared.getConsentStatus() -> VoiceConsentStatus` (`hasConsent: Bool`). Fail-safe : toute erreur → `voiceConsentMissing = false` (pas de faux nudge).
- Note affichée uniquement si `isMe && voiceConsentMissing && isAudio`. Jamais sur messages reçus.
- Tap → Réglages (`Router` `.settings`). Texte localisé 5 langues (xcstrings).
- Tests SDK : scheme `MeeshySDK-Package`. App tests : `./apps/ios/meeshy.sh test` sur simu iOS 18.2, `-only-testing` ciblé. Nouveaux .swift app → entrées pbxproj manuelles (xcodeproj classique). `meeshy.sh build` bumpe le build number → NE PAS committer les Info.plist.
- Pas de trailer `Co-Authored-By`.

---

### Task 1: SDK — atome `AudioConsentNotice` (MeeshyUI)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioConsentNotice.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/AudioConsentNoticeTests.swift`

**Interfaces:**
- Produces: `public struct AudioConsentNotice: View, Equatable { public init(message: String, actionTitle: String, accentHex: String, onTap: @escaping () -> Void) }`. Equatable ignore le closure `onTap` (compare message/actionTitle/accentHex).

- [ ] **Step 1: Write the failing test** (Equatable contract — pertinent pour le re-render leaf-view)

```swift
import Testing
@testable import MeeshyUI

struct AudioConsentNoticeTests {
    @Test func equal_whenSameVisibleParams() {
        let a = AudioConsentNotice(message: "m", actionTitle: "a", accentHex: "#6366F1", onTap: {})
        let b = AudioConsentNotice(message: "m", actionTitle: "a", accentHex: "#6366F1", onTap: {})
        #expect(a == b)
    }
    @Test func notEqual_whenMessageDiffers() {
        let a = AudioConsentNotice(message: "m1", actionTitle: "a", accentHex: "#6366F1", onTap: {})
        let b = AudioConsentNotice(message: "m2", actionTitle: "a", accentHex: "#6366F1", onTap: {})
        #expect(a != b)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/AudioConsentNoticeTests -derivedDataPath apps/ios/Build 2>&1 | tail -20`
Expected: FAIL — `cannot find 'AudioConsentNotice' in scope`.
(If MeeshyUITests target has no test action wired, place the test in `MeeshySDKTests` and import `MeeshyUI`; verify which test target the package scheme runs.)

- [ ] **Step 3: Write minimal implementation**

```swift
import SwiftUI

/// Note inline discrète invitant l'utilisateur à activer le consentement vocal.
/// Atome SDK : paramètres opaques, aucune décision produit, aucun singleton.
public struct AudioConsentNotice: View, Equatable {
    private let message: String
    private let actionTitle: String
    private let accentHex: String
    private let onTap: () -> Void

    public init(message: String, actionTitle: String, accentHex: String, onTap: @escaping () -> Void) {
        self.message = message
        self.actionTitle = actionTitle
        self.accentHex = accentHex
        self.onTap = onTap
    }

    public static func == (lhs: AudioConsentNotice, rhs: AudioConsentNotice) -> Bool {
        lhs.message == rhs.message && lhs.actionTitle == rhs.actionTitle && lhs.accentHex == rhs.accentHex
    }

    public var body: some View {
        Button(action: onTap) {
            HStack(spacing: 8) {
                Image(systemName: "mic.slash").font(.caption)
                VStack(alignment: .leading, spacing: 2) {
                    Text(message).font(.caption).multilineTextAlignment(.leading)
                    Text(actionTitle).font(.caption2.weight(.semibold))
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.caption2)
            }
            .padding(.horizontal, 10).padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color(hex: accentHex).opacity(0.4), lineWidth: 1))
            .foregroundStyle(Color(hex: accentHex))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint(Text(actionTitle))
    }
}
```
(`Color(hex:)` is the MeeshyUI extension in `Theme/ColorExtensions.swift`. `mic.slash` is iOS 13+.)

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/AudioConsentNoticeTests -derivedDataPath apps/ios/Build 2>&1 | tail -20`
Expected: PASS (2 tests). SPM auto-discovers `Sources/MeeshyUI/Media/` — no manifest edit needed.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/AudioConsentNotice.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/AudioConsentNoticeTests.swift
git commit -m "feat(sdk): AudioConsentNotice inline notice atom (MeeshyUI)"
```

---

### Task 2: App — décision pure + rendu dans AudioMediaView

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift` (`AudioMediaView` struct ~494 : ajout params + Equatable `==` + rendu ; ajout du helper pur statique)
- Test: `apps/ios/MeeshyTests/Unit/Views/ConsentNoticeDecisionTests.swift`

**Interfaces:**
- Consumes: `AudioConsentNotice` (Task 1).
- Produces: on `AudioMediaView` — two new params `var voiceConsentMissing: Bool = false`, `var onTapConsentNotice: (() -> Void)? = nil` ; and a pure static `static func shouldShowConsentNotice(isMe: Bool, voiceConsentMissing: Bool) -> Bool`. Consumed by Task 3's threading.

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
@testable import Meeshy

final class ConsentNoticeDecisionTests: XCTestCase {
    func test_show_onlyWhenMineAndConsentMissing() {
        XCTAssertTrue(AudioMediaView.shouldShowConsentNotice(isMe: true, voiceConsentMissing: true))
        XCTAssertFalse(AudioMediaView.shouldShowConsentNotice(isMe: false, voiceConsentMissing: true))
        XCTAssertFalse(AudioMediaView.shouldShowConsentNotice(isMe: true, voiceConsentMissing: false))
        XCTAssertFalse(AudioMediaView.shouldShowConsentNotice(isMe: false, voiceConsentMissing: false))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./apps/ios/meeshy.sh test --only MeeshyTests/ConsentNoticeDecisionTests` (iOS 18.2 sim)
Expected: FAIL — `AudioMediaView` has no member `shouldShowConsentNotice`.

- [ ] **Step 3: Write minimal implementation**

In `AudioMediaView` (ConversationMediaViews.swift) add the two params alongside the existing `var parentIsMe: Bool = false` (so the `AudioCarouselView` call site, which omits them, keeps compiling via defaults):
```swift
    var voiceConsentMissing: Bool = false
    var onTapConsentNotice: (() -> Void)? = nil
```
Add the pure decision (static, `nonisolated` if the type is `@MainActor`-isolated):
```swift
    nonisolated static func shouldShowConsentNotice(isMe: Bool, voiceConsentMissing: Bool) -> Bool {
        isMe && voiceConsentMissing
    }
```
If `AudioMediaView` has a hand-written `static func == `, add `&& lhs.voiceConsentMissing == rhs.voiceConsentMissing` to it (closures are excluded from Equatable as elsewhere in this struct). In `body`, after the audio player block, render the notice:
```swift
    if Self.shouldShowConsentNotice(isMe: parentIsMe, voiceConsentMissing: voiceConsentMissing) {
        AudioConsentNotice(
            message: String(localized: "audio.consent.notice.message", bundle: .main),
            actionTitle: String(localized: "audio.consent.notice.action", bundle: .main),
            accentHex: accentColor,
            onTap: { onTapConsentNotice?() }
        )
        .padding(.top, 6)
    }
```
Add the two localized keys to the app xcstrings (`apps/ios/Meeshy/Localizable.xcstrings` or the project's strings catalog) for the 5 languages, e.g. FR `audio.consent.notice.message` = "Active le consentement vocal pour que tes messages audio soient transcrits et traduits.", `audio.consent.notice.action` = "Activer dans les Réglages". (Use the byte-identical xcstrings edit approach; provide en/fr/es/pt + at least one more per project convention.)

- [ ] **Step 4: Run test + build**

Run: `./apps/ios/meeshy.sh test --only MeeshyTests/ConsentNoticeDecisionTests` then `./apps/ios/meeshy.sh build`
Expected: PASS (1 test, 4 assertions) + BUILD SUCCEEDED.

- [ ] **Step 5: Commit** (register the new test file in pbxproj; do NOT commit Info.plist build bumps)

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift \
        apps/ios/MeeshyTests/Unit/Views/ConsentNoticeDecisionTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj \
        apps/ios/Meeshy/Localizable.xcstrings
git commit -m "feat(ios): render AudioConsentNotice on own audio bubbles when voice consent missing"
```

---

### Task 3: App — fetch consentement + threading + navigation

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` (add `@Published var voiceConsentMissing: Bool = false` + a `loadVoiceConsentStatus()` called once on load)
- Modify: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift:1208` (the `AudioMediaView(...)` call — pass the two new params)
- Modify: the bubble param chain (`ThemedMessageBubble.swift` + `ConversationView`) to thread `voiceConsentMissing: Bool` + the tap closure, mirroring how `parentIsMe` / `onShowTranslationDetail` are already threaded.
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/VoiceConsentFetchTests.swift`

**Interfaces:**
- Consumes: `AudioMediaView.voiceConsentMissing` / `onTapConsentNotice` (Task 2), `VoiceProfileService.shared.getConsentStatus()`.

- [ ] **Step 1: Write the failing test** (fail-safe behavior, via an injectable consent fetch)

```swift
import XCTest
@testable import Meeshy

final class VoiceConsentFetchTests: XCTestCase {
    func test_voiceConsentMissing_falseWhenFetchThrows() async {
        // resolveVoiceConsentMissing is a pure async helper: maps a throwing
        // fetch to a Bool, defaulting to false (no false nudge) on error.
        let missing = await ConversationViewModel.resolveVoiceConsentMissing {
            throw NSError(domain: "x", code: 1)
        }
        XCTAssertFalse(missing)
    }
    func test_voiceConsentMissing_trueWhenNoConsent() async {
        let missing = await ConversationViewModel.resolveVoiceConsentMissing { false /* hasConsent */ }
        XCTAssertTrue(missing)
    }
    func test_voiceConsentMissing_falseWhenConsentGranted() async {
        let missing = await ConversationViewModel.resolveVoiceConsentMissing { true }
        XCTAssertFalse(missing)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./apps/ios/meeshy.sh test --only MeeshyTests/VoiceConsentFetchTests`
Expected: FAIL — `resolveVoiceConsentMissing` not found.

- [ ] **Step 3: Write minimal implementation**

In `ConversationViewModel`:
```swift
    @Published var voiceConsentMissing: Bool = false

    /// Pure, testable: maps a `hasConsent` fetch to "missing", fail-safe to false.
    nonisolated static func resolveVoiceConsentMissing(_ fetchHasConsent: () async throws -> Bool) async -> Bool {
        do { return try await !fetchHasConsent() } catch { return false }
    }

    func loadVoiceConsentStatus() {
        Task { [weak self] in
            let missing = await Self.resolveVoiceConsentMissing {
                try await VoiceProfileService.shared.getConsentStatus().hasConsent
            }
            await MainActor.run { self?.voiceConsentMissing = missing }
        }
    }
```
Call `loadVoiceConsentStatus()` once where the conversation loads (e.g. end of the existing `loadMessages()` / `onAppear` path — match where other one-shot loads fire).

Thread the value + tap into the bubble: at `BubbleStandardLayout.swift:1208` `AudioMediaView(...)`, add:
```swift
                voiceConsentMissing: voiceConsentMissing,
                onTapConsentNotice: onTapConsentNotice,
```
Add matching `let voiceConsentMissing: Bool` (default `false`) and `let onTapConsentNotice: (() -> Void)?` (default `nil`) to `BubbleStandardLayout` and `ThemedMessageBubble`, threaded from `ConversationView` exactly as `parentIsMe` and the other `onTap*` callbacks already are (follow the existing param-passing chain — do not invent a new mechanism). In `ConversationView`, supply `voiceConsentMissing: viewModel.voiceConsentMissing` and `onTapConsentNotice: { router.navigate(to: .settings) }` (use the project's actual Router navigation call for `.settings` — match an existing `.settings` navigation site).

- [ ] **Step 4: Run test + build**

Run: `./apps/ios/meeshy.sh test --only MeeshyTests/VoiceConsentFetchTests` then `./apps/ios/meeshy.sh build`
Expected: PASS (3 tests) + BUILD SUCCEEDED. Manually sanity-check there are no unused-param warnings on the threaded chain.

- [ ] **Step 5: Commit** (do NOT commit Info.plist build bumps)

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift \
        apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift \
        apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
        apps/ios/MeeshyTests/Unit/ViewModels/VoiceConsentFetchTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): fetch voice consent + wire AudioConsentNotice tap to Settings"
```

---

## Self-Review
- **Spec coverage:** atom → Task 1 ; decision + render → Task 2 ; detection (fail-safe) + threading + navigation + localization → Task 3. ✓
- **Placeholders:** SDK view, decision helper, consent-resolve helper, render block, and threading additions are concrete; mechanical param-threading references the established `parentIsMe`/`onTap*` pattern (legitimate in an existing codebase). ✓
- **Type consistency:** `shouldShowConsentNotice(isMe:voiceConsentMissing:)` (Task 2) ; `resolveVoiceConsentMissing(_:)`/`voiceConsentMissing` (Task 3) ; `AudioConsentNotice(message:actionTitle:accentHex:onTap:)` (Task 1) consumed in Task 2. ✓

## Déploiement
iOS ships via the iOS CI/TestFlight pipeline on merge to main.
