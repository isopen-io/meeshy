# iOS Join/Chat Links — Plan d'implémentation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permettre à un utilisateur sans compte Meeshy (guest-total) d'accéder à une conversation via un lien `/join` ou `/chat` sur iOS.

**Architecture:** GuestEntryPoint dans `MeeshyApp` — un `activeGuestSession: GuestSession?` intercepte les deep links de type joinLink/chatLink avant que le check auth ne se fasse. `GuestConversationContainer` orchestre soit le `JoinFlowSheet` existant (pas de session) soit `ConversationView` directement (session Keychain existante).

**Tech Stack:** SwiftUI, XCTest, Security framework (Keychain), Socket.IO Client, MeeshySDK

**Design doc:** `docs/plans/2026-03-08-ios-join-chat-links-design.md`

---

## Task 1 : DeepLink enum — ajouter `.chatLink`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift:141-154` (DeepLink enum)
- Modify: `apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift:178-199` (handle URL)
- Modify: `apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift:204-229` (handleCustomScheme)
- Test: `apps/ios/MeeshyTests/Unit/Navigation/DeepLinkTests.swift`

**Step 1 — Écrire les tests qui échouent**

Dans `DeepLinkTests.swift`, ajouter à la classe `DeepLinkRouterTests` (ou la créer si absente) :

```swift
@MainActor
final class DeepLinkRouterTests: XCTestCase {

    func test_handle_chatPath_setsChatLink() {
        let sut = DeepLinkRouter()
        let url = URL(string: "https://meeshy.me/chat/mshy_support")!
        let handled = sut.handle(url: url)
        XCTAssertTrue(handled)
        guard case .chatLink(let id) = sut.pendingDeepLink else {
            XCTFail("Expected chatLink, got \(String(describing: sut.pendingDeepLink))")
            return
        }
        XCTAssertEqual(id, "mshy_support")
    }

    func test_handle_chatCustomScheme_setsChatLink() {
        let sut = DeepLinkRouter()
        let url = URL(string: "meeshy://chat/mshy_abc123")!
        let handled = sut.handle(url: url)
        XCTAssertTrue(handled)
        guard case .chatLink(let id) = sut.pendingDeepLink else {
            XCTFail("Expected chatLink, got \(String(describing: sut.pendingDeepLink))")
            return
        }
        XCTAssertEqual(id, "mshy_abc123")
    }

    func test_handle_joinPath_setsJoinLink() {
        let sut = DeepLinkRouter()
        let url = URL(string: "https://meeshy.me/join/mshy_xyz")!
        _ = sut.handle(url: url)
        guard case .joinLink(let id) = sut.pendingDeepLink else {
            XCTFail("Expected joinLink"); return
        }
        XCTAssertEqual(id, "mshy_xyz")
    }

    func test_handle_lShortPath_setsJoinLink() {
        let sut = DeepLinkRouter()
        let url = URL(string: "https://meeshy.me/l/mshy_xyz")!
        _ = sut.handle(url: url)
        guard case .joinLink = sut.pendingDeepLink else {
            XCTFail("Expected joinLink"); return
        }
    }
}
```

**Step 2 — Vérifier que les tests échouent**

```bash
cd apps/ios && xcodebuild test -scheme Meeshy \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyTests/DeepLinkRouterTests \
  -quiet 2>&1 | tail -20
```

Attendu : FAIL — `chatLink` n'est pas un case du enum.

**Step 3 — Implémenter : ajouter `.chatLink` au enum**

Dans `DeepLinkRouter.swift`, ligne 141, remplacer le bloc `enum DeepLink` :

```swift
enum DeepLink: Equatable {
    case joinLink(identifier: String)
    case chatLink(identifier: String)   // NOUVEAU
    case magicLink(token: String)
    case conversation(id: String)

    static func == (lhs: DeepLink, rhs: DeepLink) -> Bool {
        switch (lhs, rhs) {
        case (.joinLink(let a), .joinLink(let b)): return a == b
        case (.chatLink(let a), .chatLink(let b)): return a == b
        case (.magicLink(let a), .magicLink(let b)): return a == b
        case (.conversation(let a), .conversation(let b)): return a == b
        default: return false
        }
    }
}
```

**Step 4 — Ajouter le parsing `/chat` dans `handle(url:)`**

Dans la `switch pathComponents[0]` (ligne ~178), après le case `"join", "l":`, ajouter :

```swift
case "chat":
    guard pathComponents.count >= 2 else { return false }
    pendingDeepLink = .chatLink(identifier: pathComponents[1])
    return true
```

**Step 5 — Ajouter le parsing `meeshy://chat` dans `handleCustomScheme(url:)`**

Dans la `switch host` (ligne ~210), après `case "join":`, ajouter :

```swift
case "chat":
    guard !pathComponents.isEmpty else { return false }
    pendingDeepLink = .chatLink(identifier: pathComponents[0])
    return true
```

**Step 6 — Vérifier que les tests passent**

```bash
cd apps/ios && xcodebuild test -scheme Meeshy \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyTests/DeepLinkRouterTests \
  -quiet 2>&1 | tail -20
```

Attendu : PASS

**Step 7 — Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift \
        apps/ios/MeeshyTests/Unit/Navigation/DeepLinkTests.swift
git commit -m "feat(ios): add chatLink deep link case and /chat URL parsing"
```

---

## Task 2 : `AnonymousSessionContext` + extension sur `AnonymousJoinResponse`

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Models/AnonymousSessionContext.swift`

Ce fichier est côté app (pas SDK) car il représente une session locale persistée en Keychain.

**Step 1 — Créer le fichier**

```swift
// apps/ios/Meeshy/Features/Main/Models/AnonymousSessionContext.swift
import Foundation
import MeeshySDK

// MARK: - AnonymousSessionContext

struct AnonymousSessionContext: Codable, Equatable {
    let sessionToken: String
    let participantId: String
    let permissions: ParticipantPermissions
    let linkId: String
    let conversationId: String
}

// MARK: - Conversion depuis AnonymousJoinResponse

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

**Step 2 — Vérifier que ça compile**

```bash
./apps/ios/meeshy.sh build 2>&1 | grep -E "error:|warning:|BUILD"
```

Attendu : `BUILD SUCCEEDED`

**Step 3 — Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Models/AnonymousSessionContext.swift
git commit -m "feat(ios): add AnonymousSessionContext model and AnonymousJoinResponse extension"
```

---

## Task 3 : `AnonymousSessionStore` (Keychain)

**Files:**
- Create: `apps/ios/Meeshy/Services/AnonymousSessionStore.swift`
- Create: `apps/ios/MeeshyTests/Unit/Services/AnonymousSessionStoreTests.swift`

**Step 1 — Écrire les tests qui échouent**

```swift
// apps/ios/MeeshyTests/Unit/Services/AnonymousSessionStoreTests.swift
import XCTest
@testable import Meeshy
import MeeshySDK

final class AnonymousSessionStoreTests: XCTestCase {

    private let testLinkId = "test_link_\(UUID().uuidString)"

    override func tearDown() {
        super.tearDown()
        AnonymousSessionStore.delete(linkId: testLinkId)
    }

    func test_save_thenLoad_returnsContext() {
        let ctx = makeContext(linkId: testLinkId)
        AnonymousSessionStore.save(ctx)
        let loaded = AnonymousSessionStore.load(linkId: testLinkId)
        XCTAssertEqual(loaded, ctx)
    }

    func test_save_differentLinkIds_returnsCorrectContext() {
        let id1 = "link_a_\(UUID().uuidString)"
        let id2 = "link_b_\(UUID().uuidString)"
        defer {
            AnonymousSessionStore.delete(linkId: id1)
            AnonymousSessionStore.delete(linkId: id2)
        }
        let ctx1 = makeContext(linkId: id1, token: "token-aaa")
        let ctx2 = makeContext(linkId: id2, token: "token-bbb")
        AnonymousSessionStore.save(ctx1)
        AnonymousSessionStore.save(ctx2)
        XCTAssertEqual(AnonymousSessionStore.load(linkId: id1)?.sessionToken, "token-aaa")
        XCTAssertEqual(AnonymousSessionStore.load(linkId: id2)?.sessionToken, "token-bbb")
    }

    func test_delete_removesFromKeychain() {
        let ctx = makeContext(linkId: testLinkId)
        AnonymousSessionStore.save(ctx)
        AnonymousSessionStore.delete(linkId: testLinkId)
        XCTAssertNil(AnonymousSessionStore.load(linkId: testLinkId))
    }

    func test_load_missingKey_returnsNil() {
        let result = AnonymousSessionStore.load(linkId: "does_not_exist_\(UUID().uuidString)")
        XCTAssertNil(result)
    }

    // MARK: - Helper

    private func makeContext(
        linkId: String,
        token: String = "test-session-token"
    ) -> AnonymousSessionContext {
        AnonymousSessionContext(
            sessionToken: token,
            participantId: "participant_\(linkId)",
            permissions: ParticipantPermissions(),
            linkId: linkId,
            conversationId: "conv_\(linkId)"
        )
    }
}
```

**Step 2 — Vérifier que les tests échouent**

```bash
cd apps/ios && xcodebuild test -scheme Meeshy \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyTests/AnonymousSessionStoreTests \
  -quiet 2>&1 | tail -20
```

Attendu : FAIL — `AnonymousSessionStore` n'existe pas.

**Step 3 — Implémenter `AnonymousSessionStore`**

```swift
// apps/ios/Meeshy/Services/AnonymousSessionStore.swift
import Foundation
import Security

enum AnonymousSessionStore {

    private static let service = "me.meeshy.app.anonymous-session"

    static func save(_ context: AnonymousSessionContext) {
        guard let data = try? JSONEncoder().encode(context) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: context.linkId,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    static func load(linkId: String) -> AnonymousSessionContext? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: linkId,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(AnonymousSessionContext.self, from: data)
    }

    static func delete(linkId: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: linkId
        ]
        SecItemDelete(query as CFDictionary)
    }
}
```

**Step 4 — Vérifier que les tests passent**

```bash
cd apps/ios && xcodebuild test -scheme Meeshy \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyTests/AnonymousSessionStoreTests \
  -quiet 2>&1 | tail -20
```

Attendu : PASS

**Step 5 — Commit**

```bash
git add apps/ios/Meeshy/Services/AnonymousSessionStore.swift \
        apps/ios/MeeshyTests/Unit/Services/AnonymousSessionStoreTests.swift
git commit -m "feat(ios): add AnonymousSessionStore with Keychain persistence"
```

---

## Task 4 : `APIClient` — ajouter `anonymousSessionToken` + header `X-Session-Token`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift:68-79` (protocol)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift:123` (propriété)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift:173-175` (request() header)

**Step 1 — Ajouter à `APIClientProviding`**

Dans le protocol (ligne ~68), ajouter après `var authToken: String? { get set }` :

```swift
var anonymousSessionToken: String? { get set }
```

**Step 2 — Ajouter la propriété dans `APIClient`**

Après `public var authToken: String?` (ligne 123) :

```swift
public var anonymousSessionToken: String?
```

**Step 3 — Ajouter le header dans `request()`**

Dans `request()`, après le bloc `if let token = authToken` (ligne 173-175), ajouter :

```swift
} else if let token = anonymousSessionToken {
    urlRequest.setValue(token, forHTTPHeaderField: "X-Session-Token")
}
```

Le bloc complet devient :

```swift
if let token = authToken {
    urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
} else if let token = anonymousSessionToken {
    urlRequest.setValue(token, forHTTPHeaderField: "X-Session-Token")
}
```

**Step 4 — Vérifier que ça compile (SDK)**

```bash
cd packages/MeeshySDK && swift build 2>&1 | grep -E "error:|BUILD"
```

Attendu : `Build complete!`

**Step 5 — Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift
git commit -m "feat(sdk): add anonymousSessionToken property and X-Session-Token header support"
```

---

## Task 5 : `MessageSocketManager` — `connectAnonymous(sessionToken:)`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift` (protocol + impl)

**Step 1 — Ajouter à `MessageSocketProviding`**

Dans le protocol (après `func connect()`, ligne ~227), ajouter :

```swift
func connectAnonymous(sessionToken: String)
```

**Step 2 — Lire la méthode `connect()` actuelle**

La méthode `connect()` construit les `extraHeaders` avec `Authorization: Bearer {token}`. `connectAnonymous` fait la même chose mais avec `X-Session-Token` :

**Step 3 — Implémenter `connectAnonymous(sessionToken:)` dans `MessageSocketManager`**

Trouver `public func connect()` dans l'implémentation et ajouter APRÈS :

```swift
public func connectAnonymous(sessionToken: String) {
    disconnect()
    let config = SocketManager(
        socketURL: URL(string: MeeshyConfig.shared.socketBaseURL)!,
        config: [
            .log(false),
            .compress,
            .extraHeaders(["X-Session-Token": sessionToken]),
            .reconnects(true),
            .reconnectAttempts(-1),
            .reconnectWait(2),
            .reconnectWaitMax(10)
        ]
    )
    manager = config
    socket = config.defaultSocket
    setupEventHandlers()
    socket?.connect()
}
```

Note : si `connect()` utilise une variable `manager` de type `SocketManager?`, reprendre la même structure. L'essentiel est de remplacer `Authorization: Bearer {token}` par `X-Session-Token: {sessionToken}`.

**Step 4 — Vérifier que ça compile**

```bash
cd packages/MeeshySDK && swift build 2>&1 | grep -E "error:|BUILD"
```

Attendu : `Build complete!`

**Step 5 — Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift
git commit -m "feat(sdk): add connectAnonymous(sessionToken:) to MessageSocketManager"
```

---

## Task 6 : `ConversationViewModel` — param `anonymousSession`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:387-415`
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelTests.swift`

**Step 1 — Écrire les tests qui échouent**

Ajouter dans `ConversationViewModelTests.swift` :

```swift
// MARK: - Anonymous Session Tests

func test_init_withAnonymousSession_setsSessionTokenOnAPIClient() async {
    let (sut, _) = makeSUT(
        anonymousSession: AnonymousSessionContext(
            sessionToken: "test-anon-token",
            participantId: "part-123",
            permissions: .defaultAnonymous,
            linkId: "mshy_test",
            conversationId: "conv-456"
        )
    )
    XCTAssertEqual(APIClient.shared.anonymousSessionToken, "test-anon-token")
    // Cleanup
    APIClient.shared.anonymousSessionToken = nil
}

func test_init_withNilAnonymousSession_doesNotSetSessionToken() {
    let (_, _) = makeSUT(anonymousSession: nil)
    XCTAssertNil(APIClient.shared.anonymousSessionToken)
}
```

Mettre à jour `makeSUT` pour accepter le nouveau paramètre :

```swift
private func makeSUT(
    conversationId: String = "conv-test",
    anonymousSession: AnonymousSessionContext? = nil,
    authManager: MockAuthManager = MockAuthManager(),
    messageService: MockMessageService = MockMessageService(),
    conversationService: MockConversationService = MockConversationService(),
    reactionService: MockReactionService = MockReactionService(),
    reportService: MockReportService = MockReportService(),
    mediaCache: MockMediaCache = MockMediaCache()
) -> (sut: ConversationViewModel, mock: MockMessageService) {
    let sut = ConversationViewModel(
        conversationId: conversationId,
        anonymousSession: anonymousSession,
        authManager: authManager,
        messageService: messageService,
        conversationService: conversationService,
        reactionService: reactionService,
        reportService: reportService,
        mediaCache: mediaCache
    )
    return (sut, messageService)
}
```

**Step 2 — Vérifier que les tests échouent**

```bash
./apps/ios/meeshy.sh test 2>&1 | grep -E "error:|FAIL|ConversationViewModelTests"
```

Attendu : erreur de compilation — param `anonymousSession` inconnu.

**Step 3 — Modifier le `init` de `ConversationViewModel`**

Ajouter `anonymousSession: AnonymousSessionContext? = nil` au `init` (ligne 387) :

```swift
init(
    conversationId: String,
    unreadCount: Int = 0,
    isDirect: Bool = false,
    participantUserId: String? = nil,
    anonymousSession: AnonymousSessionContext? = nil,   // NOUVEAU
    authManager: AuthManaging = AuthManager.shared,
    messageService: MessageServiceProviding = MessageService.shared,
    conversationService: ConversationServiceProviding = ConversationService.shared,
    reactionService: ReactionServiceProviding = ReactionService.shared,
    reportService: ReportServiceProviding = ReportService.shared,
    mediaCache: MediaCaching = MediaCacheManager.shared
) {
    self.conversationId = conversationId
    self.initialUnreadCount = unreadCount
    self.isDirect = isDirect
    self.participantUserId = participantUserId
    self.authManager = authManager
    self.messageService = messageService
    self.conversationService = conversationService
    self.reactionService = reactionService
    self.reportService = reportService
    self.mediaCache = mediaCache

    // NOUVEAU : configure le token anonyme si présent
    if let session = anonymousSession {
        APIClient.shared.anonymousSessionToken = session.sessionToken
        MessageSocketManager.shared.connectAnonymous(sessionToken: session.sessionToken)
    }

    let handler = ConversationSocketHandler(
        conversationId: conversationId,
        currentUserId: authManager.currentUser?.id ?? ""
    )
    handler.delegate = self
    self.socketHandler = handler
}
```

Et dans `deinit` (après le `socketHandler = nil`), ajouter :

```swift
// Nettoyer le token anonyme à la fermeture
APIClient.shared.anonymousSessionToken = nil
```

**Step 4 — Vérifier que les tests passent**

```bash
./apps/ios/meeshy.sh test 2>&1 | grep -E "ConversationViewModelTests|PASS|FAIL"
```

Attendu : PASS

**Step 5 — Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift \
        apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelTests.swift
git commit -m "feat(ios): add anonymousSession param to ConversationViewModel"
```

---

## Task 7 : `ConversationView` — param `anonymousSession` + bouton Fermer

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift:111-115`

Le header de `ConversationView` (onglet / détails de conversation + avatar) doit être remplacé par un simple bouton Fermer (xmark) quand `anonymousSession != nil`.

**Step 1 — Ajouter la propriété à `ConversationView`**

À la ligne 113 (après `var replyContext: ReplyContext? = nil`) :

```swift
var anonymousSession: AnonymousSessionContext? = nil   // NOUVEAU
```

**Step 2 — Trouver le composant header dans la view**

Chercher dans les fichiers d'extension de `ConversationView` :

```bash
grep -rn "ConversationView+Header\|headerView\|navigationBar\|toolbar" \
  apps/ios/Meeshy/Features/Main/Views/ --include="*.swift" | head -20
```

**Step 3 — Modifier l'affichage du header**

Dans la vue principale `body` ou le fichier d'extension `ConversationView+Header.swift`, envelopper le header normal dans une condition :

```swift
// Si mode anonyme → bouton Fermer simple
if anonymousSession != nil {
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
} else {
    // Header normal (existant)
    originalHeaderView
}
```

Note : adapter selon la structure réelle du header dans `ConversationView+Header.swift`.

**Step 4 — Vérifier que ça compile**

```bash
./apps/ios/meeshy.sh build 2>&1 | grep -E "error:|BUILD"
```

Attendu : `BUILD SUCCEEDED`

**Step 5 — Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationView+Header.swift
git commit -m "feat(ios): add anonymousSession param to ConversationView with close button header"
```

---

## Task 8 : `GuestConversationContainer` (nouveau fichier)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/GuestConversationContainer.swift`

**Step 1 — Créer le fichier**

```swift
// apps/ios/Meeshy/Features/Main/Views/GuestConversationContainer.swift
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - GuestSession

struct GuestSession {
    let identifier: String
    var context: AnonymousSessionContext?
}

// MARK: - GuestConversationContainer

struct GuestConversationContainer: View {
    let session: GuestSession
    let onSessionCreated: (AnonymousSessionContext) -> Void
    let onDismiss: () -> Void

    var body: some View {
        if let context = session.context {
            // Session Keychain existante → conversation directement
            let conv = Conversation(
                id: context.conversationId,
                title: nil,
                type: "group",
                unreadCount: 0,
                isDirect: false,
                participantUserId: nil,
                accentColor: nil,
                theme: nil,
                language: nil,
                lastMessage: nil,
                lastMessageAt: nil,
                memberCount: nil
            )
            ConversationView(
                conversation: conv,
                anonymousSession: context,
                viewModel: ConversationViewModel(
                    conversationId: context.conversationId,
                    anonymousSession: context
                )
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

Note : adapter les paramètres du `Conversation` initializer selon les champs requis dans `CoreModels.swift`.

**Step 2 — Vérifier que ça compile**

```bash
./apps/ios/meeshy.sh build 2>&1 | grep -E "error:|BUILD"
```

Si des paramètres de `Conversation` ne correspondent pas, lire `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift` pour adapter l'init.

**Step 3 — Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/GuestConversationContainer.swift
git commit -m "feat(ios): add GuestConversationContainer and GuestSession types"
```

---

## Task 9 : `MeeshyApp` — `activeGuestSession` + `handleGuestDeepLink()`

**Files:**
- Modify: `apps/ios/Meeshy/MeeshyApp.swift`

**Step 1 — Ajouter l'état et les méthodes**

Après `@State private var hasCheckedSession = false` (ligne 15), ajouter :

```swift
@State private var activeGuestSession: GuestSession?
```

Après la méthode `handlePushNavigation(payload:)`, ajouter :

```swift
// MARK: - Guest Deep Links

private func handleGuestDeepLink(_ link: DeepLink?) {
    guard let link else { return }
    guard !authManager.isAuthenticated else { return }
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
```

**Step 2 — Intégrer dans le body**

Dans le `ZStack` du `body`, après le `Group { if authManager.isAuthenticated { RootView() } else if hasCheckedSession { LoginView() } }`, ajouter :

```swift
// NOUVEAU : Mode guest-total
if let guestSession = activeGuestSession, !authManager.isAuthenticated {
    GuestConversationContainer(
        session: guestSession,
        onSessionCreated: { ctx in
            AnonymousSessionStore.save(ctx)
            activeGuestSession = GuestSession(
                identifier: guestSession.identifier,
                context: ctx
            )
        },
        onDismiss: {
            AnonymousSessionStore.delete(linkId: guestSession.identifier)
            activeGuestSession = nil
        }
    )
}
```

**Step 3 — Brancher le `onChange` et l'`onAppear`**

Dans les modifiers du `ZStack`, ajouter AVANT le `.onOpenURL` existant :

```swift
// Etat initial (lien arrivé avant l'apparition de RootView)
.onAppear {
    handleGuestDeepLink(deepLinkRouter.pendingDeepLink)
}
// Nouveaux liens pendant l'utilisation
.onChange(of: deepLinkRouter.pendingDeepLink) { _, link in
    handleGuestDeepLink(link)
}
// Réinitialiser la session guest si l'utilisateur se connecte
.onChange(of: authManager.isAuthenticated) { _, isAuth in
    if isAuth {
        activeGuestSession = nil
        // ... code existant ...
    }
}
```

**Step 4 — Vérifier que ça compile**

```bash
./apps/ios/meeshy.sh build 2>&1 | grep -E "error:|BUILD"
```

Attendu : `BUILD SUCCEEDED`

**Step 5 — Build complet + lancer l'app**

```bash
./apps/ios/meeshy.sh run
```

Tester manuellement :
1. Aller sur `https://meeshy.me/join/mshy_xxx` depuis Safari → l'app iOS doit s'ouvrir sur `JoinFlowSheet`
2. Fermer → `https://meeshy.me/chat/mshy_xxx` doit ouvrir directement la conversation (si session Keychain)

**Step 6 — Commit**

```bash
git add apps/ios/Meeshy/MeeshyApp.swift
git commit -m "feat(ios): add guest deep link handling in MeeshyApp with GuestSession state"
```

---

## Task 10 : Migration couleurs Indigo — `JoinFlowSheet` + `JoinLinkPreviewView`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinFlowSheet.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinLinkPreviewView.swift`

Ces composants utilisent les couleurs legacy (`B24BF3`, `4ECDC4`, `2ECC71`). Les migrer vers Indigo.

**Correspondances :**
| Ancien hex | Nouveau | Usage |
|-----------|---------|-------|
| `B24BF3` | `MeeshyColors.indigo500` (`6366F1`) | Ambient orb principal |
| `4ECDC4` | `MeeshyColors.indigo300` (`A5B4FC`) | Ambient orb secondaire / accent |
| `2ECC71` | `MeeshyColors.success` (`34D399`) | Succès (checkmark) |

**Step 1 — Migrer `JoinFlowSheet.swift`**

Remplacer dans `background` :
```swift
// AVANT
Circle().fill(Color(hex: "B24BF3").opacity(isDark ? 0.06 : 0.04))
Circle().fill(Color(hex: "4ECDC4").opacity(isDark ? 0.04 : 0.02))

// APRÈS
Circle().fill(MeeshyColors.indigo500.opacity(isDark ? 0.08 : 0.05))
Circle().fill(MeeshyColors.indigo300.opacity(isDark ? 0.05 : 0.03))
```

Dans `loadingState` :
```swift
// AVANT
ProgressView().tint(Color(hex: "4ECDC4"))

// APRÈS
ProgressView().tint(MeeshyColors.indigo400)
```

Dans `successState` :
```swift
// AVANT
Circle().fill(Color(hex: "2ECC71").opacity(0.15))
Image(systemName: "checkmark.circle.fill").foregroundColor(Color(hex: "2ECC71"))

// APRÈS
Circle().fill(MeeshyColors.success.opacity(0.15))
Image(systemName: "checkmark.circle.fill").foregroundColor(MeeshyColors.success)
```

Dans le bouton "Entrer dans la conversation" (si présent avec `B24BF3`) :
```swift
// Remplacer tout gradient violet/cyan par brandGradient
LinearGradient(gradient: MeeshyColors.brandGradient, ...)
```

**Step 2 — Migrer `JoinLinkPreviewView.swift`**

La propriété `accent` à la ligne 16 :
```swift
// AVANT
private var accent: Color { Color(hex: "4ECDC4") }

// APRÈS
private var accent: Color { MeeshyColors.indigo400 }
```

Le gradient du banner `conversationBanner` :
```swift
// AVANT
LinearGradient(
    colors: [
        Color(hex: "B24BF3").opacity(0.4),
        Color(hex: "4ECDC4").opacity(0.3),
        isDark ? Color(hex: "0a0a14") : Color(hex: "FAF8F5")
    ],
    ...
)

// APRÈS
LinearGradient(
    colors: [
        MeeshyColors.indigo500.opacity(0.4),
        MeeshyColors.indigo300.opacity(0.25),
        isDark ? ThemeManager.shared.backgroundPrimary : Color(hex: "FAF8F5")
    ],
    ...
)
```

**Step 3 — Vérifier que ça compile**

```bash
cd packages/MeeshySDK && swift build 2>&1 | grep -E "error:|BUILD"
```

Puis vérifier visuellement dans le simulateur :

```bash
./apps/ios/meeshy.sh run
```

Tester un lien join pour voir le `JoinFlowSheet` avec les nouvelles couleurs Indigo.

**Step 4 — Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinFlowSheet.swift \
        packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinLinkPreviewView.swift
git commit -m "fix(sdk): migrate JoinFlowSheet and JoinLinkPreviewView to Indigo brand colors"
```

---

## Tests finaux

**Run tous les tests app :**

```bash
./apps/ios/meeshy.sh test
```

Attendu : tous les tests passent, y compris les nouveaux :
- `DeepLinkRouterTests/test_handle_chatPath_setsChatLink`
- `DeepLinkRouterTests/test_handle_chatCustomScheme_setsChatLink`
- `AnonymousSessionStoreTests/*` (4 tests)
- `ConversationViewModelTests/test_init_withAnonymousSession_*` (2 tests)

**Run SDK tests :**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -quiet 2>&1 | tail -10
```

Attendu : tous les tests SDK passent.

---

## Checklist d'intégration manuelle

Avant de merger, tester ces scénarios sur simulateur :

- [ ] Lien `https://meeshy.me/join/mshy_xxx` depuis Safari → JoinFlowSheet s'ouvre (sans compte)
- [ ] Formulaire prénom/nom/langue → POST join → transition vers ConversationView
- [ ] Header de ConversationView en mode anonyme : bouton xmark visible, pas d'avatar conversation
- [ ] Tap xmark → ferme ConversationView, retour à LoginView
- [ ] Re-ouvrir `https://meeshy.me/chat/mshy_xxx` → ConversationView directement (session Keychain)
- [ ] Utilisateur authentifié avec lien `/join` → RootView gère (flux normal inchangé)
- [ ] Couleurs Indigo visibles dans JoinFlowSheet (pas de violet `B24BF3`, pas de teal `4ECDC4`)
