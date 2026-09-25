# Meeshy Session State — 2026-02-26

## Contexte
Session continuée depuis une conversation précédente (context compaction).

---

## Changements COMPLÉTÉS (à committer)

### 1. Vue Notifications iOS (Sheet modale)
**Fichiers modifiés :**
- `apps/ios/Meeshy/Features/Main/Views/RootView.swift`
  - Ajout `@State private var showNotifications = false`
  - Bell button → `showNotifications = true` (au lieu de `router.push(.notifications)`)
  - `.sheet(isPresented: $showNotifications)` avec `NotificationListView` + callback `handleNotificationTap`
  - Méthode `handleNotificationTap(_:)` routant 18 types de notifications
  - Méthode `navigateToConversationById(_:)` helper
  - NotificationCenter listeners pour `openProfileSheet` et `pushNavigateToRoute`

- `apps/ios/Meeshy/MeeshyApp.swift`
  - `handlePushNavigation(conversationId:)` → `handlePushNavigation(payload:)` gérant tous types

- `packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationListView.swift`
  - Header redesigné : "Tout lire" à gauche, titre centré, X mark (`xmark.circle.fill`) à droite

**Build iOS : OK (103s)**

### 2. Fix Visibilité Statuts (Backend)
**Fichier modifié :**
- `services/gateway/src/services/PostFeedService.ts` → `getStatuses()`
  - Ajout `getDirectConversationContactIds()` en plus de `getFriendIds()`
  - `allContactIds = [...new Set([...friendIds, ...dmContactIds])]`
  - Appliqué `buildVisibilityFilter(userId, allContactIds)`

**TypeScript : compile OK**

### 3. Fix Visibilité Stories (Backend)
**Fichier modifié :**
- `services/gateway/src/services/PostFeedService.ts` → `getStories()`
  - Remplacé `authorId: { in: viewerIds }` naïf par `buildVisibilityFilter()`
  - Inclut friends + DM contacts
  - `const where: any = { ... }` pour contourner le type Prisma

**TypeScript : compile OK**

---

## Fichiers modifiés non-staged (git status du début de session)

```
apps/ios/Meeshy.xcodeproj/project.pbxproj
apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift
apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
apps/ios/Meeshy/Features/Main/ViewModels/UserProfileViewModel.swift
apps/ios/Meeshy/Features/Main/Views/ConversationListView+Overlays.swift
apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift
apps/ios/Meeshy/Features/Main/Views/RootView.swift
apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift
packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift
packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift
packages/MeeshySDK/Sources/MeeshySDK/Models/StatsModels.swift
packages/MeeshySDK/Sources/MeeshySDK/Services/CommunityService.swift
packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationService.swift
packages/MeeshySDK/Sources/MeeshySDK/Services/UserService.swift
packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityDetailView.swift
packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityListView.swift
packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileSheetUser.swift
packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift
packages/shared/prisma/schema.prisma
services/gateway/src/routes/communities/core.ts
services/gateway/src/routes/users/preferences.ts
services/gateway/src/services/PostFeedService.ts
```

**Fichiers untracked :**
```
apps/ios/Meeshy/Features/Main/Services/WidgetDataManager.swift
docs/UserProfileSheet-Usage-Example.md
packages/MeeshySDK/Sources/MeeshySDK/Utils/
packages/MeeshySDK/Sources/MeeshyUI/Primitives/AchievementBadge.swift
packages/MeeshySDK/Sources/MeeshyUI/Primitives/ProfileCompletionRing.swift
packages/MeeshySDK/Sources/MeeshyUI/Primitives/StatsCard.swift
```

---

## TÂCHE EN COURS : Story Rings invisibles dans conversation list

### Problème
L'utilisateur dit ne PAS voir les story rings animés dans la liste des conversations, malgré le code déjà implémenté.

### Investigation (résumé de la session précédente)

**Le code est déjà câblé :**
- `MeeshyAvatar.swift` : `StoryRingState` enum (.none/.unread/.read), gradient ring animé, `handleTap()` line 227 lance story si unread
- `ThemedConversationRow.swift` : `avatarStoryState` computed property via `storyViewModel.hasUnviewedStories(forUserId:)`, passe `storyState: avatarStoryState` à MeeshyAvatar (line 222), passe `onViewStory` (line 226)
- `ConversationListView.swift` : `conversationRow(for:)` wraps ThemedConversationRow, `onViewStory` callback → `handleStoryView(conversation)` (lines 633-647)

### Causes probables (à vérifier)

1. **Cause principale probable** : Le backend `getStories()` ne retournait PAS les stories des contacts DM (bug de visibilité qu'on vient de fixer). Donc `storyViewModel.storyGroups` était vide → `hasUnviewedStories()` retournait `false` → ring state `.none`. **FIX APPLIQUÉ mais gateway pas encore redémarrée.**

2. **Cause secondaire possible** : La gesture hierarchy — `ConversationListView` line 253 a un `.onTapGesture` parent qui pourrait intercepter les taps sur l'avatar avant que `MeeshyAvatar.handleTap()` ne les reçoive. À vérifier après que les rings apparaissent.

3. **Vérifier** : Est-ce que `StoryViewModel` est bien injecté comme `@EnvironmentObject` dans `ThemedConversationRow` ?

### Prochaines étapes
1. Redémarrer le gateway pour appliquer le fix `getStories()`
2. Vérifier que `storyViewModel.storyGroups` se remplit correctement côté iOS
3. Si rings toujours absents → investiguer côté iOS (injection @EnvironmentObject, computed property, etc.)
4. Si rings visibles mais tap ne marche pas → investiguer gesture hierarchy

---

## TÂCHE NON COMMENCÉE : Audio dans les Stories

### Constat
- `audioUrl` existe sur le modèle `Post` (Prisma) et `CreatePostSchema` l'accepte côté gateway
- MAIS `CreateStoryRequest` dans le SDK Swift n'inclut PAS `audioUrl` ni `audioDuration`
- Le story composer a du support musique via `StoryEffects.musicTrackId` mais pas d'enregistrement audio vocal
- C'est une feature plus large à implémenter

---

## Problème technique de la session actuelle
**PERMISSIONS MACOS BLOQUÉES** — Impossible de lire les fichiers du repo.
- `cat`, `head`, `python`, `git show` tous bloqués avec "Operation not permitted"
- Le problème est au niveau macOS Full Disk Access pour le processus Claude Code
- **Fix** : Réglages Système > Confidentialité et sécurité > Accès complet au disque → ajouter/réactiver Terminal + Claude Code

---

## Commit suggéré (quand permissions restaurées)

Message :
```
feat(ios,gateway): notification sheet navigation, fix story/status visibility for DM contacts

- Add notification sheet modal with full navigation routing (18 notification types)
- Fix getStatuses() to include DM contacts alongside friends
- Fix getStories() to use buildVisibilityFilter() with DM contacts
- Redesign notification header with X dismiss button
- Handle all push notification types in MeeshyApp
```
