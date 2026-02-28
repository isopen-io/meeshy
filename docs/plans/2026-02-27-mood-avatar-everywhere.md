# Mood Avatar Everywhere — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Afficher l'emoji mood animé sur TOUS les `MeeshyAvatar` de l'app, tappable pour ouvrir la `StatusBubbleOverlay`, en utilisant uniquement le cache iOS existant (`statusViewModel`).

**Architecture:** Un `StatusBubbleController` singleton centralisé gère l'état de l'overlay. Un `ViewModifier` `.withStatusBubble()` est appliqué à chaque vue pour afficher l'overlay au-dessus de son contenu. `StatusViewModel.moodTapHandler(for:)` retourne le callback `onMoodTap` pour chaque avatar.

**Tech Stack:** SwiftUI, Swift 5.9, iOS 17+, MVVM, `@EnvironmentObject`, `@ObservedObject`, `@MainActor`

---

## Contexte important

- `StatusViewModel` est un `@EnvironmentObject` disponible dans toute la hiérarchie principale de l'app
- `StatusViewModel.statusForUser(userId:)` retourne `StatusEntry?` (lookup O(n) instantané)
- `StatusEntry` a : `userId`, `moodEmoji`, `content`, `audioUrl`, `timeAgo`, `avatarColor`
- Le socket IO met `statuses` à jour en temps réel → tous les avatars se mettent à jour automatiquement
- `MeeshyAvatar` accepte `moodEmoji: String?` (badge) et `onMoodTap: ((CGPoint) -> Void)?` (tap handler)
- Si `moodEmoji == nil`, `MeeshyAvatar` n'affiche pas de badge → pas de tap possible

## Pattern commun (à appliquer partout)

Pour chaque `MeeshyAvatar` qui a un `userId` connu :
```swift
MeeshyAvatar(
    // ... paramètres existants ...
    moodEmoji: statusViewModel.statusForUser(userId: userId)?.moodEmoji,
    onMoodTap: statusViewModel.moodTapHandler(for: userId)
)
```

Et ajouter `.withStatusBubble()` sur le body de la vue :
```swift
var body: some View {
    // ... contenu ...
    .withStatusBubble()
}
```

---

## Task 1: StatusBubbleController + ViewModifier

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/StatusBubbleController.swift`

**Step 1: Créer le fichier**

```swift
import SwiftUI
import MeeshySDK

// MARK: - Status Bubble Controller

@MainActor
final class StatusBubbleController: ObservableObject {
    static let shared = StatusBubbleController()
    private init() {}

    @Published var currentEntry: StatusEntry?
    @Published var anchor: CGPoint = .zero

    func show(entry: StatusEntry, anchor: CGPoint) {
        currentEntry = entry
        self.anchor = anchor
    }

    func dismiss() {
        currentEntry = nil
    }

    var isPresented: Binding<Bool> {
        Binding(
            get: { self.currentEntry != nil },
            set: { if !$0 { self.currentEntry = nil } }
        )
    }
}

// MARK: - View Modifier

private struct StatusBubbleOverlayModifier: ViewModifier {
    @ObservedObject private var controller = StatusBubbleController.shared

    func body(content: Content) -> some View {
        ZStack {
            content
            if let entry = controller.currentEntry {
                StatusBubbleOverlay(
                    status: entry,
                    anchorPoint: controller.anchor,
                    isPresented: controller.isPresented
                )
                .zIndex(200)
            }
        }
    }
}

extension View {
    func withStatusBubble() -> some View {
        modifier(StatusBubbleOverlayModifier())
    }
}
```

**Step 2: Vérifier que `StatusBubbleOverlay` est importé (il est dans `apps/ios/Meeshy/Features/Main/Components/StatusBubbleOverlay.swift` — pas besoin d'import supplémentaire, même module)**

**Step 3: Commit**
```bash
git add apps/ios/Meeshy/Features/Main/Services/StatusBubbleController.swift
git commit -m "feat(ios): add StatusBubbleController singleton + withStatusBubble() modifier"
```

---

## Task 2: StatusViewModel — ajouter moodTapHandler

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/StatusViewModel.swift:163-167`

**Step 1: Ajouter la méthode après `statusForUser` (ligne ~167)**

```swift
// MARK: - Mood Tap Handler

func moodTapHandler(for userId: String) -> ((CGPoint) -> Void)? {
    guard statusForUser(userId: userId) != nil else { return nil }
    return { [weak self] point in
        guard let entry = self?.statusForUser(userId: userId) else { return }
        Task { @MainActor in
            StatusBubbleController.shared.show(entry: entry, anchor: point)
        }
    }
}
```

**Step 2: Build pour vérifier**
```bash
cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh build
```
Expected: `Build succeeded`

**Step 3: Commit**
```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/StatusViewModel.swift
git commit -m "feat(ios): add StatusViewModel.moodTapHandler(for:) helper"
```

---

## Task 3: ConversationListView — migrer vers StatusBubbleController

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`

**Step 1: Supprimer les 3 state vars de gestion du bubble (lignes 69-71)**

Supprimer :
```swift
// Status bubble overlay state
@State private var showStatusBubble = false
@State private var selectedStatusEntry: StatusEntry?
@State private var moodBadgeAnchor: CGPoint = .zero
```

**Step 2: Remplacer l'overlay existant (lignes ~605-615)**

Remplacer :
```swift
.overlay {
    // Status bubble overlay
    if showStatusBubble, let status = selectedStatusEntry {
        StatusBubbleOverlay(
            status: status,
            anchorPoint: moodBadgeAnchor,
            isPresented: $showStatusBubble
        )
        .zIndex(200)
    }
}
```
Par rien (supprimer ce bloc — l'overlay est maintenant géré par `.withStatusBubble()`).

**Step 3: Trouver le body principal de ConversationListView et ajouter `.withStatusBubble()`**

Chercher avec `grep -n "var body: some View" apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`. Le body retourne un `NavigationStack` ou `ZStack`. Ajouter `.withStatusBubble()` sur le dernier modificateur du body.

Exemple (adapter selon le code existant) :
```swift
var body: some View {
    ZStack {
        // ...contenu existant...
    }
    // ...modificateurs existants...
    .withStatusBubble()   // ← ajouter ici, en dernier
}
```

**Step 4: Trouver où `showStatusBubble`, `selectedStatusEntry`, `moodBadgeAnchor` sont affectés (ligne ~700) et migrer**

Chercher avec `grep -n "selectedStatusEntry\|moodBadgeAnchor\|showStatusBubble" apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`

Remplacer le bloc d'affectation par :
```swift
// Avant :
selectedStatusEntry = status
moodBadgeAnchor = anchor
showStatusBubble = true

// Après :
StatusBubbleController.shared.show(entry: status, anchor: anchor)
```

**Step 5: Build pour vérifier**
```bash
./apps/ios/meeshy.sh build
```
Expected: `Build succeeded`

**Step 6: Commit**
```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift
git commit -m "feat(ios): migrate ConversationListView status bubble to StatusBubbleController"
```

---

## Task 4: ConversationView+Header — moodEmoji + onMoodTap

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+Header.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` (body uniquement)

**Contexte :** `ConversationView` a déjà `@EnvironmentObject var statusViewModel: StatusViewModel` (ligne 55).

**Step 1: Modifier le 1er `MeeshyAvatar` (conversation directe, lignes ~30-50)**

Ajouter après `presenceState: presenceManager.presenceState(for: userId),` :
```swift
moodEmoji: statusViewModel.statusForUser(userId: userId)?.moodEmoji,
onMoodTap: statusViewModel.moodTapHandler(for: userId),
```

**Step 2: Modifier les avatars membres groupe (lignes ~54-74, dans `ForEach(topActiveMembers)`)**

Pour chaque `MeeshyAvatar` membre, après `presenceState: presenceManager.presenceState(for: member.id),` :
```swift
moodEmoji: statusViewModel.statusForUser(userId: member.id)?.moodEmoji,
onMoodTap: statusViewModel.moodTapHandler(for: member.id),
```

**Step 3: Modifier le 3ème `MeeshyAvatar` (avatar collapsed, ligne ~95)**

Cet avatar affiche la conversation directe ou de groupe. Pour les convs directes, `userId = conversation?.participantUserId`. Pour les groupes, pas de userId unique → skip `moodEmoji` pour cet avatar collapsed (il représente le groupe, pas un user). Laisser comme tel.

**Step 4: Ajouter `.withStatusBubble()` au body de ConversationView**

Dans `ConversationView.swift`, trouver le body principal et ajouter `.withStatusBubble()` en dernier modificateur :
```swift
var body: some View {
    // ... contenu ...
    .withStatusBubble()
}
```

**Step 5: Build pour vérifier**
```bash
./apps/ios/meeshy.sh build
```

**Step 6: Commit**
```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationView+Header.swift
git add apps/ios/Meeshy/Features/Main/Views/ConversationView.swift
git commit -m "feat(ios): add mood emoji to ConversationView header avatars"
```

---

## Task 5: ParticipantsView — refactoring avatar + moodEmoji

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift`

**Contexte :** ParticipantsView utilise un `ZStack` manuel avec une dot online overlay. Il faut switcher vers le système natif de `MeeshyAvatar` (qui gère la dot via `presenceState:`), et ajouter le mood.

**Step 1: Ajouter `@EnvironmentObject` pour statusViewModel**

Chercher les `@EnvironmentObject` existants dans le fichier et ajouter :
```swift
@EnvironmentObject private var statusViewModel: StatusViewModel
```

**Step 2: Modifier `participantRow` (ligne ~202-218)**

Remplacer le `ZStack` avec dot manuelle par un `MeeshyAvatar` direct :

```swift
// AVANT :
ZStack(alignment: .bottomTrailing) {
    MeeshyAvatar(
        name: participant.name,
        size: .small,
        accentColor: color,
        avatarURL: participant.avatar
    )
    if isOnline {
        Circle()
            .fill(Color(hex: "4ECDC4"))
            .frame(width: 10, height: 10)
            .overlay(Circle().stroke(theme.backgroundPrimary, lineWidth: 2))
            .offset(x: 2, y: 2)
    }
}

// APRÈS :
MeeshyAvatar(
    name: participant.name,
    mode: .messageBubble,
    accentColor: color,
    avatarURL: participant.avatar,
    moodEmoji: statusViewModel.statusForUser(userId: participant.id)?.moodEmoji,
    presenceState: presenceManager.presenceState(for: participant.id),
    onMoodTap: statusViewModel.moodTapHandler(for: participant.id)
)
```

**Step 3: Supprimer la variable `isOnline` si elle n'est plus utilisée**

Chercher avec `grep -n "isOnline" apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift` — si uniquement utilisée dans le ZStack supprimé, supprimer aussi `let isOnline = ...`.

**Step 4: Ajouter `.withStatusBubble()` au body de ParticipantsView**

Trouver `var body: some View` et ajouter `.withStatusBubble()` en dernier modificateur.

**Step 5: Build**
```bash
./apps/ios/meeshy.sh build
```

**Step 6: Commit**
```bash
git add apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift
git commit -m "feat(ios): add mood emoji to ParticipantsView avatars"
```

---

## Task 6: StoryTrayView — moodEmoji + onMoodTap

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift`

**Contexte :** `StoryTrayView` n'a pas `statusViewModel`. `group.id` dans `storyRing` est le userId de l'auteur des stories.

**Step 1: Ajouter `@EnvironmentObject`**
```swift
@EnvironmentObject private var statusViewModel: StatusViewModel
```

**Step 2: Modifier `storyRing` (ligne ~123)**

Dans `MeeshyAvatar`, après `presenceState: presenceManager.presenceState(for: group.id),` :
```swift
moodEmoji: statusViewModel.statusForUser(userId: group.id)?.moodEmoji,
onMoodTap: statusViewModel.moodTapHandler(for: group.id),
```

**Step 3: Ajouter `.withStatusBubble()` au body**

**Step 4: Build**
```bash
./apps/ios/meeshy.sh build
```

**Step 5: Commit**
```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift
git commit -m "feat(ios): add mood emoji to StoryTrayView avatars"
```

---

## Task 7: FeedPostCard — moodEmoji + onMoodTap

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift`

**Contexte :** `FeedPostCard` a `let post: FeedPost`. `FeedPost.authorId: String` est le userId de l'auteur.

**Step 1: Ajouter `@EnvironmentObject`**
```swift
@EnvironmentObject private var statusViewModel: StatusViewModel
```

**Step 2: Modifier l'avatar auteur dans `authorHeader` (ligne ~82)**

```swift
MeeshyAvatar(
    name: post.author,
    mode: .custom(44),
    accentColor: accentColor,
    avatarURL: post.authorAvatarURL,
    moodEmoji: statusViewModel.statusForUser(userId: post.authorId)?.moodEmoji,
    onMoodTap: statusViewModel.moodTapHandler(for: post.authorId),
    onViewProfile: { selectedProfileUser = .from(feedPost: post) },
    contextMenuItems: [...]
)
```

**Note :** Il y a un 2ème avatar ligne ~355 (repost ou commentaire). Faire de même avec le userId disponible.

**Step 3: Ajouter `.withStatusBubble()` au body**

**Step 4: Build**
```bash
./apps/ios/meeshy.sh build
```

**Step 5: Commit**
```bash
git add apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift
git commit -m "feat(ios): add mood emoji to FeedPostCard author avatar"
```

---

## Task 8: Bulk — FeedCommentsSheet, NewConversationView, GlobalSearchView, ThreadView

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedCommentsSheet.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/NewConversationView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/GlobalSearchView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThreadView.swift`

**Pattern à appliquer dans chaque fichier :**

1. `grep -n "MeeshyAvatar\|@EnvironmentObject" <fichier>` pour repérer les appels et les envobjects existants
2. Ajouter `@EnvironmentObject private var statusViewModel: StatusViewModel` si absent
3. Pour chaque `MeeshyAvatar` call où un userId est disponible, ajouter :
   ```swift
   moodEmoji: statusViewModel.statusForUser(userId: <userId>)?.moodEmoji,
   onMoodTap: statusViewModel.moodTapHandler(for: <userId>),
   ```
4. Ajouter `.withStatusBubble()` au body

**Notes par fichier :**
- `FeedCommentsSheet` : le userId est sur chaque commentaire (`comment.userId` ou `comment.authorId`)
- `NewConversationView` : le userId est sur chaque contact résultat (`contact.id` ou `user.id`)
- `GlobalSearchView` : résultats de recherche ont un userId
- `ThreadView` : avatars des messages de thread ont `msg.senderId`

**Step final : Build + Commit**
```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/Views/FeedCommentsSheet.swift \
        apps/ios/Meeshy/Features/Main/Views/NewConversationView.swift \
        apps/ios/Meeshy/Features/Main/Views/GlobalSearchView.swift \
        apps/ios/Meeshy/Features/Main/Views/ThreadView.swift
git commit -m "feat(ios): add mood emoji to feed comments, new conversation, global search, thread views"
```

---

## Task 9: Bulk — ForwardPickerSheet, ConversationInfoSheet, SharePickerView, FriendRequestListView, AudioFullscreenView

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/ForwardPickerSheet.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/SharePickerView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/FriendRequestListView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/AudioFullscreenView.swift`

**Même pattern que Task 8 :**
1. Repérer les `MeeshyAvatar` calls et les userId disponibles
2. Ajouter `@EnvironmentObject private var statusViewModel: StatusViewModel` si absent
3. Ajouter `moodEmoji:` + `onMoodTap:` à chaque avatar
4. Ajouter `.withStatusBubble()` au body

**Step final : Build + Commit**
```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/Components/ForwardPickerSheet.swift \
        apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift \
        apps/ios/Meeshy/Features/Main/Views/SharePickerView.swift \
        apps/ios/Meeshy/Features/Main/Views/FriendRequestListView.swift \
        apps/ios/Meeshy/Features/Main/Views/AudioFullscreenView.swift
git commit -m "feat(ios): add mood emoji to picker sheets and auxiliary views"
```

---

## Task 10: UserProfileSheet (SDK) — moodEmoji param

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift`
- Modify: tous les call sites de `UserProfileSheet` dans l'app

**Contexte :** `UserProfileSheet` est dans le SDK et ne peut pas accéder à `statusViewModel`. Il faut ajouter un paramètre public.

**Step 1: Ajouter propriétés à `UserProfileSheet`**

Après `public let user: ProfileSheetUser` (ligne 7) :
```swift
public var moodEmoji: String? = nil
public var onMoodTap: ((CGPoint) -> Void)? = nil
```

**Step 2: Modifier `profileAvatar` (ligne ~236)**

```swift
// AVANT :
MeeshyAvatar(
    name: avatarName,
    mode: .custom(80),
    accentColor: isBlockedByTarget ? "888888" : resolvedAccent,
    avatarURL: displayUser.avatarURL,
    storyState: showRing ? .read : .none,
    presenceState: isBlockedByTarget ? .offline : presenceFromUser
)

// APRÈS :
MeeshyAvatar(
    name: avatarName,
    mode: .custom(80),
    accentColor: isBlockedByTarget ? "888888" : resolvedAccent,
    avatarURL: displayUser.avatarURL,
    storyState: showRing ? .read : .none,
    moodEmoji: isBlockedByTarget ? nil : moodEmoji,
    presenceState: isBlockedByTarget ? .offline : presenceFromUser,
    onMoodTap: isBlockedByTarget ? nil : onMoodTap
)
```

**Step 3: Mettre à jour les call sites dans l'app**

Chercher tous les `UserProfileSheet(user:` dans l'app :
```bash
grep -rn "UserProfileSheet(user:" apps/ios/Meeshy/ --include="*.swift"
```

Pour chaque call site où un userId est disponible depuis `statusViewModel`, ajouter :
```swift
UserProfileSheet(
    user: someUser,
    moodEmoji: statusViewModel.statusForUser(userId: someUser.userId ?? "")?.moodEmoji,
    onMoodTap: statusViewModel.moodTapHandler(for: someUser.userId ?? "")
)
```

**Note :** Certains call sites n'ont pas accès à `statusViewModel` (ex: dans le SDK lui-même). Pour ceux-là, laisser les paramètres par défaut (`nil`).

**Step 4: Build**
```bash
./apps/ios/meeshy.sh build
```

**Step 5: Commit**
```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift
git add apps/ios/Meeshy/
git commit -m "feat(sdk): add moodEmoji+onMoodTap params to UserProfileSheet"
```

---

## Task 11: Build final + run

**Step 1: Build complet**
```bash
cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh build
```
Expected: `Build succeeded`

**Step 2: Run sur simulateur**
```bash
./apps/ios/meeshy.sh run
```

**Step 3: Vérifier manuellement**
- Ouvrir l'app → liste de conversations : emoji mood visible sur les avatars avec status actif
- Ouvrir une conversation de groupe → avatars senders avec mood
- Tapper sur un emoji mood → StatusBubbleOverlay s'affiche
- Tapper en dehors → bubble se ferme
- Ouvrir ParticipantsView d'un groupe → avatars avec mood
- Ouvrir le Feed → avatars auteurs avec mood
- Ouvrir une story → avatar story tray avec mood
