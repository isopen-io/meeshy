import XCTest
import GRDB
@testable import MeeshySDK

/// T5 — Logout must purge the per-user preference stores.
///
/// `CacheCoordinator.reset()` (logout) invalidated ~24 stores but omitted the
/// four preference stores (categories / userTags / userPreferences /
/// conversationPreferences). They are NOT userId-namespaced and the coordinator
/// is a process-lifetime singleton, so their in-memory L1 survived logout —
/// user B logging in next on the same device read user A's cached categories,
/// tags, translation/theme prefs, and per-conversation pin/mute/archive from L1
/// (PreferenceService reads cache-first). A dirty pref could even be re-flushed
/// to L2 after the reset by its still-scheduled debounce task.
final class CacheCoordinatorLogoutPurgeTests: XCTestCase {

    private func makeDB() throws -> DatabaseQueue {
        let dbQueue = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: dbQueue)
        return dbQueue
    }

    private func makeCoordinator(db: DatabaseQueue) -> CacheCoordinator {
        CacheCoordinator(messageSocket: MockMessageSocket(), socialSocket: MockSocialSocket(), db: db)
    }

    private func populatePreferenceStores(_ c: CacheCoordinator) async throws {
        try await c.categories.save([ConversationCategory(id: "c1", name: "Work", color: nil, icon: nil, order: 0, isExpanded: true)], for: "list")
        try await c.userTags.save([ConversationTagEntry(name: "urgent")], for: "list")
        try await c.userPreferences.save([PreferenceValue(id: "all", value: UserPreferences.defaults)], for: "all")
        try await c.conversationPreferences.save([PreferenceValue(id: "conv1", value: APIConversationPreferences(isPinned: true))], for: "conv1")
    }

    private func assertPreferenceStoresEmpty(_ c: CacheCoordinator, _ message: String) async {
        let cat = await c.categories.loadedKeys()
        let tags = await c.userTags.loadedKeys()
        let prefs = await c.userPreferences.loadedKeys()
        let convPrefs = await c.conversationPreferences.loadedKeys()
        XCTAssertTrue(cat.isEmpty, "categories L1 must be purged — \(message)")
        XCTAssertTrue(tags.isEmpty, "userTags L1 must be purged — \(message)")
        XCTAssertTrue(prefs.isEmpty, "userPreferences L1 must be purged — \(message)")
        XCTAssertTrue(convPrefs.isEmpty, "conversationPreferences L1 must be purged — \(message)")
    }

    func test_reset_purgesAllPreferenceStores() async throws {
        let db = try makeDB()
        let c = makeCoordinator(db: db)
        try await populatePreferenceStores(c)

        await c.reset()

        await assertPreferenceStoresEmpty(c, "after reset() (logout cross-account leak)")
    }

    func test_invalidateAll_purgesAllPreferenceStores() async throws {
        let db = try makeDB()
        let c = makeCoordinator(db: db)
        try await populatePreferenceStores(c)

        await c.invalidateAll()

        await assertPreferenceStoresEmpty(c, "after invalidateAll()")
    }

    /// Local-only call transcripts (never sent to the Meeshy server) must be
    /// swept on logout the same as every other disk-backed store — leaving
    /// them populated would expose user A's call transcripts to user B on
    /// the next login, the same cross-user leak class this file exists to
    /// guard against for the preference stores.
    func test_reset_purgesCallTranscripts() async throws {
        let db = try makeDB()
        let c = makeCoordinator(db: db)
        let transcript = CallTranscript(
            callId: "call-1", conversationId: "conv-1",
            callStartedAt: Date(timeIntervalSince1970: 0), segments: []
        )
        try await c.callTranscripts.save([transcript], for: "call-1")

        await c.reset()

        let result = await c.callTranscripts.load(for: "call-1")
        switch result {
        case .empty: break
        default: XCTFail("Expected callTranscripts empty after reset() (logout), got \(result)")
        }
    }
}
