# Bouton scroll-to-bottom : morph cercle→ovale + type "appel" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `ConversationScrollControlsView`'s scroll-to-bottom pill a true circle at rest that morphs into an ovale capsule for rich content, and teach it to render a call glyph (phone/video, tinted by outcome) when the last unread message is a call notice — while keeping the SDK component a pure renderer of opaque `String?` params.

**Architecture:** Two files, two concerns, no new dependency:
- `packages/MeeshySDK/Sources/MeeshyUI/Conversation/ConversationScrollControlsView.swift` (SDK) gains (a) a `Circle()`/`Capsule()` `@ViewBuilder` branch replacing the single `RoundedRectangle`, driven by a new testable `isCompactShape` pure function, and (b) two new opaque params `unreadCallSymbol`/`unreadCallTint: String?` plus a rendering branch for them — no SDK type crosses the API boundary.
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+ScrollIndicators.swift` (app) gains a pure `unreadCallIndicator(for:)` mapping function that reads `viewModel.lastUnreadMessage?.callSummary` (already-decoded `CallSummaryMetadata`) and reuses the SSOT ordering from `CallNoticePresentation` (`BubbleCallNoticeView.swift`) — isLive read before outcome, `.missed`/`.rejected` → error, `.failed` → warning, `.completed` → no indicator — without re-decoding `message.metadata`.

**Tech Stack:** Swift 6, SwiftUI, XCTest (SDK target `MeeshyUITests` via `MeeshySDK-Package` scheme; app target `MeeshyTests` via the `Meeshy` scheme).

## Global Constraints

- iOS 16.0+ ; Swift 6 ; aucune nouvelle dépendance externe.
- Composant SDK pur (`packages/MeeshySDK/Sources/MeeshyUI/Conversation/ConversationScrollControlsView.swift`) + orchestration app-side (`apps/ios/Meeshy/Features/Main/Views/ConversationView+ScrollIndicators.swift`) — respecter la séparation : AUCUN type SDK (`CallSummaryMetadata`, `Outcome`) ne doit transiter dans la signature du composant SDK, seulement des `String?` opaques (`unreadCallSymbol`, `unreadCallTint` en hex). Toute la logique de mapping état→symbole/couleur vit côté app.
- NE JAMAIS committer le churn project.pbxproj/Meeshy.xcscheme/Package.resolved : `git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved` avant chaque commit.
- Commandes de test SDK (remplacer `<Classe>`) :
```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/<Classe> -quiet
```
- Tests app (mapping état→symbole, côté `ConversationView+ScrollIndicators`) : simulateur iPhone 16 Pro UDID `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5`.
- Commits : convention `feat(sdk):` ou `feat(ios):` selon le fichier, en français, SANS trailer Co-Authored-By.
- Vérification manuelle simulateur requise sur iPhone 16 Pro ET iPhone SE (375pt, le plus étroit) : forme cercle au repos / capsule en contenu riche, lisibilité des 4 états d'appel (en cours/manqué-rejeté/annulé/échoué).
- Commande de build/test complète : `./apps/ios/meeshy.sh build` puis `./apps/ios/meeshy.sh test` pour le gate final uniquement.

---

## Pre-Implementation Safety Check (run first, before writing any test)

The target SDK file is reported present in 3+ concurrent worktrees (`.claude/worktrees/agent-ac887328413edef97`, `.claude/worktrees/android-ios-parity-routine`, `.claude/worktrees/agent-af37c535fe9774606`, plus `../v2_meeshy-pr2851-resolve`). The spec was verified against `main` at commit `dc067a2c6`, with the file last touched by `e94b56422` and untouched since. Before touching anything:

- [ ] **Step 1: Verify the file hasn't moved since the spec was written**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git log --oneline -5 -- packages/MeeshySDK/Sources/MeeshyUI/Conversation/ConversationScrollControlsView.swift
git log --oneline -1
git status --short packages/MeeshySDK/Sources/MeeshyUI/Conversation/ConversationScrollControlsView.swift apps/ios/Meeshy/Features/Main/Views/ConversationView+ScrollIndicators.swift
```

Expected: the file's most recent commit is still `e94b56422` (or, if `HEAD` has advanced past `dc067a2c6`, the file itself is absent from every commit newer than `e94b56422`), and `git status --short` prints nothing (no local modifications) for both files.

- [ ] **Step 2: STOP if the file has changed**

If the file's most-recent commit is anything other than `e94b56422`, OR `git status --short` shows local changes on either file, **do not proceed**. Do not overwrite or rebase over the concurrent work silently. Stop and report back: which commit touched the file, what it changed (`git show <sha> -- packages/MeeshySDK/Sources/MeeshyUI/Conversation/ConversationScrollControlsView.swift`), and ask whether to rebase this plan's diffs on top or hand the conflict back for a fresh read of the file before continuing. This is a real, verified risk (multiple live worktrees on the same file) — not a hypothetical to skip past.

- [ ] **Step 3: Confirm line numbers still match before trusting the diffs below**

Every `old_string` snippet in Tasks 1–3 below is quoted verbatim from the file as read at plan-writing time. If Step 1 confirms the file is unchanged, they will match exactly. If you had to stop at Step 2 and got explicit approval to proceed anyway, re-read the file fully and re-derive the exact `old_string` values before applying any edit — do not assume the line numbers below still hold.

---

## Task 1: SDK — circle/capsule shape morph

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Conversation/ConversationScrollControlsView.swift` (body restructure, lines 125–168 in the verified state)
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/ConversationScrollControlsViewTests.swift`

**Interfaces:**
- Consumes: existing instance state — `hasUnreadContent: Bool` (private computed, line 73), `isOffline: Bool`, `isSearchingQuotedMessage: Bool` (public stored props), `contentColor: Color` (private computed, line 121), `accentColor: String`, `typingDotTimer` (`@State`, line 114), `hasTypingIndicator` (private computed, line 69), `typingDotPhase` (`@State`, line 104).
- Produces: `nonisolated static func isCompactShape(hasUnreadContent: Bool, isOffline: Bool, isSearchingQuotedMessage: Bool) -> Bool` — the pure decision consumed by `body`. Later tasks do not depend on this function's name, only Task 1 uses it.

- [ ] **Step 1: Write the failing tests**

In `packages/MeeshySDK/Tests/MeeshyUITests/ConversationScrollControlsViewTests.swift`, insert the following block immediately **before** the line `// MARK: - typingDotTimer property wrapper (audit backlog 2026-07-20,` (currently line 65):

```swift
    // MARK: - isCompactShape (circle at rest, capsule for rich content)

    func test_isCompactShape_restState_isFalse() {
        XCTAssertFalse(
            ConversationScrollControlsView.isCompactShape(hasUnreadContent: false, isOffline: false, isSearchingQuotedMessage: false))
    }

    func test_isCompactShape_hasUnreadContent_isTrue() {
        XCTAssertTrue(
            ConversationScrollControlsView.isCompactShape(hasUnreadContent: true, isOffline: false, isSearchingQuotedMessage: false))
    }

    func test_isCompactShape_offline_isTrue() {
        XCTAssertTrue(
            ConversationScrollControlsView.isCompactShape(hasUnreadContent: false, isOffline: true, isSearchingQuotedMessage: false))
    }

    func test_isCompactShape_searchingQuotedMessage_isTrue() {
        XCTAssertTrue(
            ConversationScrollControlsView.isCompactShape(hasUnreadContent: false, isOffline: false, isSearchingQuotedMessage: true))
    }

```

- [ ] **Step 2: Run to verify it fails**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/ConversationScrollControlsViewTests -quiet
```
Expected: **compile failure** — `isCompactShape` does not exist yet (`error: type 'ConversationScrollControlsView' has no member 'isCompactShape'`).

- [ ] **Step 3: Implement the shape morph**

Replace the entire `body` implementation (from `public var body: some View {` through its closing `}`, i.e. the exact block below) with the new version. The `old_string` is the full current implementation, verified unique in the file:

Old:
```swift
    public var body: some View {
        Button {
            onScrollToBottom()
        } label: {
            Group {
                if isSearchingQuotedMessage {
                    // Pulsing search indicator while loading quoted message
                    quotedMessageSearchContent
                } else if hasUnreadContent {
                    // Rich button with preview
                    unreadPreviewContent
                } else if isOffline {
                    // Offline indicator when no unread/typing
                    HStack(spacing: 8) {
                        Image(systemName: "wifi.slash")
                            .font(.system(size: 13, weight: .bold))
                        Text(String(localized: "conversation.offline", defaultValue: "Hors ligne", bundle: .module))
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundColor(contentColor)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                } else {
                    // Simple chevron-only pill
                    Image(systemName: "chevron.down")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(contentColor)
                        .padding(12)
                }
            }
            // Liquid Glass iOS 26 (fallback material teinté < 26). Teinte accent
            // FORTE pour préserver le contraste du contenu blanc (badge non-lus,
            // aperçu pièce jointe) — toutes les infos restent visibles.
            .adaptiveGlass(
                in: RoundedRectangle(cornerRadius: (hasUnreadContent || isOffline || isSearchingQuotedMessage) ? 16 : 20, style: .continuous),
                tint: isOffline ? MeeshyColors.neutral500.opacity(0.9) : Color(hex: accentColor).opacity(0.85)
            )
        }
        .allowsHitTesting(!isSearchingQuotedMessage)
        .onReceive(typingDotTimer) { _ in
            guard hasTypingIndicator else { return }
            typingDotPhase = (typingDotPhase + 1) % 3
        }
    }
```

New:
```swift
    /// Repos = cercle parfait ; contenu riche/hors-ligne/recherche = capsule
    /// ovale. Extrait en fonction pure testable (même pattern que
    /// `shouldShowAttachmentPreview` plus bas) car XCTest ne peut pas
    /// introspecter la `Shape` passée à un modificateur SwiftUI — seule la
    /// DÉCISION est vérifiable, pas le rendu.
    nonisolated static func isCompactShape(hasUnreadContent: Bool, isOffline: Bool, isSearchingQuotedMessage: Bool) -> Bool {
        hasUnreadContent || isOffline || isSearchingQuotedMessage
    }

    public var body: some View {
        if Self.isCompactShape(hasUnreadContent: hasUnreadContent, isOffline: isOffline, isSearchingQuotedMessage: isSearchingQuotedMessage) {
            pill(shape: Capsule())
        } else {
            pill(shape: Circle())
        }
    }

    /// `Circle()` et `Capsule()` sont deux `Shape` distincts : `adaptiveGlass(in:)`
    /// est générique sur `S: Shape`, donc `isCompact ? Circle() : Capsule()` ne
    /// compile pas (branches de types incompatibles). Le branchement vit donc
    /// au niveau de `body` (deux appels concrets à cette même fonction
    /// générique) plutôt qu'un ternaire ici — c'est un cross-fade à l'identité
    /// de vue au changement d'état, pas un morph de rayon animé (AnyShape
    /// exclu : plancher iOS 16 ; décision spec).
    private func pill<S: Shape>(shape: S) -> some View {
        Button {
            onScrollToBottom()
        } label: {
            Group {
                if isSearchingQuotedMessage {
                    // Pulsing search indicator while loading quoted message
                    quotedMessageSearchContent
                } else if hasUnreadContent {
                    // Rich button with preview
                    unreadPreviewContent
                } else if isOffline {
                    // Offline indicator when no unread/typing
                    HStack(spacing: 8) {
                        Image(systemName: "wifi.slash")
                            .font(.system(size: 13, weight: .bold))
                        Text(String(localized: "conversation.offline", defaultValue: "Hors ligne", bundle: .module))
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundColor(contentColor)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                } else {
                    // Chevron-only pill au repos : frame CARRÉE explicite avant
                    // .adaptiveGlass(in: Circle()) — sans elle le disque peint
                    // (inscrit dans les bounds ~37×32 laissées par padding(12))
                    // est plus étroit que le glyphe et déborde horizontalement.
                    // 44×44 atteint au passage la cible tactile HIG.
                    Image(systemName: "chevron.down")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(contentColor)
                        .frame(width: 44, height: 44)
                }
            }
            // Liquid Glass iOS 26 (fallback material teinté < 26). Teinte accent
            // FORTE pour préserver le contraste du contenu blanc (badge non-lus,
            // aperçu pièce jointe) — toutes les infos restent visibles.
            .adaptiveGlass(
                in: shape,
                tint: isOffline ? MeeshyColors.neutral500.opacity(0.9) : Color(hex: accentColor).opacity(0.85)
            )
        }
        .allowsHitTesting(!isSearchingQuotedMessage)
        .onReceive(typingDotTimer) { _ in
            guard hasTypingIndicator else { return }
            typingDotPhase = (typingDotPhase + 1) % 3
        }
    }
```

- [ ] **Step 4: Run to verify it passes**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/ConversationScrollControlsViewTests -quiet
```
Expected: PASS — all pre-existing tests (`typingLabel`, `shouldShowAttachmentPreview`, `typingDotTimer`) plus the 4 new `isCompactShape` tests are green. `typingDotTimer` stays `@State` (untouched) so `test_typingDotTimer_isDeclaredAsState` still passes unmodified.

- [ ] **Step 5: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved
git add packages/MeeshySDK/Sources/MeeshyUI/Conversation/ConversationScrollControlsView.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/ConversationScrollControlsViewTests.swift
git commit -m "feat(sdk): morph cercle/capsule pour le bouton scroll-to-bottom"
```

---

## Task 2: SDK — call glyph/tint plumbing (`unreadCallSymbol`/`unreadCallTint`)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Conversation/ConversationScrollControlsView.swift` (properties, init, `hasAttachmentPreview`, `unreadAttachmentPreview` — all UNCHANGED by Task 1, safe to edit against the original verified line numbers)
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/ConversationScrollControlsViewTests.swift`

**Interfaces:**
- Consumes: nothing from Task 1 (independent region of the file).
- Produces: `public var unreadCallSymbol: String? = nil`, `public var unreadCallTint: String? = nil` on `ConversationScrollControlsView`, both settable via the public `init` (added at the end of the parameter list, before the two closures, both defaulted to `nil` so the app's existing call site keeps compiling until Task 3 updates it). Also `nonisolated static func hasAttachmentPreview(unreadAttachmentIsAudio:unreadAttachmentThumbHash:unreadAttachmentThumbnailUrl:unreadAttachmentFullUrl:unreadAttachmentSymbol:unreadCallSymbol:) -> Bool`, consumed only by this view's own `private var hasAttachmentPreview`.

- [ ] **Step 1: Write the failing tests**

Insert the following block into `packages/MeeshySDK/Tests/MeeshyUITests/ConversationScrollControlsViewTests.swift`, immediately **before** the line `// MARK: - typingDotTimer property wrapper (audit backlog 2026-07-20,` (after Task 1's `isCompactShape` tests, same anchor — insert below them):

```swift
    // MARK: - hasAttachmentPreview (call notice branch)

    func test_hasAttachmentPreview_unreadCallSymbolPresent_isTrue() {
        XCTAssertTrue(
            ConversationScrollControlsView.hasAttachmentPreview(
                unreadAttachmentIsAudio: false,
                unreadAttachmentThumbHash: nil,
                unreadAttachmentThumbnailUrl: nil,
                unreadAttachmentFullUrl: nil,
                unreadAttachmentSymbol: nil,
                unreadCallSymbol: "phone.fill"
            ))
    }

    func test_hasAttachmentPreview_allNil_isFalse() {
        XCTAssertFalse(
            ConversationScrollControlsView.hasAttachmentPreview(
                unreadAttachmentIsAudio: false,
                unreadAttachmentThumbHash: nil,
                unreadAttachmentThumbnailUrl: nil,
                unreadAttachmentFullUrl: nil,
                unreadAttachmentSymbol: nil,
                unreadCallSymbol: nil
            ))
    }

```

- [ ] **Step 2: Run to verify it fails**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/ConversationScrollControlsViewTests -quiet
```
Expected: compile failure — `ConversationScrollControlsView.hasAttachmentPreview` (static, taking `unreadCallSymbol:`) does not exist yet.

- [ ] **Step 3: Add the two opaque properties + init params**

Old (properties block, lines 22–29):
```swift
    public var isAudioPlaying: Bool
    public var isOffline: Bool
    public var isSearchingQuotedMessage: Bool
    public var accentColor: String
    public var secondaryColor: String
    
    public var onScrollToBottom: () -> Void
    public var onPlayAudio: () -> Void
```

New:
```swift
    public var isAudioPlaying: Bool
    public var isOffline: Bool
    public var isSearchingQuotedMessage: Bool
    public var accentColor: String
    public var secondaryColor: String
    /// SF Symbol du dernier message non lu quand c'est une notice d'appel
    /// (téléphone / caméra). `nil` quand le dernier non-lu n'est pas un appel.
    public var unreadCallSymbol: String? = nil
    /// Teinte hex du glyphe d'appel (ex. "F87171"). Même convention que
    /// `accentColor`/`secondaryColor`. `nil` → pas de teinte spécifique.
    public var unreadCallTint: String? = nil
    
    public var onScrollToBottom: () -> Void
    public var onPlayAudio: () -> Void
```

Old (init signature, lines 31–49):
```swift
    public init(
        unreadCount: Int,
        typingUsernames: [String],
        lastUnreadMessageContent: String?,
        unreadAttachmentTypeLabel: String?,
        unreadAttachmentThumbHash: String?,
        unreadAttachmentThumbnailUrl: String?,
        unreadAttachmentFullUrl: String?,
        unreadAttachmentIsAudio: Bool,
        unreadAttachmentDetail: String? = nil,
        unreadAttachmentSymbol: String? = nil,
        isAudioPlaying: Bool,
        isOffline: Bool,
        isSearchingQuotedMessage: Bool = false,
        accentColor: String,
        secondaryColor: String,
        onScrollToBottom: @escaping () -> Void,
        onPlayAudio: @escaping () -> Void
    ) {
```

New:
```swift
    public init(
        unreadCount: Int,
        typingUsernames: [String],
        lastUnreadMessageContent: String?,
        unreadAttachmentTypeLabel: String?,
        unreadAttachmentThumbHash: String?,
        unreadAttachmentThumbnailUrl: String?,
        unreadAttachmentFullUrl: String?,
        unreadAttachmentIsAudio: Bool,
        unreadAttachmentDetail: String? = nil,
        unreadAttachmentSymbol: String? = nil,
        isAudioPlaying: Bool,
        isOffline: Bool,
        isSearchingQuotedMessage: Bool = false,
        accentColor: String,
        secondaryColor: String,
        unreadCallSymbol: String? = nil,
        unreadCallTint: String? = nil,
        onScrollToBottom: @escaping () -> Void,
        onPlayAudio: @escaping () -> Void
    ) {
```

Old (init body tail, lines 63–66):
```swift
        self.accentColor = accentColor
        self.secondaryColor = secondaryColor
        self.onScrollToBottom = onScrollToBottom
        self.onPlayAudio = onPlayAudio
```

New:
```swift
        self.accentColor = accentColor
        self.secondaryColor = secondaryColor
        self.unreadCallSymbol = unreadCallSymbol
        self.unreadCallTint = unreadCallTint
        self.onScrollToBottom = onScrollToBottom
        self.onPlayAudio = onPlayAudio
```

- [ ] **Step 4: Extract `hasAttachmentPreview` to a testable static func**

Old (lines 213–221):
```swift
    /// Whether the last unread message carries a renderable attachment preview
    /// (audio control, image/video thumbnail, or a type glyph).
    private var hasAttachmentPreview: Bool {
        unreadAttachmentIsAudio
            || unreadAttachmentThumbHash != nil
            || unreadAttachmentThumbnailUrl != nil
            || unreadAttachmentFullUrl != nil
            || unreadAttachmentSymbol != nil
    }
```

New:
```swift
    /// Whether the last unread message carries a renderable attachment preview
    /// (audio control, image/video thumbnail, a type glyph, or a call notice).
    private var hasAttachmentPreview: Bool {
        Self.hasAttachmentPreview(
            unreadAttachmentIsAudio: unreadAttachmentIsAudio,
            unreadAttachmentThumbHash: unreadAttachmentThumbHash,
            unreadAttachmentThumbnailUrl: unreadAttachmentThumbnailUrl,
            unreadAttachmentFullUrl: unreadAttachmentFullUrl,
            unreadAttachmentSymbol: unreadAttachmentSymbol,
            unreadCallSymbol: unreadCallSymbol
        )
    }

    /// Extracted `nonisolated static` so it's unit-testable without a full view
    /// instance — same pattern as `shouldShowAttachmentPreview` below.
    nonisolated static func hasAttachmentPreview(
        unreadAttachmentIsAudio: Bool,
        unreadAttachmentThumbHash: String?,
        unreadAttachmentThumbnailUrl: String?,
        unreadAttachmentFullUrl: String?,
        unreadAttachmentSymbol: String?,
        unreadCallSymbol: String?
    ) -> Bool {
        unreadAttachmentIsAudio
            || unreadAttachmentThumbHash != nil
            || unreadAttachmentThumbnailUrl != nil
            || unreadAttachmentFullUrl != nil
            || unreadAttachmentSymbol != nil
            || unreadCallSymbol != nil
    }
```

- [ ] **Step 5: Add the call rendering branch to `unreadAttachmentPreview`**

Old (lines 348–358, the tail of the `@ViewBuilder private var unreadAttachmentPreview`):
```swift
        } else if let symbol = unreadAttachmentSymbol {
            // Media without a thumbnail (file, location, thumbnail-less video):
            // render the type glyph so the preview still reads as media.
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 36, height: 36)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.2)))
        } else {
            EmptyView()
        }
```

New:
```swift
        } else if let symbol = unreadAttachmentSymbol {
            // Media without a thumbnail (file, location, thumbnail-less video):
            // render the type glyph so the preview still reads as media.
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 36, height: 36)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.2)))
        } else if let callSymbol = unreadCallSymbol {
            // Notice d'appel (en cours/manqué/rejeté/annulé/échoué) : même
            // gabarit que le glyphe générique ci-dessus, mais teinté par
            // `unreadCallTint` (hex fourni app-side) plutôt que du blanc fixe —
            // `nil` (ex. appel en cours, pastille déjà teintée accent) retombe
            // sur `contentColor` pour rester lisible.
            Image(systemName: callSymbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(unreadCallTint.map { Color(hex: $0) } ?? contentColor)
                .frame(width: 36, height: 36)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.2)))
        } else {
            EmptyView()
        }
```

- [ ] **Step 6: Run to verify it passes**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/ConversationScrollControlsViewTests -quiet
```
Expected: PASS — all tests from Task 1 plus the 2 new `hasAttachmentPreview` tests, and the pre-existing `shouldShowAttachmentPreview` tests (unchanged signature, per spec §Non-régression) stay green.

- [ ] **Step 7: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved
git add packages/MeeshySDK/Sources/MeeshyUI/Conversation/ConversationScrollControlsView.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/ConversationScrollControlsViewTests.swift
git commit -m "feat(sdk): glyphe et teinte d'appel pour l'aperçu non-lu du bouton scroll-to-bottom"
```

---

## Task 3: App — detect the call type and wire it into the scroll button

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift` (2 new hex string constants)
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+ScrollIndicators.swift` (`import MeeshyUI`, new mapping function + 2 computed vars, wire into `scrollToBottomButton`)
- Test: `apps/ios/MeeshyTests/Unit/Views/ConversationScrollControlsCallIndicatorTests.swift` (new file)

**Interfaces:**
- Consumes: `ConversationScrollControlsView.unreadCallSymbol` / `.unreadCallTint: String?` params (produced by Task 2 — Task 3 does not need the SDK rebuilt via `xcodebuild`, Swift Package resolution over the local path dependency picks the new source up automatically on next app build). `CallSummaryMetadata` (SDK model, already exists: `isLive: Bool`, `outcome: Outcome`, `callType: MediaType`, `isCancelled(viewerIsInitiator:) -> Bool`). `viewModel.lastUnreadMessage?.callSummary: CallSummaryMetadata?` (already exists on `MeeshyMessage`, `CoreModels.swift:733`).
- Produces: `static func unreadCallIndicator(for summary: CallSummaryMetadata?) -> (symbol: String?, tint: String?)` and `var unreadCallSymbol: String?` / `var unreadCallTint: String?` on `extension ConversationView` — consumed only by the `scrollToBottomButton` call site in this same file. `MeeshyColors.errorHex: String` / `MeeshyColors.warningHex: String` — new SDK constants, consumed by `unreadCallIndicator`.

**Design note (resolves an internal inconsistency in the spec):** The spec's Design section (§B, decision table + the dedicated "Note sur la teinte «en cours»" paragraph) is explicit and reasoned: for a **live** call, `unreadCallTint` must be `nil`, NOT the conversation accent — because the whole pill is already accent-tinted via `.adaptiveGlass(tint:)` (`ConversationScrollControlsView.swift:160`), so an accent-colored glyph on accent-tinted glass would be invisible; the glyph instead falls back to `contentColor`'s WCAG-luminance black/white choice. The spec's §Tests bullet list (point 2, first bullet) loosely says "teinte = accent de la conversation" for the live case — this is not consistent with the Design section's decision and its stated rationale, and implementing it literally would reproduce the exact invisible-glyph bug the Design section calls out. This plan follows the Design section (tint `nil` for live) — the test below (`test_liveAudioCall_returnsPhoneGlyphAndNilTint`) asserts `nil`, matching `unreadCallTint`'s own doc comment ("`nil` → pas de teinte spécifique") and the component's fallback-to-`contentColor` behavior added in Task 2 Step 5.

- [ ] **Step 1: Write the failing tests**

Create `apps/ios/MeeshyTests/Unit/Views/ConversationScrollControlsCallIndicatorTests.swift`:

```swift
import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// `ConversationView.unreadCallIndicator(for:)` maps the last unread
/// message's `CallSummaryMetadata` to the scroll-to-bottom pill's SF Symbol +
/// hex tint. Reads `isLive` BEFORE `outcome` (a live message's outcome is a
/// neutral placeholder) and keeps "annulé" on the same error hex as "manqué"
/// — mirrors `CallNoticePresentation` (`BubbleCallNoticeView.swift`), the
/// SSOT for call vocabulary, without re-decoding `message.metadata`.
@MainActor
final class ConversationScrollControlsCallIndicatorTests: XCTestCase {

    func test_noCallSummary_returnsNilSymbolAndTint() {
        let result = ConversationView.unreadCallIndicator(for: nil)

        XCTAssertNil(result.symbol)
        XCTAssertNil(result.tint)
    }

    func test_liveAudioCall_returnsPhoneGlyphAndNilTint() {
        let summary = makeSummary(callType: .audio, outcome: .completed, isLive: true)

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertEqual(result.symbol, "phone.fill")
        XCTAssertNil(result.tint, "la pastille est déjà teintée accent — le glyphe retombe sur contentColor")
    }

    func test_liveVideoCall_returnsVideoGlyph() {
        let summary = makeSummary(callType: .video, outcome: .completed, isLive: true)

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertEqual(result.symbol, "video.fill")
    }

    func test_liveCall_readsIsLiveBeforeOutcome_evenWithCompletedPlaceholder() {
        // Un message vivant porte outcome:.completed comme placeholder neutre —
        // isLive doit gagner, jamais retomber sur la branche "abouti" (nil/nil).
        let summary = makeSummary(callType: .audio, outcome: .completed, isLive: true)

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertNotNil(result.symbol)
    }

    func test_missedCall_returnsErrorHex() {
        let summary = makeSummary(callType: .audio, outcome: .missed)

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertEqual(result.symbol, "phone.fill")
        XCTAssertEqual(result.tint, MeeshyColors.errorHex)
    }

    func test_rejectedCall_returnsErrorHex() {
        let summary = makeSummary(callType: .video, outcome: .rejected)

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertEqual(result.symbol, "video.fill")
        XCTAssertEqual(result.tint, MeeshyColors.errorHex)
    }

    func test_cancelledCall_missedEndedByInitiator_staysOnErrorHex_sameFamilyAsMissed() {
        let summary = CallSummaryMetadata(
            callId: "call1", initiatorId: "u1", callType: .audio, outcome: .missed,
            durationSeconds: 0, bytesTotal: nil, bytesEstimated: false, networkQuality: nil,
            endedByInitiator: true
        )

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertEqual(result.tint, MeeshyColors.errorHex)
    }

    func test_failedCall_returnsWarningHex_notError() {
        let summary = makeSummary(callType: .audio, outcome: .failed)

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertEqual(result.tint, MeeshyColors.warningHex)
        XCTAssertNotEqual(result.tint, MeeshyColors.errorHex)
    }

    func test_completedCall_returnsNilSymbolAndTint_noPendingActionToFlag() {
        let summary = makeSummary(callType: .audio, outcome: .completed, isLive: false)

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertNil(result.symbol)
        XCTAssertNil(result.tint)
    }

    private func makeSummary(
        callType: CallSummaryMetadata.MediaType,
        outcome: CallSummaryMetadata.Outcome,
        isLive: Bool = false
    ) -> CallSummaryMetadata {
        CallSummaryMetadata(
            callId: "call1",
            initiatorId: "peer",
            callType: callType,
            outcome: outcome,
            durationSeconds: 30,
            bytesTotal: 100_000,
            bytesEstimated: false,
            networkQuality: .good,
            isLive: isLive
        )
    }
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath apps/ios/Build
```
Expected: **compile failure** — `MeeshyColors.errorHex`/`.warningHex` and `ConversationView.unreadCallIndicator` do not exist yet. (This is the RED step; it fails at compile time rather than at test-run time, which is expected and sufficient — the same failure mode the file's sibling tests hit before their production code existed.)

- [ ] **Step 3: Add the two hex constants to `MeeshyColors`**

Old (`packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift`):
```swift
    public static let readReceipt = indigo400
    public static let pinnedBlue = Color(hex: "3B82F6")

    /// Variante sombre du rouge sémantique — fond du badge de non-lus en dark mode.
    public static let errorDark = Color(hex: "991B1B")
```

New:
```swift
    public static let readReceipt = indigo400
    public static let pinnedBlue = Color(hex: "3B82F6")

    // MARK: - Semantic Hex Strings (for String-typed color params, e.g.
    // ConversationScrollControlsView.unreadCallTint — same convention as
    // brandPrimaryHex/brandDeepHex above)

    public static let errorHex = "F87171"
    public static let warningHex = "FBBF24"

    /// Variante sombre du rouge sémantique — fond du badge de non-lus en dark mode.
    public static let errorDark = Color(hex: "991B1B")
```

- [ ] **Step 4: Add `import MeeshyUI` to `ConversationView+ScrollIndicators.swift`**

Old (top of file):
```swift
// MARK: - Extracted from ConversationView.swift
import SwiftUI
import MeeshySDK

// MARK: - Scroll Indicators, Typing & Attach Options
```

New:
```swift
// MARK: - Extracted from ConversationView.swift
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Scroll Indicators, Typing & Attach Options
```

- [ ] **Step 5: Add `unreadCallIndicator` + the two computed vars**

Old (`unreadAttachmentSymbol` block, immediately followed by the `unreadAttachmentDetail` doc comment):
```swift
    /// SF Symbol describing the last unread attachment's type — drives the
    /// type glyph in the scroll-to-bottom button when no thumbnail exists.
    var unreadAttachmentSymbol: String? {
        guard let att = unreadAttachment else { return nil }
        switch att.type {
        case .image: return "photo.fill"
        case .video: return "video.fill"
        case .audio: return "waveform"
        case .file: return "doc.fill"
        case .location: return "mappin.circle.fill"
        }
    }

    /// Formatted media detail of the last unread attachment shown after its
```

New:
```swift
    /// SF Symbol describing the last unread attachment's type — drives the
    /// type glyph in the scroll-to-bottom button when no thumbnail exists.
    var unreadAttachmentSymbol: String? {
        guard let att = unreadAttachment else { return nil }
        switch att.type {
        case .image: return "photo.fill"
        case .video: return "video.fill"
        case .audio: return "waveform"
        case .file: return "doc.fill"
        case .location: return "mappin.circle.fill"
        }
    }

    /// SF Symbol + hex tint for the last unread message when it's a call
    /// notice (`CallSummaryMetadata`, no `MessageAttachment` involved — a
    /// call system message never has one). Reads `isLive` BEFORE `outcome`
    /// (a live message's outcome is a neutral placeholder), mirroring the
    /// SSOT `CallNoticePresentation.isLive`/`.tint`
    /// (`Bubble/BubbleCallNoticeView.swift:265-274`) WITHOUT re-decoding
    /// `message.metadata` — `callSummary` is already decoded on the model.
    ///
    /// Tint diverges from `CallNoticePresentation.tint` on two states, both
    /// deliberate: live returns `nil` (the whole pill is already accent-tinted
    /// via `.adaptiveGlass(tint:)`; an accent glyph on accent glass would be
    /// invisible — the glyph falls back to `contentColor`'s WCAG black/white
    /// choice instead), and `.completed` returns `nil`/`nil` (a finished call
    /// isn't a pending action worth flagging on the scroll button). A
    /// "cancelled" call (`.missed` + `isCancelled(viewerIsInitiator:)`) stays
    /// on the same error hex as a plain "missed" call — same visual family,
    /// no dedicated branch needed.
    static func unreadCallIndicator(for summary: CallSummaryMetadata?) -> (symbol: String?, tint: String?) {
        guard let summary else { return (nil, nil) }
        let glyph = summary.callType == .video ? "video.fill" : "phone.fill"
        if summary.isLive {
            return (glyph, nil)
        }
        switch summary.outcome {
        case .missed, .rejected:
            return (glyph, MeeshyColors.errorHex)
        case .failed:
            return (glyph, MeeshyColors.warningHex)
        case .completed:
            return (nil, nil)
        }
    }

    /// SF Symbol half of `unreadCallIndicator` for the scroll-to-bottom button.
    var unreadCallSymbol: String? {
        Self.unreadCallIndicator(for: viewModel.lastUnreadMessage?.callSummary).symbol
    }

    /// Hex tint half of `unreadCallIndicator` for the scroll-to-bottom button.
    var unreadCallTint: String? {
        Self.unreadCallIndicator(for: viewModel.lastUnreadMessage?.callSummary).tint
    }

    /// Formatted media detail of the last unread attachment shown after its
```

- [ ] **Step 6: Wire the two new params into the `ConversationScrollControlsView(...)` call site**

Old (`scrollToBottomButton`, `unreadAttachmentSymbol:` through `secondaryColor:` lines):
```swift
            unreadAttachmentSymbol: unreadAttachmentSymbol,
            isAudioPlaying: scrollButtonAudioIsPlaying,
            isOffline: isOffline,
            isSearchingQuotedMessage: viewModel.isSearchingQuotedMessage,
            accentColor: accentColor,
            secondaryColor: secondaryColor,
            onScrollToBottom: {
```

New:
```swift
            unreadAttachmentSymbol: unreadAttachmentSymbol,
            isAudioPlaying: scrollButtonAudioIsPlaying,
            isOffline: isOffline,
            isSearchingQuotedMessage: viewModel.isSearchingQuotedMessage,
            accentColor: accentColor,
            secondaryColor: secondaryColor,
            unreadCallSymbol: unreadCallSymbol,
            unreadCallTint: unreadCallTint,
            onScrollToBottom: {
```

- [ ] **Step 7: Run to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -derivedDataPath apps/ios/Build
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/ConversationScrollControlsCallIndicatorTests \
  -derivedDataPath apps/ios/Build
```
Expected: PASS — all 9 tests green. (This targeted `xcodebuild` pair is the documented "reproduce CI on one class" pattern from `apps/ios/CLAUDE.md`; the full phased `./apps/ios/meeshy.sh test` is reserved for the final gate in Task 5, per Global Constraints.)

- [ ] **Step 8: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved
git add packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView+ScrollIndicators.swift \
        apps/ios/MeeshyTests/Unit/Views/ConversationScrollControlsCallIndicatorTests.swift
git commit -m "feat(ios): détection du type appel pour le bouton scroll-to-bottom"
```

---

## Task 4: Manual simulator verification (iPhone 16 Pro + iPhone SE)

**Files:** none (verification only — no code changes in this task).

**Interfaces:**
- Consumes: the built app from Tasks 1–3 (shape morph + call glyph/tint), running live.
- Produces: a pass/fail verdict for 2 shape states × 2 device widths, and 4 call-outcome states' glyph/tint readability. No code artifact.

- [x] **Step 1: Build once**

```bash
cd /Users/smpceo/Documents/v2_meeshy
./apps/ios/meeshy.sh build 2>&1 | tee <scratchpad>/task4_build.log
```

Toujours `tee` le log : une citation « Build succeeded in Ns » sans log conservé
n'est pas une preuve.

- [x] **Step 2: Locate the built .app and resolve a second (iPhone SE) simulator**

Créer des simulateurs DÉDIÉS au worktree (`xcrun simctl create meeshy-scrollmorph-16pro …`,
`… -se …`) plutôt que réutiliser le `30BFD3A6` partagé : plusieurs agents
installent dessus en parallèle et le binaire observé n'est alors plus celui du
worktree — la capture ne prouve plus rien.

```bash
APP_PATH=$(find apps/ios/Build -maxdepth 6 -name "Meeshy.app" -path "*iphonesimulator*" | head -1)
echo "$APP_PATH"   # must be non-empty before continuing

SE_UDID=$(xcrun simctl list devices available | grep -i "iPhone SE" | head -1 | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}')
if [ -z "$SE_UDID" ]; then
  SE_UDID=$(xcrun simctl create "meeshy-se-verify" "iPhone SE (3rd generation)" | tail -1)
fi
echo "$SE_UDID"    # must be non-empty before continuing
```

- [x] **Step 3: Install and launch on both simulators**

```bash
xcrun simctl boot 30BFD3A6-C80B-489D-825E-5D14D6FCCAB5 2>/dev/null || true
xcrun simctl boot "$SE_UDID" 2>/dev/null || true
xcrun simctl install 30BFD3A6-C80B-489D-825E-5D14D6FCCAB5 "$APP_PATH"
xcrun simctl install "$SE_UDID" "$APP_PATH"
xcrun simctl launch 30BFD3A6-C80B-489D-825E-5D14D6FCCAB5 me.meeshy.app
xcrun simctl launch "$SE_UDID" me.meeshy.app
```

Prefer the `ios-simulator` skill's own launch/navigation scripts over raw `simctl` here if the skill exposes an equivalent — it is built for exactly this (semantic UI navigation, screenshot capture) and will be faster to drive than hand-rolled `idb`/`simctl` calls.

- [x] **Step 4: Verify the shape morph on both devices**

Log in (demo credentials from `apps/ios/fastlane/.env`, `DEMO_USER`/`DEMO_PASSWORD`), open any conversation, and scroll up past the bottom until the scroll-to-bottom pill appears at rest (no unread, not offline, not searching a quoted message). Screenshot it on both simulators (`xcrun simctl io <udid> screenshot <path>.png`, or the `ios-simulator` skill's screenshot script). Confirm:
- The pill reads as a **true circle** (not a rounded square approaching a circle) on both iPhone 16 Pro and iPhone SE.
- The chevron glyph is centered, not clipped or off-center (validates the 44×44 frame from Task 1).

Then trigger unread content and re-screenshot. Confirm:
- The pill morphs into a **capsule/ovale** shape (fully rounded ends, not a fixed-corner-radius rounded rectangle).
- On iPhone SE (375pt, narrowest supported width) the capsule's `frame(maxWidth: 260)` content (count + last-message preview) does not clip or overflow off-screen.

**L'état riche n'est PAS atteignable en lecture seule dans l'app** :
`MessageListViewController.pendingUnreadCount` part de 0 à chaque contrôleur et
ne s'incrémente que sur un message ARRIVANT pendant qu'on est loin du bas
(`MessageListViewController.swift:872`) — le compteur non-lus serveur ne
l'amorce jamais. La route 1 (« réutiliser des non-lus existants ») ne peut donc
pas produire la capsule, et la route 2 impose une écriture en PRODUCTION.
Contrôle équivalent SANS écriture : rendre le composant réel via
`ImageRenderer` (runtime iOS réel) aux DEUX largeurs d'appareil, plus les
assertions de géométrie permanentes de
`ConversationScrollControlsShapeTests` (cercle 44×44 carré, capsule ≤ 260 pt à
375 pt de large). `drawHierarchy(afterScreenUpdates:)` rend BLANC dans l'hôte
XCTest — toujours garder un contrôle anti-image-vide sur ce genre de harnais.

- [x] **Step 5: Verify the 4 call-outcome states' glyph/tint readability**

**Aucune écriture en production n'est autorisée pour ce contrôle** — ni compte
créé, ni conversation créée, ni message envoyé. Les deux routes ci-dessous ne
valent que si un jeu de données de test existe DÉJÀ ; sinon, rendre les 4 états
avec le composant réel (cf. Step 4).

Each state needs a call system message to land as the conversation's last unread message. Two viable routes, in order of preference:
1. **Check for existing seeded call history first**: the demo account may already have prior call system messages (missed/rejected/failed/live) from earlier QA passes (cf. `docs/superpowers/specs/reference_calls_audit_2026_07_11.md`-style prior work). Open conversations in the demo account and look for existing unread call notices before generating new ones.
2. **Generate live**, using two test/demo accounts on two simulators (or one simulator + a second physical/virtual device): place a call and (a) leave it ringing/unanswered to produce **missed**, (b) have the callee explicitly decline to produce **rejected**, (c) have the caller hang up before pickup to produce **annulé** (cancelled — only distinguishable from "missed" from the *initiator's* view, per `CallNoticePresentation.isCancelled`), (d) force a call to error out (e.g. toggle airplane mode mid-call) to produce **échoué**. For **en cours**, simply keep a call active while checking the scroll button from the non-call screen (background the call view without ending it) — the `call-live` message is the last unread on the other participant's side while the call keeps running.

For each of the 4 outcomes obtained, scroll the receiving side up so the scroll-to-bottom pill shows the call preview, and screenshot on both iPhone 16 Pro and iPhone SE. Confirm:
- **En cours**: phone/video glyph visible and legible against the accent-tinted glass (this is the case where `unreadCallTint` is `nil` and the glyph relies on `contentColor`'s black/white WCAG fallback — the one most likely to look wrong if the design-section resolution in Task 3 was implemented incorrectly).
- **Manqué/rejeté**: glyph tinted a visible red/error hue, distinct from the accent-tinted glass background.
- **Annulé**: same red/error hue as manqué (this state should look visually identical to "manqué" — that's the intended behavior, not a bug).
- **Échoué**: glyph tinted amber/warning — visibly different from the red used for manqué/rejeté/annulé (this is the regression this plan's Task 3 tests guard with `test_failedCall_returnsWarningHex_notError`).

- [x] **Step 6: Record the verdict**

Verdict 2026-08-11 (simulateurs dédiés `meeshy-scrollmorph-16pro` /
`meeshy-scrollmorph-se`, iOS 18.2, binaire du worktree, ZÉRO écriture en
production) :

| Contrôle | iPhone 16 Pro (402 pt) | iPhone SE (375 pt) | Preuve |
|---|---|---|---|
| Repos = vrai cercle, chevron centré non rogné | PASS | PASS | app live, capture |
| Contenu riche = capsule (bouts pleinement arrondis) | PASS | PASS | rendu composant `ImageRenderer` |
| Capsule bornée à 260 pt, pas de débordement | PASS | PASS | rendu + `ConversationScrollControlsShapeTests` |
| Appel en cours (teinte `nil`) lisible | PASS | PASS | rendu, accent sombre ET clair |
| Manqué / rejeté / annulé = rouge erreur | PASS | PASS | rendu (`annulé` ≡ `manqué`, même hex) |
| Échoué = ambre, distinct du rouge | PASS | PASS | rendu |

Toute défaillance renverrait vers Task 1 (forme) ou Task 3 (mapping appel),
jamais vers un correctif ad hoc ici.

**Prérequis découvert pour le gate de la Task 5** : `ConversationScrollControlsCallIndicatorTests.swift`
n'est PAS référencé dans le `project.pbxproj` committé (0 occurrence) —
`./apps/ios/meeshy.sh test` sortirait vert sans jamais compiler ces 9 tests.
Lancer `cd apps/ios && xcodegen generate` AVANT le gate (et ne pas committer le
pbxproj régénéré). Vérifié ici : après régénération, 9/9 verts.

---

## Task 5: Final gate

**Files:** none.

- [x] **Step 1: Clean the churn, PUIS régénérer le projet (ordre critique)**

```bash
cd "$(git rev-parse --show-toplevel)"
git checkout -- apps/ios/Meeshy.xcodeproj   # d'ABORD
git status --short                          # clean relative to Task 1–3's 3 commits
cd apps/ios && xcodegen generate && cd -    # ENSUITE
grep -c ConversationScrollControlsCallIndicatorTests apps/ios/Meeshy.xcodeproj/project.pbxproj  # doit être > 0
```

Deux pièges, tous deux vérifiés le 2026-08-11 :

1. **L'ordre.** `git checkout` APRÈS `xcodegen generate` annule la régénération
   et renvoie le gate à l'aveugle. Le prérequis noté en fin de Task 4
   (`ConversationScrollControlsCallIndicatorTests.swift` absent du pbxproj
   committé) n'est levé que si la régénération vient en dernier.
2. **Le pathspec.** `apps/ios/Package.resolved` N'EXISTE PAS ; le fichier suivi
   est `apps/ios/Meeshy.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`,
   déjà couvert par le premier pathspec. La forme à deux pathspecs sort en
   erreur (`error: pathspec 'apps/ios/Package.resolved' did not match any
   file(s) known to git`) et, git abandonnant TOUT le checkout sur un pathspec
   invalide, ne restaure RIEN — un `git checkout` qu'on croit protecteur et qui
   est un no-op.

- [x] **Step 2: Run the full build**

```bash
./apps/ios/meeshy.sh build
```
Expected: build succeeds (this also exercises the SDK's local-path Swift Package dependency, so Task 1/2's SDK changes compile as consumed by the app, not just standalone).

- [x] **Step 3: Run the full test gate**

```bash
./apps/ios/meeshy.sh test
```
Expected: green across all phases — Phase 0 (`MeeshySDKTests`/`MeeshyUITests` via `MeeshySDK-Package`, includes this plan's `ConversationScrollControlsViewTests` additions), Phase 1–3 (app suites, includes `ConversationScrollControlsCallIndicatorTests`). Do not pass `--skip-sdk` — per spec §Tests point 5, the SDK suite is part of this gate's verdict, not optional.

**Une sortie verte du script ne prouve RIEN sur une classe donnée** : le
formateur n'énumère pas les classes, et `-only-testing` sur une classe absente
du bundle imprime `Executed 0 tests` puis `** TEST EXECUTE SUCCEEDED **`. Le
gate n'est tenu pour rempli qu'avec une preuve NOMINATIVE :

```bash
nm -gU apps/ios/Build/Products/Debug-iphonesimulator/Meeshy.app/PlugIns/MeeshyTests.xctest/MeeshyTests \
  | grep -c ConversationScrollControlsCallIndicatorTests   # > 0
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/ConversationScrollControlsCallIndicatorTests \
  -derivedDataPath apps/ios/Build                          # « Executed 9 tests »
```

- [x] **Step 4: Final cleanup**

```bash
git checkout -- apps/ios/Meeshy.xcodeproj   # pathspec unique, cf. Step 1 piège 2
git status --short   # confirm still clean beyond the 3 feature commits
```

Le pbxproj régénéré n'est PAS committé : `.github/workflows/ios-tests.yml`
lance son propre `xcodegen generate`, donc la CI compile les 9 tests à partir
de `project.yml`. La régénération est un geste LOCAL, à refaire à chaque gate.

- [x] **Step 5: Verdict du gate**

Gate rejoué le 2026-08-11 23:47→23:57 (worktree `v2_meeshy-scroll-morph`,
iPhone 16 Pro, sortie du script `exit=0`).

**RED d'abord** — avec le pbxproj committé (0 occurrence du fichier de test),
la commande ciblée sort :

```
Test Suite 'MeeshyTests.xctest' passed
	 Executed 0 tests, with 0 failures (0 unexpected) in 0.000 seconds
** TEST EXECUTE SUCCEEDED **
```

`nm -gU` sur le bundle du gate précédent : 0 symbole pour
`ConversationScrollControlsCallIndicatorTests`, contre 2 pour la classe témoin
`CallDetailRoutingTests`. Le gate sortait donc vert **sans jamais compiler ni
exécuter** les 9 tests app de la Task 3.

**GREEN après `xcodegen generate`** (4 références au fichier dans le pbxproj) :

| Phase | Suites | Résultat |
|---|---|---|
| 0 — package MeeshySDK (2 bundles) | `MeeshySDKTests` puis `MeeshyUITests` | `Executed 3441 tests, 22 skipped, 0 failures` + `Executed 2971 tests, 13 skipped, 0 failures` |
| 1 — isolées | app, hors pattern phase 2 | `Executed 1943 tests, 1 skipped, 0 failures` |
| 2 — connexion & contenu (326 suites) | contient `ConversationScrollControlsCallIndicatorTests` (match `Conversation`) | `Executed 3512 tests, 0 failures` |
| 3 — état connecté | `ZZEndStateConnectedSessionTests` | `Executed 1 test, with 1 test skipped` (XCTSkip : `DEMO_USER`/`DEMO_PASSWORD` absents de `fastlane/.env`) |

La phase 3 imprime `Executed 1 test` au SINGULIER — un motif
`Executed [0-9]+ tests` ne la capture pas, d'où le mauvais mapping du premier
rapport (qui lui attribuait le compteur d'une phase antérieure).

**Preuve nominative des 9 tests** (le cœur du gate, sans quoi tout ce qui
précède reste un « vert » anonyme) :
- Phase 2 passe de **3503 à 3512 tests, soit exactement +9**, la seule
  différence entre les deux runs étant la régénération du projet.
- `nm -gU` sur le bundle produit par ce run (mtime 23:54, dans la fenêtre du
  gate) : **2** symboles pour la classe, à parité avec la classe témoin.
- Run ciblé : les 9 `test_*` nommés un par un, tous `passed`, puis
  `Executed 9 tests, with 0 failures (0 unexpected)`.

Arbre final propre : `git status --short` ne renvoie rien.
