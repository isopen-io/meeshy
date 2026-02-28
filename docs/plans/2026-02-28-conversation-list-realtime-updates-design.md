# Design : Mises à jour temps réel de la liste des conversations

**Date** : 2026-02-28
**Scope** : MeeshySDK (CoreModels) + iOS ViewModel + iOS View

## Problème

1. **Rows gelés** : `ThemedConversationRow.==` compare `lhs.conversation == rhs.conversation`, mais `MeeshyConversation.==` est par `id` uniquement. SwiftUI skippe le re-render même quand `lastMessagePreview`, `unreadCount`, `lastMessageAt` changent. Les fast-paths du ViewModel (`groupedConversations` direct) mettent bien à jour les données, mais le row n'est jamais re-rendu.

2. **Typing indicator absent** : `typingStarted`/`typingStopped` existent dans `MessageSocketManager` mais ne sont pas consommés par `ConversationListViewModel`. Rien n'est affiché dans les rows de la liste.

## Solution

### Partie 1 — `renderFingerprint` dans `MeeshyConversation`

Ajouter une computed property `renderFingerprint: Int` dans `MeeshyConversation` (`CoreModels.swift`) qui hash tous les champs visuellement pertinents :

```swift
var renderFingerprint: Int {
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

Mettre à jour `ThemedConversationRow.==` :
```swift
lhs.conversation.id == rhs.conversation.id &&
lhs.conversation.renderFingerprint == rhs.conversation.renderFingerprint &&
lhs.isTyping == rhs.isTyping &&
lhs.availableWidth == rhs.availableWidth &&
lhs.isDragging == rhs.isDragging &&
lhs.isDark == rhs.isDark &&
lhs.storyRingState == rhs.storyRingState &&
lhs.moodStatus?.id == rhs.moodStatus?.id &&
lhs.presenceState == rhs.presenceState
```

### Partie 2 — Typing indicator

#### ViewModel (`ConversationListViewModel`)

```swift
@Published var typingConversationIds: Set<String> = []
private var typingTimers: [String: Timer] = [:]

// subscribeToSocketEvents() — ajouter :
socketManager.typingStarted
    .receive(on: DispatchQueue.main)
    .sink { [weak self] event in
        self?.typingConversationIds.insert(event.conversationId)
        self?.scheduleTypingCleanup(for: event.conversationId)
    }

socketManager.typingStopped
    .receive(on: DispatchQueue.main)
    .sink { [weak self] event in
        self?.clearTyping(for: event.conversationId)
    }

// Helpers :
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

#### Row (`ThemedConversationRow`)

Nouveau paramètre :
```swift
var isTyping: Bool = false
```

`TypingDotsView` (struct private) — 3 cercles avec animation staggerée :
```swift
private struct TypingDotsView: View {
    @State private var isAnimating = false
    var accentColor: String

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
```

`typingIndicatorView` dans `ThemedConversationRow` :
```swift
@ViewBuilder
private var typingIndicatorView: some View {
    HStack(spacing: 5) {
        TypingDotsView(accentColor: accentColor)
        Text("est en train d'écrire")
            .font(.system(size: 13).italic())
            .foregroundColor(Color(hex: accentColor))
            .lineLimit(1)
    }
}
```

Dans `lastMessagePreviewView` — priorité max (avant switch sur lastMessageEffect) :
```swift
@ViewBuilder
private var lastMessagePreviewView: some View {
    if isTyping {
        typingIndicatorView
    } else {
        // switch existant sur lastMessageEffect
    }
}
```

#### Vue (`ConversationListView`)

```swift
ThemedConversationRow(
    ...
    isTyping: conversationViewModel.typingConversationIds.contains(displayConversation.id)
)
```

## Fichiers à modifier

1. `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift` — `renderFingerprint`
2. `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift` — typing subscriptions + timers
3. `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift` — `isTyping` + `TypingDotsView` + `typingIndicatorView` + `lastMessagePreviewView` guard + `==`
4. `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift` — passer `isTyping`

## Non-scope

- Pas de comptage "qui" écrit (username) — juste indicateur binaire par conversation
- Pas de mise à jour des champs isBlurred/isViewOnce/expiresAt via `message:new` (nouveau message = pas d'effet par défaut)
- Pas de changement à `MeeshyConversation.==` (volontairement par id, utilisé pour la déduplication ailleurs)
