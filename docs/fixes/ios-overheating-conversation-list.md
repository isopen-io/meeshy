# iOS — Analyse surchauffe : vue liste des conversations

**Date :** 2026-02-28
**Rapporté par :** Utilisateur (< 10 conversations, personne connecté, pas de story)
**Symptôme :** iPhone chauffe en < 30 secondes sur la vue liste, mais pas dans une conversation ouverte

---

## Contexte

La vue `ConversationListView` est la vue principale de l'app. Elle reste visible tant que
l'utilisateur n'a pas ouvert une conversation. Chaque animation ou re-render en fond se cumule
et draine CPU + GPU en continu.

---

## Audit complet — Inventaire des animations et @ObservedObject

### Hiérarchie de vues active sur la liste

```
RootView
└── ConversationListView
    ├── StoryTrayView          ← TOUJOURS visible
    │   └── addStoryButton    ← TOUJOURS visible
    ├── ConnectionBanner       ← Visible SEULEMENT si non connecté
    ├── sectionsContent
    │   └── ForEach conversations
    │       └── ThemedConversationRow
    │           └── MeeshyAvatar
    │               ├── storyRing    ← Seulement si story unread
    │               ├── moodBadge   ← Si emoji humeur configuré
    │               └── onlineDot   ← Si utilisateur en ligne
    └── themedSearchBar
```

---

## Problèmes identifiés

### SÉVÉRITÉ HAUTE : Animations perpetuelles toujours actives

#### P1 — StoryTrayView.addButtonGlow (CAUSE PRINCIPALE)
**Fichier :** `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift:111`

```swift
.onAppear {
    withAnimation(.easeInOut(duration: 2.2).repeatForever(autoreverses: true)) {
        addButtonGlow = true
    }
}
```

**Impact :**
- Le bouton "+" pour créer une story anime en boucle : opacity (0.4 → 1.0) ET scaleEffect (1.0 → 1.04)
- Le bouton contient une `Circle` avec `shadow(radius: 12)` — le shadow est un Gaussian blur
- Quand `scaleEffect` change, le shadow parent doit être recalculé par Metal à chaque frame
- **Active TOUJOURS** : `StoryTrayView` est dans `ConversationListView.body` sans condition
- 60 fps × 1 shadow blur recalculation = drainage GPU constant

**Statut :** CORRIGÉ (voir Fix 1)

---

#### P2 — MeeshyAvatar.moodBadge.pulse()
**Fichier :** `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyAvatar.swift:375`

```swift
private func moodBadge(emoji: String) -> some View {
    ...
    .pulse(intensity: 0.15)  // PulseEffect: repeatForever scaleEffect
}
```

**Impact :**
- Si un contact a un emoji humeur configuré, son badge pulse en boucle infinie
- Avec < 10 conversations, tous les contacts avec humeur génèrent une animation perpetuelle
- `PulseEffect` = `scaleEffect(1.0 ↔ 1.15)` + `repeatForever(duration: 1.8s)`

**Statut :** CORRIGÉ (voir Fix 2)

---

#### P3 — MeeshyAvatar.onlineDot.pulse()
**Fichier :** `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyAvatar.swift:398`

```swift
if effectivePresence == .online {
    dot.pulse(intensity: 0.15)
}
```

**Impact :**
- Active quand un contact est en ligne
- Même si personne n'est connecté au moment du test, c'est une animation perpétuelle dès qu'une présence est détectée

**Statut :** CORRIGÉ (voir Fix 3)

---

### SÉVÉRITÉ MOYENNE : @ObservedObject provoquant des re-renders

#### O1 — StoryTrayView `@ObservedObject presenceManager`
**Fichier :** `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift:10`

```swift
@ObservedObject private var presenceManager = PresenceManager.shared
```

**Impact :**
- `PresenceManager` a un `Timer` toutes les 60 secondes qui recalcule les présences
- Chaque tick → `presenceMap` (@Published) change → StoryTrayView re-render complet

**Statut :** CORRIGÉ (voir Fix 4)

---

#### O2 — ConversationListView `@ObservedObject socketManager`
**Fichier :** `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift:61`

```swift
@ObservedObject var socketManager = MessageSocketManager.shared
```

**Impact :**
- `MessageSocketManager` a 2 `@Published` : `isConnected` et `connectionState`
- Lors de tentatives de reconnexion (réseau instable), ces propriétés changent rapidement
- Chaque changement → re-render complet de la liste (toutes les rows)
- `socketManager` est utilisé UNIQUEMENT pour l'animation de `ConnectionBanner`
  (`.animation(.., value: socketManager.isConnected)`)

**Statut :** ACCEPTÉ — fréquence faible si connecté, à surveiller

---

### SÉVÉRITÉ CONDITIONNELLE : Actives seulement dans certains cas

#### C1 — ConnectionBanner Timer (0.4s)
**Fichier :** `apps/ios/Meeshy/Features/Main/Components/ConnectionBanner.swift:10`

```swift
private let dotTimer = Timer.publish(every: 0.4, on: .main, in: .common).autoconnect()
```

**Impact :** Timer actif UNIQUEMENT si `shouldShow == true` (non connecté + réseau OK).
Inactif si le socket est connecté. **Pas de problème en utilisation normale.**

---

#### C2 — MeeshyAvatar story ring rotation
**Fichier :** `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyAvatar.swift:249`

```swift
if effectiveStoryState == .unread {
    withAnimation(.linear(duration: 4.0).repeatForever(autoreverses: false)) {
        ringRotation = 360
    }
}
```

**Impact :** Active UNIQUEMENT si un contact a une story non lue. Inactif sans stories.

---

#### C3 — StoryTrayView shimmerPlaceholder
**Fichier :** `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift:199`

Utilise `.shimmer()` (ShimmerEffect, repeatForever) UNIQUEMENT pendant le chargement initial.
S'arrête dès que les données sont disponibles.

---

## Fixes implémentés

### Fix 1 — StoryTrayView : supprimer l'animation perpetuelle addButtonGlow
**Commit :** `perf(ios): remove perpetual glow animation from addStoryButton`

**Avant :**
```swift
.scaleEffect(addButtonGlow ? 1.04 : 1.0)
.onAppear {
    withAnimation(.easeInOut(duration: 2.2).repeatForever(autoreverses: true)) {
        addButtonGlow = true
    }
}
```

**Après :** Scale fixe à 1.0, opacity ambiant fixe à 0.6, bouton statique.

---

### Fix 2 — MeeshyAvatar : supprimer .pulse() sur moodBadge
**Commit :** `perf(sdk): remove pulse animation from mood badge`

**Avant :**
```swift
.pulse(intensity: 0.15)  // sur moodBadge
```

**Après :** Badge statique sans animation.

---

### Fix 3 — MeeshyAvatar : supprimer .pulse() sur onlineDot
**Commit :** `perf(sdk): remove pulse animation from online dot`

**Avant :**
```swift
if effectivePresence == .online {
    dot.pulse(intensity: 0.15)
}
```

**Après :** Point de présence statique sans animation.

---

### Fix 4 — StoryTrayView : remplacer @ObservedObject presenceManager
**Commit :** `perf(ios): remove ObservedObject presenceManager from StoryTrayView`

**Avant :**
```swift
@ObservedObject private var presenceManager = PresenceManager.shared
```

**Après :**
```swift
private var presenceManager: PresenceManager { PresenceManager.shared }
```

---

## Fixes de la session précédente (pour référence)

### Fix A — RootView : background statique + drawingGroup
**Commit :** session précédente
Suppression des orbes animés (floating) dans `themedBackground`. Remplacement par des cercles
flous 100% statiques. Ajout de `.drawingGroup()` pour rasterisation Metal unique.

### Fix B — ConversationListView : supprimer @ObservedObject presenceManager
**Commit :** session précédente
Remplacement par propriété calculée read-only.

### Fix C — ThemedConversationRow : supprimer .pulse() sur unreadBadge
**Commit :** session précédente
Suppression du `.pulse(intensity: 0.08)` sur le badge non-lu.

---

## Résumé des impacts

| Problème | Impact GPU/CPU | Fréquence | Statut |
|----------|---------------|-----------|--------|
| StoryTrayView addButtonGlow | Shadow blur Metal / frame | 60 fps permanent | ✅ Corrigé |
| MeeshyAvatar moodBadge pulse | Scale GPU / frame | 60 fps si humeur définie | ✅ Corrigé |
| MeeshyAvatar onlineDot pulse | Scale GPU / frame | 60 fps si online | ✅ Corrigé |
| StoryTrayView @ObservedObject presence | Re-render view | 60s (timer) | ✅ Corrigé |
| RootView background animé | Gaussian blur Metal / frame | 60 fps permanent | ✅ Corrigé (session préc.) |
| ConversationListView @ObservedObject presence | Re-render liste | Événement socket | ✅ Corrigé (session préc.) |
| ThemedConversationRow unreadBadge pulse | Scale GPU / frame | 60 fps si non-lu | ✅ Corrigé (session préc.) |
| ConversationListView @ObservedObject socket | Re-render liste | Reconnexion | Accepté (fréquence faible) |
| ConnectionBanner Timer 0.4s | Main thread tick | 0.4s si déconnecté | Conditionnel |
| MeeshyAvatar story ring rotation | Rotation GPU / frame | 60 fps si story unread | Conditionnel |

---

## Annuler un fix spécifique

Chaque fix correspond à un commit distinct. Pour annuler :
```bash
git revert <SHA-DU-COMMIT> --no-commit
```

Pour voir les commits :
```bash
git log --oneline apps/ios/ packages/MeeshySDK/
```
