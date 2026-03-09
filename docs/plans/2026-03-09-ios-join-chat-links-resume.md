# iOS Join/Chat Links — Fichier de reprise

**Date :** 2026-03-09
**Branche :** `feat/ios-join-chat-links`
**Plan complet :** `docs/plans/2026-03-08-ios-join-chat-links-impl.md`
**Design doc :** `docs/plans/2026-03-08-ios-join-chat-links-design.md`

---

## État des tâches

| # | Task | Statut | Commit |
|---|------|--------|--------|
| 1 | DeepLink `.chatLink` + parsing `/chat` | ✅ Done | `0e3f85ea` |
| 2 | `AnonymousSessionContext` + extension `AnonymousJoinResponse` | ✅ Done | `de235ade` |
| 3 | `AnonymousSessionStore` (Keychain) | ✅ Done | `2b2b4632` |
| 4 | `APIClient.anonymousSessionToken` + header `X-Session-Token` | ✅ Done | `3a95867c` |
| 5 | `MessageSocketManager.connectAnonymous(sessionToken:)` | ✅ Done | `a1322163` |
| 6 | `ConversationViewModel` param `anonymousSession` | ✅ Done | `4642c5db` (cherry-pick) |
| 7 | `ConversationView` param `anonymousSession` + bouton Fermer | ✅ Done | `880e7417` |
| 8 | `GuestConversationContainer` (nouveau fichier) | ✅ Done | `0e2ae239` |
| 9 | `MeeshyApp` `activeGuestSession` + `handleGuestDeepLink()` | ✅ Done | `0cc2bfdf` |
| 10 | Migration couleurs Indigo `JoinFlowSheet` + `JoinLinkPreviewView` | ✅ Done | `afbf74fe` |
| 11 | Code review fixes (onDismiss, save check, tests) | ✅ Done | `866dfca9` |

---

## ⚠️ PROBLÈME CRITIQUE : Task 6 sur mauvaise branche

Le subagent Task 6 a commité `6c0b071d` directement sur `dev` au lieu de `feat/ios-join-chat-links`.

**Ce commit contient :**
- `ConversationViewModel.init(anonymousSession:)` — NOUVEAU paramètre
- `ConversationViewModel.deinit` — cleanup `anonymousSessionToken`
- `MockMessageSocket.swift` — ajout `connectAnonymous(sessionToken:)` au mock
- `MockAPIClientForApp.swift` — ajout `anonymousSessionToken: String?` au mock
- `MockBlockService.swift` — fix `@unchecked Sendable`
- `MockMessageService.swift` — fix JSON stubs avec `senderId` (field non-optionnel)
- `ConversationViewModelTests.swift` — ajout 2 nouveaux tests + fix stubs `senderId`

**Fix obligatoire au démarrage de la session :**
```bash
git checkout feat/ios-join-chat-links
git cherry-pick 6c0b071d
```

**Puis vérifier que les tests passent :**
```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild test -workspace apps/ios/Meeshy.xcworkspace \
  -scheme Meeshy \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshyTests/ConversationViewModelTests \
  -quiet 2>&1 | tail -5
```
Attendu : `** TEST SUCCEEDED **` (45 tests)

---

## Contexte technique

**Working directory :** `/Users/smpceo/Documents/v2_meeshy`
**Simulator UDID :** `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5` (iPhone 16 Pro)
**Commande build :** `./apps/ios/meeshy.sh build`
**Commande tests :** `./apps/ios/meeshy.sh test` OU `xcodebuild test -workspace apps/ios/Meeshy.xcworkspace -scheme Meeshy -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -quiet`

**Fichiers créés (Tasks 1-5) :**
- `apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift` — modifié (Task 1)
- `apps/ios/MeeshyTests/Unit/Navigation/DeepLinkTests.swift` — modifié (Task 1)
- `apps/ios/Meeshy/Features/Main/Models/AnonymousSessionContext.swift` — créé (Task 2)
- `apps/ios/Meeshy/Features/Main/Services/AnonymousSessionStore.swift` — créé (Task 3)
- `apps/ios/MeeshyTests/Unit/Services/AnonymousSessionStoreTests.swift` — créé (Task 3)
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift` — modifié (Task 4)
- `packages/MeeshySDK/Tests/MeeshySDKTests/Mocks/MockAPIClient.swift` — modifié (Task 4)
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift` — modifié (Task 5)

**Fichiers à modifier (Tasks 6-10, dans le commit cherry-pick + Tasks 7-10) :**
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` — Task 6 (dans cherry-pick)
- `apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelTests.swift` — Task 6 (dans cherry-pick)
- `apps/ios/MeeshyTests/Mocks/MockMessageSocket.swift` — Task 6 (dans cherry-pick)
- `apps/ios/MeeshyTests/Mocks/MockAPIClientForApp.swift` — Task 6 (dans cherry-pick)
- `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` — Task 7
- `apps/ios/Meeshy/Features/Main/Views/GuestConversationContainer.swift` — Task 8 (créer)
- `apps/ios/Meeshy/MeeshyApp.swift` — Task 9
- `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinFlowSheet.swift` — Task 10
- `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinLinkPreviewView.swift` — Task 10

---

## Tasks restantes (7-10)

Le plan complet est dans `docs/plans/2026-03-08-ios-join-chat-links-impl.md`. Ci-dessous les points essentiels.

### Task 7 : `ConversationView` — bouton Fermer en mode anonyme

**Fichiers :**
- `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`
- Possiblement `ConversationView+Header.swift` si ce fichier existe

**Ce qu'il faut faire :**
1. Ajouter `var anonymousSession: AnonymousSessionContext? = nil` à la `struct ConversationView`
2. Passer `anonymousSession` au `ConversationViewModel` dans le `body`
3. Dans le header, ajouter une condition : si `anonymousSession != nil`, afficher un bouton xmark (`dismiss()`) à la place du header normal

```swift
// Bouton Fermer pour mode anonyme
HStack {
    Spacer()
    Button {
        HapticFeedback.light()
        dismiss()
    } label: {
        Image(systemName: "xmark")
            .font(.system(size: 11, weight: .bold))
            .foregroundColor(ThemeManager.shared.textMuted)
            .frame(width: 32, height: 32)
            .background(Circle().fill(ThemeManager.shared.textMuted.opacity(0.12)))
    }
    .accessibilityLabel("Fermer la conversation")
    .padding(.trailing, 16)
}
.padding(.top, 12)
```

**Commit :** `feat(ios): add anonymousSession param to ConversationView with close button header`

---

### Task 8 : `GuestConversationContainer` (nouveau fichier)

**Fichier à créer :** `apps/ios/Meeshy/Features/Main/Views/GuestConversationContainer.swift`

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

struct GuestSession {
    let identifier: String
    var context: AnonymousSessionContext?
}

struct GuestConversationContainer: View {
    let session: GuestSession
    let onSessionCreated: (AnonymousSessionContext) -> Void
    let onDismiss: () -> Void

    var body: some View {
        if let context = session.context {
            // Session Keychain existante → conversation directement
            ConversationView(
                conversation: Conversation(id: context.conversationId, ...),
                anonymousSession: context
            )
        } else {
            // Pas de session → JoinFlowSheet plein écran
            JoinFlowSheet(identifier: session.identifier) { joinResponse in
                onSessionCreated(joinResponse.toSessionContext)
            }
        }
    }
}
```

Note : adapter les paramètres du `Conversation` initializer selon `CoreModels.swift` du SDK.

**Ajouter au `project.pbxproj` :** Oui (nouveau fichier dans le groupe `Views`)

**Commit :** `feat(ios): add GuestConversationContainer and GuestSession types`

---

### Task 9 : `MeeshyApp` — `activeGuestSession` + `handleGuestDeepLink()`

**Fichier :** `apps/ios/Meeshy/MeeshyApp.swift`

**Ce qu'il faut faire :**
1. Ajouter `@State private var activeGuestSession: GuestSession?`
2. Ajouter la méthode `handleGuestDeepLink(_ link: DeepLink?)`
3. Dans le body, insérer `GuestConversationContainer` conditionnel (après le `if authManager.isAuthenticated`)
4. Ajouter `.onAppear { handleGuestDeepLink(deepLinkRouter.pendingDeepLink) }` pour l'état initial
5. Ajouter `.onChange(of: deepLinkRouter.pendingDeepLink)` pour les nouveaux liens
6. S'assurer que `activeGuestSession = nil` quand `authManager.isAuthenticated` devient `true`

```swift
@State private var activeGuestSession: GuestSession?

private func handleGuestDeepLink(_ link: DeepLink?) {
    guard let link else { return }
    guard !authManager.isAuthenticated else { return }
    switch link {
    case .joinLink(let id):
        activeGuestSession = GuestSession(identifier: id, context: AnonymousSessionStore.load(linkId: id))
        deepLinkRouter.consumePendingDeepLink()
    case .chatLink(let id):
        activeGuestSession = GuestSession(identifier: id, context: AnonymousSessionStore.load(linkId: id))
        deepLinkRouter.consumePendingDeepLink()
    default:
        break
    }
}
```

**Dans le body (ZStack) :**
```swift
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

**Commit :** `feat(ios): add guest deep link handling in MeeshyApp with GuestSession state`

---

### Task 10 : Migration couleurs Indigo — `JoinFlowSheet` + `JoinLinkPreviewView`

**Correspondances :**
| Ancien hex | Nouveau token | Hex |
|-----------|---------------|-----|
| `B24BF3` | `MeeshyColors.indigo500` | `#6366F1` |
| `4ECDC4` | `MeeshyColors.indigo300` | `#A5B4FC` |
| `4ECDC4` (tint) | `MeeshyColors.indigo400` | `#818CF8` |
| `2ECC71` | `MeeshyColors.success` | `#34D399` |
| Gradient violet→cyan | `MeeshyColors.brandGradient` | `#6366F1 → #4338CA` |

**Dans `JoinFlowSheet.swift` :**
- `Color(hex: "B24BF3")` → `MeeshyColors.indigo500`
- `Color(hex: "4ECDC4")` → `MeeshyColors.indigo300` (orb) ou `MeeshyColors.indigo400` (ProgressView tint)
- `Color(hex: "2ECC71")` → `MeeshyColors.success`
- Gradient `[2ECC71, 4ECDC4]` → `MeeshyColors.brandGradient` (Indigo)

**Dans `JoinLinkPreviewView.swift` :**
- `accent = Color(hex: "4ECDC4")` → `MeeshyColors.indigo400`
- Banner gradient `[B24BF3, 4ECDC4]` → `[MeeshyColors.indigo500, MeeshyColors.indigo300]`

**Build :** `cd packages/MeeshySDK && swift build 2>&1 | grep -E "error:|Build complete"`

**Commit :** `fix(sdk): migrate JoinFlowSheet and JoinLinkPreviewView to Indigo brand colors`

---

## Tests finaux attendus

```bash
# Tests app complets
./apps/ios/meeshy.sh test

# Tests SDK
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -quiet 2>&1 | tail -5
```

Tests qui doivent passer :
- `DeepLinkRouterTests/test_handle_chatPath_setsChatLink`
- `DeepLinkRouterTests/test_handle_chatCustomScheme_setsChatLink`
- `AnonymousSessionStoreTests/*` (4 tests)
- `ConversationViewModelTests/test_init_withAnonymousSession_setsSessionTokenOnAPIClient`
- `ConversationViewModelTests/test_init_withNilAnonymousSession_doesNotSetSessionToken`

---

## Instructions pour reprendre

```bash
# 1. Naviguer vers le projet
cd /Users/smpceo/Documents/v2_meeshy

# 2. Se placer sur la feature branch
git checkout feat/ios-join-chat-links

# 3. Cherry-pick le commit Task 6 (actuellement sur dev)
git cherry-pick 6c0b071d

# 4. Vérifier que les tests ConversationViewModelTests passent
xcodebuild test -workspace apps/ios/Meeshy.xcworkspace \
  -scheme Meeshy \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshyTests/ConversationViewModelTests \
  -quiet 2>&1 | tail -5

# 5. Poursuivre avec Task 7 (ConversationView)
```
