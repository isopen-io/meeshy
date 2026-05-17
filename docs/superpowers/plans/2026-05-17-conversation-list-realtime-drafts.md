# Conversation List — Indicateur coloré, Remontée temps réel, Brouillons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colorer l'indicateur de durée du dernier message quand il y a des non-lus, fiabiliser la remontée d'une conversation en tête de liste à la réception d'un message (websocket + notifications iOS + retour au premier plan), et remonter + signaler « Brouillon » les conversations en cours d'édition.

**Architecture:** Modifications iOS uniquement, MVVM. `ThemedConversationRow` (leaf view, inputs primitifs) pour l'affichage ; `ConversationListViewModel` (`@StateObject` de `RootView`, vivant toute la session) pour le tri et les abonnements temps réel ; `DraftStore` (UserDefaults) comme source des brouillons ; `PushNotificationManager` (SDK) pour le signal push. Aucune modification du modèle SDK `Conversation` — le brouillon est un concept client-local.

**Tech Stack:** Swift 6, SwiftUI, Combine, XCTest. App iOS (`apps/ios/`) + SDK (`packages/MeeshySDK/`).

**Spec de référence:** `docs/superpowers/specs/2026-05-17-conversation-list-realtime-drafts-design.md`

**Note d'organisation:** Le projet iOS utilise un `.xcodeproj` classique (objectVersion 63, pas de groupes synchronisés) — chaque nouveau fichier `.swift` exige des entrées manuelles dans `project.pbxproj`. Ce plan **ne crée aucun fichier** : tout le code de production modifie des fichiers existants, et tous les tests sont ajoutés à des fichiers de test existants. Zéro chirurgie `pbxproj`.

**Commandes de test:**
- App (production + tests app) : `./apps/ios/meeshy.sh build` (compile) et `./apps/ios/meeshy.sh test` (suite de tests app).
- SDK : `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -derivedDataPath apps/ios/Build -only-testing:MeeshySDKTests/PushNotificationManagerTests -quiet` (le scheme `MeeshyUI` n'a pas d'action de test — utiliser `MeeshySDK-Package`).

---

## File Structure

Fichiers de production modifiés :
- `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift` — couleur de l'indicateur (Tâche 1) + badge brouillon (Tâche 9).
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift` — `bumpToTop` durci (Tâche 2), abonnement push (Tâche 4), `handleForegroundReactivation` (Tâche 5), comparateur + brouillons (Tâches 7-8).
- `apps/ios/Meeshy/Features/Main/Services/DraftStore.swift` — `DraftSummary`, `changed`, `allNonEmptyDrafts()` (Tâche 6).
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift` — hook scenePhase (Tâche 5) + passage `draftSummary` (Tâche 9).
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Rows.swift` — passage `draftSummary` (Tâche 9).
- `apps/ios/Meeshy/AppDelegate.swift` — appels `noteMessageActivity` (Tâche 4).
- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushNotificationManager.swift` — `messageNotificationReceived` + `noteMessageActivity` (Tâche 3).

Fichiers de test modifiés (existants) :
- `apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift`
- `apps/ios/MeeshyTests/Unit/Services/DraftStoreTests.swift`
- `packages/MeeshySDK/Tests/MeeshySDKTests/Notifications/PushNotificationManagerTests.swift`

---

## Task 1: Couleur de l'indicateur de durée quand il y a des non-lus

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift` (ajoute `timestampColor`, modifie le `Text` de l'indicateur ~ligne 154-158)
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift`

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter ces deux méthodes dans la classe `ConversationListViewModelTests` (avant la dernière `}` du fichier). Ajouter aussi `import SwiftUI` et `import MeeshyUI` en haut du fichier, sous `import MeeshySDK` (`SwiftUI` pour nommer `Color`, `MeeshyUI` pour `MeeshyColors`).

```swift
    // MARK: - ThemedConversationRow timestamp color

    func test_themedRow_timestampColor_withUnread_isErrorRed() {
        let color = ThemedConversationRow.timestampColor(unreadCount: 3, accent: .blue)
        XCTAssertEqual(color, MeeshyColors.error)
    }

    func test_themedRow_timestampColor_noUnread_isAccent() {
        let color = ThemedConversationRow.timestampColor(unreadCount: 0, accent: .blue)
        XCTAssertEqual(color, Color.blue)
    }
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `./apps/ios/meeshy.sh build`
Expected: ÉCHEC de compilation — `type 'ThemedConversationRow' has no member 'timestampColor'`.

- [ ] **Step 3: Implémenter `timestampColor`**

Dans `ThemedConversationRow.swift`, ajouter cette fonction statique juste avant la fonction `timeAgo(_:)` (vers la ligne 332) :

```swift
    /// Teinte de l'indicateur de durée. Reprend le rouge du badge de non-lus
    /// quand la conversation a des messages non lus, sinon l'accent de la
    /// conversation. On utilise `error` (#F87171) plutôt que le fond sombre du
    /// badge (#991B1B) pour que le texte 11pt reste lisible en mode sombre.
    static func timestampColor(unreadCount: Int, accent: Color) -> Color {
        unreadCount > 0 ? MeeshyColors.error : accent
    }
```

- [ ] **Step 4: Brancher la couleur sur l'indicateur**

Dans `ThemedConversationRow.swift`, le bloc de l'indicateur de durée (vers ligne 153-158) est actuellement :

```swift
                    // Timestamp — layoutPriority(1) pour ne jamais être écrasé
                    Text(timeAgo(conversation.lastMessageAt))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(accent)
                        .layoutPriority(1)
                        .padding(.top, 2)
```

Remplacer la ligne `.foregroundColor(accent)` par :

```swift
                        .foregroundColor(Self.timestampColor(unreadCount: conversation.unreadCount, accent: accent))
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: `test_themedRow_timestampColor_withUnread_isErrorRed` et `test_themedRow_timestampColor_noUnread_isAccent` PASSENT.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift
git commit -m "feat(ios): indicateur de durée en rouge quand la conversation a des non-lus"
```

---

## Task 2: Durcissement de `bumpToTop`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift:225-232`
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter dans la classe `ConversationListViewModelTests` :

```swift
    // MARK: - bumpToTop

    func test_bumpToTop_unknownConversation_isNoOp() {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [makeConversation(id: "a"), makeConversation(id: "b")]
        sut.bumpToTop(conversationId: "ghost", newLastMessageAt: Date())
        XCTAssertEqual(sut.conversations.map(\.id), ["a", "b"])
    }

    func test_bumpToTop_knownConversation_movesToFront() {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [makeConversation(id: "a"), makeConversation(id: "b")]
        sut.bumpToTop(conversationId: "b", newLastMessageAt: Date())
        XCTAssertEqual(sut.conversations.first?.id, "b")
    }
```

- [ ] **Step 2: Lancer les tests pour vérifier l'état**

Run: `./apps/ios/meeshy.sh test`
Expected: les deux tests PASSENT déjà (le comportement actuel est correct) — ce sont des tests de non-régression. Si l'un échoue, arrêter et investiguer.

- [ ] **Step 3: Durcir `bumpToTop`**

Dans `ConversationListViewModel.swift`, remplacer la fonction `bumpToTop` (lignes 225-232) :

```swift
    func bumpToTop(conversationId: String, newLastMessageAt: Date) {
        guard let idx = conversations.firstIndex(where: { $0.id == conversationId }) else { return }
        var updated = conversations[idx]
        updated.lastMessageAt = newLastMessageAt
        conversations.remove(at: idx)
        conversations.insert(updated, at: 0)
        schedulePersist()
    }
```

par :

```swift
    func bumpToTop(conversationId: String, newLastMessageAt: Date) {
        guard let idx = convIndex(for: conversationId) else {
            Logger.messages.warning("[bumpToTop] conversation introuvable id=\(conversationId, privacy: .public)")
            return
        }
        var updated = conversations[idx]
        updated.lastMessageAt = newLastMessageAt
        conversations.remove(at: idx)
        conversations.insert(updated, at: 0)
        schedulePersist()
    }
```

- [ ] **Step 4: Ajouter le log de confirmation websocket (spec §2a)**

Pour valider en pratique que le chemin `conversation:updated` → bump fonctionne, ajouter un log à la réception de l'event. Dans `ConversationListViewModel.swift`, dans le handler `messageSocket.conversationUpdated` (le `.sink`), la branche de bump (lignes 609-611) est :

```swift
                if let newLastAt = event.lastMessageAt,
                   newLastAt > self.conversations[index].lastMessageAt {
                    self.bumpToTop(conversationId: event.conversationId, newLastMessageAt: newLastAt)
                } else {
```

La remplacer par :

```swift
                if let newLastAt = event.lastMessageAt,
                   newLastAt > self.conversations[index].lastMessageAt {
                    Logger.messages.debug("[conversationUpdated] bump websocket id=\(event.conversationId, privacy: .public)")
                    self.bumpToTop(conversationId: event.conversationId, newLastMessageAt: newLastAt)
                } else {
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: `test_bumpToTop_unknownConversation_isNoOp` et `test_bumpToTop_knownConversation_movesToFront` PASSENT.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift
git commit -m "feat(ios): bumpToTop logue les conversations introuvables au lieu d'un no-op silencieux"
```

---

## Task 3: SDK — `messageNotificationReceived` + `noteMessageActivity`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushNotificationManager.swift` (ajoute une propriété après ligne 18, une méthode après ligne 147)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Notifications/PushNotificationManagerTests.swift`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter `import Combine` en haut de `PushNotificationManagerTests.swift` (sous `import XCTest`). Puis ajouter dans la classe `PushNotificationManagerTests` :

```swift
    // MARK: - noteMessageActivity

    @MainActor
    func test_noteMessageActivity_messageType_emitsConversationId() {
        let sut = PushNotificationManager.shared
        var received: [String] = []
        let c = sut.messageNotificationReceived.sink { received.append($0) }
        sut.noteMessageActivity(userInfo: ["type": "message", "conversationId": "conv-1"])
        c.cancel()
        XCTAssertEqual(received, ["conv-1"])
    }

    @MainActor
    func test_noteMessageActivity_messageIdPresent_emitsConversationId() {
        let sut = PushNotificationManager.shared
        var received: [String] = []
        let c = sut.messageNotificationReceived.sink { received.append($0) }
        sut.noteMessageActivity(userInfo: ["messageId": "msg-9", "conversationId": "conv-2"])
        c.cancel()
        XCTAssertEqual(received, ["conv-2"])
    }

    @MainActor
    func test_noteMessageActivity_friendRequest_emitsNothing() {
        let sut = PushNotificationManager.shared
        var received: [String] = []
        let c = sut.messageNotificationReceived.sink { received.append($0) }
        sut.noteMessageActivity(userInfo: ["type": "friend_request", "conversationId": "conv-1"])
        c.cancel()
        XCTAssertTrue(received.isEmpty)
    }

    @MainActor
    func test_noteMessageActivity_missingConversationId_emitsNothing() {
        let sut = PushNotificationManager.shared
        var received: [String] = []
        let c = sut.messageNotificationReceived.sink { received.append($0) }
        sut.noteMessageActivity(userInfo: ["type": "message"])
        c.cancel()
        XCTAssertTrue(received.isEmpty)
    }
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -derivedDataPath apps/ios/Build -only-testing:MeeshySDKTests/PushNotificationManagerTests -quiet`
Expected: ÉCHEC de compilation — `value of type 'PushNotificationManager' has no member 'messageNotificationReceived'` / `noteMessageActivity`.

- [ ] **Step 3: Ajouter la propriété `messageNotificationReceived`**

Dans `PushNotificationManager.swift`, juste après la propriété `pendingNotificationPayload` (ligne 18), ajouter :

```swift

    /// Émet un conversationId chaque fois qu'une notification entrante
    /// (bannière au premier plan ou push silencieux) signale une activité de
    /// message. La liste de conversations s'y abonne pour remonter la ligne
    /// en tête en temps réel — y compris quand le message est arrivé via APNs
    /// alors que le websocket était déconnecté. Distinct de
    /// `pendingNotificationPayload`, qui porte une intention de navigation sur
    /// un tap explicite.
    public let messageNotificationReceived = PassthroughSubject<String, Never>()
```

- [ ] **Step 4: Ajouter la méthode `noteMessageActivity`**

Dans `PushNotificationManager.swift`, juste après la méthode `clearPendingNotification()` (ligne 147), ajouter :

```swift

    /// Émet le conversationId sur `messageNotificationReceived` quand une
    /// notification entrante dénote une activité de message — pour que la
    /// liste de conversations remonte la ligne. NE touche PAS
    /// `pendingNotificationPayload` : c'est un signal de tri, pas une
    /// intention de navigation. Accepte les deux formes de payload : push
    /// d'alerte (`type == "message"`) et push silencieux (présence d'un
    /// `messageId`).
    public func noteMessageActivity(userInfo: [AnyHashable: Any]) {
        guard let conversationId = userInfo["conversationId"] as? String,
              !conversationId.isEmpty else { return }
        let isMessage = (userInfo["type"] as? String) == "message"
            || (userInfo["messageId"] as? String)?.isEmpty == false
        guard isMessage else { return }
        messageNotificationReceived.send(conversationId)
    }
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -derivedDataPath apps/ios/Build -only-testing:MeeshySDKTests/PushNotificationManagerTests -quiet`
Expected: les 4 tests `test_noteMessageActivity_*` PASSENT.

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushNotificationManager.swift packages/MeeshySDK/Tests/MeeshySDKTests/Notifications/PushNotificationManagerTests.swift
git commit -m "feat(sdk): PushNotificationManager émet un signal d'activité message pour la liste"
```

---

## Task 4: Remontée pilotée par les notifications push

**Files:**
- Modify: `apps/ios/Meeshy/AppDelegate.swift` (`didReceiveRemoteNotification` ~ligne 137, `willPresent` ~ligne 429)
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift` (init, nouvelle propriété, nouvelle méthode `subscribeToPushNotifications`)
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift`

- [ ] **Step 1: Écrire le test qui échoue**

D'abord étendre `makeSUT` pour injecter le publisher push. Dans `ConversationListViewModelTests.swift`, remplacer la signature et le corps de `makeSUT` — ajouter le paramètre `messageNotificationPublisher` et le passer à l'init :

```swift
    private func makeSUT(
        api: MockAPIClientForApp? = nil,
        conversationService: MockConversationService? = nil,
        preferenceService: MockPreferenceService? = nil,
        messageSocket: MockMessageSocket? = nil,
        messageService: MockMessageService? = nil,
        authManager: MockAuthManager? = nil,
        storyService: MockStoryService? = nil,
        syncEngine: MockConversationSyncEngine? = nil,
        messageNotificationPublisher: AnyPublisher<String, Never>? = nil
    ) -> (
        sut: ConversationListViewModel,
        api: MockAPIClientForApp,
        conversationService: MockConversationService,
        preferenceService: MockPreferenceService,
        messageSocket: MockMessageSocket,
        messageService: MockMessageService,
        authManager: MockAuthManager
    ) {
        let api = api ?? MockAPIClientForApp()
        let conversationService = conversationService ?? MockConversationService()
        let preferenceService = preferenceService ?? MockPreferenceService()
        let messageSocket = messageSocket ?? MockMessageSocket()
        let messageService = messageService ?? MockMessageService()
        let authManager = authManager ?? MockAuthManager()
        let storyService = storyService ?? MockStoryService()
        let syncEngine = syncEngine ?? MockConversationSyncEngine()
        let pushPublisher = messageNotificationPublisher
            ?? PassthroughSubject<String, Never>().eraseToAnyPublisher()
        let sut = ConversationListViewModel(
            api: api,
            conversationService: conversationService,
            preferenceService: preferenceService,
            messageSocket: messageSocket,
            messageService: messageService,
            authManager: authManager,
            storyService: storyService,
            syncEngine: syncEngine,
            messageNotificationPublisher: pushPublisher
        )
        return (sut, api, conversationService, preferenceService, messageSocket, messageService, authManager)
    }
```

Puis ajouter le test dans la classe :

```swift
    // MARK: - Push notification bump

    func test_pushNotification_messageForKnownConversation_bumpsToTop() {
        let subject = PassthroughSubject<String, Never>()
        let (sut, _, _, _, _, _, _) = makeSUT(messageNotificationPublisher: subject.eraseToAnyPublisher())
        sut.conversations = [makeConversation(id: "a"), makeConversation(id: "b")]
        subject.send("b")
        let exp = expectation(description: "bump applied on main")
        DispatchQueue.main.async { exp.fulfill() }
        wait(for: [exp], timeout: 1)
        XCTAssertEqual(sut.conversations.first?.id, "b")
    }
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `./apps/ios/meeshy.sh build`
Expected: ÉCHEC de compilation — `ConversationListViewModel` n'a pas de paramètre `messageNotificationPublisher`.

- [ ] **Step 3: Ajouter la propriété et le paramètre d'init au ViewModel**

Dans `ConversationListViewModel.swift`, ajouter la propriété stockée après `private let syncEngine: ConversationSyncEngineProviding` (ligne 75) :

```swift
    /// Publisher des notifications push « message » (conversationId). Injecté
    /// pour la testabilité ; en production, branché sur
    /// `PushNotificationManager.shared.messageNotificationReceived`.
    private let messageNotificationPublisher: AnyPublisher<String, Never>
```

Puis remplacer l'init complet (lignes 311-334) par :

```swift
    init(
        api: APIClientProviding = APIClient.shared,
        conversationService: ConversationServiceProviding = ConversationService.shared,
        preferenceService: PreferenceServiceProviding = PreferenceService.shared,
        messageSocket: MessageSocketProviding = MessageSocketManager.shared,
        messageService: MessageServiceProviding = MessageService.shared,
        authManager: AuthManaging = AuthManager.shared,
        storyService: StoryServiceProviding = StoryService.shared,
        syncEngine: ConversationSyncEngineProviding = ConversationSyncEngine.shared,
        messageNotificationPublisher: AnyPublisher<String, Never> = PushNotificationManager.shared.messageNotificationReceived.eraseToAnyPublisher()
    ) {
        self.api = api
        self.conversationService = conversationService
        self.preferenceService = preferenceService
        self.messageSocket = messageSocket
        self.messageService = messageService
        self.authManager = authManager
        self.storyService = storyService
        self.syncEngine = syncEngine
        self.messageNotificationPublisher = messageNotificationPublisher
        subscribeToSocketEvents()
        subscribeToPushNotifications()
        syncBadgeOnUnreadChange()
        setupBackgroundProcessing()
        observeMarkAsRead()
        observeSync()
    }
```

- [ ] **Step 4: Implémenter `subscribeToPushNotifications`**

Dans `ConversationListViewModel.swift`, ajouter cette méthode juste après la fonction `subscribeToSocketEvents()` (après sa `}` de fermeture, vers la ligne 706) :

```swift

    // MARK: - Push Notification Subscription

    /// Remonte une conversation en tête dès qu'une notification push
    /// « message » arrive — couvre les messages reçus alors que le websocket
    /// était déconnecté (app en arrière-plan). Le payload push ne porte pas
    /// l'horodatage du message ; on utilise `dateProvider()` (instant de
    /// réception). La conséquence — `lastMessageAt` légèrement dans le futur
    /// jusqu'au prochain sync — est documentée comme bénigne dans le spec.
    private func subscribeToPushNotifications() {
        messageNotificationPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] conversationId in
                guard let self else { return }
                if self.convIndex(for: conversationId) != nil {
                    self.bumpToTop(conversationId: conversationId, newLastMessageAt: self.dateProvider())
                } else {
                    self.fetchAndPrependMissingConversation(id: conversationId, source: .socketUpdated)
                }
            }
            .store(in: &cancellables)
    }
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `./apps/ios/meeshy.sh test`
Expected: `test_pushNotification_messageForKnownConversation_bumpsToTop` PASSE.

- [ ] **Step 6: Brancher `noteMessageActivity` dans `AppDelegate`**

Dans `AppDelegate.swift`, méthode `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)` : à l'intérieur du bloc `Task { @MainActor in` (ligne 137), ajouter en toute première ligne (avant `let state = SilentPushState(...)`) :

```swift
            PushNotificationManager.shared.noteMessageActivity(userInfo: userInfo)
```

Dans la méthode `userNotificationCenter(_:willPresent:withCompletionHandler:)`, juste après la ligne `let userInfo = notification.request.content.userInfo` (ligne 429), ajouter :

```swift
        Task { @MainActor in
            PushNotificationManager.shared.noteMessageActivity(userInfo: userInfo)
        }
```

- [ ] **Step 7: Vérifier la compilation**

Run: `./apps/ios/meeshy.sh build`
Expected: SUCCÈS de compilation.

- [ ] **Step 8: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift apps/ios/Meeshy/AppDelegate.swift apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift
git commit -m "feat(ios): remontée de conversation pilotée par les notifications push iOS"
```

---

## Task 5: Resynchro au retour au premier plan

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift` (nouvelle méthode `handleForegroundReactivation`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift:548-552`
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter dans la classe `ConversationListViewModelTests` :

```swift
    // MARK: - Foreground reactivation

    func test_handleForegroundReactivation_resortsConversations() {
        let (sut, _, _, _, _, _, _) = makeSUT()
        let recent = makeConversation(id: "recent", lastMessageAt: Date(timeIntervalSince1970: 9999))
        let old = makeConversation(id: "old", lastMessageAt: Date(timeIntervalSince1970: 1))
        sut.conversations = [old, recent]
        sut.handleForegroundReactivation()
        XCTAssertEqual(sut.conversations.first?.id, "recent")
    }

    func test_handleForegroundReactivation_triggersDeltaSync() {
        let syncEngine = MockConversationSyncEngine()
        let (sut, _, _, _, _, _, _) = makeSUT(syncEngine: syncEngine)
        sut.handleForegroundReactivation()
        let exp = expectation(description: "delta sync ran")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { exp.fulfill() }
        wait(for: [exp], timeout: 2)
        XCTAssertGreaterThan(syncEngine.syncSinceLastCheckpointCallCount, 0)
    }
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `./apps/ios/meeshy.sh build`
Expected: ÉCHEC de compilation — `ConversationListViewModel` n'a pas de membre `handleForegroundReactivation`.

- [ ] **Step 3: Implémenter `handleForegroundReactivation`**

Dans `ConversationListViewModel.swift`, ajouter cette méthode juste après `handleForegroundReturn()` (après sa `}` de fermeture, vers la ligne 1444) :

```swift

    /// Appelée quand la liste de conversations revient au premier plan.
    /// Re-trie la liste en mémoire immédiatement (retour instantané), puis
    /// lance un delta sync pour que les messages reçus via APNs pendant que
    /// l'app était en arrière-plan remontent et réordonnent la liste.
    /// Distinct de `handleForegroundReturn()`, qui ne rafraîchit que les
    /// stories.
    func handleForegroundReactivation() {
        setConversations(conversations)
        Task { [weak self] in
            await self?.refresh()
        }
    }
```

- [ ] **Step 4: Brancher le hook dans `ConversationListView`**

Dans `ConversationListView.swift`, le handler scenePhase (lignes 548-552) est actuellement :

```swift
            .onChange(of: scenePhase) { _, newPhase in
                if newPhase == .active {
                    conversationViewModel.handleForegroundReturn()
                }
            }
```

Le remplacer par :

```swift
            .onChange(of: scenePhase) { _, newPhase in
                if newPhase == .active {
                    conversationViewModel.handleForegroundReturn()
                    conversationViewModel.handleForegroundReactivation()
                }
            }
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: `test_handleForegroundReactivation_resortsConversations` et `test_handleForegroundReactivation_triggersDeltaSync` PASSENT.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift
git commit -m "feat(ios): resynchro de la liste de conversations au retour au premier plan"
```

---

## Task 6: `DraftSummary` + `DraftStore.changed` + `allNonEmptyDrafts()`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/DraftStore.swift`
- Test: `apps/ios/MeeshyTests/Unit/Services/DraftStoreTests.swift`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter `import Combine` en haut de `DraftStoreTests.swift` (sous `import XCTest`). Puis ajouter dans la classe `DraftStoreTests` :

```swift
    // MARK: - allNonEmptyDrafts

    func test_allNonEmptyDrafts_excludesEmptyDrafts() {
        let sut = makeSUT()
        sut.save(MessageDraft(text: "hello"), for: "conv1")
        sut.save(MessageDraft(text: "   "), for: "conv2")
        let drafts = sut.allNonEmptyDrafts()
        XCTAssertEqual(Array(drafts.keys), ["conv1"])
        XCTAssertEqual(drafts["conv1"]?.text, "hello")
    }

    func test_allNonEmptyDrafts_emptyStore_returnsEmpty() {
        let sut = makeSUT()
        XCTAssertTrue(sut.allNonEmptyDrafts().isEmpty)
    }

    // MARK: - changed publisher

    func test_save_emitsChanged() {
        let sut = makeSUT()
        var changeCount = 0
        let c = sut.changed.sink { changeCount += 1 }
        sut.save(MessageDraft(text: "hi"), for: "conv1")
        c.cancel()
        XCTAssertEqual(changeCount, 1)
    }

    func test_remove_emitsChanged() {
        let sut = makeSUT()
        sut.save(MessageDraft(text: "hi"), for: "conv1")
        var changeCount = 0
        let c = sut.changed.sink { changeCount += 1 }
        sut.remove(for: "conv1")
        c.cancel()
        XCTAssertEqual(changeCount, 1)
    }

    // MARK: - DraftSummary

    func test_draftSummary_equatable() {
        let date = Date(timeIntervalSince1970: 100)
        XCTAssertEqual(
            DraftSummary(previewText: "a", updatedAt: date),
            DraftSummary(previewText: "a", updatedAt: date)
        )
        XCTAssertNotEqual(
            DraftSummary(previewText: "a", updatedAt: date),
            DraftSummary(previewText: "b", updatedAt: date)
        )
    }
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `./apps/ios/meeshy.sh build`
Expected: ÉCHEC de compilation — `DraftStore` n'a pas `allNonEmptyDrafts` / `changed`, et `DraftSummary` est indéfini.

- [ ] **Step 3: Ajouter `import Combine` et le type `DraftSummary`**

Dans `DraftStore.swift`, remplacer la première ligne `import Foundation` par :

```swift
import Foundation
import Combine
```

Puis ajouter, juste après la `}` de fermeture de `struct MessageDraft` (ligne 64) et avant `final class DraftStore`, le type `DraftSummary` :

```swift

/// Projection légère et prête au rendu d'un brouillon persisté, pour la liste
/// de conversations. Ne porte que ce dont la ligne et le comparateur de tri
/// ont besoin.
struct DraftSummary: Equatable, Sendable {
    let previewText: String
    let updatedAt: Date
}
```

- [ ] **Step 4: Ajouter la propriété `changed` à `DraftStore`**

Dans `DraftStore.swift`, ajouter cette propriété juste après `static let shared = DraftStore()` (ligne 67) :

```swift

    /// Émis à chaque mutation de brouillon (save, remove, clearAll,
    /// purgeExpired). La liste de conversations s'y abonne pour ré-annoter et
    /// re-trier en temps réel.
    let changed = PassthroughSubject<Void, Never>()
```

- [ ] **Step 5: Émettre `changed` dans les mutations**

Dans `DraftStore.swift`, remplacer la fonction `save(_:for:)` (lignes 88-97) :

```swift
    func save(_ draft: MessageDraft, for conversationId: String) {
        if draft.isEffectivelyEmpty {
            defaults.removeObject(forKey: key(for: conversationId))
            changed.send()
            return
        }
        var stamped = draft
        stamped.updatedAt = Date()
        guard let data = try? encoder.encode(stamped) else { return }
        defaults.set(data, forKey: key(for: conversationId))
        changed.send()
    }
```

Remplacer la fonction `remove(for:)` (lignes 114-116) :

```swift
    func remove(for conversationId: String) {
        defaults.removeObject(forKey: key(for: conversationId))
        changed.send()
    }
```

Remplacer la fonction `clearAll()` (lignes 158-163) :

```swift
    func clearAll() {
        let allKeys = defaults.dictionaryRepresentation().keys
        for k in allKeys where k.hasPrefix(prefix) {
            defaults.removeObject(forKey: k)
        }
        changed.send()
    }
```

Dans la fonction `purgeExpired(olderThan:)` (lignes 168-178), ajouter `changed.send()` en toute dernière ligne avant la `}` de fermeture :

```swift
    func purgeExpired(olderThan maxAge: TimeInterval = 30 * 24 * 3600) {
        let cutoff = Date().addingTimeInterval(-maxAge)
        let allKeys = defaults.dictionaryRepresentation().keys
        for k in allKeys where k.hasPrefix(prefix) {
            guard let data = defaults.data(forKey: k),
                  let draft = try? decoder.decode(MessageDraft.self, from: data) else { continue }
            if draft.updatedAt < cutoff {
                defaults.removeObject(forKey: k)
            }
        }
        changed.send()
    }
```

- [ ] **Step 6: Implémenter `allNonEmptyDrafts()`**

Dans `DraftStore.swift`, ajouter cette méthode juste après `hasDraft(for:)` (ligne 120) :

```swift

    /// Tous les brouillons persistés qui ont encore du contenu, indexés par
    /// conversationId. Parcourt l'espace de clés `meeshy_draft_` — utilisé par
    /// la liste de conversations pour afficher le badge « Brouillon » et
    /// remonter la ligne en tête.
    func allNonEmptyDrafts() -> [String: MessageDraft] {
        var result: [String: MessageDraft] = [:]
        for k in defaults.dictionaryRepresentation().keys where k.hasPrefix(prefix) {
            let conversationId = String(k.dropFirst(prefix.count))
            guard !conversationId.isEmpty,
                  let draft = load(for: conversationId),
                  !draft.isEffectivelyEmpty else { continue }
            result[conversationId] = draft
        }
        return result
    }
```

- [ ] **Step 7: Lancer les tests pour vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: `test_allNonEmptyDrafts_excludesEmptyDrafts`, `test_allNonEmptyDrafts_emptyStore_returnsEmpty`, `test_save_emitsChanged`, `test_remove_emitsChanged`, `test_draftSummary_equatable` PASSENT.

- [ ] **Step 8: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/DraftStore.swift apps/ios/MeeshyTests/Unit/Services/DraftStoreTests.swift
git commit -m "feat(ios): DraftStore expose DraftSummary, un publisher changed et allNonEmptyDrafts"
```

---

## Task 7: Comparateur de tri consolidé `conversationsAreInOrder`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift` (nouvelle fonction statique)
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter dans la classe `ConversationListViewModelTests` :

```swift
    // MARK: - conversationsAreInOrder comparator

    func test_conversationsAreInOrder_pinnedBeforeUnpinned() {
        let pinned = makeConversation(id: "p", isPinned: true, lastMessageAt: Date(timeIntervalSince1970: 1))
        let normal = makeConversation(id: "n", isPinned: false, lastMessageAt: Date(timeIntervalSince1970: 999))
        XCTAssertTrue(ConversationListViewModel.conversationsAreInOrder(pinned, normal, draftSummaries: [:]))
        XCTAssertFalse(ConversationListViewModel.conversationsAreInOrder(normal, pinned, draftSummaries: [:]))
    }

    func test_conversationsAreInOrder_draftBeforeNonDraft_amongUnpinned() {
        let withDraft = makeConversation(id: "d", isPinned: false, lastMessageAt: Date(timeIntervalSince1970: 1))
        let noDraft = makeConversation(id: "x", isPinned: false, lastMessageAt: Date(timeIntervalSince1970: 999))
        let drafts = ["d": DraftSummary(previewText: "wip", updatedAt: Date())]
        XCTAssertTrue(ConversationListViewModel.conversationsAreInOrder(withDraft, noDraft, draftSummaries: drafts))
        XCTAssertFalse(ConversationListViewModel.conversationsAreInOrder(noDraft, withDraft, draftSummaries: drafts))
    }

    func test_conversationsAreInOrder_draftsOrderedByUpdatedAtDescending() {
        let older = makeConversation(id: "o", isPinned: false)
        let newer = makeConversation(id: "n", isPinned: false)
        let drafts = [
            "o": DraftSummary(previewText: "a", updatedAt: Date(timeIntervalSince1970: 100)),
            "n": DraftSummary(previewText: "b", updatedAt: Date(timeIntervalSince1970: 200))
        ]
        XCTAssertTrue(ConversationListViewModel.conversationsAreInOrder(newer, older, draftSummaries: drafts))
    }

    func test_conversationsAreInOrder_pinnedBeatsDraft() {
        let pinnedNoDraft = makeConversation(id: "p", isPinned: true, lastMessageAt: Date(timeIntervalSince1970: 1))
        let unpinnedWithDraft = makeConversation(id: "d", isPinned: false, lastMessageAt: Date(timeIntervalSince1970: 999))
        let drafts = ["d": DraftSummary(previewText: "wip", updatedAt: Date())]
        XCTAssertTrue(ConversationListViewModel.conversationsAreInOrder(pinnedNoDraft, unpinnedWithDraft, draftSummaries: drafts))
    }

    func test_conversationsAreInOrder_twoPinned_orderedByLastMessageAt() {
        let pinnedOld = makeConversation(id: "po", isPinned: true, lastMessageAt: Date(timeIntervalSince1970: 1))
        let pinnedRecent = makeConversation(id: "pr", isPinned: true, lastMessageAt: Date(timeIntervalSince1970: 999))
        XCTAssertTrue(ConversationListViewModel.conversationsAreInOrder(pinnedRecent, pinnedOld, draftSummaries: [:]))
    }
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `./apps/ios/meeshy.sh build`
Expected: ÉCHEC de compilation — `ConversationListViewModel` n'a pas de membre `conversationsAreInOrder`.

- [ ] **Step 3: Implémenter le comparateur**

Dans `ConversationListViewModel.swift`, ajouter cette fonction statique juste après la fonction `groupConversations` (après sa `}` de fermeture, vers la ligne 451) :

```swift

    /// Ordre total de la liste de conversations. Épinglées d'abord ; parmi les
    /// non-épinglées, les conversations avec un brouillon actif flottent en
    /// tête (brouillon le plus récemment édité d'abord) ; le reste retombe sur
    /// `lastMessageAt` décroissant. Les épinglées conservent leur tri
    /// `lastMessageAt` — la priorité brouillon ne s'applique qu'aux
    /// non-épinglées.
    nonisolated static func conversationsAreInOrder(
        _ a: Conversation,
        _ b: Conversation,
        draftSummaries: [String: DraftSummary]
    ) -> Bool {
        if a.isPinned != b.isPinned { return a.isPinned }
        if a.isPinned && b.isPinned { return a.lastMessageAt > b.lastMessageAt }
        let aHasDraft = draftSummaries[a.id] != nil
        let bHasDraft = draftSummaries[b.id] != nil
        if aHasDraft != bHasDraft { return aHasDraft }
        if let aDraft = draftSummaries[a.id], let bDraft = draftSummaries[b.id] {
            return aDraft.updatedAt > bDraft.updatedAt
        }
        return a.lastMessageAt > b.lastMessageAt
    }
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: les 5 tests `test_conversationsAreInOrder_*` PASSENT.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift
git commit -m "feat(ios): comparateur de tri consolidé prenant en compte les brouillons"
```

---

## Task 8: Brancher les brouillons dans le ViewModel

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift` (init, propriétés, `setConversations`, `groupConversations`, pipeline, nouvelles méthodes)
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift`

- [ ] **Step 1: Écrire les tests qui échouent**

D'abord étendre `makeSUT` pour injecter le `DraftStore`. Dans `ConversationListViewModelTests.swift`, ajouter le paramètre `draftStore` à `makeSUT` (après `messageNotificationPublisher`) et le passer à l'init. La signature complète de `makeSUT` devient :

```swift
    private func makeSUT(
        api: MockAPIClientForApp? = nil,
        conversationService: MockConversationService? = nil,
        preferenceService: MockPreferenceService? = nil,
        messageSocket: MockMessageSocket? = nil,
        messageService: MockMessageService? = nil,
        authManager: MockAuthManager? = nil,
        storyService: MockStoryService? = nil,
        syncEngine: MockConversationSyncEngine? = nil,
        messageNotificationPublisher: AnyPublisher<String, Never>? = nil,
        draftStore: DraftStore? = nil
    ) -> (
        sut: ConversationListViewModel,
        api: MockAPIClientForApp,
        conversationService: MockConversationService,
        preferenceService: MockPreferenceService,
        messageSocket: MockMessageSocket,
        messageService: MockMessageService,
        authManager: MockAuthManager
    ) {
        let api = api ?? MockAPIClientForApp()
        let conversationService = conversationService ?? MockConversationService()
        let preferenceService = preferenceService ?? MockPreferenceService()
        let messageSocket = messageSocket ?? MockMessageSocket()
        let messageService = messageService ?? MockMessageService()
        let authManager = authManager ?? MockAuthManager()
        let storyService = storyService ?? MockStoryService()
        let syncEngine = syncEngine ?? MockConversationSyncEngine()
        let pushPublisher = messageNotificationPublisher
            ?? PassthroughSubject<String, Never>().eraseToAnyPublisher()
        let resolvedDraftStore: DraftStore = {
            if let draftStore { return draftStore }
            let store = DraftStore(userDefaults: UserDefaults(suiteName: "ConvListVMTests-\(UUID().uuidString)")!)
            store.clearAll()
            return store
        }()
        let sut = ConversationListViewModel(
            api: api,
            conversationService: conversationService,
            preferenceService: preferenceService,
            messageSocket: messageSocket,
            messageService: messageService,
            authManager: authManager,
            storyService: storyService,
            syncEngine: syncEngine,
            messageNotificationPublisher: pushPublisher,
            draftStore: resolvedDraftStore
        )
        return (sut, api, conversationService, preferenceService, messageSocket, messageService, authManager)
    }
```

Puis ajouter les tests dans la classe :

```swift
    // MARK: - Draft summaries integration

    func test_reloadDraftSummaries_populatesFromDraftStore() {
        let store = DraftStore(userDefaults: UserDefaults(suiteName: "VMDraft-\(UUID().uuidString)")!)
        store.clearAll()
        store.save(MessageDraft(text: "hello"), for: "conv1")
        let (sut, _, _, _, _, _, _) = makeSUT(draftStore: store)
        sut.reloadDraftSummaries()
        XCTAssertEqual(sut.draftSummaries["conv1"]?.previewText, "hello")
    }

    func test_setConversations_draftConversationSortsAboveNonPinned() {
        let store = DraftStore(userDefaults: UserDefaults(suiteName: "VMDraft-\(UUID().uuidString)")!)
        store.clearAll()
        store.save(MessageDraft(text: "wip"), for: "old")
        let (sut, _, _, _, _, _, _) = makeSUT(draftStore: store)
        sut.reloadDraftSummaries()
        let old = makeConversation(id: "old", lastMessageAt: Date(timeIntervalSince1970: 1))
        let recent = makeConversation(id: "recent", lastMessageAt: Date(timeIntervalSince1970: 9999))
        sut.setConversations([old, recent])
        XCTAssertEqual(sut.conversations.first?.id, "old")
    }
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `./apps/ios/meeshy.sh build`
Expected: ÉCHEC de compilation — `ConversationListViewModel` n'a pas de paramètre `draftStore`, ni de membre `reloadDraftSummaries` / `draftSummaries`.

- [ ] **Step 3: Ajouter les propriétés `draftStore` et `draftSummaries`**

Dans `ConversationListViewModel.swift`, ajouter après la propriété `messageNotificationPublisher` (ajoutée en Tâche 4, ligne ~76) :

```swift
    /// Source des brouillons persistés (UserDefaults). Injecté pour la
    /// testabilité ; en production, `DraftStore.shared`.
    private let draftStore: DraftStore
```

Et ajouter, après la propriété `@Published var groupedConversations` (ligne 55) :

```swift
    /// Brouillons actifs indexés par conversationId. Alimente le badge
    /// « Brouillon » de la ligne et la priorité de tri. Concept client-local
    /// — jamais stocké dans le modèle SDK `Conversation`.
    @Published private(set) var draftSummaries: [String: DraftSummary] = [:]
```

- [ ] **Step 4: Mettre à jour l'init**

Dans `ConversationListViewModel.swift`, remplacer l'init complet (modifié en Tâche 4) par :

```swift
    init(
        api: APIClientProviding = APIClient.shared,
        conversationService: ConversationServiceProviding = ConversationService.shared,
        preferenceService: PreferenceServiceProviding = PreferenceService.shared,
        messageSocket: MessageSocketProviding = MessageSocketManager.shared,
        messageService: MessageServiceProviding = MessageService.shared,
        authManager: AuthManaging = AuthManager.shared,
        storyService: StoryServiceProviding = StoryService.shared,
        syncEngine: ConversationSyncEngineProviding = ConversationSyncEngine.shared,
        messageNotificationPublisher: AnyPublisher<String, Never> = PushNotificationManager.shared.messageNotificationReceived.eraseToAnyPublisher(),
        draftStore: DraftStore = DraftStore.shared
    ) {
        self.api = api
        self.conversationService = conversationService
        self.preferenceService = preferenceService
        self.messageSocket = messageSocket
        self.messageService = messageService
        self.authManager = authManager
        self.storyService = storyService
        self.syncEngine = syncEngine
        self.messageNotificationPublisher = messageNotificationPublisher
        self.draftStore = draftStore
        reloadDraftSummaries()
        subscribeToSocketEvents()
        subscribeToPushNotifications()
        subscribeToDrafts()
        syncBadgeOnUnreadChange()
        setupBackgroundProcessing()
        observeMarkAsRead()
        observeSync()
    }
```

- [ ] **Step 5: Implémenter `reloadDraftSummaries` et `subscribeToDrafts`**

Dans `ConversationListViewModel.swift`, ajouter ces deux méthodes juste après `subscribeToPushNotifications()` (après sa `}` de fermeture) :

```swift

    // MARK: - Draft Summaries

    /// Recharge `draftSummaries` depuis le `DraftStore`. `internal` pour que
    /// les tests pilotent la synchro de façon déterministe.
    func reloadDraftSummaries() {
        draftSummaries = draftStore.allNonEmptyDrafts().mapValues { draft in
            DraftSummary(
                previewText: draft.text.trimmingCharacters(in: .whitespacesAndNewlines),
                updatedAt: draft.updatedAt
            )
        }
    }

    /// S'abonne aux mutations de brouillon. Le composer persiste à chaque
    /// frappe, donc `changed` émet en rafale — d'où le debounce de 300 ms qui
    /// évite de recharger tous les brouillons + re-trier à chaque caractère.
    /// Le re-`setConversations` ré-émet `$conversations`, ce qui relance le
    /// pipeline de groupement avec les `draftSummaries` fraîchement rechargés.
    private func subscribeToDrafts() {
        draftStore.changed
            .receive(on: DispatchQueue.main)
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .sink { [weak self] in
                guard let self else { return }
                self.reloadDraftSummaries()
                self.setConversations(self.conversations)
            }
            .store(in: &cancellables)
    }
```

- [ ] **Step 6: Brancher le comparateur dans `setConversations`**

Dans `ConversationListViewModel.swift`, remplacer `setConversations` (lignes 121-124) :

```swift
    func setConversations(_ items: [Conversation]) {
        let merged = mergePreservingRecentlyCreated(incoming: items, current: conversations, now: dateProvider())
        let drafts = draftSummaries
        conversations = merged.sorted { Self.conversationsAreInOrder($0, $1, draftSummaries: drafts) }
    }
```

- [ ] **Step 7: Brancher le comparateur dans `groupConversations`**

Dans `ConversationListViewModel.swift`, remplacer la fonction `groupConversations` complète (lignes 400-451) :

```swift
    nonisolated private static func groupConversations(
        _ filtered: [Conversation],
        categories: [ConversationSection],
        draftSummaries: [String: DraftSummary]
    ) -> [(section: ConversationSection, conversations: [Conversation])] {
        // No categories → flat list, no section headers needed
        let hasPinned = filtered.contains { $0.isPinned && $0.sectionId == nil }
        if categories.isEmpty && !hasPinned {
            let sorted = filtered.sorted { conversationsAreInOrder($0, $1, draftSummaries: draftSummaries) }
            return sorted.isEmpty ? [] : [(ConversationSection.other, sorted)]
        }

        var result: [(section: ConversationSection, conversations: [Conversation])] = []

        // O(1) lookup sets
        let categoryIds = Set(categories.map(\.id))

        // Groupement O(n) unique — remplace les k passes filter O(n×k)
        let bySection = Dictionary(grouping: filtered) { conv -> String in
            if conv.isPinned && conv.sectionId == nil { return "__pinned__" }
            return conv.sectionId ?? "__other__"
        }

        // Pinned section
        if let pinned = bySection["__pinned__"], !pinned.isEmpty {
            result.append((ConversationSection.pinned, pinned.sorted { conversationsAreInOrder($0, $1, draftSummaries: draftSummaries) }))
        }

        // User categories (order preserved)
        for category in categories {
            if let sectionConvs = bySection[category.id], !sectionConvs.isEmpty {
                let sorted = sectionConvs.sorted { conversationsAreInOrder($0, $1, draftSummaries: draftSummaries) }
                result.append((category, sorted))
            }
        }

        // Orphaned (catégorie supprimée) + non-catégorisées → section "other"
        let otherConvs = (bySection["__other__"] ?? []) + filtered.filter { conv in
            guard let sid = conv.sectionId else { return false }
            return !categoryIds.contains(sid)
        }
        if !otherConvs.isEmpty {
            result.append((ConversationSection.other, otherConvs.sorted { conversationsAreInOrder($0, $1, draftSummaries: draftSummaries) }))
        }

        return result
    }
```

- [ ] **Step 8: Passer `draftSummaries` au pipeline de groupement**

Dans `ConversationListViewModel.swift`, dans `setupBackgroundProcessing()`, remplacer le bloc `.sink` du pipeline (lignes 352-364) :

```swift
            .sink { [weak self] (convs, text, filter, categories) in
                guard let self else { return }
                let filtered = Self.filterConversations(convs, searchText: text, filter: filter)
                self.filteredConversations = filtered
                let drafts = self.draftSummaries
                self.groupingTask?.cancel()
                self.groupingTask = Task.detached(priority: .userInitiated) { [weak self] in
                    guard !Task.isCancelled else { return }
                    let grouped = Self.groupConversations(filtered, categories: categories, draftSummaries: drafts)
                    guard !Task.isCancelled else { return }
                    await MainActor.run { [weak self] in
                        self?.groupedConversations = grouped
                    }
                }
            }
```

- [ ] **Step 9: Lancer les tests pour vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: `test_reloadDraftSummaries_populatesFromDraftStore` et `test_setConversations_draftConversationSortsAboveNonPinned` PASSENT ; aucune régression sur les tests `ConversationListViewModelTests` existants.

- [ ] **Step 10: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift
git commit -m "feat(ios): la liste remonte et re-trie les conversations avec un brouillon actif"
```

---

## Task 9: Badge « Brouillon » dans la ligne de conversation

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift` (paramètre `draftSummary`, vue d'aperçu, `Equatable`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Rows.swift` (champ `draftSummary` sur `ConversationRowItem`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift` (passage de `draftSummary` ~ligne 264-275)
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter dans la classe `ConversationListViewModelTests` :

```swift
    // MARK: - ThemedConversationRow draft badge

    @MainActor
    func test_themedRow_equatable_differsByDraftSummary() {
        let conv = makeConversation(id: "c1")
        let plain = ThemedConversationRow(conversation: conv)
        let withDraft = ThemedConversationRow(
            conversation: conv,
            draftSummary: DraftSummary(previewText: "hi", updatedAt: Date(timeIntervalSince1970: 1))
        )
        XCTAssertNotEqual(plain, withDraft)
    }

    @MainActor
    func test_themedRow_equatable_sameDraftSummary_equal() {
        let conv = makeConversation(id: "c1")
        let draft = DraftSummary(previewText: "hi", updatedAt: Date(timeIntervalSince1970: 1))
        let a = ThemedConversationRow(conversation: conv, draftSummary: draft)
        let b = ThemedConversationRow(conversation: conv, draftSummary: draft)
        XCTAssertEqual(a, b)
    }
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `./apps/ios/meeshy.sh build`
Expected: ÉCHEC de compilation — `ThemedConversationRow` n'a pas de paramètre `draftSummary`.

- [ ] **Step 3: Ajouter le paramètre `draftSummary` à `ThemedConversationRow`**

Dans `ThemedConversationRow.swift`, juste après la propriété `var isSelected: Bool = false` (ligne 29), ajouter :

```swift
    /// Brouillon actif de la conversation (concept client-local). Non nil →
    /// la ligne affiche « Brouillon : … » au lieu de l'aperçu du dernier
    /// message.
    var draftSummary: DraftSummary? = nil
```

- [ ] **Step 4: Ajouter la vue d'aperçu du brouillon**

Dans `ThemedConversationRow.swift`, ajouter cette fonction juste après la propriété calculée `typingIndicatorView` (après sa `}` de fermeture, vers la ligne 377) :

```swift

    // MARK: - Draft Preview

    @ViewBuilder
    private func draftPreviewView(_ draft: DraftSummary) -> some View {
        HStack(spacing: 4) {
            Text(draft.previewText.isEmpty ? "Brouillon" : "Brouillon :")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(MeeshyColors.error)
            if !draft.previewText.isEmpty {
                Text(draft.previewText)
                    .font(.system(size: 13))
                    .foregroundColor(textSecondary)
                    .lineLimit(1)
            }
        }
    }
```

- [ ] **Step 5: Brancher l'aperçu du brouillon dans `lastMessagePreviewView`**

Dans `ThemedConversationRow.swift`, le début de `lastMessagePreviewView` (lignes 415-420) est actuellement :

```swift
    @ViewBuilder
    private var lastMessagePreviewView: some View {
        if typingUsername != nil {
            typingIndicatorView
        } else {
            switch lastMessageSummary {
```

Le remplacer par :

```swift
    @ViewBuilder
    private var lastMessagePreviewView: some View {
        if typingUsername != nil {
            typingIndicatorView
        } else if let draftSummary {
            draftPreviewView(draftSummary)
        } else {
            switch lastMessageSummary {
```

- [ ] **Step 6: Mettre à jour le `Equatable` de `ThemedConversationRow`**

Dans `ThemedConversationRow.swift`, remplacer la fonction `==` de l'extension `Equatable` (lignes 539-550) :

```swift
    static func == (lhs: ThemedConversationRow, rhs: ThemedConversationRow) -> Bool {
        lhs.conversation.id == rhs.conversation.id &&
        lhs.conversation.renderFingerprint == rhs.conversation.renderFingerprint &&
        lhs.typingUsername == rhs.typingUsername &&
        lhs.availableWidth == rhs.availableWidth &&
        lhs.isDragging == rhs.isDragging &&
        lhs.isDark == rhs.isDark &&
        lhs.storyRingState == rhs.storyRingState &&
        lhs.moodStatus?.id == rhs.moodStatus?.id &&
        lhs.presenceState == rhs.presenceState &&
        lhs.isSelected == rhs.isSelected &&
        lhs.draftSummary == rhs.draftSummary
    }
```

> Note : sans `lhs.draftSummary == rhs.draftSummary`, la ligne ne se ré-évalue jamais sur un changement de brouillon (`conversation.renderFingerprint` ne change pas) — le badge n'apparaîtrait jamais. Cette ligne est obligatoire.

- [ ] **Step 7: Ajouter le champ `draftSummary` à `ConversationRowItem`**

Dans `ConversationListView+Rows.swift`, ajouter ce champ dans le `struct ConversationRowItem`, juste après `let isSelected: Bool` (ligne 32) :

```swift
    let draftSummary: DraftSummary?
```

Puis, dans le `body`, l'appel à `ThemedConversationRow(...)` (lignes 51-67) : ajouter le paramètre `draftSummary` juste après `isSelected: isSelected`. Le bloc devient :

```swift
            ThemedConversationRow(
                conversation: conversation,
                community: community,
                availableWidth: rowWidth,
                isDragging: isDragging,
                presenceState: presenceState,
                onViewStory: onViewStory,
                onViewProfile: onViewProfile,
                onViewConversationInfo: onViewConversationInfo,
                onMoodBadgeTap: onMoodBadgeTap,
                onCreateShareLink: onCreateShareLink,
                isDark: isDark,
                storyRingState: storyRingState,
                moodStatus: moodStatus,
                typingUsername: typingUsername,
                isSelected: isSelected,
                draftSummary: draftSummary
            )
```

- [ ] **Step 8: Passer `draftSummary` depuis `ConversationListView`**

Dans `ConversationListView.swift`, dans la fonction `conversationRow(for:rowWidth:)`, l'appel `ConversationRowItem(...)` : ajouter le paramètre `draftSummary` juste après `isSelected: selectedConversationId == conversation.id,` (ligne 274) :

```swift
            draftSummary: conversationViewModel.draftSummaries[conversation.id],
```

- [ ] **Step 9: Lancer les tests pour vérifier qu'ils passent**

Run: `./apps/ios/meeshy.sh test`
Expected: `test_themedRow_equatable_differsByDraftSummary` et `test_themedRow_equatable_sameDraftSummary_equal` PASSENT ; compilation OK.

- [ ] **Step 10: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift apps/ios/Meeshy/Features/Main/Views/ConversationListView+Rows.swift apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift
git commit -m "feat(ios): badge « Brouillon » rouge dans la ligne de conversation"
```

---

## Vérification finale

- [ ] **Build complet propre**

Run: `./apps/ios/meeshy.sh build`
Expected: SUCCÈS.

- [ ] **Suite de tests app complète**

Run: `./apps/ios/meeshy.sh test`
Expected: tous les tests PASSENT, aucune régression.

- [ ] **Suite de tests SDK**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -derivedDataPath apps/ios/Build -only-testing:MeeshySDKTests/PushNotificationManagerTests -quiet`
Expected: tous les tests `PushNotificationManagerTests` PASSENT.

- [ ] **Vérification visuelle manuelle (`./apps/ios/meeshy.sh run`)**
  1. Une conversation avec des non-lus → l'indicateur de durée est en rouge.
  2. Recevoir un message (websocket) → la conversation remonte instantanément en tête.
  3. Mettre l'app en arrière-plan, recevoir un message (notification iOS), rouvrir l'app → la conversation est remontée.
  4. Ouvrir une conversation ancienne, taper du texte, revenir à la liste → la conversation est en tête des non-épinglées avec « Brouillon : … » en rouge.
  5. Vider le brouillon, revenir à la liste → la conversation reprend sa place normale, sans badge.
