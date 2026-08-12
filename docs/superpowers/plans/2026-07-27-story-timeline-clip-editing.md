# Édition des lignes de la timeline story — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre honnêtes les contrôles d'édition des pistes de la timeline story — un seul jeu de bornes pour début/fin/durée, une saisie directe, un tap qui surligne, un double tap qui ouvre une fiche entièrement dépliée, un glissement qui déplace vraiment le clip.

**Architecture:** Un résolveur pur (`ClipWindowResolver`) devient la source de vérité unique des bornes d'une fenêtre de clip ; le ViewModel et la barre tactile y délèguent, ce qui supprime trois logiques de clamp divergentes. La durée de slide devient purement dérivée du contenu : les affordances qui prétendaient la piloter sont retirées. La sélection (surlignage) est découplée de la présentation (fiche) par un second champ dans `ClipSelectionState`.

**Tech Stack:** Swift 6 / SwiftUI, package `MeeshySDK` (target `MeeshyUI`), XCTest, `MockStoryTimelineEngine`.

**Spec:** `docs/superpowers/specs/2026-07-27-story-timeline-clip-editing-design.md`

## Global Constraints

- Cible iOS 16.0+ — aucune API postérieure sans `if #available`.
- Aucune dépendance SwiftUI dans le target `MeeshySDK` ; tout ce plan vit dans `MeeshyUI`.
- `ClipWindowResolver` est un rule engine stateless : pas de singleton, pas de `MeeshyConfig`, pas de décision produit — il reste légitime au SDK (`packages/MeeshySDK/CLAUDE.md`).
- Bornes canoniques, valeurs exactes : `minimumDuration = 0.05` s, `maximumEnd = 600` s, seuil de no-op `0.0005` s.
- Jamais de `.onChange` SwiftUI brut — utiliser `adaptiveOnChange` (convention du dépôt).
- Chaque nouvelle chaîne visible passe par `String(localized:defaultValue:bundle: .module)` et doit être ajoutée dans les **7 langues** de `Sources/MeeshyUI/Resources/Localizable.xcstrings`, sinon `TimelineLocalizationTests` casse.
- Commande de test de référence (le `-derivedDataPath` privé évite la contention de DerivedData partagée entre sessions) :

```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -derivedDataPath /tmp/meeshy-timeline-dd \
  -only-testing:MeeshyUITests/<Suite> -quiet
```

- Avant de committer une tâche, la suite complète `MeeshySDK-Package` doit être verte (≈5665 tests). Les tâches 2 et 5 touchent des comportements couverts par des suites de gestes existantes (`TrimLeftHandleTests`, `TrimRightHandleTests`, `ClipDragGestureTests`, `DoubleTapSplitTests`) : ne jamais se contenter du `-only-testing` de la tâche.

## File Structure

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `Sources/MeeshyUI/Story/Timeline/Logic/ClipWindowResolver.swift` *(créé)* | Résolveur pur des bornes d'une fenêtre de clip | 1 |
| `Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel+Plan4Helpers.swift` | Délègue au résolveur ; méthodes absolues | 2 |
| `Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipTimingBar.swift` | Délègue au résolveur ; échelle avec marge | 3 |
| `Sources/MeeshyUI/Story/Timeline/Views/Overlay/DurationHandle.swift` *(supprimé)* | — | 4 |
| `Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineScrubArea.swift` | Perd `onSlideDurationChanged` | 4 |
| `Sources/MeeshyUI/Story/Timeline/Views/Controls/TimelineOperationsBar.swift` | Perd le chip « +10 s » | 4 |
| `Sources/MeeshyUI/Story/Timeline/ViewModel/ClipSelectionState.swift` | Gagne `inspectedClipId` | 5 |
| `Sources/MeeshyUI/Story/Timeline/Views/Track/{Video,Audio,Text}ClipBar.swift` | Gestes recomposés | 5 |
| `Sources/MeeshyUI/Story/Timeline/Views/Container/StoryTimelineView.swift` | Câblage tap/double-tap, retrait des affordances de durée | 4, 5 |
| `Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineInspectorHost.swift` | Garde `inspectedClipId`, action « Diviser » | 5 |
| `Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspector.swift` | Sections dépliées, champs saisissables | 6 |

---

### Task 1: `ClipWindowResolver` — la règle unique

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/ClipWindowResolver.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/ClipWindowResolverTests.swift` *(créé)*

**Interfaces:**
- Consomme : rien.
- Produit : `ClipWindowResolver.Window(start:duration:)` avec `.end`, `ClipWindowResolver.Edit` (`.move(to:)`, `.setStart(_:)`, `.setEnd(_:)`, `.setDuration(_:)`), `ClipWindowResolver.resolve(_:from:) -> Window`, `ClipWindowResolver.minimumDuration`, `ClipWindowResolver.maximumEnd`. Les tâches 2 et 3 en dépendent.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `Tests/MeeshyUITests/Timeline/Logic/ClipWindowResolverTests.swift` :

```swift
import XCTest
@testable import MeeshyUI

/// Le résolveur est la SEULE règle de bornes d'une fenêtre de clip. Avant lui,
/// trois implémentations divergeaient : la barre tactile clampait la fin à la
/// durée de slide (rendant impossible d'allonger un clip en fin de slide), les
/// steppers ne clampaient que le plancher, les poignées de piste rien du tout.
final class ClipWindowResolverTests: XCTestCase {

    private typealias Resolver = ClipWindowResolver
    private func window(_ start: Float, _ duration: Float) -> Resolver.Window {
        Resolver.Window(start: start, duration: duration)
    }

    // MARK: - move : la durée est préservée

    func test_move_keepsDuration() {
        let r = Resolver.resolve(.move(to: 5), from: window(2, 3))
        XCTAssertEqual(r.start, 5, accuracy: 0.001)
        XCTAssertEqual(r.duration, 3, accuracy: 0.001, "Déplacer ne change jamais la durée.")
    }

    func test_move_beforeZero_clampsToZero() {
        let r = Resolver.resolve(.move(to: -4), from: window(2, 3))
        XCTAssertEqual(r.start, 0, accuracy: 0.001)
        XCTAssertEqual(r.duration, 3, accuracy: 0.001)
    }

    func test_move_pastCeiling_keepsWholeClipInside() {
        let r = Resolver.resolve(.move(to: 599), from: window(2, 3))
        XCTAssertEqual(r.end, Resolver.maximumEnd, accuracy: 0.001,
                       "Le clip entier doit tenir sous le plafond, pas seulement son début.")
        XCTAssertEqual(r.duration, 3, accuracy: 0.001)
    }

    // MARK: - setStart : la FIN est fixe

    func test_setStart_keepsEnd_shrinksDuration() {
        let r = Resolver.resolve(.setStart(4), from: window(2, 6))  // fin = 8
        XCTAssertEqual(r.start, 4, accuracy: 0.001)
        XCTAssertEqual(r.end, 8, accuracy: 0.001, "Trimmer le début ne bouge pas la fin.")
        XCTAssertEqual(r.duration, 4, accuracy: 0.001)
    }

    func test_setStart_pastEnd_stopsAtMinimumDuration() {
        let r = Resolver.resolve(.setStart(99), from: window(2, 6))  // fin = 8
        XCTAssertEqual(r.duration, Resolver.minimumDuration, accuracy: 0.001)
        XCTAssertEqual(r.end, 8, accuracy: 0.001)
    }

    func test_setStart_negative_clampsToZero() {
        let r = Resolver.resolve(.setStart(-3), from: window(2, 6))
        XCTAssertEqual(r.start, 0, accuracy: 0.001)
        XCTAssertEqual(r.duration, 8, accuracy: 0.001, "La fin reste à 8, la durée s'allonge d'autant.")
    }

    // MARK: - setEnd : le DÉBUT est fixe, et rien ne borne à la durée de slide

    func test_setEnd_keepsStart_growsDuration() {
        let r = Resolver.resolve(.setEnd(12), from: window(2, 3))
        XCTAssertEqual(r.start, 2, accuracy: 0.001)
        XCTAssertEqual(r.duration, 10, accuracy: 0.001)
    }

    /// LE cas qui était impossible : un clip qui finit à la fin de la slide
    /// pouvait être tiré nulle part. La slide dérive du contenu, donc c'est
    /// l'allongement du clip qui allonge la slide — jamais l'inverse.
    func test_setEnd_beyondAnySlideLength_isAllowed() {
        let r = Resolver.resolve(.setEnd(45), from: window(0, 6))
        XCTAssertEqual(r.duration, 45, accuracy: 0.001)
    }

    func test_setEnd_beforeStart_stopsAtMinimumDuration() {
        let r = Resolver.resolve(.setEnd(1), from: window(5, 3))
        XCTAssertEqual(r.start, 5, accuracy: 0.001)
        XCTAssertEqual(r.duration, Resolver.minimumDuration, accuracy: 0.001)
    }

    func test_setEnd_pastCeiling_clampsToMaximumEnd() {
        let r = Resolver.resolve(.setEnd(9999), from: window(10, 3))
        XCTAssertEqual(r.end, Resolver.maximumEnd, accuracy: 0.001)
    }

    // MARK: - setDuration : le DÉBUT est fixe

    func test_setDuration_keepsStart() {
        let r = Resolver.resolve(.setDuration(7), from: window(2, 3))
        XCTAssertEqual(r.start, 2, accuracy: 0.001)
        XCTAssertEqual(r.duration, 7, accuracy: 0.001)
    }

    func test_setDuration_zero_stopsAtMinimum() {
        let r = Resolver.resolve(.setDuration(0), from: window(2, 3))
        XCTAssertEqual(r.duration, Resolver.minimumDuration, accuracy: 0.001)
    }

    func test_setDuration_pastCeiling_clampsSoEndFits() {
        let r = Resolver.resolve(.setDuration(9999), from: window(100, 3))
        XCTAssertEqual(r.end, Resolver.maximumEnd, accuracy: 0.001)
    }

    // MARK: - Valeurs non finies

    /// Un `Float` non fini traversant les clamps produirait un `NaN` persistant
    /// dans le projet, invisible jusqu'à l'export. Le résolveur le refuse.
    func test_nonFiniteEdit_returnsWindowUnchanged() {
        let original = window(2, 3)
        XCTAssertEqual(Resolver.resolve(.move(to: .nan), from: original), original)
        XCTAssertEqual(Resolver.resolve(.setEnd(.infinity), from: original), original)
        XCTAssertEqual(Resolver.resolve(.setDuration(.nan), from: original), original)
        XCTAssertEqual(Resolver.resolve(.setStart(-.infinity), from: original), original)
    }
}
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -derivedDataPath /tmp/meeshy-timeline-dd \
  -only-testing:MeeshyUITests/ClipWindowResolverTests -quiet
```

Attendu : échec de compilation — `cannot find 'ClipWindowResolver' in scope`.

- [ ] **Step 3: Écrire l'implémentation minimale**

Créer `Sources/MeeshyUI/Story/Timeline/Logic/ClipWindowResolver.swift` :

```swift
import Foundation

/// SOURCE DE VÉRITÉ UNIQUE des bornes d'une fenêtre de clip sur la timeline.
///
/// Trois affordances éditent la même fenêtre — la barre tactile de la fiche,
/// les champs de timing, les poignées de piste — et chacune appliquait
/// jusqu'ici ses propres clamps. Un stepper pouvait produire un état que le
/// doigt refusait, et le clamp `fin ≤ durée de slide` de la barre tactile
/// rendait un clip finissant en fin de slide impossible à allonger.
///
/// Règle : `start ≥ 0`, `duration ≥ minimumDuration`, `start + duration ≤ maximumEnd`.
/// Volontairement AUCUNE borne sur la durée de slide : celle-ci dérive du
/// contenu (`TimelineViewModel.recomputeSlideDuration`), donc c'est le clip qui
/// l'étend, jamais elle qui le contraint.
///
/// Pure, sans état, sans dépendance — testable sans monter de vue.
public enum ClipWindowResolver {

    public struct Window: Equatable, Sendable {
        public let start: Float
        public let duration: Float

        public init(start: Float, duration: Float) {
            self.start = start
            self.duration = duration
        }

        public var end: Float { start + duration }
    }

    /// Intention d'édition. Chaque cas dit ce qui reste FIXE :
    /// `move` la durée, `setStart` la fin, `setEnd` et `setDuration` le début.
    public enum Edit: Equatable, Sendable {
        case move(to: Float)
        case setStart(Float)
        case setEnd(Float)
        case setDuration(Float)
    }

    /// Durée plancher d'un clip — en deçà il ne serait plus saisissable.
    public static let minimumDuration: Float = 0.05

    /// Plafond absolu de la timeline. Portée auparavant par
    /// `TimelineViewModel.setSlideDuration`, supprimée avec le pin manuel :
    /// c'est désormais le seul rempart, `recomputeSlideDuration()` n'en a aucun.
    public static let maximumEnd: Float = 600

    public static func resolve(_ edit: Edit, from window: Window) -> Window {
        guard window.start.isFinite, window.duration.isFinite,
              value(of: edit).isFinite else { return window }

        switch edit {
        case .move(let newStart):
            let start = max(0, min(newStart, maximumEnd - window.duration))
            return Window(start: start, duration: window.duration)

        case .setStart(let newStart):
            let end = window.end
            let start = max(0, min(newStart, end - minimumDuration))
            return Window(start: start, duration: end - start)

        case .setEnd(let newEnd):
            let end = max(window.start + minimumDuration, min(newEnd, maximumEnd))
            return Window(start: window.start, duration: end - window.start)

        case .setDuration(let newDuration):
            let duration = max(minimumDuration,
                               min(newDuration, maximumEnd - window.start))
            return Window(start: window.start, duration: duration)
        }
    }

    private static func value(of edit: Edit) -> Float {
        switch edit {
        case .move(let v), .setStart(let v), .setEnd(let v), .setDuration(let v):
            return v
        }
    }
}
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Même commande qu'au Step 2. Attendu : 14 tests verts.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/ClipWindowResolver.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/ClipWindowResolverTests.swift
git commit -m "feat(sdk/timeline): une seule règle pour les bornes d'une fenêtre de clip

Trois affordances éditent la même fenêtre et chacune appliquait ses propres
clamps. Le plus coûteux : la barre tactile bornait la fin à la durée de slide,
donc un clip finissant en fin de slide ne pouvait plus être allongé — et comme
la slide dérive du contenu, plus rien ne pouvait l'allonger.

ClipWindowResolver pose la règle unique (start >= 0, duree >= 0,05 s,
fin <= 600 s) et refuse les valeurs non finies, qui produisaient un NaN
persistant invisible jusqu'à l'export. Aucun appelant encore."
```

---

### Task 2: Le ViewModel délègue, et gagne les réglages absolus

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel+Plan4Helpers.swift:26-120`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelAbsoluteTimingTests.swift` *(créé)*

**Interfaces:**
- Consomme : `ClipWindowResolver` (tâche 1).
- Produit : `TimelineViewModel.setClipStart(id:to:)`, `setClipEnd(id:to:)`, `setClipDuration(id:to:)` — utilisées par la tâche 6. `nudgeClipStart`, `trimClipStart`, `trimClipEnd` conservent leur signature publique exacte.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelAbsoluteTimingTests.swift` :

```swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Réglages ABSOLUS du timing d'un clip — ce que les champs saisissables de la
/// fiche appellent. Jusqu'ici seuls des deltas existaient : poser un début à
/// 3,5 s demandait 35 pressions sur ±0,1 s.
@MainActor
final class TimelineViewModelAbsoluteTimingTests: XCTestCase {

    private func makeSUT(start: Float = 2, duration: Float = 4) async -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.1))
        let media = StoryMediaObject(id: "m1", kind: .video, aspectRatio: 1.78,
                                     startTime: Double(start), duration: Double(duration))
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: 10,
                                              mediaObjects: [media], audioPlayerObjects: [],
                                              textObjects: [], clipTransitions: []),
                     mediaURLs: [:], images: [:])
        await vm.awaitConfigured()
        return vm
    }

    private func window(_ vm: TimelineViewModel) -> (start: Float, duration: Float) {
        let m = vm.project.mediaObjects.first { $0.id == "m1" }
        return (Float(m?.startTime ?? -1), Float(m?.duration ?? -1))
    }

    func test_setClipStart_movesTheClip_keepingDuration() async {
        let sut = await makeSUT(start: 2, duration: 4)
        sut.setClipStart(id: "m1", to: 3.5)
        let w = window(sut)
        XCTAssertEqual(w.start, 3.5, accuracy: 0.001)
        XCTAssertEqual(w.duration, 4, accuracy: 0.001, "Régler le début déplace, il ne trimme pas.")
    }

    func test_setClipEnd_keepsStart_recomputesDuration() async {
        let sut = await makeSUT(start: 2, duration: 4)
        sut.setClipEnd(id: "m1", to: 9)
        let w = window(sut)
        XCTAssertEqual(w.start, 2, accuracy: 0.001)
        XCTAssertEqual(w.duration, 7, accuracy: 0.001)
    }

    func test_setClipDuration_keepsStart_movesEnd() async {
        let sut = await makeSUT(start: 2, duration: 4)
        sut.setClipDuration(id: "m1", to: 1.5)
        let w = window(sut)
        XCTAssertEqual(w.start, 2, accuracy: 0.001)
        XCTAssertEqual(w.duration, 1.5, accuracy: 0.001)
    }

    /// Une entrée d'undo par réglage — pas zéro (le réglage serait irrattrapable),
    /// pas deux (l'utilisateur devrait annuler deux fois un seul geste).
    func test_eachAbsoluteEdit_pushesExactlyOneUndoEntry() async {
        let sut = await makeSUT(start: 2, duration: 4)
        let before = sut.commandHistoryDepth
        sut.setClipEnd(id: "m1", to: 9)
        XCTAssertEqual(sut.commandHistoryDepth, before + 1)
        sut.undo()
        XCTAssertEqual(window(sut).duration, 4, accuracy: 0.001)
    }

    func test_noOpEdit_pushesNothing() async {
        let sut = await makeSUT(start: 2, duration: 4)
        let before = sut.commandHistoryDepth
        sut.setClipStart(id: "m1", to: 2)
        XCTAssertEqual(sut.commandHistoryDepth, before,
                       "Régler une valeur à ce qu'elle vaut déjà ne doit rien empiler.")
    }

    func test_unknownClipId_isIgnored() async {
        let sut = await makeSUT()
        let before = sut.commandHistoryDepth
        sut.setClipEnd(id: "nope", to: 9)
        XCTAssertEqual(sut.commandHistoryDepth, before)
    }

    /// Le clip est autoritaire, la slide suit : allonger un clip au-delà de la
    /// fin de slide DOIT allonger la slide, puisque plus aucune affordance ne
    /// la règle à la main.
    func test_extendingBeyondSlideEnd_growsTheSlide() async {
        let sut = await makeSUT(start: 0, duration: 6)
        sut.setClipEnd(id: "m1", to: 25)
        XCTAssertEqual(window(sut).duration, 25, accuracy: 0.001)
        XCTAssertEqual(sut.project.slideDuration, 25, accuracy: 0.05,
                       "La durée de slide dérive du contenu : elle suit le clip le plus long.")
    }

    func test_absoluteEdits_respectTheCeiling() async {
        let sut = await makeSUT(start: 0, duration: 6)
        sut.setClipEnd(id: "m1", to: 9999)
        XCTAssertEqual(window(sut).duration, ClipWindowResolver.maximumEnd, accuracy: 0.001)
    }
}
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -derivedDataPath /tmp/meeshy-timeline-dd \
  -only-testing:MeeshyUITests/TimelineViewModelAbsoluteTimingTests -quiet
```

Attendu : échec de compilation — `value of type 'TimelineViewModel' has no member 'setClipStart'`.

- [ ] **Step 3: Écrire l'implémentation**

Dans `TimelineViewModel+Plan4Helpers.swift`, remplacer intégralement le bloc allant de la déclaration de `nudgeClipStart` (l. 26) à la fin de `trimClipEnd` (l. 120) par :

```swift
    // MARK: - Fenêtre d'un clip (début / fin / durée)

    /// Fenêtre courante d'un clip. Un clip « permanent » (`duration == nil` —
    /// tout texte fraîchement posé) n'a pas de durée stockée : on MATÉRIALISE
    /// sa fenêtre effective, sinon les poignées restaient inertes sur lui.
    func currentWindow(id: String) -> ClipWindowResolver.Window? {
        guard let start = clipStartTime(id: id) else { return nil }
        let duration = clipDuration(id: id)
            ?? TimelineGeometry.effectiveClipDuration(startTime: start,
                                                      duration: nil,
                                                      slideDuration: project.slideDuration)
        return ClipWindowResolver.Window(start: start, duration: duration)
    }

    /// Applique une intention d'édition à la fenêtre d'un clip et l'empile.
    ///
    /// Point de passage UNIQUE : c'est ici que les bornes s'appliquent, pour
    /// que le stepper, le champ saisi et la poignée de piste produisent
    /// exactement le même état. La commande choisie suit ce qui a changé — un
    /// déplacement pur reste un `MoveClipCommand`, qui coalesce avec les
    /// déplacements voisins dans la fenêtre du `CommandStack`.
    private func applyWindow(id: String, edit: ClipWindowResolver.Edit) {
        guard let kind = clipKind(forId: id),
              let current = currentWindow(id: id) else { return }
        let resolved = ClipWindowResolver.resolve(edit, from: current)

        let startMoved = abs(resolved.start - current.start) > 0.0005
        let durationChanged = abs(resolved.duration - current.duration) > 0.0005
        // Un réglage sans effet ne doit pas empiler une entrée d'annulation vide.
        guard startMoved || durationChanged else { return }

        do {
            if durationChanged {
                let cmd = TrimClipCommand(
                    clipId: id, kind: kind,
                    oldStartTime: current.start, oldDuration: current.duration,
                    newStartTime: resolved.start, newDuration: resolved.duration
                )
                try cmd.apply(to: &project)
                commandStack.push(.trimClip(cmd))
            } else {
                let cmd = MoveClipCommand(clipId: id, kind: kind,
                                          oldStartTime: current.start,
                                          newStartTime: resolved.start)
                try cmd.apply(to: &project)
                commandStack.push(.moveClip(cmd))
            }
            scheduleEngineReconfigure()
            recomputeSlideDuration()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Réglages ABSOLUS (champs saisissables de la fiche)

    /// Pose le DÉBUT : le clip se déplace, sa durée est préservée.
    public func setClipStart(id: String, to seconds: Float) {
        applyWindow(id: id, edit: .move(to: seconds))
    }

    /// Pose la FIN : le début est préservé, la durée se recalcule.
    public func setClipEnd(id: String, to seconds: Float) {
        applyWindow(id: id, edit: .setEnd(seconds))
    }

    /// Pose la DURÉE : le début est préservé, la fin se déplace.
    public func setClipDuration(id: String, to seconds: Float) {
        applyWindow(id: id, edit: .setDuration(seconds))
    }

    // MARK: - Réglages par PAS (steppers, poignées, actions d'accessibilité)

    /// Déplacement EXACT du début — les steppers ±0,1 s.
    ///
    /// Ne passe volontairement PAS par `dragClip`, qui emprunte le chemin du
    /// GESTE et applique l'aimantation : sa tolérance vaut `8 pt / (50 × zoom)`,
    /// soit 0,16 s au zoom par défaut — plus que le pas de 0,1 s. Un clip posé
    /// à 0 ou collé au bord d'un voisin revenait donc systématiquement à sa
    /// place. Le doigt VEUT accrocher, le stepper veut la valeur qu'il annonce.
    public func nudgeClipStart(id: String, by deltaTimeSeconds: Float) {
        guard deltaTimeSeconds.isFinite, let w = currentWindow(id: id) else { return }
        applyWindow(id: id, edit: .move(to: w.start + deltaTimeSeconds))
    }

    /// Poignée gauche : la FIN reste fixe, la durée absorbe le delta.
    public func trimClipStart(id: String, deltaTimeSeconds: Float) {
        guard deltaTimeSeconds.isFinite, let w = currentWindow(id: id) else { return }
        applyWindow(id: id, edit: .setStart(w.start + deltaTimeSeconds))
    }

    /// Poignée droite : le DÉBUT reste fixe. `mediaDurationLimit` borne à la
    /// longueur du média source quand l'appelant la connaît.
    public func trimClipEnd(id: String, deltaTimeSeconds: Float, mediaDurationLimit: Float? = nil) {
        guard deltaTimeSeconds.isFinite, let w = currentWindow(id: id) else { return }
        var target = w.end + deltaTimeSeconds
        if let limit = mediaDurationLimit {
            target = min(target, w.start + limit)
        }
        applyWindow(id: id, edit: .setEnd(target))
    }
```

- [ ] **Step 4: Lancer les tests de la tâche, puis la suite complète**

```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -derivedDataPath /tmp/meeshy-timeline-dd \
  -only-testing:MeeshyUITests/TimelineViewModelAbsoluteTimingTests -quiet
```

Puis, sans `-only-testing`, la suite entière.

**Attention — régression attendue à arbitrer :** l'ancien `trimClipStart` calculait `newDuration = max(0.05, duration - delta)` avec un début clampé indépendamment, ce qui laissait la fin dériver quand le trim dépassait. `.setStart` garde la fin strictement fixe. Si `TrimLeftHandleTests` échoue, vérifier le cas exact : si le test assertait la fin dérivante, c'est le test qui encodait le défaut — le corriger en documentant pourquoi dans le commit. S'il assertait autre chose, c'est l'implémentation qui est fautive.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel+Plan4Helpers.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelAbsoluteTimingTests.swift
git commit -m "feat(sdk/timeline): un seul chemin pour régler début, fin et durée

nudgeClipStart, trimClipStart et trimClipEnd appliquaient chacun leurs propres
clamps — début borné au plancher seulement, durée jamais bornée en haut. Ils
délèguent désormais à ClipWindowResolver, comme la barre tactile.

S'y ajoutent setClipStart/End/Duration(id:to:), qui posent une valeur au lieu
de la grignoter : poser un début à 3,5 s demandait 35 pressions sur ±0,1 s.
Chaque réglage empile exactement une entrée d'annulation, et un réglage sans
effet n'en empile aucune."
```

---

### Task 3: La barre tactile délègue et retrouve de la place à droite

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipTimingBar.swift:38-97`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/ClipTimingBarTests.swift`

**Interfaces:**
- Consomme : `ClipWindowResolver` (tâche 1).
- Produit : `ClipTimingBar.previewWindow(field:start:duration:deltaSeconds:) -> (start: Float, duration: Float)` — **la signature perd `slideDuration` et `minDuration`**, les bornes venant désormais du résolveur. `ClipTimingBar.displayTotal(slideDuration:start:duration:) -> Float`, statique et testable.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `ClipTimingBarTests.swift` (et adapter les appels existants à `previewWindow`, qui ne prend plus `slideDuration:`) :

```swift
    /// La piste doit réserver de la place APRÈS la fin de slide, sinon la
    /// poignée droite d'un clip qui finit à la fin de slide est déjà collée au
    /// bord et n'a nulle part où aller — le clamp retiré ne suffisait pas.
    func test_displayTotal_reservesRoomBeyondTheSlide() {
        let total = ClipTimingBar.displayTotal(slideDuration: 10, start: 0, duration: 10)
        XCTAssertGreaterThan(total, 10,
                             "Un clip occupant toute la slide doit garder une réserve à droite.")
    }

    func test_displayTotal_marginIsAtLeastOneSecond() {
        let total = ClipTimingBar.displayTotal(slideDuration: 2, start: 0, duration: 2)
        XCTAssertGreaterThanOrEqual(total, 3, accuracy: 0.001)
    }

    func test_displayTotal_coversAClipOverflowingTheSlide() {
        let total = ClipTimingBar.displayTotal(slideDuration: 6, start: 4, duration: 20)
        XCTAssertGreaterThan(total, 24, "Un clip qui déborde reste entièrement visible.")
    }

    /// La barre et les steppers doivent produire le MÊME état : c'est tout
    /// l'objet du résolveur partagé.
    func test_previewWindow_trimEnd_matchesResolver() {
        let preview = ClipTimingBar.previewWindow(field: .trimEnd, start: 2, duration: 3,
                                                  deltaSeconds: 40)
        let resolved = ClipWindowResolver.resolve(
            .setEnd(45), from: ClipWindowResolver.Window(start: 2, duration: 3))
        XCTAssertEqual(preview.start, resolved.start, accuracy: 0.001)
        XCTAssertEqual(preview.duration, resolved.duration, accuracy: 0.001)
    }

    func test_previewWindow_trimEnd_isNoLongerCappedByTheSlide() {
        let preview = ClipTimingBar.previewWindow(field: .trimEnd, start: 0, duration: 10,
                                                  deltaSeconds: 15)
        XCTAssertEqual(preview.duration, 25, accuracy: 0.001,
                       "Tirer au-delà de la slide allonge le clip — c'est lui qui étend la slide.")
    }

    func test_previewWindow_move_keepsDuration() {
        let preview = ClipTimingBar.previewWindow(field: .move, start: 2, duration: 3,
                                                  deltaSeconds: 5)
        XCTAssertEqual(preview.start, 7, accuracy: 0.001)
        XCTAssertEqual(preview.duration, 3, accuracy: 0.001)
    }
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -derivedDataPath /tmp/meeshy-timeline-dd \
  -only-testing:MeeshyUITests/ClipTimingBarTests -quiet
```

Attendu : échec de compilation — `displayTotal` n'est pas statique, `previewWindow` attend `slideDuration:`.

- [ ] **Step 3: Écrire l'implémentation**

Dans `ClipTimingBar.swift`, remplacer `previewWindow` (l. 41-59) par :

```swift
    /// Fenêtre prévisualisée pendant un drag. Les bornes viennent du résolveur
    /// partagé : `move` préserve la durée, `trimStart` garde la fin fixe,
    /// `trimEnd` garde le début fixe. AUCUNE borne à la durée de slide — c'est
    /// en tirant un clip qu'on allonge la slide.
    public nonisolated static func previewWindow(field: DragField,
                                                 start: Float, duration: Float,
                                                 deltaSeconds: Float
    ) -> (start: Float, duration: Float) {
        let window = ClipWindowResolver.Window(start: start, duration: duration)
        let edit: ClipWindowResolver.Edit = {
            switch field {
            case .move:      return .move(to: start + deltaSeconds)
            case .trimStart: return .setStart(start + deltaSeconds)
            case .trimEnd:   return .setEnd(window.end + deltaSeconds)
            }
        }()
        let resolved = ClipWindowResolver.resolve(edit, from: window)
        return (resolved.start, resolved.duration)
    }

    /// Étendue AFFICHÉE de la piste : la slide, jamais moins que la fenêtre du
    /// clip, plus une réserve à droite.
    ///
    /// Sans cette réserve, la poignée droite d'un clip finissant à la fin de la
    /// slide est déjà au bord de la piste : le geste n'a physiquement aucune
    /// course, et retirer le clamp ne changeait rien.
    public nonisolated static func displayTotal(slideDuration: Float,
                                                start: Float, duration: Float) -> Float {
        let content = max(slideDuration, start + duration, minimumDuration)
        return content + max(1, content * 0.2)
    }
```

Remplacer `minimumDuration` par une délégation, pour qu'il n'existe qu'un plancher :

```swift
    /// Durée plancher d'un clip — délègue au résolveur, seul détenteur de la règle.
    public nonisolated static var minimumDuration: Float { ClipWindowResolver.minimumDuration }
```

Puis, dans le corps de la vue, remplacer la propriété d'instance `displayTotal` et `previewedWindow` par :

```swift
    private var displayTotal: Float {
        Self.displayTotal(slideDuration: slideDuration, start: start, duration: duration)
    }

    private var previewedWindow: (start: Float, duration: Float) {
        guard let drag else { return (start, duration) }
        return Self.previewWindow(field: drag.field, start: start, duration: duration,
                                  deltaSeconds: drag.deltaSeconds)
    }
```

Enfin, dans `dragGesture(_:width:)`, l'appel de `onEnded` perd lui aussi l'argument :

```swift
                let window = Self.previewWindow(field: field, start: start, duration: duration,
                                                deltaSeconds: delta)
```

- [ ] **Step 4: Lancer les tests de la tâche, puis la suite complète**

Même commande qu'au Step 2, puis la suite entière (les snapshots de `ClipInspectorSnapshotTests` changent : la barre affiche désormais une réserve à droite — ré-enregistrer les baselines concernées).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipTimingBar.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/
git commit -m "fix(sdk/timeline): la barre de timing peut enfin allonger un clip

previewWindow bornait la fin à la durée de slide : un clip finissant à la fin
de la slide ne pouvait plus grandir, donc — la slide dérivant du contenu —
plus rien ne pouvait l'allonger. Elle délègue maintenant à ClipWindowResolver,
comme les steppers et les poignées de piste.

Retirer le clamp ne suffisait pas : la poignée droite était déjà collée au bord
de la piste. displayTotal réserve 20 % de course à droite, au minimum 1 s."
```

---

### Task 4: La durée de slide devient purement dérivée

**Files:**
- Delete: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/DurationHandle.swift`
- Delete: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/DurationHandleTests.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineScrubArea.swift:52-54,83,98,190-200`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TimelineOperationsBar.swift:10-12,20,27,35,104-124`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel+Plan4Helpers.swift` (bloc « Slide duration pin »)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/StoryTimelineView.swift:401-404,469`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelSlideDurationTests.swift`, `.../Views/Controls/TimelineOperationsBarTests.swift`

**Interfaces:**
- Consomme : rien.
- Produit : `TimelineOperationsBar.init(canUndo:canRedo:isSnapEnabled:onUndo:onRedo:onSnapToggle:onSave:)` — **sans** `onExtendDuration:`. `TimelineScrubArea.init` — **sans** `onSlideDurationChanged:`.

- [ ] **Step 1: Écrire le test qui échouera après la suppression**

Ajouter à `TimelineViewModelSlideDurationTests.swift` :

```swift
    /// Décision produit 2026-07-27 : le contenu gagne TOUJOURS. Aucune surface
    /// ne pose plus de durée à la main — la timeline dérive du contenu, un
    /// point c'est tout. Ce test remplace les trois tests de pin supprimés.
    func test_slideDuration_alwaysEqualsContentDerivedDuration() async {
        let sut = await makeSUT(mediaObjects: [])
        sut.addMedia(id: "m1", postMediaId: "pm1", kind: .video, startTime: 0, duration: 14)
        XCTAssertEqual(sut.project.slideDuration, 14, accuracy: 0.05)

        sut.trimClipEnd(id: "m1", deltaTimeSeconds: -5)
        XCTAssertEqual(sut.project.slideDuration, 9, accuracy: 0.05)

        sut.setClipStart(id: "m1", to: 3)
        XCTAssertEqual(sut.project.slideDuration, 12, accuracy: 0.05,
                       "Déplacer le clip déplace aussi la fin du contenu.")
    }
```

- [ ] **Step 2: Lancer et vérifier qu'il passe déjà**

```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -derivedDataPath /tmp/meeshy-timeline-dd \
  -only-testing:MeeshyUITests/TimelineViewModelSlideDurationTests/test_slideDuration_alwaysEqualsContentDerivedDuration -quiet
```

Attendu : PASS. Ce test caractérise le comportement conservé ; les suppressions qui suivent ne doivent pas le casser.

- [ ] **Step 3: Supprimer les affordances**

1. `git rm` sur `DurationHandle.swift` et `DurationHandleTests.swift`.

2. Dans `TimelineScrubArea.swift` : supprimer la propriété `onSlideDurationChanged`, son paramètre d'init, son assignation, et le bloc `if let onSlideDurationChanged { DurationHandle(...) }` (l. 190-200).

3. Dans `TimelineOperationsBar.swift` : supprimer `extendStepSeconds`, la propriété `onExtendDuration`, son paramètre d'init, son assignation, l'appel `extendChip` dans le `body`, et la sous-vue `extendChip` entière.

4. Dans `TimelineViewModel+Plan4Helpers.swift` : supprimer le bloc `// MARK: - Slide duration pin (DurationHandle)` avec `setSlideDuration(_:)` et `extendSlideDuration(by:)`.

5. Dans `StoryTimelineView.swift` : retirer l'argument `onExtendDuration:` de l'appel `TimelineOperationsBar` (l. 401-404) et l'argument `onSlideDurationChanged:` de l'appel `TimelineScrubArea` (l. 469).

6. Dans `TimelineViewModelSlideDurationTests.swift` : supprimer `test_setSlideDuration_extendsBeyondContent`, `test_setSlideDuration_cropsAndClampsPlayheadInside`, `test_setSlideDuration_clampsToSaneRange`. Dans le test du toast (l. ~190), remplacer l'appel `sut.setSlideDuration(20)` — qui servait à fabriquer un écart entre valeur courante et valeur auto — par un écart obtenu par le contenu : ajouter d'abord un clip de 20 s, puis le supprimer, de sorte que la valeur courante (20) diffère de la valeur auto recalculée. Ajuster les assertions `from`/`to` en conséquence.

7. Dans `TimelineOperationsBarTests.swift` : supprimer `test_extendSlideDuration_addsTenSeconds` et `test_extendSlideDuration_clampsAtMaxDuration` ; retirer l'argument `onExtendDuration: {}` des trois autres constructions.

8. Vérifier qu'il ne reste aucune référence :

```bash
cd packages/MeeshySDK && grep -rn "DurationHandle\|setSlideDuration\|extendSlideDuration\|onExtendDuration\|extendStepSeconds\|onSlideDurationChanged" Sources Tests
```

Attendu : aucune sortie.

9. Purger les deux clés de localisation devenues mortes dans `Sources/MeeshyUI/Resources/Localizable.xcstrings` : `story.timeline.ops.extend` et `story.timeline.a11y.durationHandle`, dans les 7 langues. Éditer textuellement (le fichier est volumineux et sensible à l'encodage) et retirer les entrées correspondantes de la liste attendue dans `TimelineLocalizationTests`.

- [ ] **Step 4: Lancer la suite complète**

Sans `-only-testing`. Ré-enregistrer les baselines de snapshot qui montraient le losange ou le chip « +10 s » (`StoryTimelineViewSnapshotTests`, `TimelineOperationsBar` s'il en a).

- [ ] **Step 5: Commit**

```bash
git add -A packages/MeeshySDK
git commit -m "feat(sdk/timeline): la durée de slide dérive du contenu, sans exception

setSlideDuration et extendSlideDuration écrivaient project.slideDuration sans
marquer que la valeur venait de l'auteur. recomputeSlideDuration, appelée par
nudge, trim, move, add, delete, undo et redo, la remplaçait aussitôt par la
durée du contenu : le réglage ne survivait pas à l'édition suivante. Un test
verrouillait même cet écrasement.

Décision produit : le contenu gagne toujours. Plutôt que réparer un pin dont
personne ne veut, les surfaces qui le promettaient disparaissent — poignée
losange du ruler et chip « +10 s ». Pour allonger une slide on allonge un
clip, ce que la barre de timing permet désormais. Le plafond de 600 s vit
maintenant dans ClipWindowResolver."
```

---

### Task 5: Le tap surligne, le double tap ouvre, le glissement déplace

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/ClipSelectionState.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift:238-240`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/VideoClipBar.swift:141-148`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/AudioClipBar.swift:120-127`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TextClipBar.swift:104-111`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/StoryTimelineView.swift` (callbacks `onTap`/`onDoubleTap`/`onLongPress` des quatre familles de barres, l. 653-658, 724-726, 786-790, 830-832)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineInspectorHost.swift:58-69,292-339`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/LaneKeyframeOverlays.swift:22-23`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/ClipSelectionInspectionTests.swift` *(créé)*, `.../Gesture/DoubleTapSplitTests.swift`

**Interfaces:**
- Consomme : rien.
- Produit : `ClipSelectionState.inspectedClipId`, `.inspect(_:)`, `.endInspection()` ; `TimelineViewModel.inspectClip(id:)`, `.endInspection()`. `ClipInspector` gagne le paramètre `onSplit: () -> Void`.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `Tests/MeeshyUITests/Timeline/ViewModel/ClipSelectionInspectionTests.swift` :

```swift
import XCTest
@testable import MeeshyUI

/// Surligner et ouvrir la fiche étaient le MÊME acte : la sheet était pilotée
/// par un binding sur selectedClipId, donc toucher une piste la recouvrait
/// aussitôt d'une fiche. Directive user 2026-07-27 : le tap surligne, le double
/// tap ouvre.
final class ClipSelectionInspectionTests: XCTestCase {

    func test_select_highlightsWithoutOpeningTheInspector() {
        var state = ClipSelectionState()
        state.select("clip-1")
        XCTAssertEqual(state.selectedClipId, "clip-1")
        XCTAssertNil(state.inspectedClipId, "Un simple tap ne présente rien.")
    }

    func test_inspect_highlightsAndOpens() {
        var state = ClipSelectionState()
        state.inspect("clip-1")
        XCTAssertEqual(state.selectedClipId, "clip-1")
        XCTAssertEqual(state.inspectedClipId, "clip-1")
    }

    /// Invariant dont dépendent les trois resolveur*Snapshot, qui lisent
    /// selectedClipId : dès qu'une fiche est ouverte, les deux coïncident.
    func test_inspectedClip_isAlwaysTheSelectedOne() {
        var state = ClipSelectionState()
        state.inspect("clip-1")
        state.select("clip-2")
        XCTAssertEqual(state.selectedClipId, "clip-2")
        XCTAssertNil(state.inspectedClipId,
                     "Surligner un autre clip referme la fiche du précédent.")
    }

    func test_endInspection_closesButKeepsTheHighlight() {
        var state = ClipSelectionState()
        state.inspect("clip-1")
        state.endInspection()
        XCTAssertNil(state.inspectedClipId)
        XCTAssertEqual(state.selectedClipId, "clip-1",
                       "Fermer la fiche ne doit pas faire perdre à l'utilisateur sa piste.")
    }

    func test_deselect_clearsBoth() {
        var state = ClipSelectionState()
        state.inspect("clip-1")
        state.deselect()
        XCTAssertNil(state.selectedClipId)
        XCTAssertNil(state.inspectedClipId)
    }
}
```

Réécrire `Tests/MeeshyUITests/Timeline/Gesture/DoubleTapSplitTests.swift` : le double tap n'appelle plus `splitSelectedAtPlayhead`. Conserver les cas de découpe eux-mêmes (ils testent le ViewModel, qui ne change pas), et remplacer l'assertion « le double tap découpe » par un test de garde de source sur `VideoClipBar.swift` :

```swift
    /// Le double tap découpait le clip. C'est un geste que l'utilisateur fait
    /// pour ouvrir des réglages, pas pour trancher son média — et il n'était
    /// câblé que sur la vidéo, donc il ne voulait pas dire la même chose d'une
    /// piste à l'autre. La découpe est passée dans la fiche.
    func test_videoClipBar_doubleTap_doesNotSplit() throws {
        let source = try String(contentsOfFile: Self.videoClipBarPath, encoding: .utf8)
        let code = Self.strippingComments(source)
        XCTAssertFalse(code.contains("split"),
                       "Aucun geste de la barre ne doit déclencher une découpe.")
    }

    /// Le glissement lent était avalé : onLongPressGesture s'engageait à 0,4 s
    /// de doigt immobile avant que le drag ne démarre, et .gesture (basse
    /// priorité) cédait au ScrollView horizontal de TimelineScrubArea.
    func test_videoClipBar_dragWinsOverScrollAndHasNoLongPress() throws {
        let source = try String(contentsOfFile: Self.videoClipBarPath, encoding: .utf8)
        let code = Self.strippingComments(source)
        XCTAssertTrue(code.contains("highPriorityGesture"),
                      "Le drag doit gagner l'arbitrage contre le ScrollView parent.")
        XCTAssertFalse(code.contains("onLongPressGesture"),
                       "Le long-press bloquait le glissement lent et faisait doublon avec le tap.")
    }
```

Le helper `strippingComments` retire les lignes commençant par `//` avant l'assertion — sans lui, le commentaire qui *explique* le motif banni le ferait échouer.

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -derivedDataPath /tmp/meeshy-timeline-dd \
  -only-testing:MeeshyUITests/ClipSelectionInspectionTests \
  -only-testing:MeeshyUITests/DoubleTapSplitTests -quiet
```

Attendu : `value of type 'ClipSelectionState' has no member 'inspectedClipId'`.

- [ ] **Step 3: Écrire l'implémentation**

1. `ClipSelectionState.swift` — ajouter le champ et ses mutations :

```swift
    /// Clip dont la FICHE est présentée. Distinct du surlignage : toucher une
    /// piste la surligne, la fiche ne s'ouvre qu'au double tap.
    ///
    /// Invariant : `inspectedClipId != nil ⟹ inspectedClipId == selectedClipId`.
    /// C'est lui qui permet aux resolveur*Snapshot de continuer à lire
    /// `selectedClipId` sans être paramétrés par un id.
    public nonisolated private(set) var inspectedClipId: String?
```

L'ajouter à l'init (`inspectedClipId: String? = nil`), puis :

```swift
    public nonisolated mutating func select(_ clipId: String) {
        selectedClipId = clipId
        inspectedClipId = nil
    }

    public nonisolated mutating func inspect(_ clipId: String) {
        selectedClipId = clipId
        inspectedClipId = clipId
    }

    /// Referme la fiche SANS désélectionner — l'utilisateur retrouve la piste
    /// qu'il consultait, surlignée.
    public nonisolated mutating func endInspection() {
        inspectedClipId = nil
    }

    public nonisolated mutating func deselect() {
        selectedClipId = nil
        inspectedClipId = nil
    }
```

2. `TimelineViewModel.swift` (l. 238) — exposer les deux intentions :

```swift
    public func selectClip(id: String?) {
        if let id { selection.select(id) } else { selection.deselect() }
    }

    /// Ouvre la fiche d'édition d'un clip (double tap sur une piste, tap sur un
    /// marqueur de keyframe ou de transition — trop petits pour exiger un
    /// double tap).
    public func inspectClip(id: String) {
        selection.inspect(id)
    }

    public func endInspection() {
        selection.endInspection()
    }
```

3. Les trois barres — remplacer le bloc de gestes par (identique dans `VideoClipBar`, `AudioClipBar`, `TextClipBar`) :

```swift
        // Le drag AVANT les taps et en haute priorité. En basse priorité
        // (.gesture) il cédait au ScrollView horizontal de TimelineScrubArea ;
        // et le onLongPressGesture qui le précédait s'engageait à 0,4 s de
        // doigt immobile, donc un glissement lent ne démarrait jamais.
        // minimumDistance: 4 laisse passer les taps, qui ne translatent pas.
        .highPriorityGesture(
            DragGesture(minimumDistance: 4)
                .onChanged { v in if !isLocked { onMoveDelta(v.translation.width) } }
                .onEnded { _ in if !isLocked { onMoveEnded() } }
        )
        .onTapGesture(count: 2) { onDoubleTap() }
        .onTapGesture { onTap() }
```

Supprimer la propriété `onLongPress` des trois barres, son paramètre d'init et son assignation.

4. `StoryTimelineView.swift` — pour les quatre familles de barres (média, audio, texte, sticker), remplacer les callbacks par :

```swift
                onTap: { viewModel.selectClip(id: media.id) },
                onDoubleTap: { viewModel.inspectClip(id: media.id) },
```

en supprimant `onLongPress:` et, pour la vidéo, l'appel à `splitSelectedAtPlayhead()`. Substituer `media.id` par `audio.id`, `text.id`, `sticker.id` selon la barre.

5. `LaneKeyframeOverlays.swift` — le marqueur ouvre au tap simple :

```swift
                onTap: { onSelect(marker.keyframeId) },
```

et retirer `onLongPress:`. Côté `StoryTimelineView`, le closure `onSelect` passé à `LaneKeyframeOverlays` appelle `viewModel.inspectClip(id:)` au lieu de `selectClip(id:)`. Faire de même pour le `onTap` de `TransitionBadge`.

6. `TimelineInspectorHost.swift` — la garde de présentation :

```swift
    public static func presentedSelection(viewModel: TimelineViewModel) -> SelectionKind? {
        // La fiche ne s'ouvre QUE sur une intention explicite (double tap sur
        // une piste, tap sur un marqueur). Surligner ne présente rien.
        guard viewModel.selection.inspectedClipId != nil else { return nil }
        switch resolveSelectionKind(viewModel: viewModel) {
        case .clip(let snapshot):
            return shouldShowClipInspector(viewModel: viewModel) ? .clip(snapshot) : nil
        case .some(let kind):
            return kind
        case .none:
            return nil
        }
    }
```

Dans `TimelineInspectorSheetModifier`, la fermeture n'efface plus que l'inspection :

```swift
            set: { if $0 == nil { viewModel.endInspection() } }
```

et les trois `onClose:` des overlays passent de `{ viewModel.selectClip(id: nil) }` à `{ viewModel.endInspection() }`.

7. `TimelineInspectorHost.clipInspectorOverlay` — câbler la découpe, qui quitte le double tap :

```swift
            onSplit: { viewModel.splitSelectedAtPlayhead() },
```

`splitSelectedAtPlayhead()` lit `selection.selectedClipId` : correct sans changement, puisque `inspect(_:)` pose les deux ids.

8. `ClipInspector.swift` — ajouter la propriété `onSplit`, son paramètre d'init (`onSplit: @escaping () -> Void = {}`) et le bouton dans `actionsRow`, avant « Supprimer » :

```swift
                Button(action: onSplit) {
                    Label(String(localized: "story.timeline.inspector.split",
                                 defaultValue: "Diviser", bundle: .module),
                          systemImage: "scissors")
                        .font(.footnote.weight(.semibold))
                        .glassControlForeground()
                        .padding(.horizontal, 14)
                        .frame(height: 36)
                        .adaptiveGlass(in: Capsule(), tint: MeeshyColors.indigo500, interactive: true)
                        .contentShape(Rectangle().inset(by: -4))
                }
                .buttonStyle(.plain)
                .accessibilityHint(String(localized: "story.timeline.inspector.split.hint",
                                          defaultValue: "Coupe le clip à la position de lecture",
                                          bundle: .module))
```

9. Ajouter `story.timeline.inspector.split` et `story.timeline.inspector.split.hint` dans les 7 langues de `Localizable.xcstrings`, et les déclarer dans `TimelineLocalizationTests`.

- [ ] **Step 4: Lancer les tests de la tâche, puis la suite complète**

Même commande qu'au Step 2, puis la suite entière. `ClipDragGestureTests` et `AudioTextDragDriftTests` couvrent le chemin de drag du ViewModel, inchangé — s'ils cassent, c'est que le câblage des barres a dérivé.

- [ ] **Step 5: Vérification simulateur — obligatoire**

Le geste ne se prouve pas en test unitaire. Sur le simulateur (`30BFD3A6-C80B-489D-825E-5D14D6FCCAB5`), ouvrir le composer story via **« Mes stories » → +** (l'anneau « Me » ouvre le lecteur quand une story existe), ajouter deux médias, ouvrir la timeline et vérifier les quatre points :

1. un tap sur une piste la surligne **sans** ouvrir de fiche ;
2. un double tap ouvre la fiche ;
3. un glissement **lent** (poser, marquer un temps, puis glisser) déplace le clip ;
4. le glissement horizontal partant d'une zone vide fait toujours défiler la timeline.

Le point 4 est le risque de `highPriorityGesture` : s'il est perdu, revenir à `simultaneousGesture` et le noter.

- [ ] **Step 6: Commit**

```bash
git add -A packages/MeeshySDK
git commit -m "feat(sdk/timeline): le tap surligne, le double tap ouvre, le glissement déplace

Sélectionner et présenter étaient le même acte — la sheet était pilotée par un
binding sur selectedClipId, donc toucher une piste la recouvrait aussitôt.
ClipSelectionState distingue inspectedClipId, sous l'invariant qu'une fiche
ouverte porte toujours sur le clip surligné : les trois resolveur*Snapshot
continuent de lire selectedClipId sans être touchés.

Le glissement, lui, ne partait pas : onLongPressGesture s'engageait à 0,4 s de
doigt immobile avant le drag, et .gesture cédait au ScrollView horizontal.
Le drag passe en highPriorityGesture et le long-press disparaît — il faisait
doublon avec le tap.

La découpe quitte le double tap pour la fiche : trancher un média n'est pas ce
qu'on attend d'un geste d'ouverture, et elle n'était câblée que sur la vidéo."
```

---

### Task 6: La fiche montre tout, et ses champs se saisissent

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspector.swift:52-85,140-158,296-361,411-506`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineInspectorHost.swift:294-339,440-445`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/ClipInspectorTests.swift`

**Interfaces:**
- Consomme : `setClipStart/End/Duration` (tâche 2), `ClipTimingBar` (tâche 3), `onSplit` (tâche 5).
- Produit : `ClipInspector.visibleSections(kind:isBackground:) -> [Section]` — **sans** les deux paramètres de repli ; `ClipInspector.Section` à six cases ; `onStartSet`, `onEndSet`, `onDurationSet: (Float) -> Void`.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `ClipInspectorTests.swift`, supprimer les quatre tests `test_resolveLinkedTiming_*` (la règle vit dans `ClipWindowResolverTests` depuis la tâche 1) et ajouter :

```swift
    /// Directive user 2026-07-27 : « affiche directement tous les éléments
    /// d'édition dans les fiches d'édition ». Les deux replis (ⓘ et Animation)
    /// cachaient le timing fin et toute la configuration d'animation.
    func test_visibleSections_foregroundVideo_showsEverything() {
        let sections = ClipInspector.visibleSections(kind: .video, isBackground: false)
        XCTAssertEqual(sections, [.header, .timing, .volume, .animation, .toggles, .actions])
    }

    func test_visibleSections_backgroundVideo_hidesTimingKeepsLoop() {
        let sections = ClipInspector.visibleSections(kind: .video, isBackground: true)
        XCTAssertFalse(sections.contains(.timing),
                       "Un fond couvre toute la slide : début et durée y sont sans effet.")
        XCTAssertTrue(sections.contains(.toggles), "La boucle n'existe que pour le fond.")
    }

    func test_visibleSections_text_hasNoVolumeNoToggles() {
        let sections = ClipInspector.visibleSections(kind: .text, isBackground: false)
        XCTAssertFalse(sections.contains(.volume))
        XCTAssertFalse(sections.contains(.toggles))
        XCTAssertTrue(sections.contains(.timing))
    }

    func test_visibleSections_sticker_hasNoVolumeNoToggles() {
        let sections = ClipInspector.visibleSections(kind: .sticker, isBackground: false)
        XCTAssertFalse(sections.contains(.volume))
        XCTAssertFalse(sections.contains(.toggles))
    }

    func test_visibleSections_image_hasNoVolume_butHasBackgroundToggle() {
        let sections = ClipInspector.visibleSections(kind: .image, isBackground: false)
        XCTAssertFalse(sections.contains(.volume), "Une image n'a pas de piste audio.")
        XCTAssertTrue(sections.contains(.toggles))
    }

    /// La section `details` a disparu : elle dupliquait les valeurs que la
    /// section `timing` porte désormais en champs saisissables.
    func test_sectionEnum_hasNoDetailsCase() {
        XCTAssertEqual(ClipInspector.Section.allCases.count, 6)
        XCTAssertFalse(ClipInspector.Section.allCases.map(\.rawValue).contains("details"))
    }

    /// Parser de saisie : l'utilisateur tape « 3,5 » en français et « 3.5 »
    /// ailleurs. Refuser la virgule rendrait le champ inutilisable en France.
    func test_parseSeconds_acceptsBothDecimalSeparators() {
        XCTAssertEqual(ClipInspector.parseSeconds("3.5") ?? -1, 3.5, accuracy: 0.001)
        XCTAssertEqual(ClipInspector.parseSeconds("3,5") ?? -1, 3.5, accuracy: 0.001)
    }

    func test_parseSeconds_rejectsGarbage() {
        XCTAssertNil(ClipInspector.parseSeconds(""))
        XCTAssertNil(ClipInspector.parseSeconds("abc"))
        XCTAssertNil(ClipInspector.parseSeconds("--3"))
    }
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -derivedDataPath /tmp/meeshy-timeline-dd \
  -only-testing:MeeshyUITests/ClipInspectorTests -quiet
```

Attendu : `extra arguments` sur `visibleSections`, `cannot find 'parseSeconds'`.

- [ ] **Step 3: Écrire l'implémentation**

1. Réduire l'enum et la résolution de sections :

```swift
    /// Régions de la fiche, dans l'ordre de rendu. TOUT est visible d'emblée
    /// (directive user 2026-07-27) : les deux replis d'avant — ⓘ pour le
    /// timing fin, « Animation » pour les fondus — cachaient l'essentiel
    /// derrière un tap supplémentaire. `details` a disparu : ses trois valeurs
    /// sont les champs saisissables de `timing`.
    public enum Section: String, CaseIterable, Sendable, Equatable {
        case header, timing, volume, animation, toggles, actions
    }

    public static func visibleSections(kind: ClipSnapshot.Kind,
                                       isBackground: Bool) -> [Section] {
        var sections: [Section] = [.header]
        if !isBackground { sections.append(.timing) }
        if hasAudioAffordances(kind: kind) { sections.append(.volume) }
        sections.append(.animation)
        if supportsLoop(kind: kind, isBackground: isBackground) || supportsBackgroundToggle(kind: kind) {
            sections.append(.toggles)
        }
        sections.append(.actions)
        return sections
    }
```

2. Supprimer `resolveLinkedTiming` et l'enum `TimingField` (la règle vit dans `ClipWindowResolver`), les `@State` `isDetailsExpanded` / `isAnimationExpanded`, le bouton ⓘ du `header`, le bouton « Animation » de `actionsRow` et la propriété `animationToggleLabel`, ainsi que `detailsSection`.

3. Ajouter le parseur et les trois callbacks absolus :

```swift
    /// Secondes saisies au clavier. Accepte les deux séparateurs décimaux :
    /// un champ qui refuse « 3,5 » est inutilisable en français.
    public nonisolated static func parseSeconds(_ text: String) -> Float? {
        let normalized = text.replacingOccurrences(of: ",", with: ".")
        guard let value = Float(normalized), value.isFinite, value >= 0 else { return nil }
        return value
    }

    /// Pose le DÉBUT à une valeur absolue (le clip se déplace).
    public let onStartSet: (Float) -> Void
    /// Pose la FIN à une valeur absolue (le début est préservé).
    public let onEndSet: (Float) -> Void
    /// Pose la DURÉE à une valeur absolue (le début est préservé).
    public let onDurationSet: (Float) -> Void
```

avec les paramètres d'init correspondants (`= { _ in }` par défaut) et leurs assignations.

4. Remplacer `timingSection` par la barre tactile **plus** les trois champs, `metadataRow` et `steppableTimeField` étant retirés :

```swift
    private var timingSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            ClipTimingBar(
                start: clip.startTime,
                duration: clip.duration,
                slideDuration: slideDuration,
                onMoveCommitted: onStartAdjusted,
                onTrimStartCommitted: onStartTrimmed,
                onTrimEndCommitted: onEndAdjusted
            )
            HStack(spacing: 10) {
                timeField(title: String(localized: "story.timeline.inspector.start",
                                        defaultValue: "Début", bundle: .module),
                          value: clip.startTime,
                          onStep: onStartAdjusted, onSet: onStartSet)
                timeField(title: String(localized: "story.timeline.inspector.end",
                                        defaultValue: "Fin", bundle: .module),
                          value: clip.startTime + clip.duration,
                          onStep: onEndAdjusted, onSet: onEndSet)
                timeField(title: String(localized: "story.timeline.inspector.duration",
                                        defaultValue: "Durée", bundle: .module),
                          value: clip.duration,
                          onStep: onDurationAdjusted, onSet: onDurationSet)
            }
        }
    }

    /// Champ de temps : saisissable au clavier ET grignotable par pas de
    /// ±0,1 s. Sans la saisie, poser un début à 3,5 s demandait 35 pressions.
    private func timeField(title: String, value: Float,
                           onStep: @escaping (Float) -> Void,
                           onSet: @escaping (Float) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            TextField("", text: Binding(
                get: { draftTimes[title] ?? String(format: "%.1f", value) },
                set: { draftTimes[title] = $0 }
            ))
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.center)
            .font(.system(.callout, design: .monospaced))
            .monospacedDigit()
            .padding(.vertical, 5)
            .background(RoundedRectangle(cornerRadius: 7)
                .fill(MeeshyColors.indigo500.opacity(0.10)))
            .onSubmit {
                if let parsed = Self.parseSeconds(draftTimes[title] ?? "") { onSet(parsed) }
                draftTimes[title] = nil
            }
            HStack(spacing: 6) {
                stepButton(systemName: "minus.circle.fill") { onStep(-Self.timeStep) }
                Spacer(minLength: 0)
                stepButton(systemName: "plus.circle.fill") { onStep(Self.timeStep) }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title) \(Self.formatTime(seconds: value))")
    }
```

avec `@State private var draftTimes: [String: String] = [:]` — un brouillon par champ, effacé à la validation pour que la valeur affichée redevienne celle du modèle. Le `.adaptiveOnChange(of: clip)` existant doit aussi le vider (`draftTimes.removeAll()`), sinon un undo laisserait le brouillon périmé à l'écran.

5. Rendre `animationConfig` inconditionnellement dans le `body`, et afficher le hint « fond » à la place de `timingSection` quand la section est absente :

```swift
            if sections.contains(.timing) {
                timingSection
            } else {
                backgroundHint
            }
```

`backgroundHint` reprend mot pour mot le `Text` que portait `detailsSection` (clé `story.timeline.inspector.background.hint`), sans son encadré.

6. `TimelineInspectorHost.clipInspectorOverlay` — câbler les trois nouveaux callbacks :

```swift
            onStartSet: { [viewModel] seconds in
                viewModel.setClipStart(id: clipId, to: seconds)
            },
            onEndSet: { [viewModel] seconds in
                viewModel.setClipEnd(id: clipId, to: seconds)
            },
            onDurationSet: { [viewModel] seconds in
                viewModel.setClipDuration(id: clipId, to: seconds)
            },
```

7. Passer la sheet en `presentationDetents([.large])` dans `TimelineInspectorSheetModifier`.

8. Purger de `Localizable.xcstrings` les clés devenues mortes : `story.timeline.inspector.details`, `story.timeline.inspector.details.hint`, `story.timeline.inspector.animation.hint` (les 7 langues), et retirer leurs entrées de `TimelineLocalizationTests`.

- [ ] **Step 4: Lancer les tests de la tâche, puis la suite complète**

Même commande qu'au Step 2, puis la suite entière. `ClipInspectorSnapshotTests` et `TimelineInspectorSheetIdentityTests` changent : ré-enregistrer les baselines.

- [ ] **Step 5: Vérification simulateur**

Double-taper une piste, vérifier que la fiche montre d'un seul tenant : nom, barre tactile, trois champs, volume, fondus, « Animer au playhead », interrupteurs, Diviser et Supprimer — sans aucun repli. Taper « 3,5 » dans le champ Début et valider : le clip se déplace à 3,5 s **sans** changer de durée.

- [ ] **Step 6: Commit**

```bash
git add -A packages/MeeshySDK
git commit -m "feat(sdk/timeline): la fiche montre tout, et ses temps se saisissent

Deux replis — ⓘ et « Animation » — cachaient le timing fin et toute la
configuration d'apparition derrière un tap de plus. Ils disparaissent : les six
sections sont rendues d'emblée. La section details, qui dupliquait les valeurs
de la barre tactile, est absorbée par timing.

Les trois temps deviennent saisissables au clavier, virgule ou point : poser un
début à 3,5 s demandait 35 pressions sur ±0,1 s. Ils appellent les réglages
absolus du view model, donc Début déplace le clip, Fin et Durée l'étirent
depuis son début — la règle que resolveLinkedTiming décrivait sans être
branchée nulle part, et qui vit désormais dans ClipWindowResolver."
```

---

## Self-Review

**Couverture de la spec :**

| Section de la spec | Tâche |
|---|---|
| Bloc 1 — durée dérivée, suppressions, migration du plafond 600 s | 4 (plafond posé en 1) |
| Bloc 2 — `inspectedClipId`, gestes recomposés, split déplacé, marqueurs au tap simple | 5 |
| Bloc 3 — sections dépliées, hint fond relogé, sheet `.large` | 6 |
| Bloc 4 — résolveur, bornes uniques, méthodes absolues, marge d'échelle, saisie directe | 1, 2, 3, 6 |
| Testing — gardes de source, vérification simulateur | 5 (gardes + simu), 6 (simu) |
| Risque « highPriorityGesture mange le scroll » | 5, step 5 point 4 |

**Cohérence des types :** `ClipWindowResolver.Window`/`.Edit`/`.resolve` sont définis en tâche 1 et consommés tels quels en 2 et 3. `setClipStart/End/Duration(id:to:)` sont définis en tâche 2 et appelés en 6 avec la même signature. `inspect(_:)`/`endInspection()` sont définis en 5 et utilisés uniquement là. `previewWindow` perd `slideDuration:` en tâche 3, et aucune tâche ultérieure ne le repasse. `visibleSections(kind:isBackground:)` change de signature en tâche 6, son unique appelant étant le `body` du même fichier.

**Écart assumé avec la spec :** la spec envisageait `ClipTimingBar.previewWindow` conservant `slideDuration`. Le plan le supprime — le paramètre n'a plus aucun usage une fois les bornes déléguées, et le garder serait un argument mort que le prochain lecteur croirait signifiant.
