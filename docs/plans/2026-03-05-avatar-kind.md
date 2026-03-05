# AvatarKind — Distinction utilisateur vs entité

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ajouter `AvatarKind` à `MeeshyAvatar` pour distinguer sémantiquement les avatars utilisateurs (story ring, mood badge, présence) des avatars d'entités (groupes, communautés, conversations) — et corriger les 3 usages d'`AsyncImage` direct dans les fichiers accessibles.

**Architecture:** On ajoute un enum `AvatarKind` (.user / .entity) comme propriété de `MeeshyAvatar`. Les computed properties `effectiveStoryState`, `effectiveMoodEmoji`, `effectivePresence` retournent des valeurs neutres quand `kind == .entity`. Les extensions hors-scope (ShareExtension, Widget) ne peuvent pas importer MeeshyUI et sont laissées en état.

**Tech Stack:** Swift 5.9, SwiftUI, iOS 16+, MeeshySDK/MeeshyUI (SPM)

---

## Périmètre

### Fichiers modifiés
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyAvatar.swift` — ajout `AvatarKind`
- `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunitySettingsView.swift` — AsyncImage → MeeshyAvatar (kind: .entity)
- `apps/ios/Meeshy/Features/Main/Views/LoginView.swift` — accountAvatar/initialsAvatar → MeeshyAvatar (kind: .user)

### Hors périmètre (imports MeeshyUI impossibles sans xcodeproj)
- `apps/ios/MeeshyShareExtension/ShareViewController.swift` — Share Extension, uniquement UIKit/SwiftUI
- `apps/ios/MeeshyWidgets/LiveActivities.swift` — Widget Extension, uniquement ActivityKit/WidgetKit

---

## Task 1 : Ajouter `AvatarKind` dans MeeshyAvatar

**Fichier :** `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyAvatar.swift`

### Step 1 : Ajouter l'enum AvatarKind (après `// MARK: - Story Ring State`, ligne ~103)

```swift
// MARK: - Avatar Kind

public enum AvatarKind: Sendable {
    /// Utilisateur — story ring, mood badge et dot de présence actifs selon le mode.
    case user
    /// Entité (groupe, communauté, conversation) — aucune décoration sociale.
    case entity
}
```

### Step 2 : Ajouter la propriété dans le struct MeeshyAvatar (après `enablePulse`, ~ligne 141)

```swift
public var kind: AvatarKind = .user
```

### Step 3 : Mettre à jour le primary init pour accepter `kind:`

Localiser le primary init (ligne ~163). Ajouter `kind: AvatarKind = .user,` dans la signature et `self.kind = kind` dans le corps :

```swift
public init(name: String, mode: AvatarMode, kind: AvatarKind = .user, accentColor: String = "", secondaryColor: String? = nil,
            avatarURL: String? = nil, storyState: StoryRingState = .none, moodEmoji: String? = nil,
            presenceState: PresenceState = .offline, enablePulse: Bool = true,
            onTap: (() -> Void)? = nil, onViewProfile: (() -> Void)? = nil,
            onViewStory: (() -> Void)? = nil, onMoodTap: ((CGPoint) -> Void)? = nil,
            onOnlineTap: (() -> Void)? = nil, contextMenuItems: [AvatarContextMenuItem]? = nil) {
    self.name = name; self.mode = mode; self.kind = kind; self.accentColor = accentColor
    self.secondaryColor = secondaryColor; self.avatarURL = avatarURL
    self.storyState = storyState; self.moodEmoji = moodEmoji; self.presenceState = presenceState
    self.enablePulse = enablePulse
    self.onTap = onTap; self.onViewProfile = onViewProfile; self.onViewStory = onViewStory
    self.onMoodTap = onMoodTap; self.onOnlineTap = onOnlineTap; self.contextMenuItems = contextMenuItems
}
```

Note : le legacy init (`AvatarSize`) n'a pas besoin d'être modifié — `kind` a un default `.user` au niveau de la propriété.

### Step 4 : Mettre à jour les 3 computed properties (lignes ~194-204)

Remplacer :

```swift
private var effectiveStoryState: StoryRingState {
    mode.showsStoryRing ? storyState : .none
}

private var effectiveMoodEmoji: String? {
    mode.showsMoodBadge ? moodEmoji : nil
}

private var effectivePresence: PresenceState {
    mode.showsOnlineDot ? presenceState : .offline
}
```

Par :

```swift
private var effectiveStoryState: StoryRingState {
    guard kind == .user else { return .none }
    return mode.showsStoryRing ? storyState : .none
}

private var effectiveMoodEmoji: String? {
    guard kind == .user else { return nil }
    return mode.showsMoodBadge ? moodEmoji : nil
}

private var effectivePresence: PresenceState {
    guard kind == .user else { return .offline }
    return mode.showsOnlineDot ? presenceState : .offline
}
```

### Step 5 : Vérifier le build partiel SDK

```bash
cd /Users/smpceo/Documents/v2_meeshy
swift build --package-path packages/MeeshySDK 2>&1 | tail -5
```

Attendu : `Build complete!`

---

## Task 2 : Corriger CommunitySettingsView (kind: .entity)

**Fichier :** `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunitySettingsView.swift`

La vue est dans le module `MeeshyUI` — pas besoin d'import.

### Step 1 : Localiser le bloc AsyncImage (ligne ~170-178)

```swift
// Avatar
settingsField(label: "Avatar") {
    HStack {
        if !viewModel.avatarUrl.isEmpty {
            AsyncImage(url: URL(string: viewModel.avatarUrl)) { image in
                image.resizable().scaledToFill().frame(width: 40, height: 40).clipShape(Circle())
            } placeholder: {
                Circle().fill(theme.backgroundSecondary).frame(width: 40, height: 40)
            }
        }
```

### Step 2 : Remplacer par MeeshyAvatar

```swift
// Avatar
settingsField(label: "Avatar") {
    HStack {
        MeeshyAvatar(
            name: viewModel.name,
            mode: .custom(40),
            kind: .entity,
            accentColor: viewModel.localColor,
            avatarURL: viewModel.avatarUrl.isEmpty ? nil : viewModel.avatarUrl,
            enablePulse: false
        )
```

---

## Task 3 : Corriger LoginView (kind: .user)

**Fichier :** `apps/ios/Meeshy/Features/Main/Views/LoginView.swift`

`SavedAccount` a : `displayName: String?`, `username: String`, `avatarURL: String?`, `shortName: String` (= displayName ?? username).

### Step 1 : Localiser la fonction `accountAvatar` (ligne ~471-501)

```swift
private func accountAvatar(_ account: SavedAccount, size: CGFloat) -> some View {
    Group {
        if let urlString = account.avatarURL, let url = URL(string: urlString) {
            AsyncImage(url: url) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                initialsAvatar(account, size: size)
            }
        } else {
            initialsAvatar(account, size: size)
        }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
}

private func initialsAvatar(_ account: SavedAccount, size: CGFloat) -> some View {
    ZStack {
        Circle()
            .fill(
                LinearGradient(
                    colors: [MeeshyColors.coral.opacity(0.8), MeeshyColors.purple],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
        Text(account.username.prefix(1).uppercased())
            .font(.system(size: size * 0.4, weight: .bold))
            .foregroundColor(.white)
    }
}
```

### Step 2 : Remplacer les deux helpers par un seul appel

```swift
private func accountAvatar(_ account: SavedAccount, size: CGFloat) -> some View {
    MeeshyAvatar(
        name: account.shortName,
        mode: .custom(size),
        kind: .user,
        avatarURL: account.avatarURL,
        enablePulse: false
    )
}
```

Supprimer entièrement `initialsAvatar`.

---

## Task 4 : Build complet + commit

### Step 1 : Build

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -20
```

Attendu : `Build succeeded`

### Step 2 : Commit et push + PR

Invoquer le skill `commit-commands:commit-push-pr` avec le diff.

Message de commit suggéré :
```
feat(avatar): AvatarKind (.user/.entity), corrige AsyncImage directs
```
