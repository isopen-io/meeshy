# Widgets Real Data & Brand Identity

**Date**: 2026-04-13
**Status**: Approved

## Problem

Les widgets iOS affichent des SF Symbols génériques et des couleurs `.blue` au lieu de refléter l'identité visuelle Meeshy et les vrais avatars des conversations.

## Design

### 1. Modèles de données

Ajouter `accentColor: String` (hex) aux deux modèles widget :

- `WidgetConversation` : + `accentColor: String`
- `WidgetFavoriteContact` : + `accentColor: String`

Mise à jour miroir dans le widget target ET dans `WidgetDataManager.swift`.

`WidgetDataManager.publishConversations` passe `conv.accentColor` depuis `MeeshyConversation`.
`WidgetDataManager.publishFavoriteContacts` idem.

### 2. WidgetColors (widget target)

```swift
private enum WidgetColors {
    static let brandPrimaryHex = "6366F1"
    static let brandDeepHex = "4338CA"
    static let successHex = "34D399"
}
```

+ extension `Color(hex:)` minimaliste (le widget ne peut pas importer MeeshyUI).

### 3. InitialsAvatar (widget target)

Composant SwiftUI léger :
- Circle rempli avec `accentColor`
- Text avec initiales (2 premières lettres des 2 premiers mots, fallback 1ère lettre)
- Couleur texte : blanc

### 4. Couleurs brand

Remplacer tous les `.blue` / `Color.blue` par :
- `Color(hex: WidgetColors.brandPrimaryHex)` pour les accents
- Gradient `brandPrimaryHex → brandDeepHex` pour les fonds (UnreadCount widget)
- Badges unread, icônes message, boutons quick-reply : indigo

### 5. Avatars

Remplacer tous les `Image(systemName: conversation.contactAvatar)` par `InitialsAvatar(name:, accentColor:, size:)`.

### Fichiers impactés

| Fichier | Changement |
|---------|-----------|
| `MeeshyWidgets/MeeshyWidgets.swift` | WidgetColors, Color(hex:), InitialsAvatar, toutes les vues |
| `Meeshy/Features/Main/Services/WidgetDataManager.swift` | accentColor dans les modèles + mapping |
| `MeeshyWidgets/MeeshyWidgets.entitlements` | Inchangé |

### Hors scope

- Pré-cache d'images avatar réseau (évolution future)
- Refonte du layout des widgets
- Live Activities (inchangées)
