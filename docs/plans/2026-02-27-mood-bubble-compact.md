# Mood Bubble — Compact Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rendre la `StatusBubbleOverlay` plus discrète et compacte — format "bulle de pensée" inline sans auteur ni actions, qui se ferme dès qu'on tape en dehors ou qu'on commence à scroller.

**Architecture:** Réécriture du `bubbleContent` dans `StatusBubbleOverlay.swift` pour afficher uniquement emoji + temps (ligne header) + contenu texte ou lecteur audio. Remplacement de l'overlay opaque par un `Color.clear` + `simultaneousGesture(DragGesture)` pour laisser passer les scrolls.

**Tech Stack:** SwiftUI, `StatusBubbleOverlay.swift`, `MeeshySDK.StatusEntry`

---

### Task 1: Redesign `bubbleContent` — header inline + contenu only

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/StatusBubbleOverlay.swift`

Ce qui disparaît : `bubbleActionButton`, `quickReactionStrip`, toute la barre d'action du top bar (translate/reply/share/close/time label séparé).

Ce qui reste : emoji, `status.timeAgo`, texte ou lecteur audio.

**Step 1: Remplacer `bubbleContent`**

Ouvrir `apps/ios/Meeshy/Features/Main/Components/StatusBubbleOverlay.swift`.

Remplacer la propriété `bubbleContent` (lignes ~90–167) par :

```swift
// MARK: - Bubble Content

private var bubbleContent: some View {
    VStack(alignment: .leading, spacing: 6) {
        // Header: emoji + time ago inline
        HStack(spacing: 6) {
            Text(status.moodEmoji)
                .font(.system(size: 18))
            Spacer()
            Text(status.timeAgo)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(theme.textMuted)
        }

        // Content: text or audio
        if let audioUrl = status.audioUrl, !audioUrl.isEmpty {
            audioPlayerView(urlString: audioUrl)
        } else if let content = status.content, !content.isEmpty {
            Text(content)
                .font(.system(size: 13))
                .foregroundColor(theme.textPrimary)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(.ultraThinMaterial)
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(
                        LinearGradient(
                            colors: [Color(hex: status.avatarColor).opacity(0.3), Color.white.opacity(0.1)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 0.5
                    )
            )
            .shadow(color: Color.black.opacity(0.1), radius: 10, y: 4)
    )
}
```

**Step 2: Réduire la largeur de la bulle**

Dans `body`, modifier la ligne `let bubbleW`:
```swift
// AVANT
let bubbleW: CGFloat = min(screenWidth - 32, 280)

// APRÈS
let bubbleW: CGFloat = min(screenWidth - 48, 210)
```

**Step 3: Supprimer les propriétés devenues inutiles**

Supprimer ces `@State` et propriétés qui ne servent plus :
```swift
// À SUPPRIMER
@StateObject private var audioPlayer = AudioPlayerManager()  // ← garder, encore utilisé pour l'audio
@State private var translatedText: String?      // ← SUPPRIMER
@State private var isTranslating = false        // ← SUPPRIMER
@State private var reactedEmoji: String?        // ← SUPPRIMER
private let quickEmojis = ["❤️", "😂", "🔥", "😮", "😢", "👏"]  // ← SUPPRIMER
```

Garder :
```swift
@StateObject private var audioPlayer = AudioPlayerManager()
@State private var appearAnimation = false
```

**Step 4: Supprimer les callbacks devenus inutiles**

Dans la déclaration de la struct, changer :
```swift
// AVANT
var onReply: (() -> Void)? = nil
var onShare: (() -> Void)? = nil
var onReaction: ((String) -> Void)? = nil

// APRÈS
// (supprimer ces 3 lignes — la bulle est read-only)
```

**Step 5: Supprimer les méthodes inutilisées**

Supprimer entièrement les méthodes :
- `bubbleActionButton(icon:color:isLoading:action:)` (lignes ~171–189)
- `quickReactionStrip` (lignes ~193–208)
- `triggerReaction(_:)` (lignes ~246–262)
- `translateContent()` (lignes ~266–294)

**Step 6: Build pour vérifier**

```bash
./apps/ios/meeshy.sh build
```
Expected: BUILD SUCCEEDED (0 warnings/errors liés au refactoring)

---

### Task 2: Fixer le dismiss — clear overlay + scroll passthrough

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/StatusBubbleOverlay.swift`

**Step 1: Remplacer l'overlay opaque dans `body`**

Dans la méthode `body`, dans le `ZStack`, remplacer :

```swift
// AVANT
Color.black.opacity(appearAnimation ? 0.06 : 0)
    .ignoresSafeArea()
    .onTapGesture { dismiss() }
    .allowsHitTesting(appearAnimation)
```

par :

```swift
// APRÈS — fond transparent, ne bloque pas le scroll
Color.clear
    .contentShape(Rectangle())
    .ignoresSafeArea()
    .onTapGesture { dismiss() }
    .simultaneousGesture(
        DragGesture(minimumDistance: 3)
            .onChanged { _ in dismiss() }
    )
    .allowsHitTesting(appearAnimation)
```

**Pourquoi :** `simultaneousGesture` avec `DragGesture` intercepte le début du drag et appelle `dismiss()`, puis la liste en dessous reçoit normalement le geste de scroll (la bulle n'est plus là pour le bloquer).

**Step 2: Build**

```bash
./apps/ios/meeshy.sh build
```
Expected: BUILD SUCCEEDED

---

### Task 3: Mettre à jour les call sites qui passaient `onReply/onShare/onReaction`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`

**Step 1: Localiser le call site**

Dans `ConversationListView.swift`, chercher `StatusBubbleOverlay(` (~ligne 590).

**Step 2: Simplifier l'appel**

```swift
// AVANT
StatusBubbleOverlay(
    status: status,
    anchorPoint: moodBadgeAnchor,
    isPresented: $showStatusBubble,
    onReply: {
        if let conv = conversationViewModel.conversations.first(where: { $0.participantUserId == status.userId && $0.type == .direct }) {
            onSelect(conv)
        }
    },
    onShare: {
        if let conv = conversationViewModel.conversations.first(where: { $0.participantUserId == status.userId && $0.type == .direct }) {
            onSelect(conv)
        }
    },
    onReaction: { emoji in
        Task {
            let _: APIResponse<[String: AnyCodable]>? = try? await APIClient.shared.post(
                endpoint: "/posts/\(status.id)/like",
                body: ["emoji": emoji]
            )
        }
    }
)

// APRÈS
StatusBubbleOverlay(
    status: status,
    anchorPoint: moodBadgeAnchor,
    isPresented: $showStatusBubble
)
```

**Step 3: Build final**

```bash
./apps/ios/meeshy.sh build
```
Expected: BUILD SUCCEEDED

**Step 4: Test visuel sur simulateur**

```bash
./apps/ios/meeshy.sh run
```

Vérifier :
- [ ] Tap sur un badge mood → bulle s'ouvre avec cercles de pensée
- [ ] Header : emoji + temps sur une ligne
- [ ] Contenu texte : 2 lignes max
- [ ] Si audio : lecteur compact visible
- [ ] Tap en dehors de la bulle → fermeture immédiate
- [ ] Scroll de la liste avec bulle ouverte → fermeture + scroll passe normalement

**Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/StatusBubbleOverlay.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift
git commit -m "feat(ios): mood bubble — compact inline, no author/actions, scroll dismiss"
```

---

## Résumé des changements

| Fichier | Nature |
|---|---|
| `StatusBubbleOverlay.swift` | Réécriture `bubbleContent`, suppression callbacks/méthodes, fix overlay dismiss |
| `ConversationListView.swift` | Simplification du call site `StatusBubbleOverlay` |

**Lignes impactées :** ~StatusBubbleOverlay entier (~305 → ~180 lignes), ConversationListView ~590–615
