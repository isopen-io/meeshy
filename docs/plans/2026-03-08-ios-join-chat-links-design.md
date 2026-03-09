# iOS — Gestion des liens /join et /chat (mode anonyme)

**Date** : 2026-03-08
**Statut** : Approuvé
**Contexte** : Permettre à un utilisateur sans compte Meeshy (guest total) de rejoindre une conversation via un lien `/join` ou `/chat` sur iOS.

---

## Contexte & problèmes identifiés

### Ce qui existe déjà (fonctionne pour utilisateurs authentifiés)
- `DeepLinkRouter` parse `/join/{id}` et `/l/{id}` → `pendingDeepLink = .joinLink(identifier:)`
- `JoinFlowSheet` (SDK MeeshyUI) : phases loading → preview → form → success
- `JoinLinkPreviewView` : détails conversation, stats, requirements
- `AnonymousJoinFormView` : formulaire firstName/lastName/langue
- `JoinFlowViewModel` : `loadLinkInfo()` + `submitJoin()` → `AnonymousJoinResponse`
- `RootView` : ouvre `JoinFlowSheet` sur `pendingDeepLink`
- Gateway : `POST /anonymous/join/:linkId`, `GET /anonymous/link/:identifier`
- Modèle unifié `Participant` en base (type="anonymous", `sessionTokenHash`, `AnonymousSession` embedded)
- SDK : `APIParticipant` + `ParticipantPermissions` (7 permissions) + `AnonymousJoinResponse`

### Problèmes critiques à résoudre

1. **Guest-total impossible** : `RootView` (qui héberge `JoinFlowSheet`) n'est affiché que si `authManager.isAuthenticated`. Un utilisateur sans compte est envoyé sur `LoginView`, le `pendingDeepLink` est stocké mais jamais consommé.

2. **`/chat` non géré** : `DeepLinkRouter` ne parse pas `/chat`. `meeshy.me/chat/mshy_xxx` → Safari.

3. **Pending deep link perdu** : `onChange(of: deepLinkRouter.pendingDeepLink)` ne fire pas pour l'état initial de `RootView` — si le lien arrive avant l'apparition de `RootView`, il est ignoré.

4. **Couleurs hardcodées** dans `JoinFlowSheet` et `JoinLinkPreviewView` (anciens `B24BF3`, `4ECDC4` au lieu d'Indigo).

---

## Sémantique des liens

| URL | Sémantique |
|-----|-----------|
| `meeshy.me/join/{linkId}` | Rejoindre une conversation (affiche preview + formulaire si pas de session) |
| `meeshy.me/l/{linkId}` | Alias court pour `/join` |
| `meeshy.me/chat/{linkId}` | Rouvrir une conversation avec une session anonyme existante |
| `meeshy://join/{linkId}` | Custom scheme équivalent |
| `meeshy://chat/{linkId}` | Custom scheme équivalent |

`{linkId}` = identifiant de `ConversationShareLink` (format `mshy_xxx` ou ObjectID MongoDB).

---

## Architecture retenue : GuestEntryPoint dans MeeshyApp

```
MeeshyApp
├─ authManager.isAuthenticated
│   ├─ true  → RootView (flux normal inchangé)
│   └─ false → LoginView
└─ activeGuestSession: GuestSession? (NOUVEAU)
    ├─ /join link → GuestConversationContainer
    │   ├─ sans session → JoinFlowSheet → onSuccess → ConversationView(anonymousSession:)
    │   └─ avec session Keychain → directement ConversationView(anonymousSession:)
    └─ /chat link → GuestConversationContainer
        ├─ avec session Keychain → directement ConversationView(anonymousSession:)
        └─ sans session → fallback JoinFlowSheet (comportement identique à /join)
```

**Priorité** : `authManager.isAuthenticated` prend le dessus — si l'utilisateur est authentifié et reçoit un lien `/join`, le flux normal `RootView` gère (JoinFlowSheet via `pendingDeepLink`). Le `GuestSession` state n'est actif que pour les utilisateurs non authentifiés.

---

## Nouveaux types

### `DeepLink` enum — ajout du case `.chatLink`
```swift
// apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift
enum DeepLink: Equatable {
    case joinLink(identifier: String)
    case chatLink(identifier: String)    // NOUVEAU
    case magicLink(token: String)
    case conversation(id: String)
}
```

### `AnonymousSessionContext`
```swift
// apps/ios/Meeshy/Features/Main/Models/AnonymousSessionContext.swift
struct AnonymousSessionContext: Codable, Equatable {
    let sessionToken: String
    let participantId: String
    let permissions: ParticipantPermissions   // MeeshySDK
    let linkId: String
    let conversationId: String
}

extension AnonymousJoinResponse {
    var toSessionContext: AnonymousSessionContext {
        AnonymousSessionContext(
            sessionToken: sessionToken,
            participantId: participant.id,
            permissions: participant.permissions,
            linkId: linkId,
            conversationId: conversation.id
        )
    }
}
```

### `AnonymousSessionStore`
```swift
// apps/ios/Meeshy/Services/AnonymousSessionStore.swift
final class AnonymousSessionStore {
    static func save(_ context: AnonymousSessionContext)  // clé Keychain = linkId
    static func load(linkId: String) -> AnonymousSessionContext?
    static func delete(linkId: String)
}
// Stockage : Keychain, kSecAttrAccessibleWhenUnlockedThisDeviceOnly
// Sérialisation : JSON (JSONEncoder/Decoder)
// Limite : max 1 session anonyme par linkId
```

### `GuestSession` state (dans MeeshyApp)
```swift
// Dans MeeshyApp (state local)
struct GuestSession {
    let identifier: String
    var context: AnonymousSessionContext?  // nil = pas encore joint
}
```

---

## Modifications par couche

### 1. `DeepLinkRouter` (apps/ios)

**Ajout du case `/chat`** dans `handle(url:)` :
```swift
case "chat":
    guard pathComponents.count >= 2 else { return false }
    pendingDeepLink = .chatLink(identifier: pathComponents[1])
    return true
```

**Ajout dans `handleCustomScheme(url:)`** :
```swift
case "chat":
    guard !pathComponents.isEmpty else { return false }
    pendingDeepLink = .chatLink(identifier: pathComponents[0])
    return true
```

### 2. `MeeshyApp` (apps/ios)

```swift
@State private var activeGuestSession: GuestSession?

// Dans onOpenURL / onContinueUserActivity (après le check magic link) :
let _ = deepLinkRouter.handle(url: url)

// Traitement du pending deep link pour guests :
.onChange(of: deepLinkRouter.pendingDeepLink) { _, link in
    guard !authManager.isAuthenticated else { return }  // RootView gère si auth
    handleGuestDeepLink(link)
}
// + .onAppear { handleGuestDeepLink(deepLinkRouter.pendingDeepLink) } pour état initial

private func handleGuestDeepLink(_ link: DeepLink?) {
    guard let link else { return }
    switch link {
    case .joinLink(let id):
        let ctx = AnonymousSessionStore.load(linkId: id)
        activeGuestSession = GuestSession(identifier: id, context: ctx)
        deepLinkRouter.consumePendingDeepLink()
    case .chatLink(let id):
        let ctx = AnonymousSessionStore.load(linkId: id)
        activeGuestSession = GuestSession(identifier: id, context: ctx)
        deepLinkRouter.consumePendingDeepLink()
    default:
        break
    }
}

// Ajout dans le body (ENTRE LoginView et RootView) :
if let guestSession = activeGuestSession, !authManager.isAuthenticated {
    GuestConversationContainer(
        session: guestSession,
        onSessionCreated: { ctx in
            AnonymousSessionStore.save(ctx)
            activeGuestSession = GuestSession(identifier: guestSession.identifier, context: ctx)
        },
        onDismiss: {
            AnonymousSessionStore.delete(linkId: guestSession.identifier)
            activeGuestSession = nil
        }
    )
}
```

### 3. `GuestConversationContainer` (NOUVEAU — apps/ios)

```swift
// apps/ios/Meeshy/Features/Main/Views/GuestConversationContainer.swift
struct GuestConversationContainer: View {
    let session: GuestSession
    let onSessionCreated: (AnonymousSessionContext) -> Void
    let onDismiss: () -> Void

    var body: some View {
        if let context = session.context {
            // Session existante → conversation directement
            let conv = Conversation(id: context.conversationId, ...)
            ConversationView(
                conversation: conv,
                anonymousSession: context
            )
        } else {
            // Pas de session → JoinFlowSheet (plein écran)
            JoinFlowSheet(identifier: session.identifier) { joinResponse in
                onSessionCreated(joinResponse.toSessionContext)
            }
        }
    }
}
```

### 4. `APIClient` (MeeshySDK)

```swift
// Ajout aux propriétés publiques de APIClient
public var anonymousSessionToken: String?

// Dans request(), après le bloc authToken :
} else if let token = anonymousSessionToken {
    urlRequest.setValue(token, forHTTPHeaderField: "X-Session-Token")
}
```

### 5. `MessageSocketManager` (MeeshySDK)

```swift
// Ajout d'une méthode de connexion anonyme
public func connectAnonymous(sessionToken: String) {
    // Configure le handshake Socket.IO avec { "sessionToken": "..." }
    // au lieu du JWT Bearer
}
```

### 6. `ConversationView` + `ConversationViewModel` (apps/ios)

**Signature** :
```swift
struct ConversationView: View {
    let conversation: Conversation
    var replyContext: ReplyContext? = nil
    var anonymousSession: AnonymousSessionContext? = nil   // NOUVEAU
}

@MainActor class ConversationViewModel: ObservableObject {
    init(
        conversation: Conversation,
        anonymousSession: AnonymousSessionContext? = nil
    )
}
```

**Comportements quand `anonymousSession != nil`** :
- Configure `APIClient.shared.anonymousSessionToken = sessionToken` dans `init`
- Appelle `MessageSocketManager.shared.connectAnonymous(sessionToken:)` dans `init`
- **Header** : le composant avatar/titre de conversation est remplacé par un bouton Fermer (xmark) positionné au même endroit
- Aucune navigation vers settings/membres/infos de la conversation
- Bouton attachment visible/masqué selon `permissions.canSendFiles`
- Bouton image visible/masqué selon `permissions.canSendImages`
- E2EE désactivé (pas de setup Signal Protocol)
- `deinit` / `onDisappear` : remet `APIClient.shared.anonymousSessionToken = nil`

---

## Flux complet — Guest total

```
1. Utilisateur reçoit lien meeshy.me/join/mshy_support
2. iOS capte via Universal Link → onContinueUserActivity
3. DeepLinkRouter.handle() → pendingDeepLink = .joinLink("mshy_support")
4. MeeshyApp.handleGuestDeepLink() → AnonymousSessionStore.load("mshy_support") → nil
5. activeGuestSession = GuestSession(identifier: "mshy_support", context: nil)
6. GuestConversationContainer affiché → context == nil → JoinFlowSheet
7. JoinFlowSheet : loading → preview (détails conversation) → form (prénom, nom, langue)
8. Utilisateur soumet → POST /anonymous/join/mshy_support → AnonymousJoinResponse
9. onSessionCreated → AnonymousSessionStore.save(ctx) → activeGuestSession.context = ctx
10. GuestConversationContainer → context != nil → ConversationView(anonymousSession: ctx)
11. ConversationView : header avec bouton Fermer, messages en temps réel, permissions filtrées

--- Retour ultérieur ---
1. Utilisateur re-ouvre meeshy.me/chat/mshy_support (ou /join)
2. DeepLinkRouter → pendingDeepLink = .chatLink("mshy_support")
3. AnonymousSessionStore.load("mshy_support") → ctx (Keychain)
4. GuestConversationContainer → context != nil → ConversationView directement (pas de formulaire)
```

---

## Tests

### SDK — `AnonymousSessionStore`
- `test_save_thenLoad_returnsContext`
- `test_save_differentLinkIds_returnsCorrectContext`
- `test_delete_removesFromKeychain`
- `test_load_missingKey_returnsNil`

### SDK — `JoinFlowViewModel` (existants + ajout)
- Existants : inchangés (signature API stable)
- `test_submitJoin_success_participantHasSevenPermissions` — valide que `APIParticipant.permissions` contient les 7 champs

### App — `ConversationViewModel` (anonymous mode)
- `test_init_withAnonymousSession_setsSessionTokenOnAPIClient`
- `test_init_withAnonymousSession_nilAuthToken`
- `test_init_withNilAnonymousSession_usesNormalAuth`

### App — `DeepLinkRouter`
- `test_handle_chatPath_returnsChatLink` ← NOUVEAU
- `test_handle_chatCustomScheme_returnsChatLink` ← NOUVEAU
- Existants `/join` : inchangés

---

## Couleurs — migration Indigo

`JoinFlowSheet` et `JoinLinkPreviewView` utilisent les anciennes couleurs (`B24BF3`, `4ECDC4`). Ces composants doivent être migrés vers le système Indigo actuel (`MeeshyColors.indigo500..700`, `MeeshyColors.brandGradient`) lors de la même PR, car ce sont des écrans guest-visible.

---

## Fichiers créés / modifiés

| Fichier | Action |
|---------|--------|
| `apps/ios/.../Navigation/DeepLinkRouter.swift` | Modifier — ajouter `.chatLink`, parse `/chat` |
| `apps/ios/.../MeeshyApp.swift` | Modifier — `activeGuestSession` state, `handleGuestDeepLink()`, `GuestConversationContainer` dans body |
| `apps/ios/.../Models/AnonymousSessionContext.swift` | Créer |
| `apps/ios/.../Services/AnonymousSessionStore.swift` | Créer |
| `apps/ios/.../Views/GuestConversationContainer.swift` | Créer |
| `apps/ios/.../Views/ConversationView.swift` | Modifier — param `anonymousSession`, header conditionnel |
| `apps/ios/.../ViewModels/ConversationViewModel.swift` | Modifier — param `anonymousSession`, config APIClient/Socket |
| `packages/MeeshySDK/.../Networking/APIClient.swift` | Modifier — `anonymousSessionToken` + header `X-Session-Token` |
| `packages/MeeshySDK/.../Sockets/MessageSocketManager.swift` | Modifier — `connectAnonymous(sessionToken:)` |
| `packages/MeeshySDK/.../JoinFlow/JoinFlowSheet.swift` | Modifier — couleurs Indigo |
| `packages/MeeshySDK/.../JoinFlow/JoinLinkPreviewView.swift` | Modifier — couleurs Indigo |
