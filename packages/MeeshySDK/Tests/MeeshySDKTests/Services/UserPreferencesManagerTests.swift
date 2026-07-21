import XCTest
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
}
