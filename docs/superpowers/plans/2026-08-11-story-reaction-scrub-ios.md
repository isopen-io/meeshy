# Story Reaction Scrub — iOS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Longpress sur le cœur (et l'icône langue) du rail du viewer de stories iOS → barre immédiate + glissement continu (survol ×1.35 avec rebond, bouton + inclus), sélection au relâchement, animation de vol ≤ 1 s remplaçant la « big reaction », tap cœur = ❤️ direct.

**Architecture:** Hit-testing pur app-side (`StoryScrubSelectionResolver`, testé XCTest) ; `EmojiReactionPicker` (MeeshyUI) et `StoryLanguageQuickBar` (app) étendus par paramètres opaques (`highlightedIndex`, publication des cadres de tuiles via PreferenceKey dans un coordinateSpace nommé) ; gestes séquencés LongPress→Drag sur les boutons du rail dans `+Sidebar` ; vol rendu en Layer canvas à la place de la big reaction.

**Tech Stack:** SwiftUI, XCTest, springs iOS (`.spring(response:dampingFraction:)`), `HapticFeedback`.

**Spec:** `docs/superpowers/specs/2026-08-11-story-reaction-scrub-design.md`

## Global Constraints

- Branche : `feat/story-reaction-scrub`. Commits fréquents, PAS de trailer `Co-Authored-By`, pas de backticks dans `git commit -m`.
- Grossissement survol : ×1.35, `.spring(response: 0.25, dampingFraction: 0.5)`. Longpress : `minimumDuration: 0.25`. Tolérance verticale hit-test : 16 pt. Fermeture barre à la sélection : `.easeOut(duration: 0.12)`. Vol : `.easeInOut(duration: 0.45)`, scale 1.35 → 0.5. Impact : mécanisme `bounceHeart()` existant (`heartScale` 1.35 → 1.0). Budget total < 1 s.
- SDK purity : `EmojiReactionPicker` ne reçoit QUE des paramètres opaques (index, nom d'espace, callback de cadres) — aucun geste, aucune règle produit dans MeeshyUI.
- La « big reaction » (`bigReactionEmoji`/`bigReactionPhase`, emoji 100 pt) est SUPPRIMÉE et remplacée par le vol sur tous les chemins.
- Gates : `./apps/ios/meeshy.sh build` doit passer ; nouveaux tests XCTest verts. Nouveaux fichiers → XcodeGen les ramasse à la régénération (`meeshy.sh build`) ; committer le `project.pbxproj` régénéré UNIQUEMENT si son diff ne référence que les fichiers de cette branche.
- Toutes les commandes depuis la racine du worktree `/Users/smpceo/Documents/v2_meeshy/.claude/worktrees/post-hashtags/`.

---

### Task 1: `StoryScrubSelectionResolver` (pur + tests XCTest)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/StoryScrubSelectionResolver.swift`
- Test: `apps/ios/MeeshyTests/Features/Stories/StoryScrubSelectionResolverTests.swift`

**Interfaces:**
- Produces:
  - `enum StoryScrubSpace { static let name = "storyViewerScrubSpace" }` — nom du coordinateSpace commun (posé Task 5, consommé Tasks 2–4).
  - `enum StoryScrubRelease: Equatable { case select(index: Int); case expand; case keepOpen }`
  - `StoryScrubSelectionResolver.hoveredIndex(tileFrames: [Int: CGRect], point: CGPoint, verticalTolerance: CGFloat) -> Int?`
  - `StoryScrubSelectionResolver.release(hoveredIndex: Int?, tileCount: Int) -> StoryScrubRelease` (le « + » porte l'index `tileCount`).
  - `struct StoryHeartFrameKey: PreferenceKey` (valeur `CGRect`, garde la dernière valeur non-nulle) — publiée par le bouton cœur (Task 4), lue par le viewer (Task 5).

- [ ] **Step 1: Write the failing tests**

```swift
import XCTest
@testable import Meeshy

/// Résolution PURE du survol des barres scrubbables du story viewer :
/// cadres des tuiles + position du doigt → index survolé (bande de tolérance
/// verticale pour qu'un tremblement ne perde pas le survol), et relâchement
/// → action. Pattern StoryGestureDecisions : décision pure, testée isolément.
final class StoryScrubSelectionResolverTests: XCTestCase {

    // Trois tuiles 40×40 côte à côte à y=100, puis la tuile « + » (index 3).
    private let frames: [Int: CGRect] = [
        0: CGRect(x: 0, y: 100, width: 40, height: 40),
        1: CGRect(x: 44, y: 100, width: 40, height: 40),
        2: CGRect(x: 88, y: 100, width: 40, height: 40),
        3: CGRect(x: 132, y: 100, width: 40, height: 40),
    ]

    private func hovered(_ x: CGFloat, _ y: CGFloat) -> Int? {
        StoryScrubSelectionResolver.hoveredIndex(
            tileFrames: frames, point: CGPoint(x: x, y: y), verticalTolerance: 16)
    }

    func test_hoveredIndex_insideTile_hoversIt() {
        XCTAssertEqual(hovered(60, 120), 1)
    }

    func test_hoveredIndex_slightlyAbove_staysWithinToleranceBand() {
        XCTAssertEqual(hovered(60, 90), 1)
    }

    func test_hoveredIndex_slightlyBelow_staysWithinToleranceBand() {
        XCTAssertEqual(hovered(60, 150), 1)
    }

    func test_hoveredIndex_beyondToleranceBand_hoversNothing() {
        XCTAssertNil(hovered(60, 200))
    }

    func test_hoveredIndex_horizontallyOutside_hoversNothing() {
        XCTAssertNil(hovered(500, 120))
    }

    func test_hoveredIndex_emptyFrames_hoversNothing() {
        XCTAssertNil(StoryScrubSelectionResolver.hoveredIndex(
            tileFrames: [:], point: CGPoint(x: 60, y: 120), verticalTolerance: 16))
    }

    func test_release_overTile_selectsIt() {
        XCTAssertEqual(StoryScrubSelectionResolver.release(hoveredIndex: 1, tileCount: 3), .select(index: 1))
    }

    func test_release_overTrailingPlus_expands() {
        XCTAssertEqual(StoryScrubSelectionResolver.release(hoveredIndex: 3, tileCount: 3), .expand)
    }

    func test_release_outsideEveryTile_keepsBarOpen() {
        XCTAssertEqual(StoryScrubSelectionResolver.release(hoveredIndex: nil, tileCount: 3), .keepOpen)
    }

    func test_release_outOfRangeIndex_keepsBarOpen() {
        XCTAssertEqual(StoryScrubSelectionResolver.release(hoveredIndex: 9, tileCount: 3), .keepOpen)
    }
}
```

- [ ] **Step 2: Créer le fichier source, puis vérifier l'échec de compilation des tests SANS l'implémentation** (le fichier doit exister pour que XcodeGen le référence)

Créer `StoryScrubSelectionResolver.swift` avec UNIQUEMENT le squelette vide (`enum StoryScrubSpace { static let name = "storyViewerScrubSpace" }`), lancer :

Run: `./apps/ios/meeshy.sh test 2>&1 | tail -20` (ou la variante ciblée si le script la supporte : `xcodebuild test -only-testing:MeeshyTests/StoryScrubSelectionResolverTests` avec le scheme du projet — voir `meeshy.sh` pour le scheme exact)
Expected: FAIL (unresolved `StoryScrubSelectionResolver`)

- [ ] **Step 3: Write the implementation**

```swift
import SwiftUI

/// Espace de coordonnées commun du système scrub du story viewer : posé sur le
/// ZStack racine du canvas, il aligne les cadres publiés par les tuiles des
/// barres, la position du doigt du DragGesture et le rendu du vol.
nonisolated enum StoryScrubSpace {
    static let name = "storyViewerScrubSpace"
}

/// Ce que le relâchement du doigt en fin de scrub résout.
nonisolated enum StoryScrubRelease: Equatable {
    /// Relâché sur une tuile — la sélectionner.
    case select(index: Int)
    /// Relâché sur la tuile « + » — ouvrir le picker complet.
    case expand
    /// Relâché hors de toute tuile — la barre reste ouverte en mode posé.
    case keepOpen
}

/// Hit-testing PUR des barres scrubbables (réactions, langues) : les tuiles
/// publient leurs cadres dans `StoryScrubSpace` ; la position du doigt est
/// d'abord matchée exactement, puis dans une bande de tolérance verticale pour
/// qu'une petite dérive au-dessus/au-dessous de la barre ne perde jamais le
/// survol. Pur et sans effet de bord — testé isolément (pattern
/// StoryGestureDecisions).
nonisolated struct StoryScrubSelectionResolver {

    static func hoveredIndex(
        tileFrames: [Int: CGRect],
        point: CGPoint,
        verticalTolerance: CGFloat
    ) -> Int? {
        if let exact = tileFrames.first(where: { $0.value.contains(point) })?.key {
            return exact
        }
        return tileFrames
            .filter { _, frame in
                point.x >= frame.minX && point.x < frame.maxX
                    && point.y >= frame.minY - verticalTolerance
                    && point.y < frame.maxY + verticalTolerance
            }
            .min { abs(point.y - $0.value.midY) < abs(point.y - $1.value.midY) }?
            .key
    }

    /// La tuile « + » porte l'index `tileCount` (juste après la dernière tuile).
    static func release(hoveredIndex: Int?, tileCount: Int) -> StoryScrubRelease {
        guard let hoveredIndex else { return .keepOpen }
        if hoveredIndex == tileCount { return .expand }
        guard (0..<tileCount).contains(hoveredIndex) else { return .keepOpen }
        return .select(index: hoveredIndex)
    }
}

/// Cadre du bouton cœur dans `StoryScrubSpace` — cible du vol de réaction.
/// Publié par le bouton (Sidebar), lu par le viewer pour l'overlay de vol.
nonisolated struct StoryHeartFrameKey: PreferenceKey {
    nonisolated static let defaultValue: CGRect = .zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) {
        let next = nextValue()
        if next != .zero { value = next }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./apps/ios/meeshy.sh test 2>&1 | tail -20` (vérifier la ligne des `StoryScrubSelectionResolverTests` — 10 tests)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryScrubSelectionResolver.swift apps/ios/MeeshyTests/Features/Stories/StoryScrubSelectionResolverTests.swift
git commit -m 'feat(ios/stories): resolver pur de survol scrub + espace de coordonnees partage'
```

---

### Task 2: `EmojiReactionPicker` scrubbable (MeeshyUI, paramètres opaques)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmojiReactionPicker.swift`

**Interfaces:**
- Produces:
  - `public struct ScrubTileFramesKey: PreferenceKey` (`[Int: CGRect]`, merge) — réutilisée par Task 3.
  - `EmojiReactionPicker` : nouveaux paramètres publics `highlightedIndex: Int? = nil`, `scrubFrameSpace: String? = nil`, `onTileFrames: (([Int: CGRect]) -> Void)? = nil`. Le « + » porte l'index `quickEmojis.count`. Les appels existants compilent sans changement.

- [ ] **Step 1: Ajouter la PreferenceKey publique** (au-dessus de `EmojiReactionPicker`) :

```swift
/// Cadres des tuiles d'une barre scrubbable, indexés par position (le « + »
/// terminal porte l'index `count`). Publiés dans le coordinateSpace nommé
/// fourni par l'appelant via `scrubFrameSpace` — le SDK reste agnostique :
/// il publie des cadres, l'app décide quoi en faire (hit-testing du scrub).
public struct ScrubTileFramesKey: PreferenceKey {
    public static let defaultValue: [Int: CGRect] = [:]
    public static func reduce(value: inout [Int: CGRect], nextValue: () -> [Int: CGRect]) {
        value.merge(nextValue()) { _, new in new }
    }
}
```

- [ ] **Step 2: Étendre `EmojiReactionPicker`**

Propriétés + init (ajouter APRÈS `onExpandFullPicker` pour ne pas casser les appels positionnels existants) :

```swift
    /// Index de la tuile survolée par le scrub (piloté par l'app) — ×1.35 rebond.
    public var highlightedIndex: Int?
    /// Nom du coordinateSpace dans lequel publier les cadres des tuiles.
    public var scrubFrameSpace: String?
    /// Reçoit les cadres publiés (index → cadre, « + » inclus).
    public var onTileFrames: (([Int: CGRect]) -> Void)?

    public init(
        quickEmojis: [String] = ["❤️", "😂", "😮", "🔥", "😢", "👏"],
        style: Style = .dark,
        scale: CGFloat = 1.0,
        scrollable: Bool = false,
        onReact: ((String) -> Void)? = nil,
        onDismiss: (() -> Void)? = nil,
        onExpandFullPicker: (() -> Void)? = nil,
        highlightedIndex: Int? = nil,
        scrubFrameSpace: String? = nil,
        onTileFrames: (([Int: CGRect]) -> Void)? = nil
    ) {
        self.quickEmojis = quickEmojis; self.style = style; self.scale = scale
        self.scrollable = scrollable
        self.onReact = onReact; self.onDismiss = onDismiss
        self.onExpandFullPicker = onExpandFullPicker
        self.highlightedIndex = highlightedIndex
        self.scrubFrameSpace = scrubFrameSpace
        self.onTileFrames = onTileFrames
    }
```

Dans `body`, après le `.onAppear` existant :

```swift
        .onPreferenceChange(ScrubTileFramesKey.self) { frames in
            onTileFrames?(frames)
        }
```

Tuile emoji (`emojiList`) — remplacer le label du Button :

```swift
                Button {
                    reactToEmoji(emoji)
                } label: {
                    Text(emoji)
                        .font(.system(size: (reactedEmoji == emoji ? 28 : 22) * scale))
                        .scaleEffect(tileScale(for: index, reactedTo: emoji))
                        .animation(.spring(response: 0.25, dampingFraction: 0.5), value: reactedEmoji)
                        .animation(.spring(response: 0.25, dampingFraction: 0.5), value: highlightedIndex)
                        .background(tileFrameReader(index: index))
                }
```

`expandButton` — mêmes ajouts sur le `ZStack` du label :

```swift
                ZStack {
                    Circle()
                        .fill(style == .dark ? Color.white.opacity(0.15) : Color.gray.opacity(0.15))
                        .frame(width: 32 * scale, height: 32 * scale)
                    Image(systemName: "plus")
                        .font(.system(size: 14 * scale, weight: .bold))
                        .foregroundColor(style == .dark ? .white.opacity(0.8) : .gray)
                }
                .scaleEffect(highlightedIndex == quickEmojis.count ? 1.35 : 1.0)
                .animation(.spring(response: 0.25, dampingFraction: 0.5), value: highlightedIndex)
                .background(tileFrameReader(index: quickEmojis.count))
```

Helpers privés (sous `reactToEmoji`) :

```swift
    private func tileScale(for index: Int, reactedTo emoji: String) -> CGFloat {
        if highlightedIndex == index { return 1.35 }
        return reactedEmoji == emoji ? 1.3 : 1.0
    }

    @ViewBuilder
    private func tileFrameReader(index: Int) -> some View {
        if let scrubFrameSpace {
            GeometryReader { proxy in
                Color.clear.preference(
                    key: ScrubTileFramesKey.self,
                    value: [index: proxy.frame(in: .named(scrubFrameSpace))]
                )
            }
        }
    }
```

- [ ] **Step 3: Build SDK**

Run: `cd packages/MeeshySDK && swift build && cd ../..`
Expected: Build complete (les appels existants — MessageOverlayMenu, story sidebar — ne passent pas les nouveaux paramètres et compilent par défauts)

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmojiReactionPicker.swift
git commit -m 'feat(ios/sdk-ui): EmojiReactionPicker scrubbable (survol + publication des cadres, parametres opaques)'
```

---

### Task 3: `StoryLanguageQuickBar` scrubbable

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryLanguageQuickBar.swift`

**Interfaces:**
- Consumes: `ScrubTileFramesKey` (Task 2, `import MeeshyUI` déjà présent).
- Produces: `StoryLanguageQuickBar` — nouveaux paramètres `highlightedIndex: Int? = nil`, `scrubFrameSpace: String? = nil`, `onTileFrames: (([Int: CGRect]) -> Void)? = nil`. Le « + » porte l'index `languages.count`. Consommé par Task 4.

- [ ] **Step 1: Étendre la struct**

Ajouter les propriétés (avec défauts, donc appel existant intact) :

```swift
    /// Index de la pastille survolée par le scrub (« + » = languages.count).
    var highlightedIndex: Int? = nil
    /// CoordinateSpace nommé dans lequel publier les cadres des pastilles.
    var scrubFrameSpace: String? = nil
    /// Reçoit les cadres publiés (hit-testing du scrub côté sidebar).
    var onTileFrames: (([Int: CGRect]) -> Void)? = nil
```

Dans `body`, sur le `Group` (avant `.quickReactionStripChrome`) :

```swift
        .onPreferenceChange(ScrubTileFramesKey.self) { frames in
            onTileFrames?(frames)
        }
```

`chip(_:)` — le label du Button devient (ajouts `scaleEffect`/`animation`/`background`) :

```swift
        } label: {
            Text(language.flag)
                .font(.system(size: 22))
                .opacity(isActive ? 1 : 0.55)
                .overlay(alignment: .bottom) {
                    Capsule()
                        .fill(MeeshyColors.indigo400)
                        .frame(width: 14, height: 2)
                        .opacity(isActive ? 1 : 0)
                        .offset(y: 3)
                }
                .scaleEffect(highlightedIndex == index(of: language) ? 1.35 : 1.0)
                .animation(.spring(response: 0.25, dampingFraction: 0.5), value: highlightedIndex)
                .background(tileFrameReader(index: index(of: language)))
        }
```

`plusChip` — sur le `ZStack` du label :

```swift
            .scaleEffect(highlightedIndex == languages.count ? 1.35 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.5), value: highlightedIndex)
            .background(tileFrameReader(index: languages.count))
```

Helpers privés :

```swift
    private func index(of language: TranslationLanguage) -> Int {
        languages.firstIndex(where: { $0.id == language.id }) ?? -1
    }

    @ViewBuilder
    private func tileFrameReader(index: Int) -> some View {
        if let scrubFrameSpace {
            GeometryReader { proxy in
                Color.clear.preference(
                    key: ScrubTileFramesKey.self,
                    value: [index: proxy.frame(in: .named(scrubFrameSpace))]
                )
            }
        }
    }
```

- [ ] **Step 2: Build**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -5`
Expected: BUILD SUCCEEDED

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryLanguageQuickBar.swift
git commit -m 'feat(ios/stories): StoryLanguageQuickBar scrubbable (survol + cadres publies)'
```

---

### Task 4: Sidebar — tap ❤️ direct + gestes de scrub sur cœur et langue

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift`

**Interfaces:**
- Consumes: `StoryScrubSelectionResolver`, `StoryScrubRelease`, `StoryScrubSpace`, `StoryHeartFrameKey` (Task 1) ; pickers étendus (Tasks 2–3).
- Produces / modifie le contrat de `StoryActionSidebarView` (câblage Task 5) :
  - `let triggerStoryReaction: (String, CGRect?) -> Void` (signature ÉTENDUE — le second paramètre est le cadre de départ du vol dans `StoryScrubSpace`, `nil` = départ du cœur)
  - `let onScrubStateChanged: (Bool) -> Void` (nouveau — vrai pendant un scrub, pilote la pause du timer)

- [ ] **Step 1: Étendre les paramètres de `StoryActionSidebarView`**

Remplacer `let triggerStoryReaction: (String) -> Void` par :

```swift
    /// Envoie la réaction ; le CGRect est le cadre (dans StoryScrubSpace) de la
    /// tuile d'origine du vol — nil = pop sur place depuis le cœur (tap direct).
    let triggerStoryReaction: (String, CGRect?) -> Void
    /// Vrai pendant un scrub longpress→drag sur le rail (pause le timer,
    /// neutralise la navigation du canvas).
    let onScrubStateChanged: (Bool) -> Void
```

Nouveaux `@State` (sous `heartScale`) :

```swift
    @State private var scrubHoveredReactionIndex: Int?
    @State private var scrubHoveredLanguageIndex: Int?
    @State private var reactionTileFrames: [Int: CGRect] = [:]
    @State private var languageTileFrames: [Int: CGRect] = [:]
    @State private var isScrubbingReactions = false
    @State private var isScrubbingLanguages = false
```

- [ ] **Step 2: Gestes séquencés** (nouvelles computed vars privées, sous `bounceHeart()`) :

```swift
    /// Longpress (0.25 s) → la barre surgit → drag continu SANS lever le doigt :
    /// survol des tuiles (×1.35 rebond via highlightedIndex), sélection au
    /// relâchement. Posé en `.highPriorityGesture` sur le bouton : un tap court
    /// (< 0.25 s) fait échouer le longpress et laisse le Button réagir
    /// normalement ; un longpress capture la séquence — le canvas ne voit rien,
    /// le swipe de navigation est donc structurellement neutralisé.
    private var reactionScrubGesture: some Gesture {
        LongPressGesture(minimumDuration: 0.25)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .named(StoryScrubSpace.name)))
            .onChanged { value in
                switch value {
                case .first(true):
                    guard !isScrubbingReactions else { return }
                    isScrubbingReactions = true
                    onScrubStateChanged(true)
                    HapticFeedback.light()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        showEmojiStrip = true
                    }
                case .second(true, let drag):
                    guard let drag else { return }
                    let hovered = StoryScrubSelectionResolver.hoveredIndex(
                        tileFrames: reactionTileFrames,
                        point: drag.location,
                        verticalTolerance: 16)
                    if hovered != scrubHoveredReactionIndex { HapticFeedback.light() }
                    scrubHoveredReactionIndex = hovered
                default:
                    break
                }
            }
            .onEnded { _ in
                let hovered = scrubHoveredReactionIndex
                isScrubbingReactions = false
                onScrubStateChanged(false)
                scrubHoveredReactionIndex = nil
                switch StoryScrubSelectionResolver.release(hoveredIndex: hovered, tileCount: quickEmojis.count) {
                case .select(let index):
                    triggerStoryReaction(quickEmojis[index], reactionTileFrames[index])
                case .expand:
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        showEmojiStrip = false
                        showFullEmojiPicker = true
                    }
                case .keepOpen:
                    break // la barre reste ouverte en mode posé (tap possible)
                }
            }
    }

    /// Même mécanique pour la barre de langues (relâchement = sélection de la
    /// langue ; « + » = liste complète ; hors barre = barre posée).
    private var languageScrubGesture: some Gesture {
        LongPressGesture(minimumDuration: 0.25)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .named(StoryScrubSpace.name)))
            .onChanged { value in
                switch value {
                case .first(true):
                    guard !isScrubbingLanguages else { return }
                    isScrubbingLanguages = true
                    onScrubStateChanged(true)
                    HapticFeedback.light()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showLanguageOptions = true
                    }
                case .second(true, let drag):
                    guard let drag else { return }
                    let hovered = StoryScrubSelectionResolver.hoveredIndex(
                        tileFrames: languageTileFrames,
                        point: drag.location,
                        verticalTolerance: 16)
                    if hovered != scrubHoveredLanguageIndex { HapticFeedback.light() }
                    scrubHoveredLanguageIndex = hovered
                default:
                    break
                }
            }
            .onEnded { _ in
                let hovered = scrubHoveredLanguageIndex
                isScrubbingLanguages = false
                onScrubStateChanged(false)
                scrubHoveredLanguageIndex = nil
                switch StoryScrubSelectionResolver.release(hoveredIndex: hovered, tileCount: availableTranslationLanguages.count) {
                case .select(let index):
                    onSelectLanguageOverride(availableTranslationLanguages[index].id)
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        showLanguageOptions = false
                    }
                case .expand:
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        showLanguageOptions = false
                        showFullLanguagePicker = true
                    }
                case .keepOpen:
                    break
                }
            }
    }
```

- [ ] **Step 3: Bouton cœur — tap = ❤️ direct, gestes, cadre publié**

Dans `sidebarContent(spacing:)`, remplacer l'action du bouton cœur (bloc `railPlan.showsReact`, action lignes ~311-313) et enrichir la chaîne de modifieurs :

```swift
                StoryActionButton(
                    icon: "heart.fill",
                    label: storyReactionCount > 0 ? "\(storyReactionCount)" : String(localized: "story.viewer.action.react", defaultValue: "Réagir", bundle: .main),
                    isActive: showEmojiStrip || storyCurrentUserHasReacted,
                    activeColor: MeeshyColors.indigo500,
                    activeGlow: MeeshyColors.indigo500,
                    accentOutline: storyCurrentUserHasReacted ? "heart" : nil,
                    accentOutlineColor: Color(hex: currentGroup?.avatarColor ?? "FF2D55")
                ) {
                    // Tap court = ❤️ immédiat (pattern Instagram/WhatsApp) —
                    // la barre s'ouvre désormais au LONGPRESS (scrub).
                    triggerStoryReaction("❤️", nil)
                }
                .highPriorityGesture(reactionScrubGesture)
                .background(
                    GeometryReader { proxy in
                        Color.clear.preference(
                            key: StoryHeartFrameKey.self,
                            value: proxy.frame(in: .named(StoryScrubSpace.name))
                        )
                    }
                )
                .scaleEffect(heartScale)
```

(le `.adaptiveOnChange(of: heartBouncePulse)`, l'overlay et le `.zIndex(10)` existants restent inchangés)

Dans l'overlay `EmojiReactionPicker`, passer les nouveaux paramètres et router le tap posé par le vol :

```swift
                        EmojiReactionPicker(
                            quickEmojis: quickEmojis,
                            style: .dark,
                            onReact: { emoji in
                                let index = quickEmojis.firstIndex(of: emoji)
                                triggerStoryReaction(emoji, index.flatMap { reactionTileFrames[$0] })
                            },
                            onDismiss: {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                    showEmojiStrip = false
                                }
                            },
                            onExpandFullPicker: {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                    showEmojiStrip = false
                                    showFullEmojiPicker = true
                                }
                            },
                            highlightedIndex: scrubHoveredReactionIndex,
                            scrubFrameSpace: StoryScrubSpace.name,
                            onTileFrames: { reactionTileFrames = $0 }
                        )
```

- [ ] **Step 4: Bouton langue — geste + paramètres du quick bar**

Sur le `StoryActionButton` du bloc `railPlan.showsTranslations` (le tap existant `showLanguageOptions.toggle()` est CONSERVÉ), ajouter après l'action :

```swift
                .highPriorityGesture(languageScrubGesture)
```

et dans l'overlay, étendre l'appel `StoryLanguageQuickBar` :

```swift
                        StoryLanguageQuickBar(
                            languages: availableTranslationLanguages,
                            activeLanguageCode: activeLanguageCode ?? displayedLanguageCode,
                            onSelect: { lang in
                                onSelectLanguageOverride(lang)
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                    showLanguageOptions = false
                                }
                            },
                            onOpenFullPicker: {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                    showLanguageOptions = false
                                    showFullLanguagePicker = true
                                }
                            },
                            highlightedIndex: scrubHoveredLanguageIndex,
                            scrubFrameSpace: StoryScrubSpace.name,
                            onTileFrames: { languageTileFrames = $0 }
                        )
```

- [ ] **Step 5: Build** (le projet ne compile PAS encore — le call site de `StoryActionSidebarView` dans +Canvas n'est pas à jour ; c'est attendu). Vérifier seulement la syntaxe du fichier :

Run: `./apps/ios/meeshy.sh build 2>&1 | grep -E 'error|BUILD' | head -20`
Expected: erreurs UNIQUEMENT sur le call site `StoryActionSidebarView(...)` (+Canvas) — arguments manquants. Aucune autre erreur.

- [ ] **Step 6: PAS de commit ici** — le repo ne compile pas tant que le call site (+Canvas) n'est pas adapté. `+Sidebar.swift` part dans le commit de la Task 5 (chaque commit laisse le codebase compilable).

---

### Task 5: Viewer — vol de réaction, suppression big reaction, pause, câblage

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/StoryReactionFlightView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` (états, `triggerStoryReaction`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift` (coordinateSpace, Layer 9, câblage sidebar)
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift` (`shouldPauseTimer`)

**Interfaces:**
- Consumes: `StoryScrubSpace`, `StoryHeartFrameKey` (Task 1), contrat sidebar étendu (Task 4).
- Produces: `struct StoryReactionFlight: Equatable, Identifiable { let id: UUID; let emoji: String; let from: CGRect }`, états `reactionFlight`, `heartFrame`, `isScrubbingRail` sur `StoryViewerView` (accès `internal` pour les extensions +Canvas/+Content).

- [ ] **Step 1: Nouveau fichier `StoryReactionFlightView.swift`**

```swift
import SwiftUI

/// Une réaction en vol : l'emoji quitte sa tuile agrandie et rejoint le cœur.
nonisolated struct StoryReactionFlight: Equatable, Identifiable {
    let id: UUID
    let emoji: String
    /// Cadre de départ dans `StoryScrubSpace` (tuile survolée, ou cœur pour un tap direct).
    let from: CGRect

    init(emoji: String, from: CGRect) {
        self.id = UUID()
        self.emoji = emoji
        self.from = from
    }
}

/// Rendu du vol (remplace la « big reaction » 100 pt) : position animée
/// tuile → cœur en ~0.45 s pendant que l'emoji rétrécit 1.35 → 0.5 ; à
/// l'arrivée le cœur rebondit (bounceHeart existant, via onArrived →
/// heartBouncePulse) et l'overlay s'efface ~0.3 s plus tard. Budget < 1 s.
/// Rendu dans le ZStack du canvas qui porte `StoryScrubSpace` — ses
/// coordonnées locales SONT l'espace des cadres publiés.
struct StoryReactionFlightView: View {
    let flight: StoryReactionFlight
    let target: CGRect
    let onArrived: () -> Void
    let onFinished: () -> Void

    @State private var progress: CGFloat = 0

    var body: some View {
        let from = CGPoint(x: flight.from.midX, y: flight.from.midY)
        let to = CGPoint(x: target.midX, y: target.midY)
        Text(flight.emoji)
            .font(.system(size: 28))
            .scaleEffect(1.35 + (0.5 - 1.35) * progress)
            .position(
                x: from.x + (to.x - from.x) * progress,
                y: from.y + (to.y - from.y) * progress
            )
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .onAppear {
                withAnimation(.easeInOut(duration: 0.45)) { progress = 1 }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { onArrived() }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.75) { onFinished() }
            }
    }
}
```

- [ ] **Step 2: `StoryViewerView.swift` — états et `triggerStoryReaction`**

Supprimer les `@State` `bigReactionEmoji` et `bigReactionPhase` (déclarés près de `heartBouncePulse`, zone ligne ~1285 — chercher `bigReaction` dans le fichier). Ajouter à leur place :

```swift
    /// Réaction en vol vers le cœur (remplace la big reaction 100 pt).
    @State var reactionFlight: StoryReactionFlight?
    /// Cadre du bouton cœur dans StoryScrubSpace (cible du vol).
    @State var heartFrame: CGRect = .zero
    /// Scrub longpress→drag en cours sur le rail (pause le timer).
    @State var isScrubbingRail = false
```

(`internal` — les extensions +Canvas/+Content y accèdent.)

Remplacer intégralement `triggerStoryReaction(_:)` (lignes ~1559-1619) :

```swift
    func triggerStoryReaction(_ emoji: String, from originFrame: CGRect? = nil) {
        HapticFeedback.medium()

        if showFullEmojiPicker {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                showFullEmojiPicker = false
            }
        }
        // La barre disparaît VITE (~120 ms) pour laisser la scène au vol
        // (spec scrub 2026-08-11) — l'ancien écho de 0.5 s est supprimé.
        withAnimation(.easeOut(duration: 0.12)) {
            showEmojiStrip = false
        }

        // Vol tuile → cœur ; un tap direct (originFrame nil) part du cœur
        // lui-même : le vol dégénère en pop sur place, même chemin de code.
        let origin = originFrame ?? heartFrame
        reactionFlight = StoryReactionFlight(emoji: emoji, from: origin)

        // Snapshot capturé AVANT la mutation optimiste — cible du rollback si
        // le réseau échoue (409 REACTION_LIMIT_REACHED notamment).
        let priorReactions = storyCurrentUserReactions
        let priorCount = storyReactionCount

        if !storyCurrentUserReactions.contains(emoji) {
            storyCurrentUserReactions.append(emoji)
            storyReactionCount += 1
        }
        sendReaction(emoji: emoji, priorReactions: priorReactions, priorCount: priorCount)
    }
```

NOTE : `heartBouncePulse` n'est PLUS tiqué ici — il tique à l'ARRIVÉE du vol (Step 3), c'est l'impact qui fait rebondir le cœur. Mettre à jour tous les call sites de `triggerStoryReaction` dans le fichier (recherche globale) vers la nouvelle signature — notamment le `EmojiFullPickerSheet` du canvas (`onReact: triggerStoryReaction` devient `onReact: { triggerStoryReaction($0) }`).

- [ ] **Step 3: `+Canvas.swift` — coordinateSpace, Layer 9, câblage**

1. Sur le ZStack racine du canvas (celui qui contient les Layers — repérer le conteneur des `// === Layer N`), ajouter :

```swift
        .coordinateSpace(name: StoryScrubSpace.name)
        .onPreferenceChange(StoryHeartFrameKey.self) { heartFrame = $0 }
```

2. Remplacer le Layer 9 (bloc `if let emoji = bigReactionEmoji { ... }`, lignes ~1839-1853) :

```swift
            // === Layer 9: Reaction flight (tuile agrandie → cœur, ≤ 1 s) ===
            if let flight = reactionFlight {
                StoryReactionFlightView(
                    flight: flight,
                    target: heartFrame,
                    onArrived: { heartBouncePulse += 1 },
                    onFinished: { reactionFlight = nil }
                )
                .zIndex(50)
            }
```

3. Call site `StoryActionSidebarView(...)` (ligne ~1770) : adapter les deux paramètres —

```swift
                    triggerStoryReaction: { emoji, frame in
                        triggerStoryReaction(emoji, from: frame)
                    },
                    onScrubStateChanged: { isScrubbingRail = $0 },
```

(placer `onScrubStateChanged` juste après `triggerStoryReaction` dans l'ordre des paramètres de la struct ET du call site ; si `triggerStoryReaction` est transmis via des vues intermédiaires — `StoryCardView` —, propager la signature `(String, CGRect?) -> Void` et la nouvelle closure `onScrubStateChanged: (Bool) -> Void` à travers les mêmes couches, en suivant le chemin du paramètre existant.)

4. Chercher toute autre référence à `bigReactionEmoji`/`bigReactionPhase` dans +Canvas/+Content/StoryViewerView et les supprimer (recherche : `grep -rn 'bigReaction' apps/ios/Meeshy/`).

- [ ] **Step 4: `+Content.swift` — pause**

Dans `shouldPauseTimer` (ligne ~736), ajouter deux termes à l'agrégat :

```swift
        || isScrubbingRail
        || reactionFlight != nil
```

(juste après `|| showFullLanguagePicker`, avec le commentaire : `// Scrub du rail + vol de réaction : la lecture attend la fin du geste et de l'animation (spec scrub 2026-08-11).`)

- [ ] **Step 5: Build + tests complets**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -5` puis `./apps/ios/meeshy.sh test 2>&1 | tail -20`
Expected: BUILD SUCCEEDED ; tous les tests verts (dont `StoryScrubSelectionResolverTests`). Si `grep -rn 'bigReaction' apps/ios/Meeshy/` retourne encore des hits → les traiter avant de committer.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift apps/ios/Meeshy/Features/Main/Views/StoryReactionFlightView.swift apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift
git commit -m 'feat(ios/stories): tap coeur direct, scrub longpress, vol de reaction, big reaction retiree'
```

(ajouter `apps/ios/Meeshy.xcodeproj/project.pbxproj` à ce commit UNIQUEMENT si son diff ne référence que `StoryScrubSelectionResolver.swift`, `StoryReactionFlightView.swift` et `StoryScrubSelectionResolverTests.swift`)

---

### Task 6: Vérification comportementale sur simulateur

- [ ] **Step 1: Lancer l'app** — `./apps/ios/meeshy.sh run` (simulateur iPhone 16 Pro, UDID `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5`), compte de test dans `apps/ios/fastlane/.env`.

- [ ] **Step 2: Scénarios** (story d'un AUTRE utilisateur) :
1. Tap court sur le cœur → pop ❤️ sur le cœur + bump + compteur +1, AUCUNE barre.
2. Longpress cœur → barre immédiate + haptique ; glisser sans lever : chaque emoji grossit (rebond) au survol et rétrécit en le quittant ; le « + » grossit pareil.
3. Relâcher sur un emoji → la barre disparaît vite, l'emoji vole vers le cœur en rétrécissant, le cœur rebondit ; total ≤ 1 s ; compteur +1.
4. Relâcher sur « + » → picker plein écran ; choisir un emoji → pop sur le cœur + bump + compteur.
5. Relâcher hors barre → barre posée ; tap sur une tuile → sélection + vol ; tap ailleurs → fermeture.
6. Pendant le longpress+drag : la story ne swipe PAS (gauche/droite inertes), timer en pause.
7. Longpress icône langue → barre de drapeaux, survol grossit, relâchement = langue appliquée + badge mis à jour ; tap court langue = toggle barre (inchangé).

- [ ] **Step 3: Rapport** — noter tout écart et le corriger avant de conclure la tâche.
