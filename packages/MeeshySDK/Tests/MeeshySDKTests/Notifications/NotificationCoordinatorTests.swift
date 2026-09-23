import XCTest
import Combine
@testable import MeeshySDK

@MainActor
final class NotificationCoordinatorTests: XCTestCase {

    // Track app-group suite names so we can tear them down after each test.
    private var createdSuiteNames: [String] = []

    override func tearDown() {
        for suite in createdSuiteNames {
            UserDefaults(suiteName: suite)?.removePersistentDomain(forName: suite)
        }
        createdSuiteNames.removeAll()
        super.tearDown()
    }

    // MARK: - Test doubles

    final class MockBadgeWriter: NotificationBadgeWriting, @unchecked Sendable {
        private let lock = NSLock()
        private var _writes: [Int] = []
        var writes: [Int] {
            lock.withLock { _writes }
        }
        func setBadgeCount(_ count: Int) async {
            lock.withLock { _writes.append(count) }
        }
    }

    @MainActor
    final class MockWidgetSink: NotificationWidgetSink {
        var publishedConversations: [[MeeshyConversation]] = []
        var publishedFavorites: [[MeeshyConversation]] = []
        var publishedUnread: [Int] = []
        var reloadCount = 0

        func publishConversations(_ conversations: [MeeshyConversation]) {
            publishedConversations.append(conversations)
        }
        func publishFavoriteContacts(_ conversations: [MeeshyConversation]) {
            publishedFavorites.append(conversations)
        }
        func publishUnreadCount(_ count: Int) {
            publishedUnread.append(count)
        }
        func reloadTimelines() {
            reloadCount += 1
        }
        var wipeAllCount = 0
        func wipeAll() {
            wipeAllCount += 1
        }
    }

    // MARK: - Factory

    /// Un registre NEUF par SUT (#6998). La production partage
    /// `ConversationReadLedger.shared` entre le badge, la pastille « retour »,
    /// le widget et le menu — c'est tout l'intérêt d'une source unique — mais
    /// deux tests qui se le partageraient hériteraient l'un de l'état de
    /// l'autre, et l'ordre d'exécution déciderait du verdict.
    private func makeLedger() -> ConversationReadLedger { ConversationReadLedger() }

    private func makeSUT() -> (NotificationCoordinator, MockBadgeWriter, MockWidgetSink, String) {
        let suite = "group.test.meeshy.coordinator.\(UUID().uuidString)"
        createdSuiteNames.append(suite)
        let defaults = UserDefaults(suiteName: suite)
        defaults?.removePersistentDomain(forName: suite)
        let writer = MockBadgeWriter()
        // `openConversationIdProvider: { nil }` — EXPLICITE, pas un détail de
        // confort. Le défaut lit `MessageSocketManager.shared.activeConversationId`,
        // un singleton qu'une AUTRE suite du même process laisse posé
        // (`MessageSocketReconnectLifecycleTests` y écrit « A » et ne l'efface
        // jamais). Tant qu'un seul chemin le consultait, la collision restait
        // improbable ; depuis que les instantanés le consultent aussi, l'ordre
        // d'exécution déciderait du verdict. Les trois tests qui MESURENT le
        // gate injectent leur propre valeur (`makeSUTWithOpenConversation`).
        let sut = NotificationCoordinator(
            badgeWriter: writer, appGroupSuiteName: suite,
            openConversationIdProvider: { nil }, ledger: makeLedger()
        )
        let sink = MockWidgetSink()
        sut.widgetSink = sink
        return (sut, writer, sink, suite)
    }

    private func makeReadEvent(conversationId: String, userId: String?, type: String) -> ReadStatusUpdateEvent {
        ReadStatusUpdateEvent(
            conversationId: conversationId,
            participantId: userId ?? "p_\(conversationId)",
            userId: userId,
            type: type,
            updatedAt: Date(),
            summary: ReadStatusSummary(totalMembers: 2, deliveredCount: 1, readCount: 1)
        )
    }

    private func makeSUTWithUser(_ userId: String?) -> NotificationCoordinator {
        let suite = "group.test.meeshy.coordinator.\(UUID().uuidString)"
        createdSuiteNames.append(suite)
        UserDefaults(suiteName: suite)?.removePersistentDomain(forName: suite)
        return NotificationCoordinator(badgeWriter: MockBadgeWriter(), appGroupSuiteName: suite,
                                       currentUserIdProvider: { userId },
                                       openConversationIdProvider: { nil }, ledger: makeLedger())
    }

    private func makeSUTWithOpenConversation(_ openId: String?) -> NotificationCoordinator {
        let suite = "group.test.meeshy.coordinator.\(UUID().uuidString)"
        createdSuiteNames.append(suite)
        UserDefaults(suiteName: suite)?.removePersistentDomain(forName: suite)
        return NotificationCoordinator(badgeWriter: MockBadgeWriter(), appGroupSuiteName: suite,
                                       openConversationIdProvider: { openId }, ledger: makeLedger())
    }

    // MARK: - Réveil background — syncNow ne doit RIEN écraser sans snapshot autoritaire

    func test_syncNow_beforeAnyAuthoritativeSnapshot_preservesBadgeAndAppGroupMirror() async {
        let (sut, writer, _, suite) = makeSUT()
        // La NSE vient d'écrire le compte de la push ; le process est relancé
        // à froid par une push silencieuse, le coordinateur est VIDE.
        UserDefaults(suiteName: suite)?.set(7, forKey: NotificationCoordinator.unreadCountKey)

        await sut.syncNow()

        XCTAssertTrue(
            writer.writes.isEmpty,
            "syncNow sur un coordinateur jamais hydraté écrasait aps.badge avec 0 — " +
            "le réveil background annulait le badge que la push venait de poser"
        )
        XCTAssertEqual(
            UserDefaults(suiteName: suite)?.integer(forKey: NotificationCoordinator.unreadCountKey), 7,
            "le miroir App Group écrit par la NSE doit survivre au réveil background"
        )
    }

    func test_syncNow_afterAuthoritativeSnapshot_writesBadge() async {
        let (sut, writer, _, _) = makeSUT()
        sut.reconcileConversationUnreads([
            makeConversation(id: "c1", unread: 3),
        ])

        await sut.syncNow()

        XCTAssertEqual(writer.writes.last, 1,
                       "D-L1 — l'icône compte UNE conversation, pas ses trois messages")
    }

    // MARK: - Gate conversation ouverte — le badge d'icône ne gonfle pas pendant la lecture

    func test_applyConversationUnread_openConversation_clampsToZero() {
        let sut = makeSUTWithOpenConversation("c1")

        sut.applyConversationUnread(conversationId: "c1", unreadCount: 5)

        XCTAssertEqual(
            sut.conversationUnreadTotal, 0,
            "Le gateway émet conversation:unread-updated à TOUS les destinataires, y compris " +
            "celui qui lit — le compteur de la conversation OUVERTE doit être clampé à 0, " +
            "sinon le badge d'icône/widget gonfle pendant la lecture (miroir du gate " +
            "ConversationSyncEngine.handleUnreadUpdated)"
        )
    }

    func test_applyConversationUnread_otherConversation_stillCounts() {
        let sut = makeSUTWithOpenConversation("c1")

        sut.applyConversationUnread(conversationId: "c2", unreadCount: 4)

        XCTAssertEqual(sut.conversationUnreadCounts["c2"], 4,
                       "la LIGNE garde ses quatre messages")
        XCTAssertEqual(sut.conversationUnreadTotal, 1,
                       "Le gate ne s'applique qu'à la conversation ouverte — les autres comptent normalement")
    }

    func test_applyConversationUnread_noOpenConversation_appliesServerValue() {
        let sut = makeSUTWithOpenConversation(nil)

        sut.applyConversationUnread(conversationId: "c1", unreadCount: 3)

        XCTAssertEqual(sut.conversationUnreadCounts["c1"], 3,
                       "la valeur serveur est bien appliquée à la LIGNE")
        XCTAssertEqual(sut.conversationUnreadTotal, 1)
    }

    // MARK: - #6998 — le badge est une PROJECTION du registre de lecture

    /// Le coordinateur ne tient plus de carte `conversationId → Int` : il LIT
    /// celle du registre. Le témoin le prouve par l'extérieur — un compteur
    /// posé DIRECTEMENT dans le registre, sans passer par aucune méthode du
    /// coordinateur, apparaît dans sa projection.
    func test_conversationUnreadCounts_isAProjectionOfTheLedger() {
        let ledger = ConversationReadLedger()
        let suite = "group.test.meeshy.coordinator.\(UUID().uuidString)"
        createdSuiteNames.append(suite)
        let sut = NotificationCoordinator(
            badgeWriter: MockBadgeWriter(), appGroupSuiteName: suite,
            openConversationIdProvider: { nil }, ledger: ledger
        )

        ledger.apply(.serverUnread(conversationId: "c1", unreadCount: 6))

        XCTAssertEqual(
            sut.conversationUnreadCounts["c1"], 6,
            "le coordinateur n'a plus de copie : la carte qu'il expose est celle du registre"
        )
    }

    /// Le gate « conversation ouverte » ne s'appliquait qu'au chemin SOCKET.
    /// Un instantané — republication de liste, resync après reconnexion —
    /// rallumait donc le badge pour la conversation que l'utilisateur est en
    /// train de LIRE, jusqu'au prochain événement socket. Le registre applique
    /// la règle en rang 1, quel que soit l'événement.
    func test_reconcileConversationUnreads_openConversation_staysZero() {
        let sut = makeSUTWithOpenConversation("c1")

        sut.reconcileConversationUnreads([
            makeConversation(id: "c1", unread: 5),
            makeConversation(id: "c2", unread: 2)
        ])

        XCTAssertEqual(sut.conversationUnreadCounts["c1"], 0,
                       "la conversation OUVERTE est lue — un instantané ne la rallume pas")
        XCTAssertEqual(sut.conversationUnreadTotal, 1)
    }

    func test_registerConversations_openConversation_staysZero() {
        let sut = makeSUTWithOpenConversation("c1")

        sut.registerConversations([
            makeConversation(id: "c1", unread: 5),
            makeConversation(id: "c2", unread: 2)
        ])

        XCTAssertEqual(sut.conversationUnreadCounts["c1"], 0)
        XCTAssertEqual(sut.conversationUnreadTotal, 1)
    }

    // MARK: - #7350 — ouvrir n'est pas lire : la fermeture rend la conversation à l'icône

    private final class OpenConversationBox { var id: String? }

    private func makeSUT(open box: OpenConversationBox) -> NotificationCoordinator {
        let suite = "group.test.meeshy.coordinator.\(UUID().uuidString)"
        createdSuiteNames.append(suite)
        UserDefaults(suiteName: suite)?.removePersistentDomain(forName: suite)
        return NotificationCoordinator(badgeWriter: MockBadgeWriter(), appGroupSuiteName: suite,
                                       openConversationIdProvider: { box.id }, ledger: makeLedger())
    }

    /// Recette 2026-09-21, étape 7 : l'API dit « 1 conversation non lue », le
    /// badge affiche 0. 99 non-lus, l'écran s'ouvre, 5 sont affichés, le
    /// serveur sert 94 PENDANT l'affichage — puis l'écran se ferme et la liste
    /// republie sa ligne, restaurée à 94.
    func test_closingAPartiallyReadConversation_countsItAgainOnTheIcon() {
        let box = OpenConversationBox()
        let sut = makeSUT(open: box)
        sut.reconcileConversationUnreads([makeConversation(id: "c1", unread: 99)])
        box.id = "c1"
        sut.applyConversationUnread(conversationId: "c1", unreadCount: 94)
        XCTAssertEqual(sut.conversationUnreadTotal, 0, "l'écran affiché ne pèse pas sur l'icône")

        box.id = nil
        sut.registerConversations([makeConversation(id: "c1", unread: 94)])

        XCTAssertEqual(sut.conversationUnreadTotal, 1, "94 non-lus restent : la conversation compte à nouveau")
        XCTAssertEqual(sut.conversationUnreadCounts["c1"], 94)
    }

    /// Ouvrir une conversation la retire de l'icône DANS LE TOUR DE BOUCLE, même
    /// quand le serveur lui sert le compte qu'elle avait déjà : c'est le
    /// curseur qui a bougé, pas l'entrée, et le total publié doit le voir.
    func test_openingAConversation_takesItOffTheIcon_evenWhenItsCountIsUnchanged() {
        let box = OpenConversationBox()
        let sut = makeSUT(open: box)
        sut.reconcileConversationUnreads([
            makeConversation(id: "c1", unread: 5),
            makeConversation(id: "c2", unread: 2)
        ])
        XCTAssertEqual(sut.conversationUnreadTotal, 2)

        box.id = "c1"
        sut.applyConversationUnread(conversationId: "c1", unreadCount: 5)

        XCTAssertEqual(sut.conversationUnreadTotal, 1, "la conversation affichée ne pèse plus sur l'icône")
    }

    /// La lecture COMPLÈTE faite pendant l'affichage tient après la fermeture :
    /// « marquer lu » doit s'appliquer à la conversation OUVERTE, dont la
    /// ligne se lit déjà à zéro.
    func test_closingAfterReadingEverything_leavesTheIconAtZero() {
        let box = OpenConversationBox()
        let sut = makeSUT(open: box)
        sut.reconcileConversationUnreads([makeConversation(id: "c1", unread: 7)])
        box.id = "c1"
        sut.applyConversationUnread(conversationId: "c1", unreadCount: 7)

        sut.markConversationRead("c1")
        box.id = nil
        sut.registerConversations([makeConversation(id: "c1", unread: 0)])

        XCTAssertEqual(sut.conversationUnreadTotal, 0)
    }

    // MARK: - appgroup-01 — reset() wipes the App Group widget store

    func test_reset_invokesWidgetSinkWipeAll() {
        let (sut, _, sink, _) = makeSUT()

        sut.reset()

        XCTAssertEqual(
            sink.wipeAllCount, 1,
            "reset() (cascade logout) must wipe the App Group widget store — keys AND staging dirs — " +
            "otherwise the signed-out account's conversations stay on the home screen and its pending " +
            "relays replay under the next account"
        )
    }

    // MARK: - U2 — read-status resets the open-conversation badge

    func test_handleReadStatusUpdated_currentUserReadEvent_resetsConversationBadge() {
        let sut = makeSUTWithUser("me")
        sut.applyConversationUnread(conversationId: "c1", unreadCount: 3)
        XCTAssertEqual(sut.conversationUnreadTotal, 1)

        sut.handleReadStatusUpdated(makeReadEvent(conversationId: "c1", userId: "me", type: "read"))

        XCTAssertEqual(sut.conversationUnreadTotal, 0,
            "the current user reading must reset the conversation's badge")
    }

    func test_handleReadStatusUpdated_receivedEvent_doesNotReset() {
        let sut = makeSUTWithUser("me")
        sut.applyConversationUnread(conversationId: "c1", unreadCount: 3)

        sut.handleReadStatusUpdated(makeReadEvent(conversationId: "c1", userId: "me", type: "received"))

        XCTAssertEqual(sut.conversationUnreadCounts["c1"], 3,
            "a 'received' (delivery) event must NOT reset the badge — only an actual read")
        XCTAssertEqual(sut.conversationUnreadTotal, 1)
    }

    func test_handleReadStatusUpdated_otherUserRead_doesNotReset() {
        let sut = makeSUTWithUser("me")
        sut.applyConversationUnread(conversationId: "c1", unreadCount: 3)

        sut.handleReadStatusUpdated(makeReadEvent(conversationId: "c1", userId: "other", type: "read"))

        XCTAssertEqual(sut.conversationUnreadCounts["c1"], 3,
            "another participant's read receipt must NOT reset MY unread badge")
        XCTAssertEqual(sut.conversationUnreadTotal, 1)
    }

    /// Wait until `condition()` returns true or the timeout expires. Unlike
    /// `Task.sleep`, this polls the Combine-driven debounce machinery on the
    /// main run loop, which is the iOS test-guide's preferred pattern.
    private func waitFor(
        _ description: String,
        timeout: TimeInterval = 1.0,
        condition: @escaping () -> Bool
    ) {
        let expectation = expectation(description: description)
        let start = Date()
        let timer = Timer.scheduledTimer(withTimeInterval: 0.02, repeats: true) { timer in
            if condition() {
                expectation.fulfill()
                timer.invalidate()
            } else if Date().timeIntervalSince(start) > timeout {
                timer.invalidate()
            }
        }
        wait(for: [expectation], timeout: timeout + 0.1)
        timer.invalidate()
    }

    private func makeConversation(
        id: String,
        unread: Int = 0,
        pinned: Bool = false,
        muted: Bool = false,
        type: MeeshyConversation.ConversationType = .direct
    ) -> MeeshyConversation {
        MeeshyConversation(
            id: id,
            identifier: id,
            type: type,
            title: "Conv \(id)",
            unreadCount: unread,
            isPinned: pinned,
            isMuted: muted
        )
    }

    // MARK: - registerConversations

    /// **D-L1 (#7236)** — le témoin DISCRIMINANT du lot : il ne peut pas
    /// verdir sur une somme. Trois conversations dont une lue, huit messages
    /// en tout : l'icône dit DEUX.
    func test_registerConversations_countsUnreadConversationsNotMessages() async {
        let (sut, _, _, _) = makeSUT()

        sut.registerConversations([
            makeConversation(id: "c1", unread: 3),
            makeConversation(id: "c2", unread: 5),
            makeConversation(id: "c3", unread: 0)
        ])

        XCTAssertEqual(sut.conversationUnreadTotal, 2,
                       "deux conversations non lues — la somme (8) n'est pas ce que l'icône montre")
        XCTAssertEqual(sut.conversationUnreadCounts["c1"], 3,
                       "la LIGNE garde sa somme de messages : seule l'icône compte des conversations")
        XCTAssertEqual(sut.conversationUnreadCounts["c2"], 5)
        XCTAssertEqual(sut.conversationUnreadCounts["c3"], 0)
        XCTAssertEqual(sut.badgeTotal, 2)
    }

    // MARK: - Muted conversations excluded from the badge

    /// A muted conversation keeps its per-row unread (still tracked in
    /// `conversationUnreadCounts`) but must NOT inflate the app-icon / widget
    /// badge — the user muted it precisely to silence that nag.
    func test_registerConversations_mutedUnread_excludedFromBadgeTotal() async {
        let (sut, _, _, _) = makeSUT()

        sut.registerConversations([
            makeConversation(id: "c1", unread: 3),
            makeConversation(id: "c2", unread: 5, muted: true)
        ])

        XCTAssertEqual(sut.conversationUnreadTotal, 1,
                       "muted c2 must not count toward the badge")
        XCTAssertEqual(sut.conversationUnreadCounts["c2"], 5,
                       "the muted conversation still tracks its real unread for its own row")
        XCTAssertEqual(sut.badgeTotal, 1)
    }

    /// Muting a previously-unmuted conversation must drop its unread out of the
    /// badge on the next snapshot.
    func test_registerConversations_muteToggle_recomputesBadge() async {
        let (sut, _, _, _) = makeSUT()

        sut.registerConversations([makeConversation(id: "c1", unread: 4)])
        XCTAssertEqual(sut.conversationUnreadTotal, 1)

        sut.registerConversations([makeConversation(id: "c1", unread: 4, muted: true)])
        XCTAssertEqual(sut.conversationUnreadTotal, 0,
                       "muting the conversation removes its unread from the badge")

        sut.registerConversations([makeConversation(id: "c1", unread: 4, muted: false)])
        XCTAssertEqual(sut.conversationUnreadTotal, 1,
                       "un-muting restores it to the badge")
    }

    /// `NotificationCoordinator.unmutedTotal` a DISPARU (#6998) : le
    /// coordinateur ne calcule plus de total, il en LIT un. La règle qu'il
    /// portait — « la somme ignore les muettes » — est mesurée là où elle vit
    /// désormais, `ConversationReadLedgerTotalTests.totalExcludesMuted`, avec
    /// sa jumelle qui vérifie que la LIGNE muette garde bien sa pastille.
    /// Ce qui reste ici mesure la même règle à travers le coordinateur :
    /// `test_registerConversations_mutedUnread_excludedFromBadgeTotal`.

    func test_registerConversations_pushesToWidgetSink() async {
        let (sut, _, sink, _) = makeSUT()

        sut.registerConversations([makeConversation(id: "a", unread: 2, pinned: true)])

        XCTAssertEqual(sink.publishedConversations.count, 1)
        XCTAssertEqual(sink.publishedConversations.first?.first?.id, "a")
        XCTAssertEqual(sink.publishedFavorites.count, 1)
    }

    func test_registerConversations_debouncesBadgeWrite() {
        let (sut, writer, sink, suite) = makeSUT()

        sut.registerConversations([makeConversation(id: "a", unread: 4)])

        // Writer is debounced (~150ms) — not called synchronously.
        XCTAssertTrue(writer.writes.isEmpty)

        waitFor("badge written") { writer.writes.contains(1) }

        XCTAssertEqual(writer.writes.last, 1)
        XCTAssertEqual(sink.publishedUnread.last, 1)
        XCTAssertEqual(UserDefaults(suiteName: suite)?.integer(forKey: "unread_count"), 1)
        XCTAssertGreaterThanOrEqual(sink.reloadCount, 1)
    }

    func test_registerConversations_onlyAddsUnknownConversations() {
        let (sut, _, _, _) = makeSUT()
        sut.registerConversations([
            makeConversation(id: "c1", unread: 3),
            makeConversation(id: "c2", unread: 5)
        ])

        // Subsequent call adds c3; c1 and c2 stay tracked even though they're
        // not in this snapshot (paginated VM republish must not drop them).
        sut.registerConversations([makeConversation(id: "c3", unread: 2)])

        XCTAssertEqual(sut.conversationUnreadCounts["c1"], 3)
        XCTAssertEqual(sut.conversationUnreadCounts["c2"], 5)
        XCTAssertEqual(sut.conversationUnreadCounts["c3"], 2)
        XCTAssertEqual(sut.conversationUnreadTotal, 3)
    }

    /// Critical for the double-path race: once the socket has set an authoritative
    /// count, a stale VM snapshot (from slow cache propagation) must NOT roll it back.
    func test_registerConversations_doesNotOverrideTrackedCounts() {
        let (sut, _, _, _) = makeSUT()
        sut.applyConversationUnread(conversationId: "c1", unreadCount: 7) // socket

        // Stale VM snapshot arrives with the pre-socket value of 3.
        sut.registerConversations([makeConversation(id: "c1", unread: 3)])

        XCTAssertEqual(sut.conversationUnreadCounts["c1"], 7)
        XCTAssertEqual(sut.conversationUnreadTotal, 1)
    }

    func test_replaceConversations_dropsEntriesNotInList() {
        let (sut, _, _, _) = makeSUT()
        sut.registerConversations([
            makeConversation(id: "c1", unread: 3),
            makeConversation(id: "c2", unread: 5)
        ])

        sut.replaceConversations([makeConversation(id: "c3", unread: 2)])

        XCTAssertNil(sut.conversationUnreadCounts["c1"])
        XCTAssertNil(sut.conversationUnreadCounts["c2"])
        XCTAssertEqual(sut.conversationUnreadCounts["c3"], 2)
        XCTAssertEqual(sut.conversationUnreadTotal, 1)
    }

    func test_reconcileConversationUnreads_overridesTrackedCounts() {
        let (sut, _, _, _) = makeSUT()
        sut.applyConversationUnread(conversationId: "c1", unreadCount: 7)
        sut.applyConversationUnread(conversationId: "c2", unreadCount: 2)

        // Post-reconnect resync with authoritative server counts — must override.
        sut.reconcileConversationUnreads([
            makeConversation(id: "c1", unread: 0),
            makeConversation(id: "c2", unread: 4)
        ])

        XCTAssertEqual(sut.conversationUnreadCounts["c1"], 0)
        XCTAssertEqual(sut.conversationUnreadCounts["c2"], 4)
        XCTAssertEqual(sut.conversationUnreadTotal, 1,
                       "c1 est retombée à zéro : une seule conversation non lue")
    }

    /// Convergence: simulate both paths (socket + VM snapshot) firing for the same
    /// conversation. The socket value must win regardless of arrival order.
    func test_socketAndVMPaths_convergeOnSocketValue() {
        let (sut, _, _, _) = makeSUT()

        // Order A: VM seeds first, then socket updates.
        sut.registerConversations([makeConversation(id: "c1", unread: 2)])
        sut.applyConversationUnread(conversationId: "c1", unreadCount: 9)
        XCTAssertEqual(sut.conversationUnreadCounts["c1"], 9)

        // Order B: socket fires first for a new conversation, VM snapshot follows
        // with a stale value. Socket stays authoritative.
        sut.applyConversationUnread(conversationId: "c2", unreadCount: 6)
        sut.registerConversations([makeConversation(id: "c2", unread: 1)])
        XCTAssertEqual(sut.conversationUnreadCounts["c2"], 6)

        XCTAssertEqual(sut.conversationUnreadTotal, 2,
                       "deux conversations non lues — leurs compteurs de ligne portent la convergence")
    }

    func test_removeConversation_dropsEntryAndRecomputes() {
        let (sut, _, _, _) = makeSUT()
        sut.registerConversations([
            makeConversation(id: "c1", unread: 3),
            makeConversation(id: "c2", unread: 5)
        ])

        sut.removeConversation("c1")

        XCTAssertNil(sut.conversationUnreadCounts["c1"])
        XCTAssertEqual(sut.conversationUnreadTotal, 1)
    }

    func test_removeConversation_isNoOpForUnknownId() {
        let (sut, writer, _, _) = makeSUT()
        sut.registerConversations([makeConversation(id: "c1", unread: 3)])
        waitFor("initial sync") { writer.writes.contains(1) }
        let writesBefore = writer.writes.count

        sut.removeConversation("does-not-exist")

        let notScheduled = expectation(description: "no new write")
        notScheduled.isInverted = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            if writer.writes.count > writesBefore { notScheduled.fulfill() }
        }
        wait(for: [notScheduled], timeout: 0.4)
        XCTAssertEqual(writer.writes.count, writesBefore)
    }

    // MARK: - applyConversationUnread

    func test_applyConversationUnread_updatesSingleEntry() async {
        let (sut, _, _, _) = makeSUT()
        sut.registerConversations([makeConversation(id: "c1", unread: 2)])

        sut.applyConversationUnread(conversationId: "c1", unreadCount: 7)

        XCTAssertEqual(sut.conversationUnreadCounts["c1"], 7)
        XCTAssertEqual(sut.conversationUnreadTotal, 1)
    }

    func test_applyConversationUnread_addsNewConversation() async {
        let (sut, _, _, _) = makeSUT()
        sut.registerConversations([makeConversation(id: "c1", unread: 2)])

        sut.applyConversationUnread(conversationId: "c2", unreadCount: 4)

        XCTAssertEqual(sut.conversationUnreadTotal, 2,
                       "deux conversations non lues (2 + 4 messages, un seul badge par conversation)")
    }

    func test_applyConversationUnread_clampsNegativeCounts() async {
        let (sut, _, _, _) = makeSUT()

        sut.applyConversationUnread(conversationId: "c1", unreadCount: -3)

        XCTAssertEqual(sut.conversationUnreadCounts["c1"], 0)
        XCTAssertEqual(sut.conversationUnreadTotal, 0)
    }

    func test_applyConversationUnread_isIdempotentWhenSameCount() {
        let (sut, writer, _, _) = makeSUT()
        sut.registerConversations([makeConversation(id: "c1", unread: 3)])
        waitFor("first sync") { writer.writes.contains(1) }
        let countAfterFirstSync = writer.writes.count

        sut.applyConversationUnread(conversationId: "c1", unreadCount: 3)
        // Give the debounce time to fire if it was going to — it shouldn't.
        let notScheduled = expectation(description: "no new write")
        notScheduled.isInverted = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            if writer.writes.count > countAfterFirstSync { notScheduled.fulfill() }
        }
        wait(for: [notScheduled], timeout: 0.4)

        XCTAssertEqual(writer.writes.count, countAfterFirstSync)
    }

    // MARK: - markConversationRead

    func test_markConversationRead_zeroesThatConversation() async {
        let (sut, _, _, _) = makeSUT()
        sut.registerConversations([
            makeConversation(id: "c1", unread: 4),
            makeConversation(id: "c2", unread: 2)
        ])

        sut.markConversationRead("c1")

        XCTAssertEqual(sut.conversationUnreadCounts["c1"], 0)
        XCTAssertEqual(sut.conversationUnreadTotal, 1)
    }

    func test_markConversationRead_noOpWhenAlreadyRead() {
        let (sut, writer, _, _) = makeSUT()
        sut.registerConversations([makeConversation(id: "c1", unread: 0)])
        waitFor("initial sync") { !writer.writes.isEmpty || writer.writes.contains(0) }
        let writesBefore = writer.writes.count

        sut.markConversationRead("c1")
        let notScheduled = expectation(description: "no new write")
        notScheduled.isInverted = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            if writer.writes.count > writesBefore { notScheduled.fulfill() }
        }
        wait(for: [notScheduled], timeout: 0.4)

        XCTAssertEqual(writer.writes.count, writesBefore)
    }

    // MARK: - applyInAppNotificationCounts

    func test_applyInAppNotificationCounts_updatesInAppBellOnly() {
        let (sut, writer, _, _) = makeSUT()
        sut.registerConversations([makeConversation(id: "c1", unread: 5)])
        waitFor("initial sync") { writer.writes.contains(1) }
        let writesBefore = writer.writes.count

        sut.applyInAppNotificationCounts(total: 12, unread: 7)

        XCTAssertEqual(sut.inAppNotificationUnread, 7)
        // Must NOT change the badge: conversations remain the source of truth.
        XCTAssertEqual(writer.writes.count, writesBefore)
        XCTAssertEqual(sut.conversationUnreadTotal, 1)
    }

    func test_applyInAppNotificationCounts_clampsNegatives() async {
        let (sut, _, _, _) = makeSUT()

        sut.applyInAppNotificationCounts(total: 0, unread: -2)

        XCTAssertEqual(sut.inAppNotificationUnread, 0)
    }

    // MARK: - syncNow

    func test_syncNow_writesBadgeAndWidget() async {
        let (sut, writer, sink, suite) = makeSUT()
        sut.registerConversations([makeConversation(id: "a", unread: 3)])

        await sut.syncNow()

        XCTAssertEqual(writer.writes.last, 1)
        XCTAssertEqual(sink.publishedUnread.last, 1)
        XCTAssertEqual(UserDefaults(suiteName: suite)?.integer(forKey: "unread_count"), 1)
    }

    func test_syncNow_whenBadgeDisabled_writesZeroBadgeButKeepsWidgetCount() async {
        let suite = "group.test.meeshy.coordinator.\(UUID().uuidString)"
        createdSuiteNames.append(suite)
        UserDefaults(suiteName: suite)?.removePersistentDomain(forName: suite)
        let writer = MockBadgeWriter()
        let sink = MockWidgetSink()
        let sut = NotificationCoordinator(
            badgeWriter: writer, appGroupSuiteName: suite,
            badgeEnabledProvider: { false },
            openConversationIdProvider: { nil },
            ledger: makeLedger()
        )
        sut.widgetSink = sink
        sut.registerConversations([makeConversation(id: "a", unread: 3)])

        await sut.syncNow()

        // Pref « Badges » désactivée → l'icône d'app ne montre aucun badge…
        XCTAssertEqual(writer.writes.last, 0)
        // …mais le widget (compteur distinct) garde le vrai compte.
        XCTAssertEqual(sink.publishedUnread.last, 1)
    }

    // MARK: - reset

    func test_reset_clearsStateAndBadge() {
        let (sut, writer, sink, suite) = makeSUT()
        sut.registerConversations([makeConversation(id: "c1", unread: 5)])
        sut.applyInAppNotificationCounts(total: 1, unread: 1)

        sut.reset()

        XCTAssertEqual(sut.conversationUnreadTotal, 0)
        XCTAssertTrue(sut.conversationUnreadCounts.isEmpty)
        XCTAssertEqual(sut.inAppNotificationUnread, 0)
        XCTAssertFalse(sut.isRunning)

        waitFor("reset badge write") { writer.writes.last == 0 }

        XCTAssertEqual(writer.writes.last, 0)
        // appgroup-01 — reset() délègue désormais la remise à zéro du store
        // widget au wipe App Group complet (wipeAll), qui supprime la clé
        // unread_count côté sink au lieu de publier 0.
        XCTAssertEqual(sink.wipeAllCount, 1)
        XCTAssertEqual(UserDefaults(suiteName: suite)?.integer(forKey: "unread_count"), 0)
    }

    // MARK: - increment/decrement

    func test_incrementInAppNotificationUnread_incrementsBy1() {
        let (sut, _, _, _) = makeSUT()
        sut.setInAppNotificationUnread(4)

        sut.incrementInAppNotificationUnread()

        XCTAssertEqual(sut.inAppNotificationUnread, 5)
    }

    func test_decrementInAppNotificationUnread_clampsAtZero() {
        let (sut, _, _, _) = makeSUT()
        sut.setInAppNotificationUnread(0)

        sut.decrementInAppNotificationUnread()

        XCTAssertEqual(sut.inAppNotificationUnread, 0)
    }

    // MARK: - start idempotency

    func test_start_isIdempotent() {
        let (sut, _, _, _) = makeSUT()

        sut.start()
        let runningAfterFirst = sut.isRunning
        sut.start()

        XCTAssertTrue(runningAfterFirst)
        XCTAssertTrue(sut.isRunning)
    }

    // MARK: - Badge preference change → resync immédiat

    /// Basculer le toggle « Badges » doit réécrire l'icône TOUT DE SUITE :
    /// avant ce correctif, le badge restait affiché jusqu'au prochain event
    /// socket ou passage en background.
    func test_badgePreferenceChange_resyncsBadgeImmediately() {
        let suite = "group.test.meeshy.coordinator.\(UUID().uuidString)"
        createdSuiteNames.append(suite)
        let writer = MockBadgeWriter()
        let changes = PassthroughSubject<Bool, Never>()
        var badgeEnabled = true
        let sut = NotificationCoordinator(
            badgeWriter: writer,
            appGroupSuiteName: suite,
            badgeEnabledProvider: { badgeEnabled },
            badgeEnabledChanges: changes.eraseToAnyPublisher(),
            openConversationIdProvider: { nil },
            ledger: makeLedger()
        )
        sut.start()
        sut.applyConversationUnread(conversationId: "c1", unreadCount: 7)
        waitFor("initial badge write") { writer.writes.last == 1 }

        badgeEnabled = false
        changes.send(false)

        waitFor("badge cleared after toggle off") { writer.writes.last == 0 }
        XCTAssertEqual(writer.writes.last, 0)

        badgeEnabled = true
        changes.send(true)

        waitFor("badge restored after toggle on") { writer.writes.last == 1 }
        XCTAssertEqual(writer.writes.last, 1)
    }
}
