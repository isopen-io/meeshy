import XCTest
import Combine
import GRDB
@testable import MeeshySDK

@MainActor
final class UserPreferencesManagerTests: XCTestCase {

    // UserPreferencesManager is a singleton with private init.
    // We test the public behavior that doesn't require network (local logic).
    // We use a dedicated UserDefaults suite to avoid polluting the shared defaults.

    private var manager: UserPreferencesManager!

    override func setUp() {
        super.setUp()
        manager = UserPreferencesManager.shared
        manager.resetToDefaults()
        // Test-only cleanup: a previous test's `scheduleSyncToBackend` may
        // still be inside its 1s debounce when this test starts (no network
        // in this suite, so `resetToDefaults()` doesn't touch it). Without
        // this, `pendingCategories` from a prior test leaks into this one's
        // `shouldApplyRemote`/`applyRemote`-adjacent assertions.
        manager.pendingCategories.removeAll()
    }

    override func tearDown() {
        // `service`/`isAuthenticatedOverride` are test-only injection seams
        // on the shared singleton — restore the production defaults so a
        // leaked stub never leaks into an unrelated test in this bundle.
        // Any `scheduleSyncToBackend` debounce `Task` still alive from this
        // test will find `isAuthenticatedOverride == nil` and fall back to
        // the real (false, in this test process) `AuthManager.shared
        // .isAuthenticated`, so it safely no-ops instead of mutating
        // whichever `OfflineQueue` pool is configured by the time it fires.
        manager.isAuthenticatedOverride = nil
        manager.service = PreferenceService.shared
        super.tearDown()
    }

    // MARK: - resetToDefaults

    func test_resetToDefaults_restoresAllCategories() {
        manager.updatePrivacy { $0.showOnlineStatus = false }
        manager.updateAudio { $0.ttsEnabled = true }
        manager.updateDocument { $0.autoDownloadEnabled = true }

        manager.resetToDefaults()

        XCTAssertEqual(manager.privacy, PrivacyPreferences.defaults)
        XCTAssertEqual(manager.audio, AudioPreferences.defaults)
        XCTAssertEqual(manager.message, MessagePreferences.defaults)
        XCTAssertEqual(manager.notification, UserNotificationPreferences.defaults)
        XCTAssertEqual(manager.video, VideoPreferences.defaults)
        XCTAssertEqual(manager.document, DocumentPreferences.defaults)
        XCTAssertEqual(manager.application, ApplicationPreferences.defaults)
    }

    // MARK: - dndUtcOffsetMinutes (DND serveur tz-aware)

    /// Chaque écriture de préférences notification embarque l'offset UTC du
    /// device : le gateway évalue la fenêtre DND dans l'heure LOCALE de
    /// l'utilisateur (`isWithinDnd`, dndUtcOffsetMinutes). Sans ce stamp, les
    /// push des utilisateurs iOS hors UTC étaient (dé)bloqués aux mauvaises
    /// heures dès que l'app était fermée.
    func test_updateNotification_stampsDeviceUtcOffset() {
        manager.updateNotification { $0.newMessageEnabled = false }

        XCTAssertEqual(
            manager.notification.dndUtcOffsetMinutes,
            TimeZone.current.secondsFromGMT() / 60
        )
    }

    // MARK: - Miroir App Group (NSE)

    /// La NSE tourne dans un process séparé sans accès à
    /// `UserDefaults.standard` : chaque écriture des préférences notification
    /// doit être miroitée dans la suite App Group pour que le gating à la
    /// livraison (sons/badge/DND/types) fonctionne app tuée.
    func test_updateNotification_mirrorsToAppGroupForNSE() throws {
        let suite = UserDefaults(suiteName: UserPreferencesManager.appGroupSuiteName)
        suite?.removeObject(forKey: UserPreferencesManager.appGroupNotificationPrefsKey)

        manager.updateNotification { $0.soundEnabled = false }

        let data = try XCTUnwrap(
            suite?.data(forKey: UserPreferencesManager.appGroupNotificationPrefsKey),
            "le miroir App Group doit être écrit à chaque persist notification"
        )
        let mirrored = try JSONDecoder().decode(UserNotificationPreferences.self, from: data)
        XCTAssertFalse(mirrored.soundEnabled)
    }

    func test_resetSession_removesAppGroupMirror() {
        manager.updateNotification { $0.soundEnabled = false }

        manager.resetSession()

        XCTAssertNil(
            UserDefaults(suiteName: UserPreferencesManager.appGroupSuiteName)?
                .data(forKey: UserPreferencesManager.appGroupNotificationPrefsKey),
            "logout : un user B ne doit pas hériter du gating NSE du user A"
        )
    }

    // MARK: - resetSession (P1 — logout)

    /// Prouve que `resetSession()` purge à la fois les @Published en mémoire
    /// ET les clés UserDefaults — sans ça, un cold-start sous user B
    /// re-hydrate les préférences du user A depuis le disque. Câblée
    /// depuis `AuthManager.logout()`.
    func test_resetSession_clearsInMemoryAndWipesDisk() {
        manager.updateAudio { $0.ttsEnabled = true }
        manager.updateDocument { $0.autoDownloadEnabled = true }

        // précondition : les valeurs et les clés disque existent
        XCTAssertTrue(manager.audio.ttsEnabled, "precondition: audio.ttsEnabled should be true")
        XCTAssertNotNil(
            UserDefaults.standard.object(forKey: "meeshy_prefs_audio"),
            "precondition: audio prefs should be persisted on disk"
        )

        manager.resetSession()

        XCTAssertEqual(manager.audio, AudioPreferences.defaults)
        XCTAssertEqual(manager.document, DocumentPreferences.defaults)
        XCTAssertEqual(manager.privacy, PrivacyPreferences.defaults)
        XCTAssertNil(manager.lastSyncDate)
        XCTAssertFalse(manager.isSyncing)
        for category in PreferenceCategory.allCases {
            XCTAssertNil(
                UserDefaults.standard.object(forKey: "meeshy_prefs_" + category.rawValue),
                "disk key for \(category.rawValue) should be wiped"
            )
        }
        XCTAssertNil(UserDefaults.standard.object(forKey: "meeshy_prefs_last_sync"))
    }

    // MARK: - updatePrivacy

    func test_updatePrivacy_appliesTransform() {
        manager.updatePrivacy { $0.showOnlineStatus = false }
        XCTAssertFalse(manager.privacy.showOnlineStatus)
    }

    func test_updatePrivacy_noChange_doesNotPublish() {
        let initialPrivacy = manager.privacy
        manager.updatePrivacy { _ in }
        XCTAssertEqual(manager.privacy, initialPrivacy)
    }

    // MARK: - updateAudio

    func test_updateAudio_appliesTransform() {
        manager.updateAudio { $0.noiseSuppression = false }
        XCTAssertFalse(manager.audio.noiseSuppression)
    }

    // MARK: - updateMessage

    func test_updateMessage_appliesTransform() {
        manager.updateMessage { $0.linkPreviewEnabled = false }
        XCTAssertFalse(manager.message.linkPreviewEnabled)
    }

    // MARK: - updateVideo

    func test_updateVideo_appliesTransform() {
        manager.updateVideo { $0.showSelfView = false }
        XCTAssertFalse(manager.video.showSelfView)
    }

    // MARK: - updateDocument

    func test_updateDocument_appliesTransform() {
        manager.updateDocument { $0.inlinePreviewEnabled = false }
        XCTAssertFalse(manager.document.inlinePreviewEnabled)
    }

    // MARK: - updateApplication

    func test_updateApplication_appliesTransform() {
        manager.updateApplication { $0.reducedMotion = true }
        XCTAssertTrue(manager.application.reducedMotion)
    }

    // MARK: - Voice Consent (espace de préférences)

    func test_voiceConsentGranted_defaultsToFalse() {
        XCTAssertFalse(manager.voiceConsentGranted)
        XCTAssertFalse(manager.voiceCloningConsentGranted)
    }

    func test_grantVoiceAutoTranslationConsent_setsConsentChainAndAudioFeatures() {
        manager.grantVoiceAutoTranslationConsent()

        XCTAssertTrue(manager.voiceConsentGranted)
        XCTAssertTrue(manager.voiceCloningConsentGranted)
        XCTAssertNotNil(manager.application.dataProcessingConsentAt)
        XCTAssertNotNil(manager.application.voiceDataConsentAt)
        XCTAssertNotNil(manager.application.voiceProfileConsentAt)
        XCTAssertNotNil(manager.application.voiceCloningEnabledAt)
        XCTAssertTrue(manager.audio.transcriptionEnabled)
        XCTAssertTrue(manager.audio.audioTranslationEnabled)
        XCTAssertTrue(manager.audio.ttsEnabled)
        XCTAssertTrue(manager.audio.voiceProfileEnabled)
    }

    func test_grantVoiceAutoTranslationConsent_isIdempotent_neverRewritesTimestamps() {
        let first = Date(timeIntervalSince1970: 1_700_000_000)
        manager.grantVoiceAutoTranslationConsent(now: first)
        let stamped = manager.application.voiceProfileConsentAt

        manager.grantVoiceAutoTranslationConsent(now: first.addingTimeInterval(3600))

        XCTAssertEqual(manager.application.voiceProfileConsentAt, stamped)
    }

    // MARK: - shouldApplyRemote (applyRemote server-wins race, P1)
    //
    // `applyRemote` itself is private and only reachable through
    // `fetchFromBackend()`, which hits the real (non-injectable)
    // `PreferenceService.shared` — so the merge DECISION is extracted to a
    // pure static function and tested directly (same "extract the pure
    // core" pattern as `StoryViewerView.rollingBackOptimisticComment`).

    func test_shouldApplyRemote_categoryNotPending_returnsTrue() {
        XCTAssertTrue(UserPreferencesManager.shouldApplyRemote(.privacy, pendingCategories: []))
    }

    func test_shouldApplyRemote_categoryPending_returnsFalse() {
        XCTAssertFalse(UserPreferencesManager.shouldApplyRemote(.privacy, pendingCategories: [.privacy]))
    }

    func test_shouldApplyRemote_otherCategoryPending_returnsTrue() {
        XCTAssertTrue(UserPreferencesManager.shouldApplyRemote(.privacy, pendingCategories: [.audio]))
    }

    // MARK: - pendingCategories wiring (scheduleSyncToBackend / syncCategoryToBackend)

    func test_updatePrivacy_marksCategoryPendingSynchronously() {
        manager.updatePrivacy { $0.showOnlineStatus = false }

        XCTAssertTrue(manager.pendingCategories.contains(.privacy), "scheduleSyncToBackend marks the category pending BEFORE the 1s debounce, synchronously")
    }

    func test_updateAudio_onlyMarksItsOwnCategoryPending() {
        manager.updateAudio { $0.noiseSuppression = false }

        XCTAssertTrue(manager.pendingCategories.contains(.audio))
        XCTAssertFalse(manager.pendingCategories.contains(.privacy))
    }

    func test_resetSession_clearsPendingCategories() {
        manager.updatePrivacy { $0.showOnlineStatus = false }
        XCTAssertFalse(manager.pendingCategories.isEmpty, "precondition: a pending category exists")

        manager.resetSession()

        XCTAssertTrue(manager.pendingCategories.isEmpty)
    }

    // MARK: - pendingCategories persistence (cross-kill stability)

    func test_updateNotification_persistsPendingCategoriesToUserDefaults() {
        manager.updateNotification { $0.notificationBadgeEnabled = false }
        XCTAssertTrue(manager.pendingCategories.contains(.notification), "precondition: notification pending")

        // Verify that pending categories are persisted to UserDefaults
        let savedArray = UserDefaults.standard.stringArray(forKey: "meeshy_prefs_pending_categories") ?? []
        XCTAssertTrue(savedArray.contains(PreferenceCategory.notification.rawValue), "pendingCategories should be persisted to UserDefaults so they survive a relaunch")
    }

    func test_updatePrivacy_persistsPendingCategoriesToUserDefaults() {
        manager.updatePrivacy { $0.showOnlineStatus = false }
        XCTAssertTrue(manager.pendingCategories.contains(.privacy), "precondition: privacy pending")

        let savedArray = UserDefaults.standard.stringArray(forKey: "meeshy_prefs_pending_categories") ?? []
        XCTAssertTrue(savedArray.contains(PreferenceCategory.privacy.rawValue))
    }

    func test_syncCategoryToBackend_clearsPendingCategoriesFromUserDefaults() async {
        manager.updatePrivacy { $0.showOnlineStatus = false }
        // Debounce is 1s, wait for it to fire
        try? await Task.sleep(nanoseconds: 1_200_000_000)

        let savedArray = UserDefaults.standard.stringArray(forKey: "meeshy_prefs_pending_categories") ?? []
        XCTAssertFalse(savedArray.contains(PreferenceCategory.privacy.rawValue), "pending categories should be cleared after sync completes (or fails)")
    }

    func test_resetSession_wipesPersistedPendingCategories() {
        manager.updatePrivacy { $0.showOnlineStatus = false }
        manager.resetSession()

        let savedArray = UserDefaults.standard.stringArray(forKey: "meeshy_prefs_pending_categories")
        XCTAssertNil(savedArray, "pendingCategories key should be wiped on logout")
    }

    // MARK: - fetchFromBackend / applyRemote integration (cold-boot reconciliation)
    //
    // `UserPreferencesManager` is a singleton with a private `init()`, so a
    // real relaunch cannot be simulated by constructing a fresh instance.
    // Instead we drive the EXACT reload path `init()` uses
    // (`UserPreferencesManager.loadPendingCategories()`) after manually
    // dropping the in-memory `pendingCategories`, which is what a process
    // kill does for real. `service` is swapped for a mock so
    // `fetchFromBackend()` never touches the network, and
    // `isAuthenticatedOverride` bypasses the real `AuthManager.shared`
    // singleton (see `tearDown` for why).

    func test_fetchFromBackend_afterSimulatedRelaunch_preservesNotYetConfirmedLocalChange() async {
        let mock = MockPreferenceService()
        manager.service = mock
        manager.isAuthenticatedOverride = { true }

        manager.updatePrivacy { $0.showOnlineStatus = false }
        XCTAssertTrue(manager.pendingCategories.contains(.privacy), "precondition: local change marked pending")

        // Simulate process kill + relaunch: in-memory state is dropped,
        // then re-hydrated from UserDefaults via the same path `init()` uses.
        manager.pendingCategories.removeAll()
        manager.pendingCategories = UserPreferencesManager.loadPendingCategories() ?? []
        XCTAssertTrue(manager.pendingCategories.contains(.privacy), "precondition: pending flag survives relaunch via persisted UserDefaults")

        // Stale server value predating the local change (defaults: true).
        mock.allPreferencesResult = .defaults

        await manager.fetchFromBackend()

        XCTAssertFalse(manager.privacy.showOnlineStatus, "cold-boot reconciliation must not clobber a not-yet-confirmed local change with a stale server value")
        XCTAssertEqual(mock.getAllPreferencesCallCount, 1, "precondition: fetchFromBackend actually called the (mocked) network")
    }

    func test_fetchFromBackend_categoryNotPending_appliesRemoteValue() async {
        let mock = MockPreferenceService()
        manager.service = mock
        manager.isAuthenticatedOverride = { true }

        var remote = UserPreferences.defaults
        remote.privacy.showOnlineStatus = false
        mock.allPreferencesResult = remote

        await manager.fetchFromBackend()

        XCTAssertFalse(manager.privacy.showOnlineStatus, "no local pending edit for .privacy — remote value applies normally")
    }

    // MARK: - resumeOrphanedPendingSyncs (gateway-delivery guarantee)
    //
    // Reproduces the reported symptom precisely: `scheduleSyncToBackend`'s
    // 1s debounce `Task` never had time to fire before the app was killed,
    // so the local value + the pending flag are durably persisted but
    // NOTHING has reached the outbox yet. `resumeOrphanedPendingSyncs` is
    // what `observeAuth()` calls on the next authenticated boot.

    func test_resumeOrphanedPendingSyncs_deliversMutation_forCategoryNeverEnqueued() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)
        await OfflineQueue.shared.clearAll()

        manager.isAuthenticatedOverride = { true }

        // `updatePrivacy` marks `.privacy` pending synchronously and starts
        // the 1s debounce — deliberately NOT awaited here, simulating a kill
        // that happens before it fires.
        manager.updatePrivacy { $0.showOnlineStatus = false }
        let countBeforeResume = try await pool.read { db in try OutboxRecord.fetchCount(db) }
        XCTAssertEqual(countBeforeResume, 0, "precondition: debounce hasn't fired yet, nothing enqueued")

        await manager.resumeOrphanedPendingSyncs([.privacy])

        let countAfterResume = try await pool.read { db in try OutboxRecord.fetchCount(db) }
        XCTAssertGreaterThanOrEqual(countAfterResume, 1, "an orphaned pending category must reach the outbox without waiting for the 1s debounce — this is the reported symptom: the PATCH never reaching the gateway")
        XCTAssertFalse(manager.pendingCategories.contains(.privacy), "a successfully-resumed sync clears the pending flag")
    }

    func test_resumeOrphanedPendingSyncs_notAuthenticated_leavesCategoryPending() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)
        await OfflineQueue.shared.clearAll()

        manager.isAuthenticatedOverride = { false }
        manager.pendingCategories = [.privacy]

        await manager.resumeOrphanedPendingSyncs([.privacy])

        let count = try await pool.read { db in try OutboxRecord.fetchCount(db) }
        XCTAssertEqual(count, 0, "not authenticated yet — must not attempt delivery")
    }

    // MARK: - namesUserLevelCategory (scope de la diffusion — décision pure)
    //
    // `user:preferences-updated` est une UNION de trois scopes sur un seul nom
    // d'événement. Ce prédicat est ce qui empêche la relecture des sept blocs
    // user-level de partir sur un scope qui ne la concerne pas.

    func test_namesUserLevelCategory_acceptsEverySevenServerCategories() {
        for category in PreferenceCategory.allCases {
            let event = UserPreferencesUpdatedEvent(userId: "u1", category: category.rawValue)
            XCTAssertTrue(
                UserPreferencesManager.namesUserLevelCategory(event),
                "les sept noms du gateway (preferences-broadcast.ts) doivent tous déclencher : \(category.rawValue)"
            )
        }
    }

    func test_namesUserLevelCategory_rejectsEventNamingAConversation() {
        let event = UserPreferencesUpdatedEvent(
            userId: "u1", category: PreferenceCategory.notification.rawValue, conversationId: "conv1"
        )

        XCTAssertFalse(
            UserPreferencesManager.namesUserLevelCategory(event),
            "un scope conversation ne doit JAMAIS coûter un GET /me/preferences complet, même quand son `category` porte par hasard un nom user-level"
        )
    }

    func test_namesUserLevelCategory_rejectsUnknownCategoryName() {
        for unknown in ["pin", "mute", "reaction", "conversation", ""] {
            let event = UserPreferencesUpdatedEvent(userId: "u1", category: unknown)
            XCTAssertFalse(
                UserPreferencesManager.namesUserLevelCategory(event),
                "une catégorie hors des sept noms gelés n'est pas une raison de relire : \(unknown)"
            )
        }
    }

    // MARK: - observeRemotePreferenceBroadcast (le troisième déclencheur)
    //
    // Le déclencheur VIF, à côté des deux déclencheurs de cycle de vie. Les
    // témoins ci-dessous poussent leur propre sujet dans le seam d'injection
    // plutôt que le publisher du socket partagé.

    func test_remoteBroadcast_categoryScope_refetchesAndAppliesRemoteValue() async throws {
        let mock = MockPreferenceService()
        manager.service = mock
        manager.isAuthenticatedOverride = { true }
        var remote = UserPreferences.defaults
        remote.notification.newMessageEnabled = false
        mock.allPreferencesResult = remote

        let subject = PassthroughSubject<UserPreferencesUpdatedEvent, Never>()
        manager.observeRemotePreferenceBroadcast(subject.eraseToAnyPublisher())

        subject.send(UserPreferencesUpdatedEvent(userId: "u1", category: "notification"))
        await Self.settleCoalescingWindow()

        XCTAssertEqual(mock.getAllPreferencesCallCount, 1,
                       "une diffusion de scope catégorie relit — sans attendre un retour au premier plan")
        XCTAssertFalse(manager.notification.newMessageEnabled,
                       "et la valeur relue atteint le bloc en mémoire")
    }

    func test_remoteBroadcast_burstOfSevenCategories_collapsesIntoASingleRead() async throws {
        let mock = MockPreferenceService()
        manager.service = mock
        manager.isAuthenticatedOverride = { true }
        mock.allPreferencesResult = .defaults

        let subject = PassthroughSubject<UserPreferencesUpdatedEvent, Never>()
        manager.observeRemotePreferenceBroadcast(subject.eraseToAnyPublisher())

        // `DELETE /me/preferences` émet UNE FOIS PAR CATÉGORIE effacée, et il
        // n'existe pas de GET par catégorie : sans regroupement, une remise à
        // zéro globale coûte sept lectures complètes.
        for category in PreferenceCategory.allCases {
            subject.send(UserPreferencesUpdatedEvent(userId: "u1", category: category.rawValue))
        }
        await Self.settleCoalescingWindow()

        XCTAssertEqual(mock.getAllPreferencesCallCount, 1,
                       "sept événements pour un geste ⇒ une seule relecture")
    }

    func test_remoteBroadcast_conversationScope_doesNotRefetch() async throws {
        let mock = MockPreferenceService()
        manager.service = mock
        manager.isAuthenticatedOverride = { true }
        mock.allPreferencesResult = .defaults

        let subject = PassthroughSubject<UserPreferencesUpdatedEvent, Never>()
        manager.observeRemotePreferenceBroadcast(subject.eraseToAnyPublisher())

        subject.send(UserPreferencesUpdatedEvent(
            userId: "u1", category: "notification", conversationId: "conv1", isPinned: true
        ))
        await Self.settleCoalescingWindow()

        XCTAssertEqual(mock.getAllPreferencesCallCount, 0,
                       "chaque épinglage venu d'un autre appareil ne doit pas coûter une lecture des sept blocs")
    }

    func test_remoteBroadcast_notAuthenticated_doesNotRefetch() async throws {
        let mock = MockPreferenceService()
        manager.service = mock
        manager.isAuthenticatedOverride = { false }
        mock.allPreferencesResult = .defaults

        let subject = PassthroughSubject<UserPreferencesUpdatedEvent, Never>()
        manager.observeRemotePreferenceBroadcast(subject.eraseToAnyPublisher())

        subject.send(UserPreferencesUpdatedEvent(userId: "u1", category: "privacy"))
        await Self.settleCoalescingWindow()

        XCTAssertEqual(mock.getAllPreferencesCallCount, 0,
                       "la garde d'authentification de fetchFromBackend vaut aussi sur ce chemin")
    }

    /// L'ÉCHO. Le gateway renvoie la diffusion au compte ÉMETTEUR : l'appareil
    /// qui vient de basculer un interrupteur reçoit l'annonce de son propre
    /// geste, et la relecture qu'elle déclenche court contre le PATCH encore
    /// en vol. Sans le veto `pendingCategories`, le réglage que l'utilisateur
    /// vient de changer REVIENT tout seul à l'ancienne valeur — pire qu'un
    /// réglage périmé, puisqu'il l'a vu changer puis se défaire (cycle 132,
    /// leçon 310, tranchée ici par le veto qui existait déjà).
    func test_remoteBroadcast_echoOfOwnPendingEdit_doesNotUndoTheGesture() async throws {
        let mock = MockPreferenceService()
        manager.service = mock
        manager.isAuthenticatedOverride = { true }
        // Valeur SERVEUR périmée : celle d'avant le geste local.
        mock.allPreferencesResult = .defaults
        XCTAssertTrue(UserNotificationPreferences.defaults.newMessageEnabled,
                      "précondition : la valeur serveur périmée est bien l'inverse du geste ci-dessous")

        manager.updateNotification { $0.newMessageEnabled = false }
        XCTAssertTrue(manager.pendingCategories.contains(.notification),
                      "précondition : le geste local est marqué pending avant son debounce")

        let subject = PassthroughSubject<UserPreferencesUpdatedEvent, Never>()
        manager.observeRemotePreferenceBroadcast(subject.eraseToAnyPublisher())

        subject.send(UserPreferencesUpdatedEvent(userId: "u1", category: "notification"))
        await Self.settleCoalescingWindow()

        XCTAssertEqual(mock.getAllPreferencesCallCount, 1, "précondition : la relecture a bien eu lieu")
        XCTAssertFalse(manager.notification.newMessageEnabled,
                       "l'écho de son propre geste ne doit pas rendre à l'utilisateur la valeur qu'il vient de quitter")
    }

    /// Attend la fenêtre de regroupement de production, plus une marge pour le
    /// `Task` que le sink lance et le hop d'acteur de `fetchFromBackend()`.
    /// La fenêtre est LUE sur le code de production, jamais recopiée.
    private static func settleCoalescingWindow() async {
        let window = UserPreferencesManager.remoteRefreshCoalescingWindow
        try? await Task.sleep(nanoseconds: UInt64((window + 0.35) * 1_000_000_000))
    }
}

// MARK: - Test Doubles

/// Minimal `PreferenceServiceProviding` conformer for
/// `UserPreferencesManagerTests`' `fetchFromBackend()` integration tests.
/// Only `getAllPreferences` is exercised by those tests; every other
/// requirement is stubbed to a harmless default since the protocol has no
/// default implementation for them (see the cache-first accessors, which
/// DO have one, in `PreferenceService.swift`).
private final class MockPreferenceService: PreferenceServiceProviding, @unchecked Sendable {
    var allPreferencesResult: UserPreferences?
    private(set) var getAllPreferencesCallCount = 0

    func getCategories() async throws -> [ConversationCategory] { [] }

    func getConversationPreferences(conversationId: String) async throws -> APIConversationPreferences {
        throw MockPreferenceServiceError.notStubbed
    }

    func updateConversationPreferences(conversationId: String, request: UpdateConversationPreferencesRequest) async throws {}

    func patchCategory(id: String, isExpanded: Bool) async throws {}

    func getAllPreferences() async throws -> UserPreferences {
        getAllPreferencesCallCount += 1
        guard let allPreferencesResult else { throw MockPreferenceServiceError.notStubbed }
        return allPreferencesResult
    }

    func patchPreferences<T: Encodable>(category: PreferenceCategory, body: T) async throws {}

    func resetPreferences(category: PreferenceCategory) async throws {}

    func createCategory(name: String, color: String?, icon: String?) async throws -> ConversationCategory {
        throw MockPreferenceServiceError.notStubbed
    }

    func getMyConversationTags() async throws -> [String] { [] }
}

private enum MockPreferenceServiceError: Error {
    case notStubbed
}
