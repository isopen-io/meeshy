# iOS Performance Optimization — Interface Ultra-Fluide

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Éliminer la saturation du thread principal pour atteindre 60 FPS constants sur les 3 listes critiques : conversations, messages, feed.

**Architecture:** Les bottlenecks sont concentrés dans 4 patterns : (1) socket events sans debounce qui inondent le main thread, (2) ForEach sans Equatable qui re-rendent toutes les rows sur chaque changement, (3) Set créations O(n) répétées, (4) calculs coûteux dans onAppear de chaque cellule. Chaque tâche est indépendante et peut être commitée séparément.

**Tech Stack:** Swift 5.9, SwiftUI iOS 17, Combine, @MainActor ViewModels, GRDB, Kingfisher 7.10

---

## Contexte : Diagnostic Complet des Bottlenecks

### Saturation Principal — 3 Sources Majeures

| Source | Impact | Fichier | Ligne |
|--------|--------|---------|-------|
| `unreadUpdated` socket sans debounce → `invalidateCache()` à chaque event | CRITIQUE | `ConversationListViewModel.swift` | 168-172 |
| `ForEach` messages sans `Equatable` → re-render toutes les rows sur réaction/read | CRITIQUE | `ConversationView.swift` | ~100 |
| `onAppear` sur chaque post → O(n) `firstIndex(where:)` par cellule visible | HAUT | `FeedView.swift` | 697-698 |
| `Set(messages.map(\.id))` recréé à chaque pagination older/search | HAUT | `ConversationViewModel.swift` | 411, 792, 937 |
| `ForEach` conversations sans `Equatable` → re-render tout sur unread update | HAUT | `ConversationListView.swift` | partout |
| `messages.didSet` invalide `_allAudioItems` à chaque append → O(n×m) recompute | MOYEN | `ConversationViewModel.swift` | 27-36 |
| 20+ `@Published` dans `ConversationViewModel` → chaque prop déclenche re-eval totale | MOYEN | `ConversationViewModel.swift` | 37-97 |
| `DragGesture` sur CHAQUE row (50+ handlers actifs) sur main thread | MOYEN | `ConversationView+MessageRow.swift` | ~200 |

---

## Phase 1 — Quick Wins : Debounce & ID Index (Jour 1)

### Task 1 : Debouncer les socket events dans ConversationListViewModel

**Pourquoi :** `invalidateCache()` est appelé sans debounce sur chaque event socket (`unreadUpdated`, `messageReceived`). Si 20 messages arrivent en 500ms, ça déclenche 20 rebuilds du pipeline Combine + 20 `filteredConversations` recalculs.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift:159-220`

**Step 1: Lire le code actuel des socket subscriptions**
```bash
sed -n '155,230p' apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift
```

**Step 2: Ajouter une propriété de debounce + un subject pour batching**

Après la déclaration des `cancellables`, ajouter dans la section `private` du ViewModel (chercher `// MARK: - Private`) :

```swift
// Debounce subject pour les socket events haute fréquence
private let socketEventBatch = PassthroughSubject<Void, Never>()
```

**Step 3: Modifier `subscribeToSocketEvents()` pour utiliser le debounce**

Localiser `socketManager.unreadUpdated` et `socketManager.messageReceived` (lignes ~168 et ~181). Remplacer les deux sinks qui appellent `invalidateCache()` en:

```swift
// AVANT (dans unreadUpdated.sink):
invalidateCache()

// APRÈS:
socketEventBatch.send()
```

Et ajouter ce pipeline dans `init()` ou `subscribeToSocketEvents()` :

```swift
socketEventBatch
    .debounce(for: .milliseconds(400), scheduler: DispatchQueue.main)
    .sink { [weak self] in
        self?.invalidateCache()
    }
    .store(in: &cancellables)
```

**Step 4: Vérifier que les mises à jour UI directes (unreadCount, lastMessagePreview) restent immédiates**

Les mutations sur `self.conversations[idx]` (unreadCount, lastMessageAt, etc.) DOIVENT rester immédiates — seul `invalidateCache()` est debounced. Vérifier que les sinks ressemblent à :

```swift
socketManager.unreadUpdated
    .receive(on: DispatchQueue.main)
    .sink { [weak self] event in
        guard let self else { return }
        // Mutation directe → immédiate (bonne)
        if let idx = self.convIndex(for: event.conversationId) {
            self.conversations[idx].unreadCount = event.unreadCount
        }
        // Cache invalidation → debounced (bonne)
        socketEventBatch.send()
    }
    .store(in: &cancellables)
```

**Step 5: Build**
```bash
./apps/ios/meeshy.sh build
```
Expected: BUILD SUCCEEDED

**Step 6: Commit**
```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift
git commit -m "perf(ios): debounce socket cache invalidation 400ms dans ConversationListViewModel"
```

---

### Task 2 : Éliminer O(n) Set rebuilds dans ConversationViewModel

**Pourquoi :** `Set(messages.map(\.id))` est recréé à chaque `loadOlderMessages()`, `loadNewerMessages()`, et pendant le jump search. Avec 200+ messages, c'est une allocation O(n) inutile car le `_messageIdIndex` existe déjà.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:408-413, 789-794, 934-939`

**Step 1: Chercher toutes les occurrences**
```bash
grep -n "Set(messages.map" apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
```
Expected output: lignes ~411, ~792, ~937

**Step 2: Remplacer chaque occurrence par `containsMessage(id:)`**

Le ViewModel possède déjà `containsMessage(id:)` qui utilise `_messageIdIndex` (O(1) avec cache). Remplacer :

```swift
// AVANT (x3 occurrences)
let existingIds = Set(messages.map(\.id))
let newMessages = olderMessages.filter { !existingIds.contains($0.id) }

// APRÈS
let newMessages = olderMessages.filter { !containsMessage(id: $0.id) }
```

**Step 3: Vérifier que `containsMessage` est accessible (non-private)**
```bash
grep -n "func containsMessage\|private func containsMessage" apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
```
Si `private`, retirer le modificateur.

**Step 4: Build**
```bash
./apps/ios/meeshy.sh build
```

**Step 5: Commit**
```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
git commit -m "perf(ios): éliminer Set(messages.map) O(n) — utiliser containsMessage O(1)"
```

---

### Task 3 : Remplacer onAppear infinite scroll dans FeedView

**Pourquoi :** Chaque post visible appelle `loadMoreIfNeeded(currentPost:)` via `onAppear`. Cette fonction fait `posts.firstIndex(where: { $0.id == currentPost.id })` — O(n) par cellule. Avec 40 posts visibles et scroll rapide, c'est 40+ O(n) lookups/seconde sur le main thread.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift:61-95`
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView.swift:634-720`

**Step 1: Lire le code actuel de loadMoreIfNeeded**
```bash
sed -n '58,100p' apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift
```

**Step 2: Remplacer `loadMoreIfNeeded(currentPost:)` par `loadMoreIfNeededAt(index:)`**

Dans `FeedViewModel.swift`, remplacer la fonction :

```swift
// AVANT
func loadMoreIfNeeded(currentPost: FeedPost) async {
    guard let index = posts.firstIndex(where: { $0.id == currentPost.id }) else { return }
    let threshold = posts.count - 5
    guard index >= threshold, hasMore, !isLoadingMore, nextCursor != nil else { return }
    // ...
}

// APRÈS — Index passé directement, zéro recherche
func loadMoreIfNeededAt(index: Int) async {
    let threshold = posts.count - 5
    guard index >= threshold, hasMore, !isLoadingMore, nextCursor != nil else { return }

    isLoadingMore = true
    defer { isLoadingMore = false }

    do {
        let response: PaginatedAPIResponse<[APIPost]> = try await api.paginatedRequest(
            endpoint: "/posts/feed",
            cursor: nextCursor,
            limit: 20
        )
        if response.success {
            let newPosts = response.data.map { $0.toFeedPost() }
            // Dedup O(1) avec un Set maintenu en propriété
            let uniqueNew = newPosts.filter { !postIdSet.contains($0.id) }
            uniqueNew.forEach { postIdSet.insert($0.id) }
            posts.append(contentsOf: uniqueNew)
            nextCursor = response.pagination?.nextCursor
            hasMore = response.pagination?.hasMore ?? false
        }
    } catch { /* silently fail */ }
}
```

**Step 3: Ajouter `postIdSet` comme propriété privée maintenue**

Dans `FeedViewModel`, ajouter après la déclaration de `posts` :

```swift
@Published var posts: [FeedPost] = [] {
    didSet {
        // Maintenir le Set en sync (uniquement sur assign complet, pas sur append)
    }
}
/// Set des IDs pour dedup O(1) — maintenu en parallèle de posts
private var postIdSet: Set<String> = []
```

Et dans `loadFeed()`, après `posts = response.data.map { $0.toFeedPost() }` :
```swift
postIdSet = Set(posts.map(\.id))
```

**Step 4: Mettre à jour FeedView pour passer l'index**

Dans `FeedView.swift`, dans le `ForEach` qui itère les posts, passer l'index :

```swift
// AVANT
ForEach(filteredPosts, id: \.id) { post in
    FeedPostCard(post: post, ...)
        .onAppear {
            Task { await viewModel.loadMoreIfNeeded(currentPost: post) }
        }
}

// APRÈS — Utiliser enumerated() pour avoir l'index
ForEach(Array(filteredPosts.enumerated()), id: \.element.id) { index, post in
    FeedPostCard(post: post, ...)
        .onAppear {
            // Vérifier seulement si proche de la fin (évite les calls inutiles)
            let isNearEnd = index >= filteredPosts.count - 5
            if isNearEnd {
                Task { await viewModel.loadMoreIfNeededAt(index: index) }
            }
        }
}
```

**Step 5: Build**
```bash
./apps/ios/meeshy.sh build
```

**Step 6: Commit**
```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift
git add apps/ios/Meeshy/Features/Main/Views/FeedView.swift
git commit -m "perf(ios): remplacer onAppear O(n) par index-based threshold dans FeedView"
```

---

## Phase 2 — Equatable Views : Stopper les Re-renders (Jour 2)

**Principe:** Sans `Equatable`, SwiftUI re-évalue le body de chaque row à CHAQUE changement du ViewModel parent — même si les données de cette row n'ont pas changé. Avec `.equatable()`, SwiftUI compare avant/après et skip la re-évaluation si identique.

### Task 4 : Equatable sur ConversationRow

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`

**Step 1: Lire ThemedConversationRow**
```bash
sed -n '1,50p' apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift
```

**Step 2: Conformer ThemedConversationRow à Equatable**

Ajouter la conformance. La struct doit avoir des propriétés `let` (non-`@State`, non-closures) comparables :

```swift
// Dans ThemedConversationRow.swift, trouver la struct principale
struct ThemedConversationRow: View, Equatable {
    let conversation: Conversation
    let isSelected: Bool
    // Les closures (onSelect, etc.) ne sont PAS Equatable — les exclure
    var onSelect: (Conversation) -> Void

    // Implémenter Equatable manuellement (les closures ne sont pas comparables)
    static func == (lhs: ThemedConversationRow, rhs: ThemedConversationRow) -> Bool {
        lhs.conversation.id == rhs.conversation.id &&
        lhs.conversation.unreadCount == rhs.conversation.unreadCount &&
        lhs.conversation.lastMessagePreview == rhs.conversation.lastMessagePreview &&
        lhs.conversation.lastMessageAt == rhs.conversation.lastMessageAt &&
        lhs.conversation.isPinned == rhs.conversation.isPinned &&
        lhs.isSelected == rhs.isSelected
    }
}
```

**Step 3: Appliquer `.equatable()` dans la ConversationListView**

Chercher dans `ConversationListView.swift` où `ThemedConversationRow` est instancié dans un `ForEach` :

```swift
// AVANT
ForEach(group.conversations, id: \.id) { conv in
    ThemedConversationRow(
        conversation: conv,
        isSelected: selectedConversation?.id == conv.id,
        onSelect: { onSelect(conv) }
    )
}

// APRÈS
ForEach(group.conversations, id: \.id) { conv in
    ThemedConversationRow(
        conversation: conv,
        isSelected: selectedConversation?.id == conv.id,
        onSelect: { onSelect(conv) }
    )
    .equatable()  // Skip re-render si == retourne true
}
```

**Step 4: Build**
```bash
./apps/ios/meeshy.sh build
```

**Step 5: Commit**
```bash
git add apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift
git add apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift
git commit -m "perf(ios): Equatable sur ThemedConversationRow — stopper re-renders inutiles"
```

---

### Task 5 : Equatable sur FeedPostCard

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView.swift`

**Step 1: Ajouter Equatable à FeedPostCard**

```swift
struct FeedPostCard: View, Equatable {
    let post: FeedPost
    var isCommentsExpanded: Bool = false
    // Closures non-Equatable → à exclure
    var onToggleComments: (() -> Void)? = nil
    var onLike: ((String) -> Void)? = nil
    // ...

    static func == (lhs: FeedPostCard, rhs: FeedPostCard) -> Bool {
        lhs.post.id == rhs.post.id &&
        lhs.post.likes == rhs.post.likes &&
        lhs.post.comments == rhs.post.comments &&
        lhs.post.isLiked == rhs.post.isLiked &&
        lhs.post.isBookmarked == rhs.post.isBookmarked &&
        lhs.isCommentsExpanded == rhs.isCommentsExpanded
    }
}
```

**Step 2: Appliquer `.equatable()` dans FeedView**

```swift
// Dans le ForEach des posts (après Task 3)
ForEach(Array(filteredPosts.enumerated()), id: \.element.id) { index, post in
    FeedPostCard(post: post, ...)
        .equatable()  // ← Ajouter
        .onAppear {
            let isNearEnd = index >= filteredPosts.count - 5
            if isNearEnd { Task { await viewModel.loadMoreIfNeededAt(index: index) } }
        }
}
```

**Step 3: Build & Commit**
```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift apps/ios/Meeshy/Features/Main/Views/FeedView.swift
git commit -m "perf(ios): Equatable sur FeedPostCard — stopper re-renders sur like/comment"
```

---

### Task 6 : Equatable sur Message Rows dans ConversationView

**Pourquoi :** C'est le plus impactant. Chaque réaction, chaque `read status`, chaque unread update déclenche un re-render de TOUTES les 50 rows visibles. Avec Equatable, seule la row modifiée est re-évaluée.

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/MessageRowWrapper.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`

**Step 1: Créer MessageRowWrapper — une view Equatable encapsulant la row**

Créer le fichier `apps/ios/Meeshy/Features/Main/Views/MessageRowWrapper.swift` :

```swift
import SwiftUI
import MeeshySDK

/// Wrapper Equatable pour ThemedMessageBubble.
/// Permet à SwiftUI de skip la re-évaluation si le message n'a pas changé.
struct MessageRowWrapper: View, Equatable {
    let message: Message
    let index: Int
    let totalCount: Int
    // Données dérivées passées depuis le parent (pas de lookup dans body)
    let transcription: MessageTranscription?
    let textTranslations: [MessageTranslation]
    let translatedAudios: [MessageTranslatedAudio]
    let preferredTranslation: MessageTranslation?
    let activeAudioLanguage: String?
    let isDirect: Bool
    let accentColor: Color
    let senderMoodEmoji: String?

    // Callbacks (non-Equatable)
    var onAddReaction: (String) -> Void
    var onToggleReaction: (String, String) -> Void
    var onOpenReactPicker: (String) -> Void
    var onShowInfo: () -> Void
    var onShowReactions: (String) -> Void
    var onReplyTap: (String) -> Void
    var onMediaTap: (MessageAttachment) -> Void
    var onConsumeViewOnce: (String, () -> Void) -> Void
    var onRequestTranslation: (String, String) -> Void
    var onShowTranslationDetail: (String) -> Void
    var onScrollToMessage: (String) -> Void

    // Equatable: comparer uniquement les données qui impactent visuellement
    static func == (lhs: MessageRowWrapper, rhs: MessageRowWrapper) -> Bool {
        lhs.message.id == rhs.message.id &&
        lhs.message.content == rhs.message.content &&
        lhs.message.reactions == rhs.message.reactions &&
        lhs.message.deliveryStatus == rhs.message.deliveryStatus &&
        lhs.message.isEdited == rhs.message.isEdited &&
        lhs.preferredTranslation?.translatedContent == rhs.preferredTranslation?.translatedContent &&
        lhs.transcription?.transcribedText == rhs.transcription?.transcribedText &&
        lhs.textTranslations.count == rhs.textTranslations.count &&
        lhs.translatedAudios.count == rhs.translatedAudios.count &&
        lhs.senderMoodEmoji == rhs.senderMoodEmoji &&
        lhs.isDirect == rhs.isDirect
    }

    var body: some View {
        // Déléguer à la vue existante (pas dupliquer le code)
        // ⚠️ Voir Step 2 — le body appelle la fonction existante messageRow()
        Color.clear  // Placeholder — voir Step 2
    }
}
```

**Step 2: Refactorer ConversationView pour utiliser MessageRowWrapper**

Dans `ConversationView.swift`, remplacer le `ForEach` des messages. Chercher `ForEach(Array(viewModel.messages.enumerated())` :

```swift
// AVANT
ForEach(Array(viewModel.messages.enumerated()), id: \.element.id) { index, msg in
    messageRow(index: index, msg: msg)
        .onAppear { ... }
        .onDisappear { ... }
}

// APRÈS — Passer toutes les données calculées dans le wrapper
ForEach(Array(viewModel.messages.enumerated()), id: \.element.id) { index, msg in
    MessageRowWrapper(
        message: msg,
        index: index,
        totalCount: viewModel.messages.count,
        transcription: viewModel.messageTranscriptions[msg.id],
        textTranslations: viewModel.messageTranslations[msg.id] ?? [],
        translatedAudios: viewModel.messageTranslatedAudios[msg.id] ?? [],
        preferredTranslation: viewModel.preferredTranslation(for: msg.id),
        activeAudioLanguage: viewModel.activeAudioLanguageOverrides[msg.id] ?? nil,
        isDirect: isDirect,
        accentColor: accentColor,
        senderMoodEmoji: statusViewModel.statusForUser(userId: msg.senderId ?? "")?.moodEmoji,
        onAddReaction: { messageId in /* ... */ },
        // ... autres callbacks
        onScrollToMessage: { messageId in /* ... */ }
    )
    .equatable()
    .onAppear {
        if index < 5 { Task { await viewModel.loadOlderMessages() } }
    }
}
```

**Note architecturale:** Le `body` de `MessageRowWrapper` doit appeler la logique de rendu existante de `ConversationView+MessageRow.swift`. La solution la plus propre est d'extraire le corps de `messageRow()` en une sub-view `MessageBubbleRow` et de l'appeler depuis `MessageRowWrapper.body`.

**Step 3: Build**
```bash
./apps/ios/meeshy.sh build
```

**Step 4: Commit**
```bash
git add apps/ios/Meeshy/Features/Main/Views/MessageRowWrapper.swift
git add apps/ios/Meeshy/Features/Main/Views/ConversationView.swift
git commit -m "perf(ios): MessageRowWrapper Equatable — skip re-render rows inchangées"
```

---

## Phase 3 — State Management : Réduire les @Published (Jour 3)

### Task 7 : Grouper les états éphémères en structs dans ConversationViewModel

**Pourquoi :** `ConversationViewModel` a 20+ `@Published` properties. SwiftUI observe CHAQUE propriété séparément — mais si la View lit plusieurs propriétés dans son body, un changement d'UNE seule déclenche une re-évaluation complète du body. Grouper les états qui changent ensemble en structs `@Published` réduit les triggers.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:37-97`

**Step 1: Lire la section @Published**
```bash
sed -n '36,100p' apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
```

**Step 2: Créer une struct LoadingState**

Juste avant la classe, ajouter :

```swift
/// État de chargement regroupé — un seul @Published au lieu de 5
struct MessageLoadingState: Equatable {
    var isInitial: Bool = false
    var isOlder: Bool = false
    var isNewer: Bool = false
    var isSending: Bool = false
    var error: String? = nil
}
```

**Step 3: Remplacer les 5 @Published individuels**

```swift
// REMPLACER ces 5 lignes:
// @Published var isLoadingInitial = false
// @Published var isLoadingOlder = false
// @Published var isLoadingNewer = false
// @Published var isSending = false
// @Published var error: String?

// PAR un seul struct:
@Published var loadingState = MessageLoadingState()
```

**Step 4: Mettre à jour toutes les références**

```bash
# Trouver toutes les utilisations
grep -rn "isLoadingInitial\|isLoadingOlder\|isLoadingNewer\|isSending\|self\.error" \
    apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift | wc -l
```

Remplacer (exemples) :
```swift
// AVANT
isLoadingInitial = true
isLoadingOlder = false
self.error = error.localizedDescription

// APRÈS
loadingState.isInitial = true
loadingState.isOlder = false
loadingState.error = error.localizedDescription
```

**Step 5: Mettre à jour les Views qui lisent ces propriétés**
```bash
grep -rn "\.isLoadingInitial\|\.isLoadingOlder\|\.isLoadingNewer\|\.isSending" \
    apps/ios/Meeshy/Features/Main/Views/ | head -20
```

Dans chaque View, remplacer `viewModel.isLoadingOlder` par `viewModel.loadingState.isOlder`, etc.

**Step 6: Build**
```bash
./apps/ios/meeshy.sh build
```

**Step 7: Commit**
```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
git add apps/ios/Meeshy/Features/Main/Views/ConversationView.swift
git commit -m "perf(ios): grouper loading states en struct — réduire @Published triggers"
```

---

### Task 8 : Rendre _messageIdIndex persistant (ne pas invalider sur chaque append)

**Pourquoi :** `messages.didSet` invalide `_messageIdIndex = nil` à chaque mutation, y compris un simple `append()` d'un nouveau message. L'index est ensuite rebuild la prochaine fois qu'on appelle `messageIndex(for:)`. Avec un index maintenu incrémentalement, on évite les rebuilds complets.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:26-36, 265-280`

**Step 1: Lire le didSet actuel**
```bash
sed -n '25,45p' apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
```

**Step 2: Modifier didSet pour maintenir l'index incrémentalement**

```swift
@Published var messages: [Message] = [] {
    didSet {
        // AVANT: _messageIdIndex = nil  ← rebuild complet à chaque mutation

        // APRÈS: maintenance incrémentale
        // Si taille identique (update) → reconstruire seulement les entrées modifiées
        // Si plus grand (append) → ajouter les nouvelles entrées
        // Si plus petit (suppression) → reconstruire complètement (rare)
        if messages.count > oldValue.count {
            // Append: ajouter uniquement les nouveaux
            for i in oldValue.count..<messages.count {
                _messageIdIndex?[messages[i].id] = i
            }
        } else if messages.count < oldValue.count {
            // Suppression: rebuild complet (opération rare)
            _messageIdIndex = nil
        }
        // Update (count identique): l'index reste valide car les IDs ne changent pas

        // Les autres caches visuels restent invalidés (comportement correct)
        _topActiveMembers = nil
        _mediaSenderInfoMap = nil
        _allVisualAttachments = nil
        _mediaCaptionMap = nil
        _allAudioItems = nil
        _replyCountMap = nil
    }
}
```

**Step 3: Modifier `rebuildIndexIfNeeded()` pour initialiser à vide si nil**

```swift
private func rebuildIndexIfNeeded() -> [String: Int] {
    if let cached = _messageIdIndex { return cached }
    var index = [String: Int](minimumCapacity: messages.count)
    for (i, msg) in messages.enumerated() {
        index[msg.id] = i
    }
    _messageIdIndex = index
    return index
}
```

**Step 4: Build & Commit**
```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
git commit -m "perf(ios): index messages incrémental — éviter rebuild complet sur append"
```

---

## Phase 4 — Lazy Computation & Cache (Jour 4)

### Task 9 : Découpler _allAudioItems du didSet messages

**Pourquoi :** `allAudioItems` est invalidé à CHAQUE `messages.didSet`, même quand le nouveau message n'a pas d'audio. Résultat : chaque nouveau message textuel déclenche un rebuild O(n×m) au prochain accès à `allAudioItems`. Ajouter une condition intelligente.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:26-36`

**Step 1: Ajouter un compteur d'attachements audio**

Dans la section `private` :
```swift
/// Nombre total d'attachements audio — pour invalider allAudioItems seulement si changé
private var _audioAttachmentCount: Int = 0
```

**Step 2: Modifier le didSet pour n'invalider que si count change**

```swift
@Published var messages: [Message] = [] {
    didSet {
        // ... (index maintenance du Task 8)

        // N'invalider allAudioItems que si le count d'audio a changé
        let newAudioCount = messages.reduce(0) { $0 + $1.attachments.filter { $0.type == .audio }.count }
        if newAudioCount != _audioAttachmentCount {
            _audioAttachmentCount = newAudioCount
            _allAudioItems = nil
        }

        // Autres caches
        _topActiveMembers = nil
        _mediaSenderInfoMap = nil
        _allVisualAttachments = nil
        _mediaCaptionMap = nil
        _replyCountMap = nil
    }
}
```

**Step 3: Build & Commit**
```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
git commit -m "perf(ios): invalidation allAudioItems conditionnelle — éviter O(n×m) inutile"
```

---

### Task 10 : Augmenter le cache LocalStore de 50 à 200 messages

**Pourquoi :** La limite actuelle de 50 messages force une requête API à chaque ouverture de conversation avec l'historique. Passer à 200 signifie que 95%+ des ouvertures de conversations affichent du cache immédiatement sans attendre le réseau.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/LocalStore.swift`

**Step 1: Localiser la constante**
```bash
grep -n "maxCachedMessagesPerConversation\|50" packages/MeeshySDK/Sources/MeeshySDK/Persistence/LocalStore.swift | head -5
```

**Step 2: Modifier la constante**
```swift
// AVANT
private static let maxCachedMessagesPerConversation = 50

// APRÈS
private static let maxCachedMessagesPerConversation = 200
```

**Step 3: Build & Commit**
```bash
./apps/ios/meeshy.sh build
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/LocalStore.swift
git commit -m "perf(ios/sdk): augmenter cache LocalStore 50→200 messages par conversation"
```

---

### Task 11 : Optimiser le pipeline Combine groupedConversations

**Pourquoi :** Le pipeline de grouping reconstruit `Set(categories.map(\.id))` à chaque passage. Avec 50+ catégories, c'est O(n) inutile. De plus, les multiples `.sorted()` sur chaque section peuvent être unifiés.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift:103-140`

**Step 1: Lire le pipeline de grouping**
```bash
sed -n '100,145p' apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift
```

**Step 2: Pré-calculer le Set dans le map et utiliser un sort unique**

```swift
// Dans le .map { (filtered, categories) -> [...] } :

// AVANT (rebuild Set à chaque passage)
let categoryIds = Set(categories.map(\.id))
for category in categories {
    let sectionConvs = filtered.filter { $0.sectionId == category.id }
    if !sectionConvs.isEmpty {
        let sorted = sectionConvs.sorted { a, b in
            if a.isPinned != b.isPinned { return a.isPinned }
            return a.lastMessageAt > b.lastMessageAt
        }
        result.append((category, sorted))
    }
}

// APRÈS — grouping en O(n) avec Dictionary puis tri par section
// 1. Grouper toutes les conversations par sectionId en un seul passage
let bySectionId = Dictionary(grouping: filtered.filter { $0.sectionId != nil }) { $0.sectionId! }

// 2. Comparator réutilisable
let byPinnedThenDate: (Conversation, Conversation) -> Bool = { a, b in
    if a.isPinned != b.isPinned { return a.isPinned }
    return a.lastMessageAt > b.lastMessageAt
}

// 3. Construire les sections depuis le dictionnaire
for category in categories {
    if let sectionConvs = bySectionId[category.id], !sectionConvs.isEmpty {
        result.append((category, sectionConvs.sorted(by: byPinnedThenDate)))
    }
}
```

**Step 3: Build & Commit**
```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift
git commit -m "perf(ios): pipeline groupedConversations — Dictionary grouping O(n) vs multi-filter"
```

---

## Phase 5 — Gesture Isolation (Jour 5)

### Task 12 : Déplacer DragGesture rubber-band sur background thread

**Pourquoi :** Le `DragGesture.onChanged` de chaque message row calcule l'effet rubber-band (floating point math) directement sur le main thread, 60 fois/seconde pendant le swipe. Avec 50 messages visibles, cela représente 50 listeners actifs. La solution : gesture isolation via `@GestureState` et calcul différé.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift`

**Step 1: Lire l'implémentation actuelle du gesture**
```bash
grep -n "DragGesture\|swipeOffset\|rubber\|onChanged\|onEnded" \
    apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift | head -20
```

**Step 2: Remplacer DragGesture par @GestureState**

`@GestureState` est automatiquement reset à `.zero` quand le gesture se termine, et ne publie pas sur `@Published` (moins de re-renders) :

```swift
// AVANT (dans la row)
.simultaneousGesture(
    DragGesture(minimumDistance: overlayState.quickReactionMessageId != nil ? 10000 : 15)
        .onChanged { value in
            scrollState.swipedMessageId = msg.id
            let zone: CGFloat = 72
            let absH = abs(value.translation.width)
            let sign: CGFloat = value.translation.width > 0 ? 1 : -1
            if absH > zone {
                scrollState.swipeOffset = sign * (zone + (absH - zone) * 0.15)
            } else {
                scrollState.swipeOffset = value.translation.width
            }
        }
        .onEnded { value in
            // ...trigger reply/forward
            withAnimation(.spring(response: 0.42, dampingFraction: 0.62)) {
                scrollState.swipeOffset = 0
                scrollState.swipedMessageId = nil
            }
        }
)
.offset(x: isActiveSwipe ? scrollState.swipeOffset : 0)

// APRÈS — GestureState local (pas de @Published, reset automatique)
@GestureState private var dragOffset: CGFloat = 0

var swipeGesture: some Gesture {
    DragGesture(minimumDistance: overlayState.quickReactionMessageId != nil ? 10000 : 15)
        .updating($dragOffset) { value, state, _ in
            // Rubber-band calculation — local, no @Published trigger
            let zone: CGFloat = 72
            let absH = abs(value.translation.width)
            let sign: CGFloat = value.translation.width > 0 ? 1 : -1
            state = absH > zone
                ? sign * (zone + (absH - zone) * 0.15)
                : value.translation.width
        }
        .onEnded { value in
            let directed = abs(value.translation.width)
            if directed >= 66 {
                if value.translation.width > 0 { triggerReply(for: msg) }
                else { composerState.forwardMessage = msg }
            }
        }
}

// Dans body:
.offset(x: dragOffset)
.simultaneousGesture(swipeGesture)
```

**Note :** `@GestureState` ne peut pas être une propriété d'une `extension` de View. Il faudra soit créer une sub-view dédiée pour la row, soit passer par un `@State` avec reset manuel.

**Step 3: Build**
```bash
./apps/ios/meeshy.sh build
```

**Step 4: Commit**
```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift
git commit -m "perf(ios): GestureState pour swipe messages — éliminer @Published sur chaque frame"
```

---

## Phase 6 — Prefetching & Image Loading (Jour 6)

### Task 13 : Prefetching Kingfisher pour les avatars dans ConversationList

**Pourquoi :** Quand l'utilisateur scroll rapidement la liste de conversations, les avatars apparaissent en blanc puis se chargent. Kingfisher supporte le prefetching via `ImagePrefetcher` — démarrer le téléchargement avant que la row soit visible.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift`

**Step 1: Ajouter une fonction prefetchAvatars dans le ViewModel**

```swift
// Dans ConversationListViewModel.swift
import Kingfisher

func prefetchAvatars(for conversations: [Conversation]) {
    let urls = conversations
        .compactMap { $0.avatarUrl }
        .compactMap { URL(string: $0) }

    let prefetcher = ImagePrefetcher(urls: urls)
    prefetcher.start()
}
```

**Step 2: Déclencher le prefetch quand conversations est chargé**

```swift
// Dans loadConversations(), après assignments:
Task { prefetchAvatars(for: conversations) }
```

**Step 3: Build & Commit**
```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift
git add apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift
git commit -m "perf(ios): Kingfisher prefetch avatars conversations au chargement"
```

---

### Task 14 : Débouncer le typing indicator dans ConversationViewModel

**Pourquoi :** Le typing indicator (`typingStatusPublisher`) peut arriver à haute fréquence si plusieurs utilisateurs tapent. Chaque update déclenche un re-render du composer. Debouncer à 100ms.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/ConversationSocketHandler.swift`

**Step 1: Localiser la subscription typing**
```bash
grep -n "typingStatus\|typingUser" apps/ios/Meeshy/Features/Main/Services/ConversationSocketHandler.swift
```

**Step 2: Ajouter debounce 100ms**
```swift
// AVANT
socketManager.typingStatusPublisher
    .receive(on: DispatchQueue.main)
    .sink { [weak self, weak delegate] (roomId, typingUsers) in
        guard self?.conversationId == roomId else { return }
        delegate?.didUpdateTypingUsers(typingUsers)
    }
    .store(in: &cancellables)

// APRÈS
socketManager.typingStatusPublisher
    .filter { [weak self] (roomId, _) in roomId == self?.conversationId }
    .debounce(for: .milliseconds(100), scheduler: DispatchQueue.main)
    .sink { [weak delegate] (_, typingUsers) in
        delegate?.didUpdateTypingUsers(typingUsers)
    }
    .store(in: &cancellables)
```

**Step 3: Build & Commit**
```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/Services/ConversationSocketHandler.swift
git commit -m "perf(ios): debounce 100ms typing indicator — réduire re-renders composer"
```

---

## Phase 7 — Profiling & Validation (Jour 7)

### Task 15 : Profiler avec Instruments Time Profiler

**Objectif :** Mesurer l'impact de toutes les optimisations et identifier des bottlenecks résiduels.

**Step 1: Lancer l'app sur device réel (ou simulateur Release)**
```bash
./apps/ios/meeshy.sh build
```

**Step 2: Ouvrir Instruments**
```bash
open /Applications/Xcode.app/Contents/Applications/Instruments.app
```
Choisir **SwiftUI** template (ou **Time Profiler** pour le CPU).

**Step 3: Reproduire les scénarios de stress**

1. **Conversation list :** Recevoir 10 messages rapidement → observer que la liste ne refreeze plus
2. **Message list :** Scroller 200 messages rapidement → observer 60 FPS constant
3. **Feed :** Scroller 50 posts → observer que loadMoreIfNeeded ne spam plus

**Step 4: Targets de performance post-optimisation**

| Métrique | Avant | Cible |
|----------|-------|-------|
| FPS scroll conversation list | ~40 FPS | 60 FPS |
| FPS scroll message list | ~35-45 FPS | 60 FPS |
| FPS scroll feed | ~50 FPS | 60 FPS |
| Latence unread update (socket → UI) | <150ms | <100ms |
| Latence ouverture conversation (cache) | ~200ms | <50ms |
| Re-renders par socket unread event | ~20 rows | 1-2 rows |

**Step 5: Documenter les résultats**
```bash
# Ajouter les résultats à tasks/lessons.md
```

---

## Résumé des Fichiers Modifiés

| Fichier | Phase | Impact |
|---------|-------|--------|
| `ConversationListViewModel.swift` | 1, 11 | Debounce socket, pipeline O(n) |
| `ConversationViewModel.swift` | 2, 7, 8, 9 | Set O(n), states groupés, index incrémental, audio cache |
| `FeedViewModel.swift` | 1 | Index-based scroll trigger |
| `FeedView.swift` | 1, 2 | onAppear O(n), equatable |
| `ThemedConversationRow.swift` | 2 | Equatable |
| `FeedPostCard.swift` | 2 | Equatable |
| `MessageRowWrapper.swift` (NEW) | 2 | Equatable wrapper messages |
| `ConversationView.swift` | 2 | Utiliser MessageRowWrapper |
| `ConversationView+MessageRow.swift` | 5 | GestureState |
| `ConversationSocketHandler.swift` | 6 | Debounce typing |
| `LocalStore.swift` (SDK) | 4 | Cache 50→200 messages |

---

## Notes d'Architecture

### Pourquoi .equatable() est si impactant
SwiftUI utilise l'identité structurelle pour détecter les changements. Un `ForEach` avec 50 rows déclenche une re-évaluation de chaque row body quand le ViewModel parent change. Avec `.equatable()`, SwiftUI compare `lhs == rhs` avant de re-évaluer — si les données sont identiques, le body est skipé entièrement. Pour 50 messages avec 1 réaction qui change, on passe de 50 body evaluations à 1.

### Pourquoi les GestureState vs @Published
`@GestureState` est local au gesture, ne publie pas via Combine/ObservableObject, et reset automatiquement. `@Published var swipeOffset` publie à 60 FPS pendant le drag → re-render du ConversationView parent → re-render de tous les autres rows. `@GestureState` est scopé à la view et n'affecte que le `offset()` local.

### Concernant l'AudioItem cache
`allAudioItems` utilise déjà un lazy pattern (`_allAudioItems?`). Le problème est qu'il est invalidé inutilement à chaque `messages.didSet`, même pour des messages texte. La Task 9 ajoute une guard conditionnelle basée sur le count d'attachements audio.

### Kingfisher vs CachedAsyncImage
`CachedAsyncImage` utilise déjà `MediaCacheManager` (NSCache + FileManager). Ce n'est pas un problème de caching — les images sont déjà cachées. L'opportunité est dans le **prefetching** (tâche 13) : télécharger à l'avance les images qui seront visibles 500ms plus tard.
