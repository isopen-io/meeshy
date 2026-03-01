# Design : Effets des messages dans la liste des conversations

**Date** : 2026-02-28
**Scope** : Gateway + MeeshySDK + iOS app

## Problème

La liste des conversations affiche un preview du dernier message sans tenir compte des effets (flou, éphémère, view-once). Les messages expirés remontent malgré leur durée d'affichage écoulée.

## Solution : Approche A — Pipeline complet

### 1. Gateway (`services/gateway/src/routes/conversations/core.ts`)

Dans le select Prisma des `messages` (take: 1), ajouter :

```typescript
isBlurred: true,
isViewOnce: true,
expiresAt: true,
```

### 2. SDK — Modèles API (`packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift`)

**`APIConversationLastMessage`** — ajouter :
```swift
public let isBlurred: Bool?
public let isViewOnce: Bool?
public let expiresAt: Date?
```

**`MeeshyConversation`** — ajouter :
```swift
public var lastMessageIsBlurred: Bool = false
public var lastMessageIsViewOnce: Bool = false
public var lastMessageExpiresAt: Date? = nil
```

**`APIConversation.toConversation()`** — mapper depuis `lastMessage`.

**`MeeshyConversation.init()`** — ajouter les 3 paramètres avec valeurs par défaut.

### 3. iOS Vue (`apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift`)

Remplacer le contenu de `lastMessagePreviewView` par une logique qui détecte l'effet :

| Priorité | Condition | Affichage |
|----------|-----------|-----------|
| 1 | `lastMessageExpiresAt != nil && expiresAt <= now` | `timer.badge.xmark` + "Message expiré" (grisé, italique) — attachements masqués |
| 2 | `lastMessageIsBlurred` | `eye.slash` + texte flouté `.blur(radius: 4)` — attachements masqués |
| 3 | `lastMessageIsViewOnce` | `flame` + "Voir une fois" (accent color) |
| 4 | `lastMessageExpiresAt != nil && expiresAt > now` | `timer` en préfixe + contenu normal |
| 5 | sinon | comportement actuel (inchangé) |

## Fichiers à modifier

1. `services/gateway/src/routes/conversations/core.ts` — +3 champs select
2. `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift` — APIConversationLastMessage + MeeshyConversation
3. `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift` — lastMessagePreviewView

## Non-scope

- Pas de changement à `MeeshyConversation.==` (compare par id, comportement intentionnel)
- Pas de timer live pour le countdown éphémère dans la liste (trop coûteux en re-renders)
- Pas de changement aux tests existants (hors scope immédiat)
