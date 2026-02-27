# Community Completion — iOS Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Compléter la gestion des communautés iOS : fix navigation settings, affichage avatar/bannière, sélecteur couleur/emoji local, et mise à jour avatar via PUT.

**Architecture:** Approach B (Fast iOS + navigation fix) — pas de migration Prisma, pas de stories, pas d'upload image. Couleur/emoji stockés en UserDefaults par communityId. L'avatar/banner sont des URLs texte envoyées au backend existant (PUT /communities/:id).

**Tech Stack:** Swift 5.9, SwiftUI, MeeshySDK, Kingfisher (KFImage), UserDefaults

---

## Context

Fichiers SDK à modifier (dans `packages/MeeshySDK/`) :
- `Sources/MeeshySDK/Models/CommunityModels.swift` — APICommunity + UpdateCommunityRequest
- `Sources/MeeshySDK/Services/CommunityService.swift` — update() method
- `Sources/MeeshyUI/Community/CommunitySettingsView.swift` — redesign complet
- `Sources/MeeshyUI/Community/CommunityDetailView.swift` — affichage banner + avatar

Builder toujours via : `./apps/ios/meeshy.sh build`

---

### Task 1: SDK Models — ajouter banner à APICommunity

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/CommunityModels.swift`

**Contexte :** `APICommunity` (struct Decodable) ne décode pas `banner`. Le backend le retourne déjà. `MeeshyCommunity` a déjà `banner: String?`. Il faut juste câbler le décodage.

**Step 1: Ajouter `banner` à APICommunity**

Dans `CommunityModels.swift`, struct `APICommunity` (ligne ~108), ajouter après `avatar`:
```swift
public let banner: String?
```

**Step 2: Mapper dans toCommunity()**

Dans `extension APICommunity { func toCommunity() }`, dans le `MeeshyCommunity(...)` initialiseur, ajouter:
```swift
banner: banner,
```
(après `avatar: avatar,`)

**Step 3: Vérifier que UpdateCommunityRequest reçoit avatar**

Dans `struct UpdateCommunityRequest: Encodable`, ajouter:
```swift
public let avatar: String?
public let banner: String?
```

Et mettre à jour le `init`:
```swift
public init(name: String? = nil, identifier: String? = nil, description: String? = nil,
            isPrivate: Bool? = nil, avatar: String? = nil, banner: String? = nil) {
    self.name = name; self.identifier = identifier
    self.description = description; self.isPrivate = isPrivate
    self.avatar = avatar; self.banner = banner
}
```

**Step 4: Mettre à jour CommunityService.update()**

Dans `CommunityService.swift`, méthode `update()`, ajouter les paramètres `avatar` et `banner`:
```swift
public func update(communityId: String, name: String? = nil, identifier: String? = nil,
                   description: String? = nil, isPrivate: Bool? = nil,
                   avatar: String? = nil, banner: String? = nil) async throws -> APICommunity {
    let body = UpdateCommunityRequest(name: name, identifier: identifier,
                                       description: description, isPrivate: isPrivate,
                                       avatar: avatar, banner: banner)
    let response: APIResponse<APICommunity> = try await api.put(endpoint: "/communities/\(communityId)", body: body)
    return response.data
}
```

**Step 5: Build pour vérifier**
```bash
./apps/ios/meeshy.sh build
```
Expected: Build SUCCESS (aucune erreur de compilation)

**Step 6: Commit**
```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/CommunityModels.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Services/CommunityService.swift
git commit -m "feat(sdk): add banner/avatar to APICommunity and UpdateCommunityRequest"
```

---

### Task 2: CommunityDetailView — affichage banner + avatar image

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityDetailView.swift`

**Contexte :** La vue actuelle montre un gradient coloré avec emoji/initiales. Il faut afficher :
- Si `community.banner != nil` → image bannière en haut (hauteur 200px), navigation header flottant dessus
- Si `community.avatar != nil` → KFImage circulaire, sinon garder le carré gradient actuel
- Les couleurs/emoji locaux (UserDefaults) peuvent remplacer les valeurs par défaut

**Step 1: Ajouter la lecture des prefs locales**

En haut de la vue (après `@ObservedObject private var theme`), ajouter :
```swift
@State private var localColor: String? = nil
@State private var localEmoji: String? = nil
```

Et dans `.task { await viewModel.load() }`, lire UserDefaults :
```swift
.task {
    await viewModel.load()
    localColor = UserDefaults.standard.string(forKey: "community.color.\(viewModel.communityId)")
    localEmoji = UserDefaults.standard.string(forKey: "community.emoji.\(viewModel.communityId)")
}
```

**Step 2: Modifier headerSection pour afficher bannière**

Remplacer `headerSection` pour avoir une structure en deux parties :
1. Bannière (image ou gradient) de 200px
2. Infos de la communauté dessous

```swift
@ViewBuilder
private func headerSection(_ community: MeeshyCommunity) -> some View {
    VStack(spacing: 0) {
        // Bannière
        ZStack(alignment: .bottomLeading) {
            bannerView(community)
                .frame(height: 180)

            // Avatar overlaid en bas de la bannière
            communityAvatar(community)
                .offset(x: 16, y: 40)
        }

        // Infos
        VStack(spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(community.name)
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                        .foregroundColor(theme.textPrimary)

                    if let desc = community.description, !desc.isEmpty {
                        Text(desc)
                            .font(.system(size: 13, design: .rounded))
                            .foregroundColor(theme.textSecondary)
                            .lineLimit(2)
                    }
                }
                Spacer()
                privacyBadge(community)
            }
            .padding(.top, 48) // espace pour l'avatar qui déborde
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 16)
    }
}
```

**Step 3: Ajouter bannerView()**

```swift
@ViewBuilder
private func bannerView(_ community: MeeshyCommunity) -> some View {
    let color = localColor ?? (community.color.isEmpty ? DynamicColorGenerator.colorForName(community.name) : community.color)

    if let bannerUrl = community.banner, let url = URL(string: bannerUrl) {
        KFImage(url)
            .resizable()
            .aspectRatio(contentMode: .fill)
            .clipped()
    } else {
        LinearGradient(
            colors: [Color(hex: color), Color(hex: color).opacity(0.5)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}
```

**Step 4: Modifier communityAvatar() pour afficher image si URL**

```swift
@ViewBuilder
private func communityAvatar(_ community: MeeshyCommunity) -> some View {
    let color = localColor ?? (community.color.isEmpty ? DynamicColorGenerator.colorForName(community.name) : community.color)
    let emoji = localEmoji.map { $0.isEmpty ? community.emoji : $0 } ?? community.emoji

    ZStack {
        if let avatarUrl = community.avatar, let url = URL(string: avatarUrl) {
            KFImage(url)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 18))
        } else {
            RoundedRectangle(cornerRadius: 18)
                .fill(LinearGradient(
                    colors: [Color(hex: color), Color(hex: color).opacity(0.6)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                ))
                .frame(width: 72, height: 72)
                .overlay {
                    if !emoji.isEmpty {
                        Text(emoji).font(.system(size: 32))
                    } else {
                        Text(String(community.name.prefix(2)).uppercased())
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                    }
                }
        }
    }
    .shadow(color: Color(hex: color).opacity(0.4), radius: 8, y: 4)
    .overlay(
        RoundedRectangle(cornerRadius: 18)
            .stroke(theme.backgroundPrimary, lineWidth: 3)
    )
}
```

**Step 5: Adapter navigationHeader() pour fonctionner sur fond de bannière**

Le header doit flotter au-dessus de la bannière. Changer la structure de `body` pour que le navigationHeader soit en ZStack par-dessus le ScrollView :

```swift
public var body: some View {
    ZStack(alignment: .topLeading) {
        theme.backgroundPrimary.ignoresSafeArea()

        if viewModel.isLoading && viewModel.community == nil {
            ProgressView().tint(Color(hex: "FF2E63"))
        } else if let community = viewModel.community {
            ScrollView {
                VStack(spacing: 0) {
                    headerSection(community)
                    statsSection(community)
                    actionsSection(community)
                    conversationsSection
                }
            }
            // Navigation header flottant
            navigationHeader(community)
                .padding(.top, 8)
        } else if let error = viewModel.errorMessage {
            EmptyStateView(...)
        }
    }
    .task { ... }
    .alert(...)
    .sheet(...)
}
```

**Step 6: Build**
```bash
./apps/ios/meeshy.sh build
```
Expected: BUILD SUCCESS

**Step 7: Commit**
```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityDetailView.swift
git commit -m "feat(sdk): community detail with banner image, avatar image, floating nav header"
```

---

### Task 3: CommunitySettingsView — fix navigation + color/emoji UI

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunitySettingsView.swift`

**Problème navigation :** `CommunitySettingsView` a un `NavigationStack` imbriqué dans une `.sheet` présentée depuis un NavigationStack. Le `dismiss()` peut déclencher une dismissal ambiguë. **Fix** : supprimer le `NavigationStack`, utiliser un header custom HStack à la place.

**Nouvelles features :** Section "Visuel" avec :
- Color picker (grille 12 couleurs prédéfinies, stockées UserDefaults)
- Emoji picker (champ texte emoji, stocké UserDefaults)
- Champ URL avatar (envoyé via PUT au backend)

**Step 1: Modifier CommunitySettingsViewModel pour ajouter les nouveaux champs**

```swift
@MainActor
final class CommunitySettingsViewModel: ObservableObject {
    // Champs existants ...
    @Published var name: String
    @Published var descriptionText: String
    @Published var isPrivate: Bool

    // Nouveaux champs
    @Published var avatarUrl: String
    @Published var localColor: String
    @Published var localEmoji: String

    // ... hasChanges mis à jour
    var hasChanges: Bool {
        name != originalName || descriptionText != originalDescription
        || isPrivate != originalIsPrivate || avatarUrl != originalAvatarUrl
        || localColor != originalLocalColor || localEmoji != originalLocalEmoji
    }

    private let originalAvatarUrl: String
    private let originalLocalColor: String
    private let originalLocalEmoji: String

    init(community: MeeshyCommunity) {
        // ... existant ...
        let savedColor = UserDefaults.standard.string(forKey: "community.color.\(community.id)") ?? community.color
        let savedEmoji = UserDefaults.standard.string(forKey: "community.emoji.\(community.id)") ?? community.emoji
        self.localColor = savedColor
        self.localEmoji = savedEmoji
        self.avatarUrl = community.avatar ?? ""
        self.originalAvatarUrl = community.avatar ?? ""
        self.originalLocalColor = savedColor
        self.originalLocalEmoji = savedEmoji
    }

    func save() async -> MeeshyCommunity? {
        // Sauvegarder les prefs locales
        UserDefaults.standard.set(localColor, forKey: "community.color.\(communityId)")
        UserDefaults.standard.set(localEmoji, forKey: "community.emoji.\(communityId)")

        // Sauvegarder avatar sur backend si changé
        isSaving = true
        defer { isSaving = false }
        do {
            let apiCommunity = try await CommunityService.shared.update(
                communityId: communityId,
                name: name != originalName ? name : nil,
                description: descriptionText != originalDescription ? descriptionText : nil,
                isPrivate: isPrivate != originalIsPrivate ? isPrivate : nil,
                avatar: avatarUrl != originalAvatarUrl ? (avatarUrl.isEmpty ? nil : avatarUrl) : nil
            )
            return apiCommunity.toCommunity()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
            return nil
        }
    }
}
```

**Step 2: Supprimer NavigationStack et créer header custom**

Remplacer le body complet — supprimer `NavigationStack { ... }` et utiliser un ZStack avec header custom :

```swift
public var body: some View {
    ZStack {
        theme.backgroundPrimary.ignoresSafeArea()

        VStack(spacing: 0) {
            // Header custom (remplace NavigationBar)
            settingsHeader

            ScrollView {
                VStack(spacing: 20) {
                    visualSection     // NOUVEAU
                    editSection
                    privacySection
                    dangerSection
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
            }
        }
    }
    .alert("Error", ...) // alerts sans NavigationStack
    .alert("Delete Community", ...)
    .alert("Leave Community", ...)
}

private var settingsHeader: some View {
    HStack {
        Button("Annuler") { dismiss() }
            .foregroundColor(theme.textSecondary)

        Spacer()

        Text("Réglages")
            .font(.system(size: 17, weight: .bold, design: .rounded))
            .foregroundColor(theme.textPrimary)

        Spacer()

        Button {
            Task {
                let updated = await viewModel.save()
                if updated != nil {
                    onUpdated?(updated!)
                    dismiss()
                }
            }
        } label: {
            if viewModel.isSaving {
                ProgressView().tint(Color(hex: "FF2E63")).scaleEffect(0.8)
            } else {
                Text("Sauvegarder")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(viewModel.hasChanges ? Color(hex: "FF2E63") : theme.textMuted)
            }
        }
        .disabled(!viewModel.hasChanges || viewModel.isSaving)
    }
    .padding(.horizontal, 20)
    .padding(.vertical, 14)
    .background(theme.backgroundPrimary)
    .overlay(alignment: .bottom) {
        Divider().opacity(0.3)
    }
}
```

**Step 3: Ajouter visualSection**

```swift
private let presetColors = [
    "FF2E63", "A855F7", "08D9D6", "FF6B6B",
    "4ECDC4", "45B7D1", "F59E0B", "10B981",
    "6366F1", "EC4899", "14B8A6", "F97316"
]

private var visualSection: some View {
    VStack(spacing: 16) {
        sectionHeader("Apparence")

        // Emoji
        VStack(alignment: .leading, spacing: 6) {
            Text("Emoji")
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundColor(theme.textSecondary)

            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(Color(hex: viewModel.localColor).opacity(0.15))
                        .frame(width: 52, height: 52)
                    Text(viewModel.localEmoji.isEmpty ? "?" : viewModel.localEmoji)
                        .font(.system(size: 30))
                }

                TextField("Emoji de la communauté", text: $viewModel.localEmoji)
                    .font(.system(size: 24))
                    .frame(height: 44)
                    .padding(.horizontal, 12)
                    .background(theme.backgroundSecondary.opacity(0.5))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .onChange(of: viewModel.localEmoji) { _, new in
                        // Limiter à 1 emoji
                        if new.count > 2 {
                            viewModel.localEmoji = String(new.prefix(2))
                        }
                    }
            }
        }

        // Color picker
        VStack(alignment: .leading, spacing: 10) {
            Text("Couleur")
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundColor(theme.textSecondary)

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 6), spacing: 10) {
                ForEach(presetColors, id: \.self) { hex in
                    Circle()
                        .fill(Color(hex: hex))
                        .frame(height: 36)
                        .overlay(
                            Circle()
                                .stroke(Color.white, lineWidth: viewModel.localColor == hex ? 3 : 0)
                        )
                        .overlay(
                            Circle()
                                .stroke(Color(hex: hex), lineWidth: viewModel.localColor == hex ? 1.5 : 0)
                                .padding(-2)
                        )
                        .shadow(color: Color(hex: hex).opacity(0.4), radius: viewModel.localColor == hex ? 6 : 0)
                        .onTapGesture {
                            withAnimation(.spring(response: 0.25)) {
                                viewModel.localColor = hex
                            }
                        }
                }
            }
        }

        // Avatar URL
        settingsField(label: "Image (URL)") {
            TextField("https://...", text: $viewModel.avatarUrl)
                .font(.system(size: 15, design: .rounded))
                .foregroundColor(theme.textPrimary)
                .keyboardType(.URL)
                .autocapitalization(.none)
        }
    }
}
```

**Step 4: Build**
```bash
./apps/ios/meeshy.sh build
```
Expected: BUILD SUCCESS

**Step 5: Commit**
```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Community/CommunitySettingsView.swift
git commit -m "feat(sdk): community settings redesign — remove NavigationStack, add color/emoji/avatar UI"
```

---

### Task 4: Mise à jour ThemedCommunityCard (overlay dans ConversationList)

**Files:**
- Check: `apps/ios/Meeshy/Features/Main/Views/ConversationListHelpers.swift`

**Contexte :** Les cards de communauté dans la liste des conversations doivent aussi lire les prefs locales (couleur/emoji). La `ThemedCommunityCard` dans `ConversationListHelpers.swift` utilise `community.color` et `community.emoji`. Il faut lire depuis UserDefaults.

**Step 1: Modifier ThemedCommunityCard pour lire UserDefaults**

Dans `ThemedCommunityCard`, ajouter :
```swift
private var localColor: String {
    UserDefaults.standard.string(forKey: "community.color.\(community.id)") ?? community.color
}
private var localEmoji: String {
    UserDefaults.standard.string(forKey: "community.emoji.\(community.id)") ?? community.emoji
}
```

Et remplacer toutes les références à `community.color` par `localColor` et `community.emoji` par `localEmoji`.

**Step 2: Build**
```bash
./apps/ios/meeshy.sh build
```

**Step 3: Commit (si changes)**
```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationListHelpers.swift
git commit -m "feat(ios): community cards read local color/emoji preferences from UserDefaults"
```

---

### Task 5: Vérification finale et commit session state

**Step 1: Build + Run**
```bash
./apps/ios/meeshy.sh run
```

**Step 2: Vérifier dans le simulateur :**
- [ ] Naviguer dans la liste des communautés → voir les cards
- [ ] Ouvrir une communauté → voir bannière/avatar si URL
- [ ] Ouvrir les settings → header custom (pas de NavigationBar), section Apparence
- [ ] Choisir une couleur → card dans la liste se met à jour (prochaine ouverture)
- [ ] Changer emoji → visible dans le preview de la section
- [ ] Entrer URL avatar → sauvegarder → retour sur communityDetail avec image
- [ ] Sauvegarder → retour sur communityDetail (PAS retour à la liste de conversations)

**Step 3: Commit du fichier session state**
```bash
git add meeshy-session-state-2026-02-26.md
git commit -m "docs: add session state file for 2026-02-26"
```

**Step 4: Commit global si tout est OK**
```bash
git log --oneline -6
```
Vérifier que les commits précédents sont bien là.

---

## Résumé des changements

| Fichier | Type | Description |
|---------|------|-------------|
| `packages/MeeshySDK/Sources/MeeshySDK/Models/CommunityModels.swift` | Modify | APICommunity + banner, UpdateCommunityRequest + avatar/banner |
| `packages/MeeshySDK/Sources/MeeshySDK/Services/CommunityService.swift` | Modify | update() + avatar, banner params |
| `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityDetailView.swift` | Modify | Banner image, avatar image, floating nav header, local prefs |
| `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunitySettingsView.swift` | Modify | Remove NavigationStack, add Visual section (color/emoji/avatar) |
| `apps/ios/Meeshy/Features/Main/Views/ConversationListHelpers.swift` | Modify | Read local color/emoji prefs in ThemedCommunityCard |
