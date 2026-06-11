# Story Surfaces (Lot 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre l'accès aux stories fonctionnel et cohérent sur TOUTES les surfaces iOS : bulles de conversation, avatar auteur de publication (feed), profil utilisateur, recherche, deep links/push — avec une source unique d'état d'anneau (`storyRingState(forUserId:)`).

**Architecture:** Aucun nouveau fichier app (pas de pbxproj). Un helper unique sur `StoryViewModel` remplace 4 calculs dupliqués. Le reader reste `StoryViewerContainer` (unique). Les nouveaux points d'entrée réutilisent les chemins de présentation existants (`overlayState` de ConversationView, `StoryViewerCoordinator` de RootView). Seul changement SDK : 2 paramètres opaques optionnels sur `UserProfileSheet` (conforme SDK purity — paramètres opaques, décision app-side).

**Tech Stack:** SwiftUI + UIKit bridge (MessageListViewController), XCTest, `./apps/ios/meeshy.sh`.

**Spec:** `docs/superpowers/specs/2026-06-11-story-stack-fluidity-design.md` (§S1, Lot 1).
Les Lots 2 (horloge unique + audio), 3 (transitions reels) et 4 (robustesse) ont des plans séparés écrits après livraison du Lot 1.

**Règle produit `singleGroup` (décision de la spec):** contexte « personne précise » (bulle, header, profil, avatar de post, commentaire, recherche) → `singleGroup: true` ; contexte « flux » (tray, liste de conversations) → `singleGroup: false`.

---

## Préambule — Environnement

- [ ] **Step 0.1 : Créer le worktree isolé** (env contendu par agents parallèles)

```bash
git -C /Users/smpceo/Documents/v2_meeshy worktree add ../v2_meeshy-story-surfaces -b feat/story-surfaces-lot1 main
cd /Users/smpceo/Documents/v2_meeshy-story-surfaces
```

Tous les chemins ci-dessous sont relatifs à la racine du worktree.

- [ ] **Step 0.2 : Vérifier que la base build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED (attention : exit 1 possible sur build sans warning — vérifier la chaîne "BUILD SUCCEEDED" dans la sortie, cf. lesson `meeshy.sh exit 1`).

---

### Task 1 : Helper unique `storyRingState(forUserId:)`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift` (section `// MARK: - Lookup Methods`, après `hasUnviewedStories`, ~ligne 445)
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/StoryViewModelTests.swift` (fichier existant — réutiliser ses factories de `StoryGroup`/`StoryItem`)

- [ ] **Step 1.1 : Écrire les tests qui échouent**

Dans `StoryViewModelTests.swift`, réutiliser la factory existante de groupes (si le fichier expose `makeStoryGroup`/`makeStoryItem`, les utiliser ; sinon construire via `StoryItem`/`StoryGroup` inits publics du SDK comme le font les tests existants) :

```swift
func test_storyRingState_userWithUnviewedStories_returnsUnread() {
    let (sut, _) = makeSUT()
    sut.storyGroups = [makeStoryGroup(userId: "u1", hasUnviewed: true)]
    XCTAssertEqual(sut.storyRingState(forUserId: "u1"), .unread)
}

func test_storyRingState_userWithAllViewedStories_returnsRead() {
    let (sut, _) = makeSUT()
    sut.storyGroups = [makeStoryGroup(userId: "u1", hasUnviewed: false)]
    XCTAssertEqual(sut.storyRingState(forUserId: "u1"), .read)
}

func test_storyRingState_userWithoutStories_returnsNone() {
    let (sut, _) = makeSUT()
    sut.storyGroups = []
    XCTAssertEqual(sut.storyRingState(forUserId: "u1"), .none)
}

func test_storyRingState_userWithFullyExpiredGroup_returnsNone() {
    let (sut, _) = makeSUT()
    sut.storyGroups = [makeStoryGroup(userId: "u1", allExpired: true)]
    XCTAssertEqual(sut.storyRingState(forUserId: "u1"), .none)
}
```

Si `makeSUT()` n'existe pas dans ce fichier, suivre le pattern factory du fichier (les 22 tests existants en ont un).

- [ ] **Step 1.2 : Vérifier l'échec**

Run: `./apps/ios/meeshy.sh test 2>&1 | grep -E "storyRingState|error:"`
Expected: erreur de compilation `value of type 'StoryViewModel' has no member 'storyRingState'`.

- [ ] **Step 1.3 : Implémenter le helper**

Dans `StoryViewModel.swift`, section Lookup Methods (le fichier importe déjà ce qu'il faut ; `StoryRingState` vient de `MeeshyUI` — ajouter `import MeeshyUI` en tête si absent) :

```swift
/// Source unique de l'état d'anneau story d'un avatar, toutes surfaces.
/// `.none` si l'utilisateur n'a aucune story active (groupe absent ou
/// entièrement expiré), `.unread` s'il reste au moins une story non vue.
func storyRingState(forUserId userId: String) -> StoryRingState {
    guard let group = storyGroups.first(where: { $0.id == userId }),
          !group.isFullyExpired() else { return .none }
    return group.hasUnviewed ? .unread : .read
}
```

- [ ] **Step 1.4 : Vérifier que les tests passent**

Run: `./apps/ios/meeshy.sh test 2>&1 | grep -E "storyRingState|passed|failed"`
Expected: 4 tests PASS.

- [ ] **Step 1.5 : Remplacer les 4 calculs dupliqués**

1. `apps/ios/Meeshy/Features/Main/Views/FeedCommentsSheet.swift:240` — remplacer
   `storyViewModel.storyGroupForUser(userId: comment.authorId).map { $0.hasUnviewed ? .unread : .read } ?? .none`
   par `storyViewModel.storyRingState(forUserId: comment.authorId)`.
2. `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift:386` — même remplacement.
3. `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift:251-256` (`storyRingState(for:)`) — le corps délègue :
   ```swift
   private func storyRingState(for conversation: Conversation) -> StoryRingState {
       guard conversation.type == .direct,
             let userId = conversation.participantUserId else { return .none }
       return storyViewModel.storyRingState(forUserId: userId)
   }
   ```
4. `apps/ios/Meeshy/Features/Main/Views/ConversationView+Header.swift:282-286` (`memberStoryState(for:)`) — même délégation vers `storyViewModel.storyRingState(forUserId:)`.

- [ ] **Step 1.6 : Build + tests + commit**

```bash
./apps/ios/meeshy.sh build && ./apps/ios/meeshy.sh test
git add -A && git commit -m "feat(ios): storyRingState(forUserId:) source unique de l'anneau story"
```

---

### Task 2 : `StoryViewerRequest` — `singleGroup` + `startAtFirstUnviewed` sur deep link/push

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootView.swift:20-27` (struct `StoryViewerRequest`), `:388-417` (fullScreenCover du coordinator), `:553-556` (push `storyDetail:`), `:705-715` (deep link `.storyDetail`)

- [ ] **Step 2.1 : Étendre la struct**

```swift
struct StoryViewerRequest: Identifiable, Equatable {
    let id: String
    var initialAction: StoryViewerInitialAction? = nil
    var startAtFirstUnviewed: Bool = false
    /// `true` pour les entrées « personne précise » (profil, bulle, avatar
    /// de post) : le viewer ne montre que le groupe de cet utilisateur.
    var singleGroup: Bool = false
}
```

- [ ] **Step 2.2 : Propager dans le cover du coordinator**

Dans le `fullScreenCover` de RootView (~ligne 388-417) qui construit `StoryViewerContainer` depuis `pendingRequest`, passer `singleGroup: request.singleGroup` (paramètre déjà supporté par `StoryViewerContainer`).

- [ ] **Step 2.3 : Deep link + push ouvrent à la première non-vue**

Aux deux sites (`RootView.swift` ~553-556 et ~705-715), remplacer
`StoryViewerRequest(id: storyViewModel.storyGroups[groupIdx].id)` par :

```swift
StoryViewerRequest(id: storyViewModel.storyGroups[groupIdx].id, startAtFirstUnviewed: true)
```

(Le deep link cible un *auteur* dont la story est dans le tray — pas un index précis ; ouvrir sur la première non-vue est le comportement attendu. Si un jour un deep link cible une slide précise, il passera un `initialAction`.)

- [ ] **Step 2.4 : Build + commit**

```bash
./apps/ios/meeshy.sh build
git add -A && git commit -m "feat(ios): StoryViewerRequest.singleGroup + startAtFirstUnviewed sur deep link/push story"
```

---

### Task 3 : `MyStoryButton` routé via `StoryViewerCoordinator`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift:119-129` (state `showOwnStoryViewer` + son fullScreenCover, cover réel ~lignes 604-614)

- [ ] **Step 3.1 : Remplacer le chemin local par le coordinator**

1. Ajouter dans `StoryTrayView` : `@EnvironmentObject private var storyViewerCoordinator: StoryViewerCoordinator` (injecté à RootView:322, le tray est dans l'arbre).
2. Supprimer `@State private var showOwnStoryViewer` et le `.fullScreenCover(isPresented: $showOwnStoryViewer) { ... }` associé.
3. Au tap « voir ma story » du `MyStoryButton`, remplacer `showOwnStoryViewer = true` par :

```swift
storyViewerCoordinator.present(StoryViewerRequest(
    id: AuthManager.shared.currentUser?.id ?? "",
    singleGroup: true
))
```

(Pas de `startAtFirstUnviewed` : pour sa propre story on garde l'index 0, comportement actuel.)

- [ ] **Step 3.2 : Build + vérif visuelle simulateur**

```bash
./apps/ios/meeshy.sh build
```
Smoke (skill ios-simulator) : tap sur « Ma story » dans le tray → le viewer s'ouvre sur ses propres stories uniquement, le swipe horizontal ne navigue pas vers d'autres auteurs.

- [ ] **Step 3.3 : Commit**

```bash
git add -A && git commit -m "refactor(ios): MyStoryButton route via StoryViewerCoordinator (chemin unique)"
```

---

### Task 4 : `handleStoryView` — suppression du fallback par username

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift:803-816`

- [ ] **Step 4.1 : Réécrire le handler**

```swift
private func handleStoryView(_ conversation: Conversation) {
    guard conversation.type == .direct,
          let userId = conversation.participantUserId,
          storyViewModel.hasStories(forUserId: userId) else { return }
    onStoryViewRequest?(userId, true)
}
```

Le fallback `storyGroups.first(where: { $0.username == conversation.name })` est supprimé (rompt au changement de display name ; le ring n'est de toute façon affiché que si `participantUserId` matche un groupe — Task 1 Step 1.5.3). Le 2e paramètre (`startAtFirstUnviewed`) passe à `true` : taper un anneau ouvre la première non-vue.

- [ ] **Step 4.2 : Vérifier la signature de `onStoryViewRequest`**

Run: `grep -n "onStoryViewRequest" apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift apps/ios/Meeshy/Features/Main/Views/RootView*.swift`
Expected: closure `(String, Bool) -> Void` dont le Bool alimente `StoryViewerRequest.startAtFirstUnviewed` côté RootView. Si le Bool est aujourd'hui ignoré côté RootView, le brancher : `StoryViewerRequest(id: userId, startAtFirstUnviewed: flag)`.

- [ ] **Step 4.3 : Build + commit**

```bash
./apps/ios/meeshy.sh build
git add -A && git commit -m "fix(ios): handleStoryView — lookup par userId uniquement, ouvre la 1re non-vue"
```

---

### Task 5 : `ThemedAvatarButton` — tristate au lieu du booléen

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationHelperViews.swift:123-158`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift:1269-1276` (seul call site)

- [ ] **Step 5.1 : Remplacer la prop**

Dans `ThemedAvatarButton` : supprimer `var hasStoryRing: Bool = false`, ajouter `var storyState: StoryRingState = .none`, et passer `storyState: storyState` au `MeeshyAvatar` interne (au lieu de `hasStoryRing ? .unread : .none`).

- [ ] **Step 5.2 : Mettre à jour le call site**

`ConversationView.swift:1269` : remplacer `hasStoryRing: headerHasStoryRing` par `storyState: headerStoryRingState` où :

```swift
private var headerStoryRingState: StoryRingState {
    guard let userId = conversation?.participantUserId,
          conversation?.type == .direct else { return .none }
    return storyViewModel.storyRingState(forUserId: userId)
}
```

(Chercher la définition actuelle de `headerHasStoryRing` via `grep -n "headerHasStoryRing" apps/ios/Meeshy/Features/Main/Views/ConversationView*.swift` ; la remplacer entièrement par la computed ci-dessus, supprimer l'ancienne.)

- [ ] **Step 5.3 : Build + commit**

```bash
./apps/ios/meeshy.sh build
git add -A && git commit -m "fix(ios): ThemedAvatarButton affiche l'état vu/non-vu réel de l'anneau story"
```

---

### Task 6 : Anneau story sur l'avatar expéditeur dans les bulles

L'infra aval existe déjà entièrement (`ThemedMessageBubble.senderStoryRingState`/`onViewStory` lignes 53-54, inclus dans `==` ; `SenderIdentity.storyRing` ; `BubbleFooter` ring + item de menu « Voir la story »). Il manque uniquement l'amont : MLVC ne peuple jamais ces props. NB : l'avatar n'apparaît que si `showAvatar == true` (conversations de groupe) — en DM le header (Task 5) couvre le besoin.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift` (~lignes 505-560, config cellule ; + nouvelle var handler ; + subscription Combine)
- Modify: `apps/ios/Meeshy/Features/Main/Views/MessageListView.swift` (~lignes 290-320, plomberie)
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` (closure de présentation + état overlay lignes 67-70)

- [ ] **Step 6.1 : MLVC — handler + ring dans la config cellule**

Ajouter la var (à côté de `onStoryReplyTap`, ligne ~92) :

```swift
/// Tap sur l'avatar/anneau de l'expéditeur → ouvre sa story (userId).
var onViewSenderStory: ((String) -> Void)?
```

Dans la config cellule (~ligne 490, où sont capturés les autres handlers), capturer :

```swift
let senderId = message.senderId
let ringState = self.storyViewModel.storyRingState(forUserId: senderId)
let viewSenderStoryHandler = self.onViewSenderStory
```

(Vérifier le nom exact du champ sender sur `Message` : `grep -n "senderId" packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift | head -3` — adapter si c'est `sender.id`.)

Puis dans l'init `ThemedMessageBubble(...)` (~ligne 522), ajouter les deux arguments :

```swift
senderStoryRingState: isMine ? .none : ringState,
onViewStory: (!isMine && ringState != .none)
    ? { viewSenderStoryHandler?(senderId) }
    : nil,
```

- [ ] **Step 6.2 : MLVC — re-render des cellules visibles quand les stories changent**

`senderStoryRingState` est dans le `==` de `ThemedMessageBubble`, mais une cellule déjà configurée ne se reconfigure pas seule. Dans `MessageListViewController`, à l'endroit où sont créées les autres subscriptions Combine (chercher `store.$` ou `cancellables`), ajouter :

```swift
storyViewModel.$storyGroups
    .map { groups in groups.map { "\($0.id):\($0.hasUnviewed)" } }
    .removeDuplicates()
    .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
    .sink { [weak self] _ in self?.reconfigureVisibleCells() }
    .store(in: &cancellables)
```

et implémenter (adapter au nom réel du diffable data source du fichier) :

```swift
private func reconfigureVisibleCells() {
    guard let dataSource else { return }
    var snapshot = dataSource.snapshot()
    let visibleIds = (tableView.indexPathsForVisibleRows ?? [])
        .compactMap { dataSource.itemIdentifier(for: $0) }
    guard !visibleIds.isEmpty else { return }
    snapshot.reconfigureItems(visibleIds)
    dataSource.apply(snapshot, animatingDifferences: false)
}
```

(Si le fichier utilise `UICollectionView` + un autre nom, suivre le pattern de reconfiguration déjà présent — chercher `reconfigureItems` dans le fichier ; s'il existe déjà un chemin de reconfiguration (typing, presence), le réutiliser au lieu d'en créer un.)

- [ ] **Step 6.3 : MessageListView — plomberie**

Ajouter `var onViewSenderStory: ((String) -> Void)?` aux props de `MessageListView` et dans `makeUIViewController` : `vc.onViewSenderStory = onViewSenderStory` (avec les autres assignations ~ligne 303+).

- [ ] **Step 6.4 : ConversationView — présentation**

1. À l'état overlay (lignes 67-70), ajouter : `var storyViewerStartAtFirstUnviewed = false`.
2. Au site qui construit `MessageListView` (chercher `MessageListView(` dans `ConversationView.swift`), passer :

```swift
onViewSenderStory: { userId in
    overlayState.storyViewerUserId = userId
    overlayState.storyViewerSlideIndex = 0
    overlayState.storyViewerStartAtFirstUnviewed = true
    overlayState.showStoryViewer = true
},
```

3. Dans le `fullScreenCover` overlay (~ligne 610-628), passer `startAtFirstUnviewed: overlayState.storyViewerStartAtFirstUnviewed` au `StoryViewerContainer`, et remettre le flag à `false` au site existant qui ouvre le viewer pour une story-reply (lignes ~998-1000, qui pose un `slideIdx` précis).

- [ ] **Step 6.5 : Build + smoke + commit**

```bash
./apps/ios/meeshy.sh build && ./apps/ios/meeshy.sh test
```
Smoke simulateur : dans une conversation de GROUPE avec un membre ayant une story active → son avatar de bulle porte l'anneau ; tap → reader sur SA story uniquement (`singleGroup` via overlay = comportement existant), première non-vue.

```bash
git add -A && git commit -m "feat(ios): anneau story + tap sur l'avatar expéditeur des bulles (groupe)"
```

---

### Task 7 : Anneau story sur l'avatar auteur de publication (feed)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift` (props ~ligne 10-60, `authorHeader` lignes 346-362, `==` ligne 889)
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootViewComponents.swift:483` (site feed principal)
- Modify: `apps/ios/Meeshy/Features/Main/Views/BookmarksView.swift:17`
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedCommentsSheet.swift:889`

- [ ] **Step 7.1 : Props + Equatable**

`FeedPostCard` est une leaf `.equatable()` sans `@EnvironmentObject` (règle Zero Re-render) — le ring arrive du parent en `let` :

```swift
/// État de l'anneau story de l'auteur — fourni par le parent
/// (FeedPostCard est une leaf .equatable(), pas d'@EnvironmentObject).
var authorStoryRing: StoryRingState = .none
var onViewAuthorStory: (() -> Void)? = nil
```

Dans `nonisolated static func ==` (ligne 889), ajouter :

```swift
lhs.authorStoryRing == rhs.authorStoryRing &&
```

- [ ] **Step 7.2 : Brancher l'avatar**

Dans `authorHeader` (lignes 349-362), enrichir le `MeeshyAvatar` :

```swift
MeeshyAvatar(
    name: post.author,
    context: .postAuthor,
    accentColor: accentColor,
    avatarURL: post.authorAvatarURL,
    storyState: authorStoryRing,
    moodEmoji: authorMoodEmoji,
    onViewProfile: { selectedProfileUser = .from(feedPost: post) },
    onViewStory: onViewAuthorStory,
    onMoodTap: onAuthorMoodTap,
    contextMenuItems: [
        AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
            selectedProfileUser = .from(feedPost: post)
        }
    ] + (onViewAuthorStory.map {
        [AvatarContextMenuItem(label: "Voir la story", icon: "play.circle.fill", action: $0)]
    } ?? [])
)
```

(Vérifier la sémantique de `MeeshyAvatar` : quand `storyState != .none` ET `onViewStory != nil`, le tap par défaut va à la story — comportement identique au tray/bulles. Le profil reste accessible via menu contextuel.)

- [ ] **Step 7.3 : Câbler les parents**

Aux 3 sites (`RootViewComponents.swift:483`, `BookmarksView.swift:17`, `FeedCommentsSheet.swift:889`), ajouter aux arguments du `FeedPostCard(` :

```swift
authorStoryRing: storyViewModel.storyRingState(forUserId: post.authorId),
```

plus le `onViewAuthorStory` propre à chaque parent :

- `RootViewComponents` : réutiliser le mécanisme existant des lignes 438-440 —
  `onViewAuthorStory: { selectedStoryUserId = post.authorId; storyViewerSingleGroup = true; showStoryViewer = true }`.
  Le cover ligne 640 sert AUSSI au tray (flux, `singleGroup: false`) : ajouter un état `@State private var storyViewerSingleGroup = false`, posé `false` par le chemin tray et `true` par l'avatar de post, transmis au `StoryViewerContainer` du cover (`singleGroup: storyViewerSingleGroup`).
- `BookmarksView` et `FeedCommentsSheet` : `onViewAuthorStory: { storyAuthorUserId = post.authorId }` avec un état local + `fullScreenCover` du même pattern (FeedCommentsSheet a déjà `storyViewModel` en `@EnvironmentObject`, ligne 240) :

```swift
@State private var storyAuthorUserId: String?

.fullScreenCover(isPresented: Binding(
    get: { storyAuthorUserId != nil },
    set: { if !$0 { storyAuthorUserId = nil } }
)) {
    StoryViewerContainer(
        viewModel: storyViewModel,
        userId: storyAuthorUserId ?? "",
        isPresented: Binding(
            get: { storyAuthorUserId != nil },
            set: { if !$0 { storyAuthorUserId = nil } }
        ),
        singleGroup: true,
        startAtFirstUnviewed: true,
        presentationSource: "FeedPostCard.authorAvatar"
    )
    .environmentObject(router)
    .environmentObject(conversationListViewModel)
    .environmentObject(statusViewModel)
}
```

(Vérifier que chaque vue hôte a `router`/`conversationListViewModel`/`statusViewModel` à réinjecter — pattern obligatoire, cf. commentaires existants « fullScreenCover does NOT inherit EnvironmentObjects ». Si BookmarksView n'a pas ces env objects, les ajouter en `@EnvironmentObject`.)

- [ ] **Step 7.4 : Build + smoke + commit**

```bash
./apps/ios/meeshy.sh build && ./apps/ios/meeshy.sh test
```
Smoke : feed → un post dont l'auteur a une story active → anneau visible ; tap avatar → reader (sa story seule, première non-vue) ; menu contextuel → « Voir le profil » fonctionne toujours.

```bash
git add -A && git commit -m "feat(ios): anneau + accès story sur l'avatar auteur de publication"
```

---

### Task 8 : Accès story depuis le profil utilisateur (`UserProfileSheet`)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift` (init + avatar du header)
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift:316` (call site sheet)
- Test: `packages/MeeshySDK/Tests/` (test d'init non-régression si une suite UserProfileSheet existe ; sinon couverture par défauts non-cassants)

- [ ] **Step 8.1 : Paramètres opaques SDK (purity : aucune décision produit dans le SDK)**

Ajouter à `UserProfileSheet` :

```swift
public var storyRingState: StoryRingState = .none
public var onViewStory: (() -> Void)? = nil
```

et les 2 paramètres correspondants en queue d'`init` avec défauts (`storyRingState: StoryRingState = .none, onViewStory: (() -> Void)? = nil`) — non-cassant pour tous les call sites existants.

- [ ] **Step 8.2 : Brancher l'avatar du header du sheet**

Localiser le `MeeshyAvatar` du header : `grep -n "MeeshyAvatar(" packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift`. Lui passer `storyState: storyRingState, onViewStory: onViewStory`.

- [ ] **Step 8.3 : Câbler le call site FeedPostCard**

`FeedPostCard.swift:316` :

```swift
UserProfileSheet(
    user: profileUser,                       // arguments existants inchangés
    ...,
    storyRingState: authorStoryRing,
    onViewStory: onViewAuthorStory.map { handler in
        { selectedProfileUser = nil; handler() }
    }
)
```

(Fermer le sheet avant d'ouvrir le reader — pas d'empilement de covers.)

Les autres call sites de `UserProfileSheet` (PostDetailView, GlobalSearchView, AudioFullscreenView, RootView…) gardent les défauts `.none`/`nil` dans ce lot ; les câbler est un suivi mécanique optionnel hors périmètre.

- [ ] **Step 8.4 : Build + tests SDK + commit**

```bash
./apps/ios/meeshy.sh build
git add -A && git commit -m "feat(sdk+ios): accès story depuis UserProfileSheet (paramètres opaques)"
```

---

### Task 9 : Anneau story dans la recherche globale

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/GlobalSearchView.swift` (3 sites `MeeshyAvatar(` lignes ~388, 449, 569 — identifier celui/ceux des résultats *utilisateur*)

- [ ] **Step 9.1 : Identifier les rows utilisateur**

Run: `sed -n '380,400p;440,460p;560,580p' apps/ios/Meeshy/Features/Main/Views/GlobalSearchView.swift`
Ne câbler que les avatars représentant un utilisateur avec un `userId` fiable (pas les résultats conversation/message sans userId).

- [ ] **Step 9.2 : Câbler ring + tap**

Sur chaque site utilisateur retenu (ex. row de résultat avec `user.id`) :

```swift
storyState: storyViewModel.storyRingState(forUserId: user.id),
onViewStory: {
    storyViewerCoordinator.present(StoryViewerRequest(
        id: user.id, startAtFirstUnviewed: true, singleGroup: true
    ))
},
```

avec en tête de `GlobalSearchView` (si absents) :

```swift
@EnvironmentObject private var storyViewModel: StoryViewModel
@EnvironmentObject private var storyViewerCoordinator: StoryViewerCoordinator
```

(Les deux sont injectés depuis RootView ; si GlobalSearchView est présentée hors de cet arbre, vérifier l'injection au site de présentation et l'ajouter.)

- [ ] **Step 9.3 : Build + smoke + commit**

```bash
./apps/ios/meeshy.sh build
git add -A && git commit -m "feat(ios): anneau + accès story sur les résultats utilisateur de la recherche"
```

---

### Task 10 : Vérification finale du lot

- [ ] **Step 10.1 : Suite complète**

```bash
./apps/ios/meeshy.sh build && ./apps/ios/meeshy.sh test
```
Expected: BUILD SUCCEEDED, 0 failure (re-runner les flaky connus : `FeedViewModelTests.test_loadMoreIfNeeded`, `ConversationListViewModelTests.schedulePersist_*` avant de conclure à une régression).

- [ ] **Step 10.2 : Matrice de smoke (simulateur, skill ios-simulator)**

| Surface | Attendu |
|---|---|
| Tray | inchangé ; « Ma story » s'ouvre via coordinator, singleGroup |
| Liste conversations (DM avec story) | anneau correct, tap → 1re non-vue |
| Header conversation (DM) | anneau tristate correct (plus de faux « non-vu ») |
| Bulle groupe (membre avec story) | anneau + tap → reader |
| Feed avatar auteur | anneau + tap → reader singleGroup |
| Profil (sheet depuis feed) | anneau + tap → sheet se ferme, reader s'ouvre |
| Recherche utilisateur | anneau + tap → reader |
| Push/deep link story | ouvre à la 1re non-vue |
| Story vue dans le reader | tous les anneaux des surfaces visibles passent à `.read` (≤300 ms après retour) |

- [ ] **Step 10.3 : Self-review + PR**

Relire le diff complet (`git diff main...HEAD`), vérifier la cohérence `singleGroup` avec la règle produit, puis ouvrir la PR vers `main` (utiliser `-F` pour le body, jamais de backticks zsh inline) :

```bash
git push -u origin feat/story-surfaces-lot1
gh pr create --base main --title "feat(ios): stories accessibles sur toutes les surfaces (Lot 1)" -F /tmp/pr-body-lot1.md
```
