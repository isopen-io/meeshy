# Menu long-press message — gestes verticaux + purge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sur le menu long-press d'un message (Menu 1, surface unifiée liquid glass), un swipe-up fort ouvre le menu custom complet (`MessageMoreSheet`, même chemin que le tap « Plus… ») et un swipe-down fort ferme l'overlay ; puis purge atomique de l'ancienne surface capsule morte.

**Architecture:** Une loi de geste 100 % pure (`MessageOverlayDragLaw`, testée en TDD) décide de l'outcome ; `MessageOverlayMenu` la câble via un `DragGesture` sur la liste verticale du chemin native-lean, le cluster (barre emoji + bulle + menu) suivant le doigt en `.offset(y:)`. La purge supprime 4 fichiers de la surface capsule morte + 1 fichier de tests + le code résiduel de `MessageOverlayMenu` et du call site, en un seul commit (les résidus référencent les fichiers supprimés).

**Tech Stack:** Swift 6 / SwiftUI (iOS 16+), XCTest, XcodeGen, `./apps/ios/meeshy.sh`.

**Spec:** `docs/superpowers/specs/2026-07-11-message-longpress-unified-glass-menu-design.md`

## Global Constraints

- TDD non négociable : test RED avant toute ligne de prod (CLAUDE.md racine).
- Build/tests via `./apps/ios/meeshy.sh` uniquement (jamais `xcodebuild` direct) ; tests ciblés sur simulateur iOS 18.2 (UDID `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5`).
- `meeshy.sh test` peut sortir 0 malgré échec — vérifier le `.xcresult`/log, pas le code retour ; `TEST FAILED` peut masquer une erreur de compile.
- Après ajout/suppression de fichiers : `cd apps/ios && xcodegen generate`, vérifier que `CURRENT_PROJECT_VERSION = 1236` est préservé dans le pbxproj, committer le pbxproj régénéré dans le même commit.
- Commits sans trailer `Co-Authored-By` ; `git add` en pathspec strict (jamais `git add -A`).
- Seuils de la loi : `openMoreThreshold = -80`, `dismissThreshold = 80`, prédiction compte double (±160) uniquement dans le sens du drag, amorti ×0.3 au-delà du seuil.
- Ne PAS toucher : `MessageMoreSheet`, `MessageActionResolver`, swipes latéraux, chemin legacy `!useSourceFrame` (hors retrait de résidus non rendus), `EmojiReactionPicker`.

---

### Task 1: `MessageOverlayDragLaw` — loi pure en TDD

**Files:**
- Test: `apps/ios/MeeshyTests/Unit/Components/MessageOverlayDragLawTests.swift` (create)
- Create: `apps/ios/Meeshy/Features/Main/Components/MessageOverlayDragLaw.swift`
- Modify: `apps/ios/Meeshy.xcodeproj/project.pbxproj` (régénéré par XcodeGen)

**Interfaces:**
- Consumes: rien (types Foundation/CoreGraphics uniquement).
- Produces: `enum MessageOverlayDragOutcome: Equatable { case openMore, dismiss, snapBack }` ; `enum MessageOverlayDragLaw` avec `static let openMoreThreshold: CGFloat`, `static let dismissThreshold: CGFloat`, `static func outcome(translation: CGFloat, predicted: CGFloat) -> MessageOverlayDragOutcome`, `static func displayOffset(for translation: CGFloat) -> CGFloat`, `static func isArmed(translation: CGFloat) -> Bool`. Task 2 en dépend.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `apps/ios/MeeshyTests/Unit/Components/MessageOverlayDragLawTests.swift` :

```swift
import XCTest
@testable import Meeshy

final class MessageOverlayDragLawTests: XCTestCase {

    // MARK: - outcome — swipe up

    func test_outcome_strongSwipeUp_opensMore() {
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: -80, predicted: -80), .openMore)
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: -140, predicted: -140), .openMore)
    }

    func test_outcome_weakSwipeUp_snapsBack() {
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: -40, predicted: -60), .snapBack)
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: -79.9, predicted: -79.9), .snapBack)
    }

    func test_outcome_upVelocityInDragDirection_opensMore() {
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: -30, predicted: -200), .openMore)
    }

    func test_outcome_upVelocityAgainstDragDirection_ignored() {
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: 10, predicted: -200), .snapBack)
    }

    func test_outcome_dragUpBeyondThresholdThenFlingDown_opensMore() {
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: -100, predicted: 200), .openMore)
    }

    // MARK: - outcome — swipe down

    func test_outcome_strongSwipeDown_dismisses() {
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: 80, predicted: 80), .dismiss)
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: 140, predicted: 140), .dismiss)
    }

    func test_outcome_weakSwipeDown_snapsBack() {
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: 40, predicted: 50), .snapBack)
    }

    func test_outcome_downVelocityInDragDirection_dismisses() {
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: 30, predicted: 200), .dismiss)
    }

    func test_outcome_downVelocityAgainstDragDirection_ignored() {
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: -10, predicted: 200), .snapBack)
    }

    func test_outcome_zeroDrag_snapsBack() {
        XCTAssertEqual(MessageOverlayDragLaw.outcome(translation: 0, predicted: 0), .snapBack)
    }

    // MARK: - displayOffset

    func test_displayOffset_underThresholds_followsFingerOneToOne() {
        XCTAssertEqual(MessageOverlayDragLaw.displayOffset(for: 0), 0)
        XCTAssertEqual(MessageOverlayDragLaw.displayOffset(for: -50), -50)
        XCTAssertEqual(MessageOverlayDragLaw.displayOffset(for: 50), 50)
        XCTAssertEqual(MessageOverlayDragLaw.displayOffset(for: -80), -80)
        XCTAssertEqual(MessageOverlayDragLaw.displayOffset(for: 80), 80)
    }

    func test_displayOffset_beyondUpThreshold_isDamped() {
        // 40pt au-delà du seuil -80, amorti ×0.3 → -80 + (-40 × 0.3) = -92
        XCTAssertEqual(MessageOverlayDragLaw.displayOffset(for: -120), -92, accuracy: 0.001)
    }

    func test_displayOffset_beyondDownThreshold_isDamped() {
        XCTAssertEqual(MessageOverlayDragLaw.displayOffset(for: 120), 92, accuracy: 0.001)
    }

    func test_displayOffset_staysMonotonic_beyondThreshold() {
        XCTAssertLessThan(
            MessageOverlayDragLaw.displayOffset(for: -200),
            MessageOverlayDragLaw.displayOffset(for: -120)
        )
        XCTAssertGreaterThan(
            MessageOverlayDragLaw.displayOffset(for: 200),
            MessageOverlayDragLaw.displayOffset(for: 120)
        )
    }

    // MARK: - isArmed

    func test_isArmed_exactlyAtUpThreshold() {
        XCTAssertTrue(MessageOverlayDragLaw.isArmed(translation: -80))
        XCTAssertTrue(MessageOverlayDragLaw.isArmed(translation: -120))
        XCTAssertFalse(MessageOverlayDragLaw.isArmed(translation: -79.9))
        XCTAssertFalse(MessageOverlayDragLaw.isArmed(translation: 0))
        XCTAssertFalse(MessageOverlayDragLaw.isArmed(translation: 80))
    }
}
```

- [ ] **Step 2: Enregistrer le fichier au projet et vérifier l'échec (RED)**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate
grep -c "CURRENT_PROJECT_VERSION = 1236" Meeshy.xcodeproj/project.pbxproj  # attendu: 2
./meeshy.sh test --only-testing:MeeshyTests/MessageOverlayDragLawTests
```

Expected: échec de COMPILE (`cannot find 'MessageOverlayDragLaw' in scope`) — c'est le RED attendu. Si `CURRENT_PROJECT_VERSION` a changé, le restaurer à 1236 dans les deux occurrences.

- [ ] **Step 3: Implémentation minimale (GREEN)**

Créer `apps/ios/Meeshy/Features/Main/Components/MessageOverlayDragLaw.swift` :

```swift
import CoreGraphics

/// Outcome d'un geste vertical relâché sur le menu long-press (Menu 1).
enum MessageOverlayDragOutcome: Equatable {
    /// Swipe-up fort → ouvre la feuille « Plus… » (Menu 2).
    case openMore
    /// Swipe-down fort → ferme l'overlay.
    case dismiss
    /// Geste insuffisant → retour spring à la position de repos.
    case snapBack
}

/// Loi pure du geste vertical du menu long-press — source unique de vérité
/// pour « que fait ce drag ». Aucune dépendance UI ; testée exhaustivement
/// dans `MessageOverlayDragLawTests`.
///
/// Plages disjointes par construction : chaque outcome directionnel exige un
/// signe strict de `translation`, la vélocité (via `predicted`) ne compte que
/// dans la direction du drag. Le cas croisé « drag up au-delà du seuil puis
/// fling down au relâchement » retombe sur la règle position (`.openMore`) —
/// l'annulation passe par le slide-off (revenir sous le seuil avant de
/// relâcher).
enum MessageOverlayDragLaw {
    static let openMoreThreshold: CGFloat = -80
    static let dismissThreshold: CGFloat = 80
    /// La translation prédite (position + vélocité projetée) compte double.
    private static let predictionFactor: CGFloat = 2
    /// Suivi du doigt au-delà du seuil : butée élastique amortie.
    private static let overshootDamping: CGFloat = 0.3

    static func outcome(translation: CGFloat, predicted: CGFloat) -> MessageOverlayDragOutcome {
        let openMorePredicted = openMoreThreshold * predictionFactor
        let dismissPredicted = dismissThreshold * predictionFactor
        if translation <= openMoreThreshold || (predicted <= openMorePredicted && translation < 0) {
            return .openMore
        }
        if translation >= dismissThreshold || (predicted >= dismissPredicted && translation > 0) {
            return .dismiss
        }
        return .snapBack
    }

    static func displayOffset(for translation: CGFloat) -> CGFloat {
        if translation < openMoreThreshold {
            return openMoreThreshold + (translation - openMoreThreshold) * overshootDamping
        }
        if translation > dismissThreshold {
            return dismissThreshold + (translation - dismissThreshold) * overshootDamping
        }
        return translation
    }

    static func isArmed(translation: CGFloat) -> Bool {
        translation <= openMoreThreshold
    }
}
```

- [ ] **Step 4: Vérifier le passage (GREEN)**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate
./meeshy.sh test --only-testing:MeeshyTests/MessageOverlayDragLawTests
```

Expected: 15 tests PASS dans le `.xcresult` (vérifier le log, pas le code retour).

- [ ] **Step 5: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/Components/MessageOverlayDragLaw.swift \
        apps/ios/MeeshyTests/Unit/Components/MessageOverlayDragLawTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios/menu): MessageOverlayDragLaw — loi pure du geste vertical du menu long-press (TDD)"
```

---

### Task 2: Câblage des gestes verticaux dans `MessageOverlayMenu`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift`

**Interfaces:**
- Consumes: `MessageOverlayDragLaw.outcome/displayOffset/isArmed` (Task 1) ; `handlePrimaryAction(_:)` et `dismiss()` existants du fichier.
- Produces: comportement UI uniquement — rien de nouveau pour les tâches suivantes.

- [ ] **Step 1: Ajouter l'état local du drag**

Dans `MessageOverlayMenu.swift`, sous `@State private var isEmojiPickerOpen = false` (ligne ~65), ajouter :

```swift
    /// Offset vertical du cluster native-lean pendant le drag (suivi du doigt,
    /// amorti au-delà des seuils par `MessageOverlayDragLaw.displayOffset`).
    @State private var clusterDragOffset: CGFloat = 0
    /// Haptic d'armement émis une seule fois par geste ; réarmé au release.
    @State private var dragHapticArmed = false
```

- [ ] **Step 2: Ajouter le gesture**

Dans le même fichier, après la propriété `dismissBackground` (section `// MARK: - Dismiss Background`), ajouter :

```swift
    // MARK: - Cluster Drag (swipe-up → Menu 2, swipe-down → fermeture)

    private var clusterDragGesture: some Gesture {
        DragGesture(minimumDistance: 12)
            .onChanged { value in
                guard isVisible else { return }
                clusterDragOffset = MessageOverlayDragLaw.displayOffset(for: value.translation.height)
                if MessageOverlayDragLaw.isArmed(translation: value.translation.height),
                   !dragHapticArmed {
                    dragHapticArmed = true
                    HapticFeedback.medium()
                }
            }
            .onEnded { value in
                defer { dragHapticArmed = false }
                guard isVisible else { return }
                switch MessageOverlayDragLaw.outcome(
                    translation: value.translation.height,
                    predicted: value.predictedEndTranslation.height
                ) {
                case .openMore:
                    handlePrimaryAction(.more)
                case .dismiss:
                    dismiss()
                case .snapBack:
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                        clusterDragOffset = 0
                    }
                }
            }
    }
```

- [ ] **Step 3: Câbler l'offset et le gesture sur le cluster native-lean**

Toujours dans `body`, chemin `if useSourceFrame` :

3a. Sur `MessageActionsMenu` — le bloc actuel :

```swift
                    MessageActionsMenu(
                        actions: primaryActions,
                        accentHex: contactColor,
                        onSelect: { handlePrimaryAction($0) }
                    )
                    .position(
                        x: nlMenuX,
                        y: isVisible ? nlMenuY : (bubbleRect.maxY + 8)
                    )
                    .opacity(isVisible ? 1 : 0)
                    .scaleEffect(isVisible ? 1.0 : 0.85, anchor: .top)
```

devient :

```swift
                    MessageActionsMenu(
                        actions: primaryActions,
                        accentHex: contactColor,
                        onSelect: { handlePrimaryAction($0) }
                    )
                    .position(
                        x: nlMenuX,
                        y: isVisible ? nlMenuY : (bubbleRect.maxY + 8)
                    )
                    .offset(y: clusterDragOffset)
                    .opacity(isVisible ? 1 : 0)
                    .scaleEffect(isVisible ? 1.0 : 0.85, anchor: .top)
                    .gesture(clusterDragGesture)
```

3b. Sur le `ThemedMessageBubble` — après `.position(x: nlAnchorX, y: isVisible ? nlBubbleMidY : bubbleRect.midY)` et avant `.opacity(isVisible ? 1 : 0)`, insérer :

```swift
                    .offset(y: clusterDragOffset)
```

3c. Sur `emojiQuickBar` (native-lean) — après `.position(x: nlEmojiX, y: isVisible ? nlEmojiY : bubbleRect.minY)` et avant `.opacity(isVisible ? 1 : 0)`, insérer :

```swift
                        .offset(y: clusterDragOffset)
```

NE PAS attacher le gesture à la barre emoji (scroll horizontal) ni à la bulle (`allowsHitTesting(false)`). Le chemin legacy `!useSourceFrame` ne reçoit ni offset ni gesture.

- [ ] **Step 4: Build + tests de non-régression**

```bash
cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh build
```

Expected: `BUILD SUCCEEDED` dans le log (grep le log — `meeshy.sh` peut sortir 0 malgré échec). Puis :

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh test --only-testing:MeeshyTests/MessageOverlayDragLawTests --only-testing:MeeshyTests/MessageActionResolverTests
```

Expected: tous PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift
git commit -m "feat(ios/menu): swipe-up fort du menu long-press ouvre le menu complet, swipe-down ferme"
```

---

### Task 3: Purge atomique de la surface capsule morte

**Files:**
- Delete: `apps/ios/Meeshy/Features/Main/Views/MessageContextOverlay.swift`
- Delete: `apps/ios/Meeshy/Features/Main/Views/ContextActionMenu.swift`
- Delete: `apps/ios/Meeshy/Features/Main/Views/MessageOverlayLayoutEngine.swift`
- Delete: `apps/ios/Meeshy/Features/Main/Views/ConversationView+ContextOverlay.swift`
- Delete: `apps/ios/MeeshyTests/Unit/Views/Bubble/MessageOverlayLayoutEngineTests.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift` (résidus + props orphelines)
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` (champs `contextOverlay*` + args du call site)
- Modify: `apps/ios/Meeshy/Features/Main/Views/BubbleAnimations.swift` (statics orphelins)
- Modify: `apps/ios/Meeshy.xcodeproj/project.pbxproj` (régénéré)

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: signature réduite de `MessageOverlayMenu` (sans `conversationId`, `onReply`, `onShowThread`, `onReport`, `onDeleteAttachment`, `onSelectTranslation`, `onSelectAudioLanguage`, `onRequestTranslation`).

Tout ce qui suit part dans UN SEUL commit — les résidus de `MessageOverlayMenu` référencent `ContextActionMenu`/`ContextAction`, la compile casse si on scinde.

- [ ] **Step 1: Supprimer les 5 fichiers**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git rm apps/ios/Meeshy/Features/Main/Views/MessageContextOverlay.swift \
       apps/ios/Meeshy/Features/Main/Views/ContextActionMenu.swift \
       apps/ios/Meeshy/Features/Main/Views/MessageOverlayLayoutEngine.swift \
       apps/ios/Meeshy/Features/Main/Views/ConversationView+ContextOverlay.swift \
       apps/ios/MeeshyTests/Unit/Views/Bubble/MessageOverlayLayoutEngineTests.swift
```

- [ ] **Step 2: Purger les résidus de `MessageOverlayMenu.swift`**

Supprimer intégralement (repères sur l'état actuel du fichier) :
- Props : `conversationId` (:12), `onReply` (:17), `onSelectTranslation`/`onSelectAudioLanguage`/`onRequestTranslation` (:26-28), `onReport` (:30), `onDeleteAttachment` (:32), `onShowThread` (:36).
- `@State private var dragOffset: CGFloat = 0` (:63) et `@State private var forceTab: DetailTab? = nil` (:64) — `clusterDragOffset` (Task 2) est le remplaçant.
- `gridVisibleHeight` avec son bloc de commentaire (:80-88).
- Toute la section `// MARK: - Quick Action Bar (au-dessus de la bulle)` : `quickActions`, `quickActionPalette`, `handleQuickAction` (:149-195).
- Dans `body` : le bloc de calculs morts de `let quickActionsCount = quickActions.count` (:282) jusqu'à `let clusterIsInteractive = clusterFadeOpacity > 0.5` (:334) inclus, ainsi que le commentaire « Cluster vertical au-dessus… » (:258-266) qui décrit la surface morte. **GARDER** `useSourceFrame`, `bubbleRect`, `maxPreviewHeight`, `bubblePreviewScale`, `scaledBubbleHeight` (:267-278) — consommés par la géométrie native-lean.
- Dans `onAppear` : la ligne `dragOffset = 0` (:502) et la phrase du commentaire qui mentionne « Le panneau demarre REPLIE (`dragOffset = 0`) ».
- Sections entières : `// MARK: - Detail Panel` (`detailPanel`, `panelDragHandle`, `panelDragGesture`, `panelBackground`, :859-983) et `// MARK: - Quick Actions for Grid` (`overlayActions`, :985-1057).
- `dismissThen(_:)` (:1084-1095) — seul `overlayActions` l'appelait.

- [ ] **Step 3: Purger `ConversationView.swift`**

3a. Dans `ConversationOverlayState`, supprimer le bloc `// MARK: - Context overlay (iMessage-style long-press)` complet — les 5 champs et leurs doc-comments (:46-62) : `contextOverlayPhase`, `contextOverlayMessage`, `contextOverlayTargetFrame`, `contextOverlayLayoutOutput`, `contextOverlayDragOffset`. **GARDER** `quickReactionAnchorFrame` (:63-66) et tout le reste.

3b. Dans `overlayMenuContent` (call site `MessageOverlayMenu(...)`, :1590-1678), supprimer les arguments : `conversationId: viewModel.conversationId,` — `onReply: { triggerReply(for: msg) },` — `onSelectTranslation: { ... },` — `onSelectAudioLanguage: { ... },` — `onRequestTranslation: { ... },` — `onReport: { ... },` — `onDeleteAttachment: { ... },` — `onShowThread: { ... },` (8 arguments ; toutes ces actions restent servies par le Menu 2 et les swipes latéraux).

- [ ] **Step 4: Purger `BubbleAnimations.swift`**

Vérifié par grep : le seul usage externe survivant est `BubbleAnimations.overlayRevealCrossfade` (`MessageListView.swift:108`). Réduire le fichier à :

```swift
import SwiftUI

/// Centralized animation constants for the conversation bubble surface.
///
/// Non-modal interactions (cell layout, swipe, reaction pulse) standardize on
/// `.easeOut(0.18)` for visual coherence — introduced by the flatten
/// refactor (`docs/superpowers/specs/2026-05-22-conversation-flatten-perf-design.md`).
enum BubbleAnimations {
    static let overlayRevealCrossfade: Animation = .linear(duration: BubbleAnimationDurations.overlayRevealCrossfade)
}

/// Nominal durations in seconds, kept separate so call sites can schedule
/// completion work without introspecting an `Animation` (not Equatable).
enum BubbleAnimationDurations {
    static let overlayRevealCrossfade: TimeInterval = 0.016
}
```

- [ ] **Step 5: Vérifier qu'aucune référence ne survit**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios
grep -rn "ContextAction\|MessageContextOverlay\|MessageOverlayLayoutEngine\|OverlayPhase\|withAnimationCompletion\|openContextOverlay\|contextOverlay\|ConversationColorPalette.fallback\|dismissThen\|overlayActions\|detailPanel\|panelDragGesture\|quickActionPalette" --include="*.swift" Meeshy MeeshyTests
```

Expected: zéro résultat (ou uniquement des mots sans rapport — vérifier chaque hit). Si `ConversationColorPalette.fallback` a un usage survivant, relocaliser l'extension dans `packages/MeeshySDK/Sources/MeeshySDK/Theme/ColorGeneration.swift` au lieu de la supprimer.

- [ ] **Step 6: Régénérer le projet, build + tests**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate
grep -c "CURRENT_PROJECT_VERSION = 1236" Meeshy.xcodeproj/project.pbxproj  # attendu: 2 (sinon restaurer)
grep -c "MessageContextOverlay\|ContextActionMenu\|MessageOverlayLayoutEngine" Meeshy.xcodeproj/project.pbxproj  # attendu: 0
cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh build
```

Expected: `BUILD SUCCEEDED` dans le log. Puis suite ciblée :

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && ./meeshy.sh test --only-testing:MeeshyTests/MessageOverlayDragLawTests --only-testing:MeeshyTests/MessageActionResolverTests
```

Expected: tous PASS (vérifier le `.xcresult`).

- [ ] **Step 7: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/Views/MessageContextOverlay.swift \
        apps/ios/Meeshy/Features/Main/Views/ContextActionMenu.swift \
        apps/ios/Meeshy/Features/Main/Views/MessageOverlayLayoutEngine.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView+ContextOverlay.swift \
        apps/ios/MeeshyTests/Unit/Views/Bubble/MessageOverlayLayoutEngineTests.swift \
        apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
        apps/ios/Meeshy/Features/Main/Views/BubbleAnimations.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "refactor(ios/menu): purge la surface capsule morte du long-press (MessageContextOverlay, ContextActionMenu, layout engine, résidus MessageOverlayMenu)"
```

---

### Task 4: QA simulateur + revue d'implémentation + push

**Files:** aucun nouveau (corrections éventuelles issues de la QA/revue).

**Interfaces:** aucune.

- [ ] **Step 1: Lancer l'app au simulateur**

```bash
cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh run
```

(BLOQUE avec logs — lancer en background et capturer les logs.)

- [ ] **Step 2: Vérification visuelle (checklist spec)**

Dans une conversation avec messages :
1. Long-press une bulle → Menu 1 unifié (barre emoji + bulle élevée + liste verticale glass).
2. Drag lent vers le haut sur la liste : le cluster suit le doigt ; à −80 pt un haptic (non observable en simu — vérifier l'absence de crash) et résistance au-delà.
3. Swipe-up fort → `MessageMoreSheet` s'ouvre, overlay fermé.
4. Swipe-up faible relâché → le cluster revient en place (spring).
5. Swipe-down fort → overlay fermé, pas de sheet.
6. Tap sur une row (ex. Copier) → action exécutée (les taps ne sont pas cassés par le gesture).
7. Scroll horizontal de la barre emoji → intact.
8. Tap sur le fond → fermeture, intact.
Captures d'écran des étapes clés dans le scratchpad pour preuve.

Si le `DragGesture` posé en `.gesture` avale le feedback des `Button` : basculer sur `.simultaneousGesture(clusterDragGesture)` (repli prévu par la spec), re-build, re-vérifier, committer le correctif.

- [ ] **Step 3: Revue d'implémentation par agent indépendant**

Dispatcher un agent code-reviewer sur `git diff f3c0d83f7..HEAD` avec la spec comme référence. Corriger les findings CONFIRMÉS, committer les corrections.

- [ ] **Step 4: Push**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git push origin main
```

Expected: push accepté ; surveiller le déclenchement CI.
