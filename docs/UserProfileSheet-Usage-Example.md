# UserProfileSheet - Guide d'utilisation complet

## Vue d'ensemble

Le `UserProfileSheet` supporte maintenant toutes les fonctionnalités de blocage/déblocage avec le bouton "Bloquer" ajouté pour les profils non bloqués.

## Utilisation avec UserProfileViewModel (Recommandé)

### Exemple complet avec gestion du blocage

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

struct SomeView: View {
    @StateObject private var viewModel: UserProfileViewModel
    @State private var showProfile = false

    init(user: ProfileSheetUser) {
        _viewModel = StateObject(wrappedValue: UserProfileViewModel(user: user))
    }

    var body: some View {
        Button("Voir profil") {
            showProfile = true
        }
        .sheet(isPresented: $showProfile) {
            UserProfileSheet(
                user: viewModel.profileUser,
                conversations: viewModel.sharedConversations.map { $0.toMeeshyConversation() },
                isCurrentUser: viewModel.isCurrentUser,
                isBlocked: viewModel.isBlocked,
                isBlockedByTarget: viewModel.isBlockedByTarget,
                isLoading: viewModel.isLoading,
                fullUser: viewModel.fullUser,
                userStats: viewModel.userStats,
                isLoadingStats: viewModel.isLoadingStats,
                onNavigateToConversation: { conversation in
                    // Navigation vers conversation
                },
                onSendMessage: {
                    // Composer nouveau message
                },
                onBlock: {
                    Task {
                        await viewModel.blockUser()
                        // Optionnel: fermer le sheet après blocage
                        showProfile = false
                    }
                },
                onUnblock: {
                    Task {
                        await viewModel.unblockUser()
                    }
                },
                onDismiss: {
                    showProfile = false
                },
                onLoadStats: {
                    await viewModel.loadUserStats()
                }
            )
            .presentationDetents([.medium, .large])
            .task {
                await viewModel.loadFullProfile()
                viewModel.findSharedConversations(from: allConversations)
            }
        }
    }
}
```

## Comportement du blocage

### États du profil

| État | Interface affichée |
|------|-------------------|
| **Non bloqué** | Bouton "Bloquer cet utilisateur" (rouge) en bas des actions |
| **Bloqué par vous** | Card "Vous avez bloqué cet utilisateur" + bouton "Débloquer" |
| **Vous êtes bloqué** | Card "Profil restreint" (pas d'actions possibles) |

### Flux utilisateur

#### Bloquer un utilisateur
1. Utilisateur clique "Bloquer cet utilisateur"
2. Appel à `onBlock()` → `viewModel.blockUser()`
3. API call `BlockService.shared.blockUser(userId:)`
4. `viewModel.isBlocked = true`
5. UI se met à jour automatiquement (bouton "Bloquer" disparaît, card "Bloqué" apparaît)

#### Débloquer un utilisateur
1. Utilisateur voit la card "Vous avez bloqué cet utilisateur"
2. Clique sur "Débloquer"
3. Appel à `onUnblock()` → `viewModel.unblockUser()`
4. API call `BlockService.shared.unblockUser(userId:)`
5. `viewModel.isBlocked = false`
6. UI se met à jour (card "Bloqué" disparaît, bouton "Bloquer" réapparaît)

## Callbacks disponibles

| Callback | Description | Obligatoire |
|----------|-------------|------------|
| `onBlock` | Bloquer l'utilisateur | Non (si absent, bouton "Bloquer" ne s'affiche pas) |
| `onUnblock` | Débloquer l'utilisateur | Non (si absent, bouton "Débloquer" ne s'affiche pas) |
| `onSendMessage` | Envoyer un message | Oui (pour profils non bloqués) |
| `onNavigateToConversation` | Naviguer vers conversation | Oui (si conversations partagées) |
| `onConnectionRequest` | Demande de connexion | Non |
| `onDismiss` | Fermer le sheet | Non |
| `onLoadStats` | Charger les statistiques | Oui (pour onglet Stats) |

## Style du bouton "Bloquer"

```swift
// Bouton rouge avec style error
HStack {
    Image(systemName: "hand.raised.fill")
    Text("Bloquer cet utilisateur")
}
.foregroundColor(theme.error)
.background(theme.error.opacity(0.1))
.clipShape(RoundedRectangle(cornerRadius: 12))
.overlay(RoundedRectangle(cornerRadius: 12).stroke(theme.error.opacity(0.3)))
```

## Notes d'implémentation

### UserProfileViewModel
- `blockUser()` : Async, appelle BlockService
- `unblockUser()` : Async, appelle BlockService
- `isBlocked` : @Published, se met à jour automatiquement
- `checkIsBlocked()` : Vérifie au chargement si userId dans `currentUser.blockedUserIds`

### BlockService
```swift
public final class BlockService {
    public static let shared = BlockService()

    public func blockUser(userId: String) async throws
    public func unblockUser(userId: String) async throws
    public func listBlockedUsers() async throws -> [MeeshyUser]
}
```

### Cache invalidation
Quand un utilisateur est bloqué/débloqué, le cache de son profil devrait être invalidé :

```swift
func blockUser() async {
    guard let userId = profileUser.userId else { return }
    do {
        try await BlockService.shared.blockUser(userId: userId)
        isBlocked = true

        // Invalider le cache du profil
        await UserProfileCacheManager.shared.invalidate(userId: userId)
    } catch {}
}
```

## Migration des vues existantes

### RootView (actuellement sans callbacks)

**Avant** :
```swift
UserProfileSheet(
    user: user,
    isLoading: isLoading,
    fullUser: fullUser
)
```

**Après** (avec blocage) :
```swift
@StateObject private var profileViewModel: UserProfileViewModel

UserProfileSheet(
    user: profileViewModel.profileUser,
    isBlocked: profileViewModel.isBlocked,
    isBlockedByTarget: profileViewModel.isBlockedByTarget,
    fullUser: profileViewModel.fullUser,
    userStats: profileViewModel.userStats,
    isLoadingStats: profileViewModel.isLoadingStats,
    onBlock: {
        Task { await profileViewModel.blockUser() }
    },
    onUnblock: {
        Task { await profileViewModel.unblockUser() }
    },
    onLoadStats: {
        await profileViewModel.loadUserStats()
    }
)
.task {
    await profileViewModel.loadFullProfile()
}
```

## Sécurité

- Le blocage est **unidirectionnel** : bloquer A n'empêche pas A de voir le profil de B
- L'API retourne **403** si B a bloqué A et que A tente d'accéder au profil de B
- Le `isBlockedByTarget` se détecte via l'erreur 403 dans `loadFullProfile()`
- Les profils bloqués n'apparaissent plus dans les recherches/suggestions côté serveur
