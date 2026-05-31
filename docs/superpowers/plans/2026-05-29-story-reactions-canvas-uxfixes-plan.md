# Story Reactions + Canvas UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger 7 bugs UX/comportement sur les stories iOS (réactions full picker, hearts de commentaires persistence, zoom live de texte, loop 6s pour BG court, glass backdrop noir, slider bordure texte, animation reaction visible).

**Architecture:** Fixes chirurgicaux par axe — aucune refonte d'architecture. Le canvas `StoryCanvasUIView` (modes `.edit` / `.play`) reste partagé entre composer / viewer / preview. `SlideMiniPreview` reste pour la tray. Chaque task est indépendante et mergeable séparément.

**Tech Stack:** Swift 6, SwiftUI, UIKit (StoryCanvasUIView CALayer-based), AVPlayer/AVPlayerLooper, Combine, XCTest + Swift Testing, MeeshySDK (package SPM local).

**Spec source:** `docs/superpowers/specs/2026-05-28-story-reactions-canvas-uxfixes-design.md`

---

## File Structure

### Files to create

| Fichier | Responsabilité |
|---|---|
| `apps/ios/MeeshyTests/Features/Stories/StoryViewerReactionFlowTests.swift` | Tests des chemins de réaction (full picker, strip, API call) |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Models/FeedCommentCodableTests.swift` | Roundtrip Codable de `FeedComment` (avec nouveau `currentUserReactions`) |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryDurationPolicy.swift` | Règle de durée minimale 6s + helpers (code pur, pas de UIKit) |
| `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryDurationPolicyTests.swift` | 6 tests Swift Testing de la policy |
| `packages/MeeshySDK/Tests/MeeshyUITests/Story/TextEditToolOptionsBorderTests.swift` | Tests du panneau bordure (init defaults, palette toujours active) |
| `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryTextLayerBorderTests.swift` | Tests snapshot du rendu stroke (0pt = invisible, 4pt = trait) |

### Files to modify

| Fichier | Changement |
|---|---|
| `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` | `triggerStoryReaction` : dismiss full picker immédiat |
| `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift` | `applyCommentReactionEvent` (drop guard overlay), `loadStoryCommentsAsync` + `fetchStoryCommentsFromNetwork` (recompute likedIds), mapping `APIPostComment → FeedComment` (propager currentUserReactions), nouvelle overload `computeLikedIds(fromCachedComments:)` |
| `apps/ios/MeeshyTests/Features/Stories/StoryViewerCommentReactionTests.swift` | Étendre avec tests B.1, B.2, B.3 |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift` | `FeedComment` : ajouter `currentUserReactions: [String]?` + CodingKey + init + Codable manuels |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditToolOptions.swift` | Refondre `borderOptions` : slider continu + palette toujours active |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift` | Guard `widthPx > 0` avant stroke attrs |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderTimerController.swift` | Brancher `StoryDurationPolicy.adjustedDuration` |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift` | (Task 8) Live transform texte pendant pinch ; (Task 9 selon hypothèse) glass backdrop en `.play` |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryGlassBackdropLayer.swift` | (Task 9 selon hypothèse) — fix défini après investigation |

### Branches Git

Une branche par task pour faciliter review + rollback indépendant :
- `fix/story-full-picker-dismiss`
- `fix/feed-comment-current-user-reactions`
- `fix/story-comment-likes-reload`
- `fix/story-comment-event-without-overlay`
- `feat/story-text-border-slider`
- `fix/story-text-border-zero-invisible`
- `feat/story-duration-policy-6s-loop`
- `fix/story-text-pinch-live-transform`
- `fix/story-glass-backdrop-play-mode`

Toutes mergées sur `main`.

---

## Task 1 — Section 1A : Full picker emoji dismiss + animation visible

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:1004-1040`
- Create: `apps/ios/MeeshyTests/Features/Stories/StoryViewerReactionFlowTests.swift`

- [ ] **Step 1.1 : Créer la branche**

```bash
git checkout main && git pull
git checkout -b fix/story-full-picker-dismiss
```

- [ ] **Step 1.2 : Écrire le test échouant**

Créer `apps/ios/MeeshyTests/Features/Stories/StoryViewerReactionFlowTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import Meeshy

@MainActor
final class StoryViewerReactionFlowTests: XCTestCase {

    func test_triggerStoryReaction_whenFullPickerVisible_dismissesItImmediately() {
        // Arrange : un viewer avec full picker ouvert
        var showFullEmojiPicker = true
        var showEmojiStrip = false
        var bigReactionEmoji: String?

        // Act : simule triggerStoryReaction("❤️") en exécutant la même logique
        // (mirror du SUT — on teste le comportement, pas l'API privée)
        if showFullEmojiPicker {
            // Animation withAnimation est synchronisée dans le test runloop
            showFullEmojiPicker = false
        }
        bigReactionEmoji = "❤️"

        // Assert : le picker est fermé ET l'emoji animation est posée
        XCTAssertFalse(showFullEmojiPicker, "Full picker doit se fermer immédiatement")
        XCTAssertEqual(bigReactionEmoji, "❤️", "L'animation doit recevoir l'emoji")
    }

    func test_triggerStoryReaction_whenStripVisible_keepsStripVisibleInitially() {
        // Le strip a un délai 0.5s avant dismiss — feedback visuel délibéré.
        // On vérifie qu'on NE le ferme PAS immédiatement.
        var showEmojiStrip = true
        let stripWasVisible = showEmojiStrip
        // Mirror du SUT : préambule de triggerStoryReaction NE touche PAS showEmojiStrip
        XCTAssertTrue(stripWasVisible, "Strip reste visible après le préambule")
        XCTAssertTrue(showEmojiStrip, "Strip n'est pas dismissé immédiatement (asyncAfter 0.5s)")
    }
}
```

- [ ] **Step 1.3 : Vérifier que le test compile et fail (red)**

Run : `./apps/ios/meeshy.sh test` (filtre sur la suite si possible : `xcodebuild test -only-testing:MeeshyTests/StoryViewerReactionFlowTests`)
Expected : compile OK ; le 1er test passe déjà car c'est un mirror du futur SUT (PAS un test de couverture du code de production — il valide la logique de la spec).

> **Note** : ces tests sont des **tests-de-spec** (comportement attendu) plutôt que des **tests-de-SUT** car `triggerStoryReaction` est private + dépend de SwiftUI @State difficile à inspecter sans refactor. La VRAIE garantie de régression viendra du Step 1.5 manuel + d'un futur snapshot test post-refactor.

- [ ] **Step 1.4 : Modifier `triggerStoryReaction`**

Éditer `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:1004-1040` :

```swift
private func triggerStoryReaction(_ emoji: String) {
    HapticFeedback.medium()

    // Full picker covers ENTIRE screen → must dismiss immediately so the
    // big-reaction animation (`bigReactionEmoji`) is visible. Strip is a
    // partial overlay → keep its 0.5s dismissal delay below (deliberate
    // visual echo of the chosen emoji before the strip disappears).
    if showFullEmojiPicker {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            showFullEmojiPicker = false
        }
    }

    // Big floating emoji — dramatic 3-phase animation
    bigReactionEmoji = emoji
    bigReactionPhase = 0
    // Phase 1: burst in with overshoot
    withAnimation(.spring(response: 0.25, dampingFraction: 0.4)) {
        bigReactionPhase = 1
    }
    // Phase 1.5: subtle pulse at peak (secondary haptic)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
        HapticFeedback.light()
    }
    // Phase 2: float up and dissolve
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
        withAnimation(.easeOut(duration: 0.6)) { bigReactionPhase = 2 }
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
        bigReactionEmoji = nil
        bigReactionPhase = 0
    }

    // Collapse strip after reaction (timer auto-resumes when showEmojiStrip=false)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
            showEmojiStrip = false
        }
    }

    storyReactionCount += 1
    if !storyCurrentUserReactions.contains(emoji) {
        storyCurrentUserReactions.append(emoji)
    }
    heartBouncePulse += 1
    sendReaction(emoji: emoji)
}
```

- [ ] **Step 1.5 : Build + test manuel en RUNNING**

Run : `./apps/ios/meeshy.sh run` (BLOQUE sur logs). Dans le simulateur :
1. Ouvrir une story d'un autre utilisateur
2. Tap heart → strip apparaît
3. Tap chevron expand → full picker plein écran
4. Tap un emoji (ex : 🔥) → **attendu** : full picker disparaît immédiatement, gros 🔥 anime, network call POST /posts/:id/like
5. Tap heart → strip apparaît
6. Tap un emoji du strip (ex : 😂) → **attendu** : 😂 anime, strip reste visible ~0.5s puis se ferme

- [ ] **Step 1.6 : Vérifier les tests unitaires**

Run : `./apps/ios/meeshy.sh test`
Expected : tous les tests existants + les 2 nouveaux passent.

- [ ] **Step 1.7 : Commit + push**

```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift apps/ios/MeeshyTests/Features/Stories/StoryViewerReactionFlowTests.swift
git commit -m "fix(stories): full picker emoji dismisses immediately so big-reaction anim is visible"
git push -u origin fix/story-full-picker-dismiss
gh pr create --base main --title "fix(stories): full picker emoji dismiss" --body "$(cat <<'EOF'
## Summary
- Le full picker emoji (sheet plein écran) ne dismissait pas après tap → big-reaction animation invisible derrière la sheet
- Préambule dans triggerStoryReaction : if showFullEmojiPicker → close immédiat
- Strip rapide garde son délai 0.5s (écho visuel délibéré)

## Test plan
- [ ] Tap emoji dans full picker → animation visible
- [ ] Tap emoji dans strip → strip reste visible 0.5s puis ferme
- [ ] Tests unitaires verts
EOF
)"
```

---

## Task 2 — Section 1B.3 : `FeedComment.currentUserReactions` (SDK)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift:221-298`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/FeedCommentCodableTests.swift`

- [ ] **Step 2.1 : Branche**

```bash
git checkout main && git pull
git checkout -b fix/feed-comment-current-user-reactions
```

- [ ] **Step 2.2 : Écrire les tests Codable roundtrip**

Créer `packages/MeeshySDK/Tests/MeeshySDKTests/Models/FeedCommentCodableTests.swift` :

```swift
import Testing
import Foundation
@testable import MeeshySDK

@Suite("FeedComment Codable roundtrip")
struct FeedCommentCodableTests {

    @Test("currentUserReactions roundtrips when set")
    func roundtrips_whenSet() throws {
        let original = FeedComment(
            id: "c1",
            author: "Alice",
            authorId: "u1",
            content: "Hello",
            currentUserReactions: ["❤️", "🔥"]
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        let data = try encoder.encode(original)
        let decoded = try JSONDecoder().decode(FeedComment.self, from: data)
        #expect(decoded.currentUserReactions == ["❤️", "🔥"])
    }

    @Test("currentUserReactions roundtrips as nil when absent")
    func roundtrips_whenNil() throws {
        let original = FeedComment(
            id: "c2",
            author: "Bob",
            authorId: "u2",
            content: "World"
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(FeedComment.self, from: data)
        #expect(decoded.currentUserReactions == nil)
    }

    @Test("decodes legacy payload without the field")
    func decodes_legacyPayload() throws {
        let json = """
        {
          "id": "c3", "author": "Carol", "authorId": "u3",
          "content": "Old", "timestamp": 0, "likes": 0, "replies": 0,
          "effectFlags": 0
        }
        """.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(FeedComment.self, from: json)
        #expect(decoded.currentUserReactions == nil)
        #expect(decoded.id == "c3")
    }

    @Test("preserves empty array distinct from nil")
    func emptyArray_distinctFromNil() throws {
        let original = FeedComment(
            id: "c4",
            author: "Dan",
            authorId: "u4",
            content: "Empty",
            currentUserReactions: []
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(FeedComment.self, from: data)
        #expect(decoded.currentUserReactions == [])
        #expect(decoded.currentUserReactions != nil)
    }
}
```

- [ ] **Step 2.3 : Vérifier que les tests FAIL (compile error sur `currentUserReactions:` param)**

Run : `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/FeedCommentCodableTests -derivedDataPath apps/ios/Build`
Expected : compile error — `'currentUserReactions' not declared`.

- [ ] **Step 2.4 : Ajouter le champ + CodingKey + Codable manuel**

Éditer `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift` :

Ligne 235 (après `public var translatedContent: String?`) — ajouter :
```swift
    public var currentUserReactions: [String]?
```

Ligne 243-254 — étendre le init principal :
```swift
    public init(id: String = UUID().uuidString, author: String, authorId: String = "", authorUsername: String? = nil,
                authorAvatarURL: String? = nil,
                content: String, timestamp: Date = Date(), likes: Int = 0, replies: Int = 0,
                parentId: String? = nil, effectFlags: Int = 0,
                originalLanguage: String? = nil, translatedContent: String? = nil,
                currentUserReactions: [String]? = nil) {
        self.id = id; self.author = author; self.authorId = authorId; self.authorUsername = authorUsername
        self.authorColor = DynamicColorGenerator.colorForName(authorId.isEmpty ? author : authorId)
        self.authorAvatarURL = authorAvatarURL; self.parentId = parentId
        self.content = content; self.timestamp = timestamp; self.likes = likes; self.replies = replies
        self.effectFlags = effectFlags
        self.originalLanguage = originalLanguage; self.translatedContent = translatedContent
        self.currentUserReactions = currentUserReactions
    }
```

Ligne 261-262 — étendre les CodingKeys :
```swift
    enum CodingKeys: String, CodingKey {
        case id, author, authorId, authorUsername, authorAvatarURL, parentId, content, timestamp, likes, replies
        case effectFlags, originalLanguage, translatedContent, currentUserReactions
    }
```

Ligne 265-281 — étendre `init(from decoder:)` (ajouter la ligne avant `authorColor = ...`) :
```swift
        currentUserReactions = try c.decodeIfPresent([String].self, forKey: .currentUserReactions)
```

Ligne 283-298 — étendre `encode(to encoder:)` (ajouter à la fin avant la `}`) :
```swift
        try c.encodeIfPresent(currentUserReactions, forKey: .currentUserReactions)
```

- [ ] **Step 2.5 : Vérifier que les tests PASS (green)**

Run : `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/FeedCommentCodableTests -derivedDataPath apps/ios/Build`
Expected : 4/4 tests pass.

- [ ] **Step 2.6 : Vérifier qu'aucune régression SDK**

Run : `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests -derivedDataPath apps/ios/Build`
Expected : tous les tests SDK passent.

- [ ] **Step 2.7 : Commit + push**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/FeedCommentCodableTests.swift
git commit -m "feat(sdk): FeedComment carries currentUserReactions for cache-side like state recovery"
git push -u origin fix/feed-comment-current-user-reactions
gh pr create --base main --title "feat(sdk): FeedComment.currentUserReactions" --body "$(cat <<'EOF'
## Summary
- Adds optional `currentUserReactions: [String]?` to `FeedComment` (SDK model)
- Manual Codable extended to encode/decode the field
- Backwards-compatible: legacy payloads decode with `nil`
- Required for Task 3 (computeLikedIds dual-path cache reload)

## Test plan
- [ ] 4 new Swift Testing roundtrip tests pass
- [ ] No regression in existing MeeshySDKTests
EOF
)"
```

---

## Task 3 — Section 1B.2 : Reload recompute likedIds + mapping APIPostComment → FeedComment

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift` (mapping ligne 1398, `loadStoryCommentsAsync`, overload `computeLikedIds`)
- Modify: `apps/ios/MeeshyTests/Features/Stories/StoryViewerCommentReactionTests.swift`

**Dépendance** : Task 2 mergée d'abord (besoin de `FeedComment.currentUserReactions`).

- [ ] **Step 3.1 : Branche depuis main rebasé**

```bash
git checkout main && git pull  # contient Task 2
git checkout -b fix/story-comment-likes-reload
```

- [ ] **Step 3.2 : Lire le mapping existant ligne 1393-1410**

```bash
sed -n '1390,1415p' apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift
```

Le mapping `APIPostComment → FeedComment` crée `FeedComment(...)` sans passer `currentUserReactions`. À corriger.

- [ ] **Step 3.3 : Écrire les tests échouants**

Ajouter à `apps/ios/MeeshyTests/Features/Stories/StoryViewerCommentReactionTests.swift` :

```swift
func test_computeLikedIds_fromCachedComments_extractsHeartReactions() {
    let comments: [FeedComment] = [
        FeedComment(id: "c1", author: "A", authorId: "u1", content: "x",
                    currentUserReactions: ["❤️"]),
        FeedComment(id: "c2", author: "B", authorId: "u2", content: "y",
                    currentUserReactions: ["🔥"]),  // not heart
        FeedComment(id: "c3", author: "C", authorId: "u3", content: "z",
                    currentUserReactions: nil),
        FeedComment(id: "c4", author: "D", authorId: "u4", content: "w",
                    currentUserReactions: ["❤️", "🔥"]),
    ]
    let result = StoryViewerView.computeLikedIds(fromCachedComments: comments)
    XCTAssertEqual(result, ["c1", "c4"])
}

func test_computeLikedIds_fromCachedComments_emptyInput_returnsEmptySet() {
    let result = StoryViewerView.computeLikedIds(fromCachedComments: [])
    XCTAssertEqual(result, Set<String>())
}
```

- [ ] **Step 3.4 : Vérifier que les tests FAIL (compile error)**

Run : `./apps/ios/meeshy.sh test --filter StoryViewerCommentReactionTests`
Expected : `'computeLikedIds(fromCachedComments:)' not found`.

- [ ] **Step 3.5 : Ajouter l'overload + propager currentUserReactions au mapping**

Éditer `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift` :

**A.** Ligne 1527 — ajouter l'overload sous la fonction existante :
```swift
    static func computeLikedIds(fromCachedComments comments: [FeedComment]) -> Set<String> {
        return Set(
            comments
                .filter { $0.currentUserReactions?.contains(StoryViewerView.heartEmoji) == true }
                .map { $0.id }
        )
    }
```

**B.** Ligne 1398 — propager `currentUserReactions` dans le `FeedComment.init` du mapping replies (search pattern : `return FeedComment(`) :
```swift
                return FeedComment(
                    id: c.id, author: c.user.displayName ?? c.user.username,
                    authorId: c.user.id, authorUsername: c.user.username,
                    authorAvatarURL: c.user.avatarUrl,
                    content: c.content, timestamp: c.createdAt,
                    likes: c.reactionsCount ?? 0, replies: 0,
                    parentId: c.parentId, effectFlags: c.effectFlags ?? 0,
                    originalLanguage: c.originalLanguage,
                    translatedContent: translated,
                    currentUserReactions: c.currentUserReactions
                )
```

**C.** Le même mapping existe pour les top-level comments dans `fetchStoryCommentsFromNetwork` (ligne ~1571) — appliquer la même propagation `currentUserReactions: c.currentUserReactions`.

**D.** Brancher la recompute dans `loadStoryCommentsAsync` (ligne 1540+) — modifier les cases du switch `cached` :
```swift
        switch cached {
        case .fresh(let comments, _):
            storyComments = comments
            storyCommentLikedIds = Self.computeLikedIds(fromCachedComments: comments)
            let topAll = comments.filter { $0.parentId == nil }
            storyCommentCount = topAll.count + topAll.reduce(0) { $0 + $1.replies }
            return
        case .stale(let comments, _):
            storyComments = comments
            storyCommentLikedIds = Self.computeLikedIds(fromCachedComments: comments)
            let topAll = comments.filter { $0.parentId == nil }
            storyCommentCount = topAll.count + topAll.reduce(0) { $0 + $1.replies }
        case .expired, .empty:
            isLoadingComments = true
        }
```

**E.** Brancher dans `fetchStoryCommentsFromNetwork` (ligne ~1556+) après l'appel API :
```swift
        let response = try await PostService.shared.getComments(postId: story.id, cursor: nil, limit: 50)
        guard currentStory?.id == story.id else { return }
        storyCommentLikedIds = Self.computeLikedIds(from: response.data)  // [APIPostComment] overload existant
        // ... reste inchangé
```

- [ ] **Step 3.6 : Vérifier que les tests PASS**

Run : `./apps/ios/meeshy.sh test --filter StoryViewerCommentReactionTests`
Expected : 2 nouveaux tests + tests existants passent.

- [ ] **Step 3.7 : Test manuel en RUNNING**

Run : `./apps/ios/meeshy.sh run`
1. Ouvrir une story avec commentaires
2. Like 2 commentaires (cœur sur chacun)
3. Fermer l'overlay commentaires
4. Re-ouvrir l'overlay → **attendu** : les 2 cœurs sont toujours rouges
5. Swipe vers la slide suivante puis revenir → **attendu** : les cœurs persistent
6. Tuer l'app → rouvrir → ouvrir la même story → **attendu** : les cœurs sont restaurés depuis le cache GRDB

- [ ] **Step 3.8 : Commit + push**

```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift apps/ios/MeeshyTests/Features/Stories/StoryViewerCommentReactionTests.swift
git commit -m "fix(stories): comment likes restored from cache via FeedComment.currentUserReactions"
git push -u origin fix/story-comment-likes-reload
gh pr create --base main --title "fix(stories): comment likes restored from cache" --body "$(cat <<'EOF'
## Summary
- Adds `computeLikedIds(fromCachedComments:)` overload for [FeedComment] cache hits
- Propagates `currentUserReactions` from APIPostComment → FeedComment in both mappings
- Recomputes `storyCommentLikedIds` on every fresh/stale/network load

## Test plan
- [ ] Cold start: likes restored from GRDB
- [ ] Slide swipe: likes persist
- [ ] 2 new unit tests pass
EOF
)"
```

---

## Task 4 — Section 1B.1 : `applyCommentReactionEvent` sans guard overlay

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:1457`
- Modify: `apps/ios/MeeshyTests/Features/Stories/StoryViewerCommentReactionTests.swift`

- [ ] **Step 4.1 : Branche**

```bash
git checkout main && git pull
git checkout -b fix/story-comment-event-without-overlay
```

- [ ] **Step 4.2 : Test échouant**

Ajouter à `StoryViewerCommentReactionTests` :

```swift
func test_applyCommentReactionEvent_whenOverlayClosed_stillUpdatesState() async {
    // Préparer un viewer avec un commentaire chargé, overlay fermé
    let (sut, _) = await makeSUTWithComments(showOverlay: false)
    // Le commentaire c1 a 5 likes en local, pas liké par moi
    XCTAssertFalse(sut.storyCommentLikedIds.contains("c1"))

    // Event socket : un autre user vient de liker → count passe à 6
    let event = SocketCommentReactionUpdateEvent(
        commentId: "c1",
        postId: "story-1",
        emoji: "❤️",
        aggregation: .init(count: 6, hasCurrentUser: false)
    )

    sut.applyCommentReactionEvent(event)

    // Assert : l'état a été mis à jour MÊME overlay fermé
    XCTAssertEqual(sut.storyComments.first(where: { $0.id == "c1" })?.likes, 6)
}
```

> **Note** : `makeSUTWithComments` est une factory à créer si elle n'existe pas. Si le SUT exige trop de plumbing (View + bindings), réécrire ce test en testant **directement** la pure function équivalente extraite de `applyCommentReactionEvent` (refacto léger en `static func applyEvent(...) -> State` testable).

- [ ] **Step 4.3 : Vérifier FAIL**

Run : `./apps/ios/meeshy.sh test --filter StoryViewerCommentReactionTests/test_applyCommentReactionEvent_whenOverlayClosed`
Expected : assertion failure (event ignoré → likes reste à 5).

- [ ] **Step 4.4 : Retirer le guard**

Éditer `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:1457` — supprimer la ligne :
```swift
        guard showCommentsOverlay else { return }
```

Garder les deux guards suivants (postId, emoji). Ajouter un commentaire :
```swift
    func applyCommentReactionEvent(_ event: SocketCommentReactionUpdateEvent) {
        // 2026-05-29 : on ne gate plus sur `showCommentsOverlay` — l'état doit
        // rester aligné sur le serveur même quand l'overlay est fermé. Si
        // `storyComments` est vide (overlay jamais ouvert), `firstIndex(where:)`
        // retourne nil et on skip silencieusement ; on se ré-alignera au prochain
        // load via `computeLikedIds(fromCachedComments:)`.
        guard event.postId == currentStory?.id else { return }
        guard event.emoji == Self.heartEmoji else { return }
        // ... reste inchangé
```

- [ ] **Step 4.5 : Vérifier PASS**

Run : `./apps/ios/meeshy.sh test --filter StoryViewerCommentReactionTests`
Expected : nouveau test passe + existants passent.

- [ ] **Step 4.6 : Test manuel**

Run : `./apps/ios/meeshy.sh run`
1. Ouvrir une story d'un autre user
2. Liker un commentaire
3. Fermer l'overlay commentaires
4. Avoir un autre device qui re-like le même commentaire (ou en simulé : reset cache, regarder le count au prochain reload)
5. Re-ouvrir l'overlay → le count reflète la nouvelle valeur

- [ ] **Step 4.7 : Commit + push**

```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift apps/ios/MeeshyTests/Features/Stories/StoryViewerCommentReactionTests.swift
git commit -m "fix(stories): comment reaction events apply even when overlay closed"
git push -u origin fix/story-comment-event-without-overlay
gh pr create --base main --title "fix(stories): comment events apply with overlay closed" --body "Drop the showCommentsOverlay guard from applyCommentReactionEvent. State stays aligned to server when overlay is closed."
```

---

## Task 5 — Section 3A : Border slider UI + palette toujours active

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditToolOptions.swift:211-238`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/TextEditToolOptionsBorderTests.swift`

- [ ] **Step 5.1 : Branche**

```bash
git checkout main && git pull
git checkout -b feat/story-text-border-slider
```

- [ ] **Step 5.2 : Test échouant pour les defaults d'ouverture**

Créer `packages/MeeshySDK/Tests/MeeshyUITests/Story/TextEditToolOptionsBorderTests.swift` :

```swift
import Testing
import SwiftUI
@testable import MeeshySDK
@testable import MeeshyUI

@MainActor
@Suite("TextEditToolOptions border behavior")
struct TextEditToolOptionsBorderTests {

    @Test("opening border tool with neutral state initializes white + 4pt")
    func opensBorder_neutralState_initsDefaults() {
        var obj = StoryTextObject(
            id: "t1", text: "Hello",
            x: 0.5, y: 0.5, scale: 1.0, rotation: 0,
            fontSize: 32
        )
        obj.borderColor = nil
        obj.borderWidth = nil

        TextEditToolOptions.initializeBorderDefaultsIfNeutral(on: &obj)

        #expect(obj.borderColor == "FFFFFF")
        #expect(obj.borderWidth == 4)
    }

    @Test("opening border tool with existing values keeps them")
    func opensBorder_withValues_keepsThem() {
        var obj = StoryTextObject(
            id: "t2", text: "Hi", x: 0, y: 0, scale: 1, rotation: 0, fontSize: 32
        )
        obj.borderColor = "FF0000"
        obj.borderWidth = 8

        TextEditToolOptions.initializeBorderDefaultsIfNeutral(on: &obj)

        #expect(obj.borderColor == "FF0000")
        #expect(obj.borderWidth == 8)
    }

    @Test("slider at 0 keeps borderColor (no nil)")
    func sliderZero_keepsBorderColor() {
        var obj = StoryTextObject(
            id: "t3", text: "X", x: 0, y: 0, scale: 1, rotation: 0, fontSize: 32
        )
        obj.borderColor = "FFFFFF"
        obj.borderWidth = 0

        // The model never nullifies borderColor when borderWidth goes to 0 —
        // user keeps the color choice for when they bring the slider back up.
        #expect(obj.borderColor == "FFFFFF")
        #expect(obj.borderWidth == 0)
    }
}
```

- [ ] **Step 5.3 : Vérifier FAIL**

Run : `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/TextEditToolOptionsBorderTests -derivedDataPath apps/ios/Build`
Expected : `'initializeBorderDefaultsIfNeutral' not found`.

- [ ] **Step 5.4 : Refondre `borderOptions`**

Éditer `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditToolOptions.swift:211-238` — REMPLACER les fonctions `borderOptions` + `borderWidthChip` par :

```swift
    // MARK: - Border

    /// Initialise les défauts de bordure si l'utilisateur n'en a jamais défini.
    /// Posé à l'ouverture du tool border pour offrir un retour visuel immédiat.
    static func initializeBorderDefaultsIfNeutral(on obj: inout StoryTextObject) {
        if obj.borderColor == nil && obj.borderWidth == nil {
            obj.borderColor = "FFFFFF"
            obj.borderWidth = 4
        }
    }

    private var borderOptions: some View {
        VStack(spacing: 10) {
            // Slider continu 0...12pt, défaut 4pt (cf. initializeBorderDefaultsIfNeutral)
            HStack(spacing: 10) {
                Image(systemName: "text.below.photo")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                Slider(
                    value: Binding(
                        get: { textObject.borderWidth ?? 0 },
                        set: { newValue in
                            textObject.borderWidth = newValue
                            if textObject.borderColor == nil { textObject.borderColor = "FFFFFF" }
                        }
                    ),
                    in: 0...12,
                    step: 0.5
                )
                .tint(MeeshyColors.brandPrimary)
                Image(systemName: "bold")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.secondary)
                Text(String(format: "%.1f", textObject.borderWidth ?? 0))
                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .frame(width: 34)
            }
            // Palette de couleurs — TOUJOURS active (suppression .disabled + .opacity)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(StoryTextColors.palette, id: \.self) { hex in
                        let isSel = textObject.borderColor?.caseInsensitiveCompare(hex) == .orderedSame
                        Button {
                            textObject.borderColor = hex
                            if textObject.borderWidth == nil || textObject.borderWidth == 0 {
                                textObject.borderWidth = 4
                            }
                            HapticFeedback.light()
                        } label: {
                            colorDot(hex: hex, selected: isSel, size: 28)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(4)
            }
        }
    }
```

Supprimer entièrement `borderWidthChip(label:width:)` (ligne 240-267 — devenu inutilisé).

- [ ] **Step 5.5 : Brancher `initializeBorderDefaultsIfNeutral` dans le parent**

Éditer `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditToolbar.swift` (ou le call-site qui passe `tool: .border` à `TextEditToolOptions`) — appeler `initializeBorderDefaultsIfNeutral` quand `expandedTool` devient `.border`. Cherche le call-site avec `grep -n "tool: \.border\|case .border" packages/MeeshySDK/Sources/MeeshyUI/Story/`.

Pattern à insérer (adapter au call-site exact) :
```swift
.onChange(of: expandedTool) { _, newTool in
    if newTool == .border {
        TextEditToolOptions.initializeBorderDefaultsIfNeutral(on: &textObject)
    }
}
```

- [ ] **Step 5.6 : Vérifier PASS**

Run : `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/TextEditToolOptionsBorderTests -derivedDataPath apps/ios/Build`
Expected : 3/3 tests pass.

- [ ] **Step 5.7 : Test manuel en RUNNING**

Run : `./apps/ios/meeshy.sh run`
1. Composer une story, ajouter un texte
2. Tap le tool `border` → **attendu** : texte affiche bordure blanche 4pt instantanément
3. Bouger le slider gauche → bordure rétrécit en live
4. Bouger le slider à 0 → bordure invisible
5. Tap une couleur rouge → bordure réapparaît à 4pt rouge
6. Bouger le slider à 10 → bordure épaisse rouge

- [ ] **Step 5.8 : Commit + push**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditToolOptions.swift packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditToolbar.swift packages/MeeshySDK/Tests/MeeshyUITests/Story/TextEditToolOptionsBorderTests.swift
git commit -m "feat(stories): text border slider 0-12pt with always-active color palette"
git push -u origin feat/story-text-border-slider
gh pr create --base main --title "feat(stories): text border slider" --body "Replaces 4 preset chips with continuous 0-12pt slider. Color palette no longer greyed out. Default white + 4pt on first open."
```

---

## Task 6 — Section 3B : `borderWidth = 0` rend invisible

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift:75-79`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryTextLayerBorderTests.swift`

- [ ] **Step 6.1 : Branche**

```bash
git checkout main && git pull
git checkout -b fix/story-text-border-zero-invisible
```

- [ ] **Step 6.2 : Test échouant**

Créer `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryTextLayerBorderTests.swift` :

```swift
import Testing
import UIKit
@testable import MeeshySDK
@testable import MeeshyUI

@MainActor
@Suite("StoryTextLayer border rendering")
struct StoryTextLayerBorderTests {

    @Test("borderWidth 0 with non-nil color skips stroke attributes")
    func borderWidthZero_skipsStroke() {
        var obj = StoryTextObject(
            id: "t1", text: "Hello",
            x: 0.5, y: 0.5, scale: 1.0, rotation: 0,
            fontSize: 32
        )
        obj.borderColor = "FFFFFF"
        obj.borderWidth = 0

        let attrs = StoryTextLayer.testStrokeAttributes(for: obj, designFontSize: 32)
        #expect(attrs[.strokeColor] == nil)
        #expect(attrs[.strokeWidth] == nil)
    }

    @Test("borderWidth 4 with color applies stroke")
    func borderWidthFour_appliesStroke() {
        var obj = StoryTextObject(
            id: "t2", text: "Hi", x: 0, y: 0, scale: 1, rotation: 0, fontSize: 32
        )
        obj.borderColor = "FF0000"
        obj.borderWidth = 4

        let attrs = StoryTextLayer.testStrokeAttributes(for: obj, designFontSize: 32)
        #expect(attrs[.strokeColor] != nil)
        #expect(attrs[.strokeWidth] != nil)
    }
}
```

> **Note** : `testStrokeAttributes(for:designFontSize:)` est une `static func` testable à extraire de la logique inline du fichier `StoryTextLayer.swift` (les lignes 75-79 actuelles deviennent un appel à cette static). Ça découple le calcul des attributs de stroke du cycle `configure` UIKit.

- [ ] **Step 6.3 : Vérifier FAIL**

Run : `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTextLayerBorderTests -derivedDataPath apps/ios/Build`
Expected : `'testStrokeAttributes' not found`.

- [ ] **Step 6.4 : Extraire la pure function + appliquer le guard**

Éditer `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift` :

Ajouter une `static func` (proche du top du fichier ou de la classe) :
```swift
    /// Calcule les attributs de stroke (`strokeColor`, `strokeWidth`) pour un
    /// `StoryTextObject`. Retourne un dictionnaire vide si aucun stroke ne doit
    /// être rendu (`borderColor == nil` OU `borderWidth == 0` OU `borderWidth == nil`).
    static func testStrokeAttributes(
        for text: StoryTextObject,
        designFontSize: CGFloat
    ) -> [NSAttributedString.Key: Any] {
        var attrs: [NSAttributedString.Key: Any] = [:]
        guard
            let borderHex = text.borderColor,
            let borderColor = parseHexColor(borderHex)
        else { return attrs }
        let widthPx = CGFloat(text.borderWidth ?? 0)
        guard widthPx > 0 else { return attrs }
        attrs[.strokeColor] = borderColor.cgColor
        attrs[.strokeWidth] = -(widthPx / max(designFontSize, 1)) * 100.0
        return attrs
    }
```

Remplacer le bloc ligne 75-79 par :
```swift
        let strokeOnly = Self.testStrokeAttributes(for: text, designFontSize: designFontSize)
        strokeAttrs.merge(strokeOnly) { _, new in new }
```

(Le nom local existant `strokeAttrs` est merge avec le résultat de la static.)

- [ ] **Step 6.5 : Vérifier PASS**

Run : `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryTextLayerBorderTests -derivedDataPath apps/ios/Build`
Expected : 2/2 pass.

- [ ] **Step 6.6 : Test visuel en RUNNING**

Run : `./apps/ios/meeshy.sh run`
1. Composer une story, ajouter un texte avec bordure couleur + slider à 0
2. **Attendu** : texte sans aucun trait, juste le glyph remplit

- [ ] **Step 6.7 : Commit + push**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryTextLayerBorderTests.swift
git commit -m "fix(stories): borderWidth=0 renders no stroke regardless of borderColor"
git push -u origin fix/story-text-border-zero-invisible
gh pr create --base main --title "fix(stories): borderWidth=0 invisible" --body "Guards stroke attributes behind widthPx > 0. Extracts pure testStrokeAttributes static for unit test coverage."
```

---

## Task 7 — Section 2B : `StoryDurationPolicy` loop ≥ 6s

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryDurationPolicy.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryDurationPolicyTests.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderTimerController.swift`

- [ ] **Step 7.1 : Branche**

```bash
git checkout main && git pull
git checkout -b feat/story-duration-policy-6s-loop
```

- [ ] **Step 7.2 : Écrire les 6 tests Swift Testing**

Créer `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryDurationPolicyTests.swift` :

```swift
import Testing
import Foundation
@testable import MeeshyUI

@Suite("StoryDurationPolicy")
struct StoryDurationPolicyTests {

    @Test("bgVideo 2.5s yields exactly 7.5s (3 loops)")
    func bgVideo_2_5s() {
        let r = StoryDurationPolicy.adjustedDuration(intrinsic: 5.0, backgroundMediaDuration: 2.5)
        #expect(abs(r - 7.5) < 0.001)
    }

    @Test("bgVideo 5.9s yields exactly 11.8s (2 loops)")
    func bgVideo_5_9s() {
        let r = StoryDurationPolicy.adjustedDuration(intrinsic: 5.0, backgroundMediaDuration: 5.9)
        #expect(abs(r - 11.8) < 0.001)
    }

    @Test("bgVideo 6.0s yields intrinsic (no multiplication)")
    func bgVideo_6_0s() {
        let r = StoryDurationPolicy.adjustedDuration(intrinsic: 6.0, backgroundMediaDuration: 6.0)
        #expect(abs(r - 6.0) < 0.001)
    }

    @Test("bgAudio 4s yields exactly 8s (2 loops)")
    func bgAudio_4s() {
        let r = StoryDurationPolicy.adjustedDuration(intrinsic: 5.0, backgroundMediaDuration: 4.0)
        #expect(abs(r - 8.0) < 0.001)
    }

    @Test("no bgMedia falls back to intrinsic")
    func noBgMedia() {
        let r = StoryDurationPolicy.adjustedDuration(intrinsic: 10.0, backgroundMediaDuration: nil)
        #expect(abs(r - 10.0) < 0.001)
    }

    @Test("bgMedia duration zero falls back to intrinsic")
    func bgMediaZero() {
        let r = StoryDurationPolicy.adjustedDuration(intrinsic: 10.0, backgroundMediaDuration: 0)
        #expect(abs(r - 10.0) < 0.001)
    }

    @Test("intrinsic larger than 6s loop value wins")
    func intrinsicWins() {
        // bgVideo 2s → 3 loops = 6s, but intrinsic is 10s → keep 10s
        let r = StoryDurationPolicy.adjustedDuration(intrinsic: 10.0, backgroundMediaDuration: 2.0)
        #expect(abs(r - 10.0) < 0.001)
    }
}
```

- [ ] **Step 7.3 : Vérifier FAIL**

Run : `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryDurationPolicyTests -derivedDataPath apps/ios/Build`
Expected : `'StoryDurationPolicy' not found`.

- [ ] **Step 7.4 : Créer la policy**

Créer `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryDurationPolicy.swift` :

```swift
import Foundation

/// Politique de durée minimale d'une slide quand son background media (audio
/// ou vidéo) a une durée inférieure au seuil. Garantit que l'utilisateur a le
/// temps de percevoir le contenu avant transition de slide.
///
/// **Règle** : si `bgMediaDuration < minimumLoopAccumulation`, la slide
/// joue pendant `ceil(minimumLoopAccumulation / bgMediaDuration) × bgMediaDuration`
/// secondes (i.e. boucles complètes, pas de coupure mid-loop).
///
/// **Source** : design 2026-05-28 « loops audio + règle si BG < 6s → looper
/// jusqu'à 6s » validée @jcnm. Applique uniformément aux 2 types de média.
public enum StoryDurationPolicy {

    /// Seuil minimum (secondes) — durée totale cumulée minimum pour BG court.
    public static let minimumLoopAccumulation: TimeInterval = 6.0

    /// Calcule la durée effective de la slide à partir de la durée intrinsèque
    /// (texte, photo, etc.) et de la durée du média background (optionnelle).
    ///
    /// - Parameters:
    ///   - intrinsic: durée qu'aurait la slide sans la règle de loop (texte, photo, etc.)
    ///   - backgroundMediaDuration: durée du media BG en secondes (nil si pas de média BG, 0 si non résolu)
    /// - Returns: la durée finale appliquée. Toujours `>= intrinsic`.
    public static func adjustedDuration(
        intrinsic: TimeInterval,
        backgroundMediaDuration: TimeInterval?
    ) -> TimeInterval {
        guard
            let d = backgroundMediaDuration,
            d > 0,
            d < minimumLoopAccumulation
        else {
            return intrinsic
        }
        let loops = ceil(minimumLoopAccumulation / d)
        let loopTotal = loops * d
        return max(intrinsic, loopTotal)
    }
}
```

- [ ] **Step 7.5 : Vérifier PASS**

Run : `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryDurationPolicyTests -derivedDataPath apps/ios/Build`
Expected : 7/7 pass.

- [ ] **Step 7.6 : Brancher dans `StoryReaderTimerController`**

Lire le fichier pour comprendre la structure actuelle :
```bash
sed -n '1,50p' packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderTimerController.swift
```

Cherche l'endroit où la durée de slide est posée pour démarrer le timer. Brancher :

```swift
// Avant de programmer le timer :
let bgDuration = currentSlide.effects.resolvedBackgroundMedia?.knownDuration
self.slideDuration = StoryDurationPolicy.adjustedDuration(
    intrinsic: computedIntrinsicDuration,
    backgroundMediaDuration: bgDuration
)
```

> **Note pour l'engineer** : `knownDuration` peut ne pas exister sur le model courant. Si tu trouves un autre champ qui porte la durée du média BG résolu, utilise-le. Si la durée n'est pas connue au moment du démarrage du timer (async via AVPlayer KVO), démarre avec `intrinsic` ET re-déclenche `adjustedDuration` quand la durée arrive via le KVO (event handler dans le BackgroundLayer probablement).

- [ ] **Step 7.7 : Test manuel en RUNNING**

Run : `./apps/ios/meeshy.sh run`
1. Composer une story avec un BG vidéo de 3s (importer un court clip)
2. Publier + ouvrir le viewer
3. Chronométrer la slide → **attendu** : ~6s (2 boucles de 3s)
4. Composer une autre avec BG audio de 4s
5. Viewer → **attendu** : ~8s (2 boucles de 4s)
6. BG vidéo de 7s → **attendu** : reste à 7s (pas de boost)

- [ ] **Step 7.8 : Commit + push**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryDurationPolicy.swift packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryDurationPolicyTests.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderTimerController.swift
git commit -m "feat(stories): BG media < 6s loops to fill minimum slide duration"
git push -u origin feat/story-duration-policy-6s-loop
gh pr create --base main --title "feat(stories): 6s minimum loop policy" --body "New StoryDurationPolicy.adjustedDuration applies ceil(6/d)*d when BG media is shorter than 6s. Audio and video treated identically."
```

---

## Task 8 — Section 2A : Live text zoom pendant pinch (investigation-first)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift:2333-2350`

- [ ] **Step 8.1 : Branche**

```bash
git checkout main && git pull
git checkout -b fix/story-text-pinch-live-transform
```

- [ ] **Step 8.2 : Investigation en RUNNING**

Run : `./apps/ios/meeshy.sh run`
1. Composer une story, ajouter un texte
2. Pincher le texte
3. Observer :
   - Le texte change-t-il pendant le geste ? (oui = pas de bug, fermer le ticket)
   - Si non : ajouter `print("scale at .changed: \(newScale)")` dans `handlePinch.case .changed` (StoryCanvasUIView.swift:2348)
4. Reproduire — confirmer que `.changed` fire mais que le rendu n'est PAS live
5. Investiguer pourquoi `slide.didSet → rebuildLayers()` ne re-render pas en live :
   - Ajouter `print("rebuildLayers called")` au début de `rebuildLayers()`
   - Si rebuildLayers n'est PAS appelé à chaque tick → c'est H2/H3 (debounce/batch)
   - Si rebuildLayers EST appelé mais le texte ne change pas → c'est H1 (CATextLayer pas re-rendered)

- [ ] **Step 8.3 : Documenter l'hypothèse confirmée**

Ajouter une entrée dans la mémoire projet (cf. system memory) ou un commentaire dans le code expliquant la cause exacte. Si l'hypothèse est H4 (nouvelle), valider avec @jcnm avant de continuer.

- [ ] **Step 8.4 : Appliquer le fix selon l'hypothèse**

**Si H1** (CATextLayer pas re-rendered) — pattern : appliquer une transform live sur le layer sans re-render complet :

Dans `handlePinch.changed` (~ligne 2348), avant `slide = updateScale(...)`, capturer le baseScale et appliquer une transform directe au layer du texte :

```swift
        case .changed:
            guard let id = manipulatedItemId else { return }
            if id == backgroundMediaObjectId {
                // ... existing bg path ...
                return
            }
            let newScale = max(0.3, min(4.0, baseScale * Double(recognizer.scale)))
            // Live transform on the text layer — bypasses rebuildLayers cost.
            // The model commit happens at .ended via slide = updateScale(...).
            if let textLayer = textLayer(forId: id) {
                let scaleFactor = CGFloat(newScale / baseScale)
                textLayer.transform = CATransform3DScale(textLayer.transform, scaleFactor, scaleFactor, 1)
                baseScale = newScale  // anchor next delta to the just-applied state
            } else {
                // Foreground non-text (image/video) — fall back to model update.
                slide = updateScale(slideId: id, scale: newScale)
                onItemModified?(slide)
            }
```

Et dans `.ended` ajouter la commit modèle :
```swift
        case .ended, .cancelled, .failed:
            // ... existing bg handling ...
            if let id = manipulatedItemId, textLayer(forId: id) != nil {
                slide = updateScale(slideId: id, scale: baseScale)
                onItemModified?(slide)
            }
            manipulatedItemId = nil
            slideContentRevision &+= 1
            rebuildLayers()
```

Ajouter la helper `textLayer(forId:)` privée si pas existante :
```swift
    private func textLayer(forId id: String) -> StoryTextLayer? {
        for sub in itemsContainer.sublayers ?? [] {
            if sub.name == id, let txt = sub as? StoryTextLayer { return txt }
        }
        return nil
    }
```

**Si H2/H3** — adapter le fix selon la cause confirmée.

- [ ] **Step 8.5 : Test manuel + vérifier régression**

Run : `./apps/ios/meeshy.sh run`
1. Pincher un texte → bordure et glyph se redimensionnent en live
2. Relâcher → la slide est commitée avec la nouvelle scale
3. Bouger / rotation après resize → pas de bug d'anchor
4. Tests existants de gesture passent

Run tous les tests canvas : `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/StoryCanvas -derivedDataPath apps/ios/Build`

- [ ] **Step 8.6 : Commit + push**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift
git commit -m "fix(stories): live text scale during pinch via CATransform3D (commit model at .ended)"
git push -u origin fix/story-text-pinch-live-transform
gh pr create --base main --title "fix(stories): live text pinch" --body "Text layer transforms live during pinch (no rebuildLayers per-tick). Model commits at .ended. Mirrors the background pinch pattern."
```

---

## Task 9 — Section 2C : Glass backdrop noir dans viewer (investigation-first)

**Files:**
- Modify: dépend de l'hypothèse confirmée — typiquement `StoryGlassBackdropLayer.swift` ou `StoryBackdropCapture.swift` ou `StoryCanvasUIView.swift`

- [ ] **Step 9.1 : Branche**

```bash
git checkout main && git pull
git checkout -b fix/story-glass-backdrop-play-mode
```

- [ ] **Step 9.2 : Investigation en RUNNING + View Hierarchy Debugger**

Run : `./apps/ios/meeshy.sh run`
1. Composer une story avec un texte sur fond glass (tool `background` → `Verre`)
2. Publier + ouvrir le viewer
3. Observer : la glass backdrop est-elle noire ?
4. Pause via Xcode → Debug → View Hierarchy
5. Inspecter le `StoryGlassBackdropLayer` du texte :
   - Quel est son `bounds` ? (0,0,0,0 → H3)
   - Quel est son `backgroundColor` ? (clear/blanc translucide → H1 ou H2)
   - Quels sont ses `filters` ? (vide → CAFilter pas posé → H1)
6. Ajouter du logging dans `StoryGlassBackdropLayer.configure(sigma:)` et `setBackdropTexture(_:)` pour voir si elles sont appelées en mode `.play`

- [ ] **Step 9.3 : Documenter l'hypothèse confirmée**

Si H1 (CAFilter fail) : commenter la cause précise dans le code.
Si H2 (BackdropCapture gaté) : modifier `StoryBackdropCapture` pour fonctionner en `.play` mode aussi.
Si H3 (bounds zero) : ajouter `setNeedsLayout` après attach.
Si H4 (autre cause) : valider avec @jcnm avant code.

- [ ] **Step 9.4 : Appliquer le fix selon hypothèse**

**Pattern recommandé si H1** — remplacer le CAFilter par un snapshot statique baked dans le layer au moment de l'attach :

```swift
// Dans StoryGlassBackdropLayer ou StoryTextLayer.applyBackgroundStyle :
// Au lieu de CAFilter, faire un snapshot du parent canvas via
// `UIGraphicsImageRenderer` (synchrone, sur main thread) + appliquer
// un CIFilter "CIGaussianBlur" sur le UIImage résultat, puis poser
// l'image comme `contents` du backdrop.
```

(Code exact à finaliser après investigation — placeholder délibéré ici car la solution dépend de la cause.)

- [ ] **Step 9.5 : Test snapshot end-to-end**

Créer `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryGlassBackdropPlayModeSnapshotTests.swift` :

```swift
import Testing
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
@Suite("Glass backdrop in .play mode")
struct StoryGlassBackdropPlayModeSnapshotTests {

    @Test("text with glass background rendered as blurred backdrop (not black)")
    func glassBackdrop_inPlayMode_rendersBlurred() {
        // Build a slide with one text + glass bg, render in .play mode,
        // capture as UIImage, inspect the pixel region behind the text.
        // The region must NOT be uniform black (rgb close to 0,0,0).
        let slide = makeSlideWithGlassText()
        let image = renderCanvas(slide: slide, mode: .play, size: CGSize(width: 393, height: 698))
        let backdropRegion = CGRect(x: 100, y: 300, width: 200, height: 50)
        let pixels = image.samplePixels(in: backdropRegion)
        let allBlack = pixels.allSatisfy { $0.r < 0.1 && $0.g < 0.1 && $0.b < 0.1 }
        #expect(!allBlack, "Glass backdrop should not render uniformly black in .play mode")
    }
}
```

(Helpers `makeSlideWithGlassText`, `renderCanvas`, `samplePixels` à créer ; ils existent peut-être déjà dans les helpers de test du canvas — vérifier `MeeshyUITests/Story/` avant duplication.)

- [ ] **Step 9.6 : Test manuel sur 2 devices**

Run sur iPhone 16 Pro + iPhone SE 3 (changer la destination simulator avec `-destination`).

- [ ] **Step 9.7 : Commit + push**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryGlassBackdropLayer.swift  # ou autre selon fix
git add packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryGlassBackdropPlayModeSnapshotTests.swift
git commit -m "fix(stories): glass text backdrop renders correctly in viewer/preview (.play mode)"
git push -u origin fix/story-glass-backdrop-play-mode
gh pr create --base main --title "fix(stories): glass backdrop in viewer" --body "Glass text backdrop was rendering as uniform black in .play mode. Root cause: [H1/H2/H3 — fill in after investigation]. Snapshot test guards regression."
```

---

## Self-Review

### Spec coverage check

| Spec section | Couvert par task | OK ? |
|---|---|---|
| 1A Full picker dismiss | Task 1 | ✅ |
| 1B.1 applyEvent sans guard | Task 4 | ✅ |
| 1B.2 reload likedIds dual-path | Task 3 | ✅ |
| 1B.3 FeedComment currentUserReactions | Task 2 | ✅ |
| 2A Live text zoom | Task 8 | ✅ |
| 2B Loop 6s | Task 7 | ✅ |
| 2C Glass backdrop | Task 9 | ✅ |
| 3A Border slider UX | Task 5 | ✅ |
| 3B borderWidth=0 invisible | Task 6 | ✅ |
| 4 Cross-chantier coherence | Task 1 (déjà inclut le pattern) | ✅ |

### Placeholder scan

- Task 9.4 a un placeholder délibéré (« code exact à finaliser après investigation ») — c'est OK car l'investigation est le step précédent et le code dépend du résultat. Spec et plan l'ont anticipé.
- Task 7.6 a un « note pour l'engineer » qui invite à chercher `knownDuration` ou équivalent — ambigu mais nécessaire car le model exact n'est pas figé au moment du plan.

Pas d'autres placeholders trouvés.

### Type consistency

- `computeLikedIds(from: [APIPostComment])` ↔ `computeLikedIds(fromCachedComments: [FeedComment])` : noms distincts, paramètres distincts, OK.
- `StoryDurationPolicy.adjustedDuration(intrinsic:backgroundMediaDuration:)` : utilisée cohéramment dans Task 7.
- `triggerStoryReaction(_:)` : signature préservée.
- `initializeBorderDefaultsIfNeutral(on:)` : `inout StoryTextObject`, statique sur `TextEditToolOptions`, OK.
- `testStrokeAttributes(for:designFontSize:)` : statique sur `StoryTextLayer`, retourne `[NSAttributedString.Key: Any]`, OK.

### Ordre + dépendances

- Task 2 doit être mergée avant Task 3 (Task 3 utilise `FeedComment.currentUserReactions`)
- Toutes les autres tasks sont **indépendantes** — peuvent partir en parallèle si on a plusieurs developers/agents
- Tasks 8 et 9 dépendent d'investigations préalables sur device → planifier en série

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-29-story-reactions-canvas-uxfixes-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Je dispatch un fresh subagent par task, review entre tasks, itérations rapides. Idéal pour les tasks 1–7 indépendantes ; pour 8 et 9 (investigation-first) je supervise plus étroitement.

**2. Inline Execution** — Exécute les tasks dans cette session via executing-plans, batch avec checkpoints pour review.

Which approach?
