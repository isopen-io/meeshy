# Conversation List Real-time Updates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Corriger le bug de re-render des rows de la liste des conversations et ajouter le typing indicator animé dans chaque row.

**Architecture:** Deux fixes indépendants — (1) `renderFingerprint` dans `MeeshyConversation` pour que `.equatable()` détecte les changements de contenu, (2) subscription `typingStarted`/`typingStopped` dans `ConversationListViewModel` + `TypingDotsView` dans `ThemedConversationRow`.

**Tech Stack:** Swift 5.9, SwiftUI, Combine, MeeshySDK (Socket.IO publishers)

---

### Task 1 : SDK — `renderFingerprint` dans `MeeshyConversation`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift`

**Context:**
`MeeshyConversation.==` compare uniquement par `id` (ligne 210). `.equatable()` sur `ThemedConversationRow` s'appuie sur cet opérateur — donc les rows ne se re-rendent jamais quand `lastMessagePreview`, `unreadCount`, `lastMessageAt`, etc. changent. On ajoute `renderFingerprint: Int` (computed, non-Codable) qui hash tous les champs visuels.

**Step 1 : Localiser le bon endroit dans la struct**

Ouvrir `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift`.

Chercher le bloc :
```swift
    public var lastSeenText: String? {
        guard let date = lastSeenAt else { return nil }
        ...
    }
```
Il se termine vers la ligne 166 avec `}`.

**Step 2 : Ajouter `renderFingerprint` après `lastSeenText`**

Après la fermeture `}` de `lastSeenText`, avant `public init(...)`, insérer :

```swift
    /// Hash des champs visuels — utilisé dans ThemedConversationRow.== pour détecter les changements de contenu.
    /// Mettre à jour ce hash quand un nouveau champ est affiché dans ThemedConversationRow.
    public var renderFingerprint: Int {
        var h = Hasher()
        h.combine(lastMessagePreview)
        h.combine(unreadCount)
        h.combine(lastMessageAt)
        h.combine(lastMessageSenderName)
        h.combine(lastMessageAttachmentCount)
        h.combine(lastMessageIsBlurred)
        h.combine(lastMessageIsViewOnce)
        h.combine(lastMessageExpiresAt)
        h.combine(name)
        h.combine(isMuted)
        h.combine(isPinned)
        return h.finalize()
    }
```

**Step 3 : Vérifier que le SDK compile**

```bash
./apps/ios/meeshy.sh build
```

Expected: `Build succeeded`

**Step 4 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift
git commit -m "feat(sdk): add renderFingerprint to MeeshyConversation for row re-render detection"
```

---

### Task 2 : iOS View — Mettre à jour `ThemedConversationRow.==` avec `renderFingerprint` + `isTyping`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift`

**Context:**
`ThemedConversationRow` est un `struct View` avec une `extension ThemedConversationRow: Equatable` en bas du fichier (lignes 495-506). Le `==` actuel utilise `lhs.conversation == rhs.conversation` (par `id`). On doit :
1. Ajouter `var isTyping: Bool = false` comme propriété du struct (ligne ~21)
2. Mettre à jour `==` pour inclure `renderFingerprint` et `isTyping`

**Step 1 : Ajouter `isTyping` aux propriétés du row**

Trouver le bloc de déclarations en haut de `ThemedConversationRow` (lignes 7-21) :
```swift
    var isDark: Bool = false
    var storyRingState: StoryRingState = .none
    var moodStatus: StatusEntry? = nil
```

Après `var moodStatus: StatusEntry? = nil`, ajouter :
```swift
    var isTyping: Bool = false
```

**Step 2 : Mettre à jour `ThemedConversationRow.==`**

Trouver l'extension Equatable (lignes ~495-506) :
```swift
extension ThemedConversationRow: Equatable {
    static func == (lhs: ThemedConversationRow, rhs: ThemedConversationRow) -> Bool {
        lhs.conversation == rhs.conversation &&
        lhs.availableWidth == rhs.availableWidth &&
        lhs.isDragging == rhs.isDragging &&
        lhs.isDark == rhs.isDark &&
        lhs.storyRingState == rhs.storyRingState &&
        lhs.moodStatus?.id == rhs.moodStatus?.id &&
        lhs.presenceState == rhs.presenceState
    }
}
```

Remplacer entièrement par :
```swift
extension ThemedConversationRow: Equatable {
    static func == (lhs: ThemedConversationRow, rhs: ThemedConversationRow) -> Bool {
        lhs.conversation.id == rhs.conversation.id &&
        lhs.conversation.renderFingerprint == rhs.conversation.renderFingerprint &&
        lhs.isTyping == rhs.isTyping &&
        lhs.availableWidth == rhs.availableWidth &&
        lhs.isDragging == rhs.isDragging &&
        lhs.isDark == rhs.isDark &&
        lhs.storyRingState == rhs.storyRingState &&
        lhs.moodStatus?.id == rhs.moodStatus?.id &&
        lhs.presenceState == rhs.presenceState
    }
}
```

**Step 3 : Vérifier que l'app compile**

```bash
./apps/ios/meeshy.sh build
```

Expected: `Build succeeded`

**Step 4 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift
git commit -m "fix(ios): use renderFingerprint in ThemedConversationRow.== to fix stale rows"
```

---

### Task 3 : iOS View — `TypingDotsView` + `typingIndicatorView` + guard dans `lastMessagePreviewView`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift`

**Context:**
On doit ajouter :
1. `TypingDotsView` — struct private, 3 cercles animés avec bounce staggeré
2. `typingIndicatorView` — computed `@ViewBuilder` qui affiche les dots + "est en train d'écrire"
3. Modifier `lastMessagePreviewView` pour afficher le typing indicator en priorité si `isTyping == true`

**Step 1 : Ajouter `TypingDotsView` juste avant la section `// MARK: - Last Message Preview`**

Chercher :
```swift
// MARK: - Last Message Preview
```

Juste **avant** ce commentaire, insérer :

```swift
// MARK: - Typing Indicator

private struct TypingDotsView: View {
    let accentColor: String
    @State private var isAnimating = false

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(Color(hex: accentColor))
                    .frame(width: 5, height: 5)
                    .scaleEffect(isAnimating ? 1.0 : 0.5)
                    .opacity(isAnimating ? 1.0 : 0.4)
                    .animation(
                        .easeInOut(duration: 0.5)
                            .repeatForever(autoreverses: true)
                            .delay(Double(i) * 0.18),
                        value: isAnimating
                    )
            }
        }
        .onAppear { isAnimating = true }
        .onDisappear { isAnimating = false }
    }
}

@ViewBuilder
private var typingIndicatorView: some View {
    HStack(spacing: 5) {
        TypingDotsView(accentColor: accentColor)
        Text(String(localized: "typing.in_progress", defaultValue: "est en train d'écrire"))
            .font(.system(size: 13).italic())
            .foregroundColor(Color(hex: accentColor))
            .lineLimit(1)
    }
}

```

**Step 2 : Modifier `lastMessagePreviewView` pour prioriser le typing indicator**

Trouver :
```swift
@ViewBuilder
private var lastMessagePreviewView: some View {
    switch lastMessageEffect {
```

Remplacer par :
```swift
@ViewBuilder
private var lastMessagePreviewView: some View {
    if isTyping {
        typingIndicatorView
    } else {
    switch lastMessageEffect {
```

Puis fermer la nouvelle condition en trouvant la fermeture du switch (la `}` de `switch`) et ajouter `}` après :
```swift
    } // switch lastMessageEffect
    } // isTyping else
}
```

**Note importante** : chercher exactement la fermeture du switch. Le bloc `lastMessagePreviewView` ressemble à :
```swift
@ViewBuilder
private var lastMessagePreviewView: some View {
    switch lastMessageEffect {
    case .expired:
        ...
    case .none:
        ...
        }
    }  ← fermeture du switch
}  ← fermeture de lastMessagePreviewView
```

La structure finale doit être :
```swift
@ViewBuilder
private var lastMessagePreviewView: some View {
    if isTyping {
        typingIndicatorView
    } else {
        switch lastMessageEffect {
        case .expired:
            ...
        case .none:
            ...
        }
    }
}
```

**Step 3 : Vérifier que l'app compile**

```bash
./apps/ios/meeshy.sh build
```

Expected: `Build succeeded`

**Step 4 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift
git commit -m "feat(ios): add TypingDotsView and typing indicator in conversation row preview"
```

---

### Task 4 : iOS ViewModel — Typing subscriptions dans `ConversationListViewModel`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift`

**Context:**
`MessageSocketManager.shared` expose `typingStarted: PassthroughSubject<TypingEvent, Never>` et `typingStopped`. `TypingEvent` a `conversationId: String`. On doit :
1. Ajouter `@Published var typingConversationIds: Set<String> = []` (ligne ~32)
2. Ajouter `private var typingTimers: [String: Timer] = [:]` pour auto-cleanup 15s
3. Ajouter les subscriptions dans `subscribeToSocketEvents()`
4. Ajouter les helpers `scheduleTypingCleanup(for:)` et `clearTyping(for:)`

**Step 1 : Ajouter les propriétés**

Trouver le bloc :
```swift
    @Published var groupedConversations: [(section: ConversationSection, conversations: [Conversation])] = []
```

Après cette ligne, ajouter :
```swift
    @Published var typingConversationIds: Set<String> = []
    private var typingTimers: [String: Timer] = [:]
```

**Step 2 : Ajouter les subscriptions dans `subscribeToSocketEvents()`**

Trouver la fin de `subscribeToSocketEvents()` — juste avant le `}` de fermeture de la fonction (après le dernier `.store(in: &cancellables)`).

Ajouter avant la fermeture `}` :

```swift
        // Typing indicator — affiche "est en train d'écrire" dans le row
        socketManager.typingStarted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                typingConversationIds.insert(event.conversationId)
                scheduleTypingCleanup(for: event.conversationId)
            }
            .store(in: &cancellables)

        socketManager.typingStopped
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.clearTyping(for: event.conversationId)
            }
            .store(in: &cancellables)
```

**Step 3 : Ajouter les helpers**

Chercher la section `// MARK: - Badge Sync` et ajouter, juste **avant** ce commentaire, une nouvelle section :

```swift
    // MARK: - Typing Cleanup

    private func scheduleTypingCleanup(for conversationId: String) {
        typingTimers[conversationId]?.invalidate()
        typingTimers[conversationId] = Timer.scheduledTimer(withTimeInterval: 15, repeats: false) { [weak self] _ in
            self?.clearTyping(for: conversationId)
        }
    }

    private func clearTyping(for conversationId: String) {
        typingTimers[conversationId]?.invalidate()
        typingTimers[conversationId] = nil
        typingConversationIds.remove(conversationId)
    }

```

**Step 4 : Vérifier que l'app compile**

```bash
./apps/ios/meeshy.sh build
```

Expected: `Build succeeded`

**Step 5 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift
git commit -m "feat(ios): subscribe to typing events in ConversationListViewModel with 15s cleanup"
```

---

### Task 5 : iOS View — Passer `isTyping` à `ThemedConversationRow` depuis `ConversationListView`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`

**Context:**
`conversationRow(for:rowWidth:)` construit `ThemedConversationRow(...)` (lignes ~213-236). `conversationViewModel` est accessible dans `ConversationListView` via `@EnvironmentObject`. On passe le nouveau `isTyping` calculé depuis `typingConversationIds`.

**Step 1 : Localiser l'appel à `ThemedConversationRow`**

Chercher dans `ConversationListView.swift` :
```swift
            ThemedConversationRow(
                conversation: displayConversation,
                availableWidth: rowWidth,
                isDragging: draggingConversation?.id == displayConversation.id,
```

**Step 2 : Ajouter `isTyping`**

Trouver la ligne :
```swift
                moodStatus: conversationMoodStatus(for: displayConversation)
```

C'est le dernier paramètre nommé avant la fermeture `)`. Après cette ligne, ajouter :
```swift
                isTyping: conversationViewModel.typingConversationIds.contains(displayConversation.id)
```

Le bloc doit ressembler à :
```swift
            ThemedConversationRow(
                conversation: displayConversation,
                availableWidth: rowWidth,
                isDragging: draggingConversation?.id == displayConversation.id,
                presenceState: presenceManager.presenceState(for: displayConversation.participantUserId ?? ""),
                onViewStory: { handleStoryView(displayConversation) },
                onViewProfile: { handleProfileView(displayConversation) },
                onViewConversationInfo: { handleConversationInfoView(displayConversation) },
                onMoodBadgeTap: { anchor in handleMoodBadgeTap(displayConversation, at: anchor) },
                onCreateShareLink: canCreateShareLink(for: displayConversation) ? {
                    Task { await shareConversationLink(for: displayConversation) }
                } : nil,
                isDark: theme.mode.isDark,
                storyRingState: storyRingState(for: displayConversation),
                moodStatus: conversationMoodStatus(for: displayConversation),
                isTyping: conversationViewModel.typingConversationIds.contains(displayConversation.id)
            )
```

**Step 3 : Vérifier le build complet**

```bash
./apps/ios/meeshy.sh build
```

Expected: `Build succeeded`

**Step 4 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift
git commit -m "feat(ios): pass isTyping to ThemedConversationRow from ConversationListView"
```

---

### Task 6 : Vérification visuelle

**Step 1 : Lancer l'app sur le simulateur**

```bash
./apps/ios/meeshy.sh run
```

**Step 2 : Vérifier le fix de re-render**

- Ouvrir une conversation, envoyer un message depuis un autre client (ou via Postman/curl)
- Revenir sur la liste → le row doit montrer le nouveau preview, le badge unread incrémenté, et la conversation remontée en tête de section

**Step 3 : Vérifier le typing indicator**

- Ouvrir une conversation depuis un autre device/client et commencer à écrire
- Dans la liste, le row correspondant doit afficher les 3 points animés + "est en train d'écrire"
- Arrêter d'écrire → le preview revient après max 15s (ou immédiatement si `typing:stop` reçu)

**Step 4 : Commit final si ajustements UI**

```bash
git add -p
git commit -m "fix(ios): adjust typing indicator rendering in conversation list"
```
