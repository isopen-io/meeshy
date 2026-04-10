# Reply Thread Overlay — Design Spec

**Date:** 2026-04-10
**Scope:** iOS (SwiftUI) + Gateway endpoint

## Objectif

Deux changements UX sur les messages avec reply chip :
1. Ajouter un espacement visuel entre le chip reponse et le contenu du message
2. Au tap sur le chip, afficher un overlay de consultation du thread complet (flat) avec fond floute

## 1. Espacement chip → contenu

**Fichier:** `ThemedMessageBubble.swift`

Ajouter `4pt` de padding bottom apres le `quotedReplyView`, entre le chip et le `VStack` du contenu message.

**Avant:** `VStack(alignment: .leading, spacing: 0)` — le chip et le contenu se touchent (seul le padding interne du VStack contenu cree un ecart implicite).

**Apres:** Ajouter `.padding(.bottom, 4)` sur le `quotedReplyView` ou modifier le spacing du VStack parent.

## 2. Reply Thread Overlay (iOS)

### 2.1 Presentation

- **Fond:** `ultraThinMaterial` + `Color.black.opacity(0.3)` sur toute la surface
- **Card:** coins arrondis 18pt, max height ~70% ecran, centree verticalement
- **Background card:** `theme.surfaceGradient(tint: accentColor)` + border `theme.border(tint: accentColor)`
- **Dismiss:** tap sur le fond floute OU swipe down (DragGesture avec seuil ~100pt)
- **Animation entree:** scale(0.95) + opacity(0) → scale(1) + opacity(1), spring(response: 0.4, dampingFraction: 0.8)
- **Animation sortie:** inverse avec spring

### 2.2 Contenu de la card

```
VStack(spacing: 0)
├── Header
│   ├── Titre "Discussion" (17pt bold)
│   ├── Badge count reponses (12pt muted)
│   └── Bouton X (fermer)
├── Divider
├── ScrollView
│   ├── Message parent (style highlight, fond accent 10%)
│   │   ├── Avatar + nom auteur + date relative
│   │   └── Contenu texte complet
│   ├── Divider "N reponses"
│   └── LazyVStack(spacing: 8)
│       └── ForEach(replies) { reply in
│          ├── [Si reply.replyTo != nil] Mini reply chip inline (compact)
│          ├── Avatar + nom + date
│          └── Contenu texte
│       }
└── (pas de composer — consultation uniquement)
```

### 2.3 Mini reply chip inline (dans le thread)

Quand un message dans le thread repond a un autre message du thread (pas au parent), afficher un mini chip compact :
- Barre accent 3pt a gauche
- "↩ {authorName}: {previewText}" en 11pt, 1 ligne max, tronque
- Fond subtil (`Color.white.opacity(0.05)` dark / `Color.black.opacity(0.03)` light)
- Tap sur ce mini chip : scroll vers le message cible dans le ScrollView du thread

### 2.4 Etat de chargement

- Skeleton placeholder pendant le fetch API (pas de spinner)
- Si aucune reponse : afficher le message parent seul + texte "Aucune reponse pour le moment" centre, muted

### 2.5 Fichiers iOS

| Fichier | Changement |
|---------|-----------|
| `ThemedMessageBubble.swift` | +4pt spacing, callback `onReplyTap` inchange |
| `ConversationOverlayState` (dans `ConversationView.swift`) | +`showReplyThread: Bool`, +`replyThreadParentId: String?` |
| `ConversationView.swift` | Presenter `ReplyThreadOverlay` en ZStack overlay |
| `ConversationView+MessageRow.swift` | `onReplyTap` → set overlay state au lieu de scrollToMessageId |
| **Nouveau:** `ReplyThreadOverlay.swift` | Vue overlay complete |

## 3. Gateway — Endpoint Thread

### 3.1 Route

```
GET /api/v1/conversations/:conversationId/threads/:messageId
```

### 3.2 Comportement

1. Recuperer le message parent par `messageId`
2. Recuperer recursivement toutes les reponses :
   - Niveau 1 : messages avec `replyToId = messageId`
   - Niveau 2+ : messages avec `replyToId` = un des messages deja recuperes
   - Continuer jusqu'a epuisement (pas de limite de profondeur, mais limit total de messages)
3. Aplatir et trier chronologiquement (par `createdAt` ASC)
4. Retourner le tout dans le format standard `sendSuccess()`

### 3.3 Response format

```typescript
{
  success: true,
  data: {
    parent: Message,           // Le message parent complet
    replies: Message[],        // Toutes les reponses aplaties, triees chrono
    totalCount: number         // Nombre total de reponses
  }
}
```

Chaque `Message` dans `replies` inclut son `replyTo` (ReplyReference) pour que le client puisse afficher le mini reply chip inline.

### 3.4 Implementation gateway

- Nouveau fichier : `services/gateway/src/routes/conversations/threads.ts`
- Enregistrer la route dans le router conversations existant
- Requete MongoDB : aggregation recursive avec `$graphLookup` sur le champ `replyToId`
  - Collection : `Message`
  - `startWith: messageId`
  - `connectFromField: "id"` (ou `_id`)
  - `connectToField: "replyToId"`
  - `as: "threadReplies"`
  - `maxDepth: 10` (securite)
  - `depthField: "depth"`
- Limite : 200 messages max par thread
- Select : memes champs que l'endpoint messages standard (content, senderId, senderName, replyTo, createdAt, etc.)

### 3.5 Fichiers gateway

| Fichier | Changement |
|---------|-----------|
| **Nouveau:** `services/gateway/src/routes/conversations/threads.ts` | Handler + schema Zod |
| `services/gateway/src/routes/conversations/index.ts` | Enregistrer la nouvelle route |

## 4. iOS SDK

### 4.1 Nouveau modele de reponse

Dans `packages/MeeshySDK/Sources/MeeshySDK/Models/` :

```swift
public struct ThreadResponse: Decodable, Sendable {
    public let parent: APIMessage
    public let replies: [APIMessage]
    public let totalCount: Int
}
```

### 4.2 Appel API

Extension de `APIClient` ou nouveau `ThreadService` :

```swift
func fetchThread(conversationId: String, messageId: String) async throws -> ThreadResponse
```

## 5. Hors scope

- Composer dans l'overlay (l'utilisateur utilise le swipe-to-reply existant)
- Reactions/traductions dans l'overlay
- Pagination du thread (limit 200 suffit)
- Notifications de nouveaux messages dans le thread en temps reel
