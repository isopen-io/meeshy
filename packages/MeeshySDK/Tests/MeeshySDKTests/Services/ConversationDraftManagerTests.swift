import XCTest
import GRDB
@testable import MeeshySDK

/// Tests for Task 2.2 of the iOS Local-First Wave 1 plan: per-conversation
/// message draft persistence backed by `CacheCoordinator.drafts`.
///
/// The actor is exercised against a `CacheCoordinator` bound to an in-memory
/// GRDB database (same harness used by `CacheBackgroundFlushTests`) so the
/// tests stay isolated from the `.shared` singleton and don't leak state
/// across runs.
final class ConversationDraftManagerTests: XCTestCase {

    private func makeCoordinator() throws -> CacheCoordinator {
        let dbQueue = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: dbQueue)
        return CacheCoordinator(
            messageSocket: MockMessageSocket(),
            socialSocket: MockSocialSocket(),
            db: dbQueue
        )
    }

    func test_save_and_load_returnsLatestText() async throws {
        let coordinator = try makeCoordinator()
        let manager = ConversationDraftManager(cache: coordinator, debounce: 0.01)

        await manager.save("Hello world", for: "conv1")
        try await Task.sleep(nanoseconds: 80_000_000) // 80 ms — gives the debounced write room to land

        let restored = await manager.draft(for: "conv1")
        XCTAssertEqual(restored, "Hello world")
    }

    func test_save_debouncesMultipleWrites_lastOneWins() async throws {
        let coordinator = try makeCoordinator()
        let manager = ConversationDraftManager(cache: coordinator, debounce: 0.05)

        // Hammer the manager with five quick writes — earlier ones should be
        // cancelled and the last one (e) is the one that hits the cache.
        for char in "abcde" {
            await manager.save(String(char), for: "conv1")
        }
        try await Task.sleep(nanoseconds: 150_000_000) // 150 ms — well past the 50 ms debounce

        let saved = await manager.draft(for: "conv1")
        XCTAssertEqual(saved, "e")
    }

    func test_save_emptyString_clearsDraftImmediately() async throws {
        let coordinator = try makeCoordinator()
        // Long debounce intentionally — proves the empty-path bypasses it.
        let manager = ConversationDraftManager(cache: coordinator, debounce: 0.5)

        await manager.save("typed something", for: "conv1")
        try await Task.sleep(nanoseconds: 600_000_000) // wait past the 500 ms debounce
        let typed = await manager.draft(for: "conv1")
        XCTAssertEqual(typed, "typed something")

        await manager.save("", for: "conv1")
        try await Task.sleep(nanoseconds: 60_000_000) // empty path has no debounce, but allow the invalidate to commit
        let cleared = await manager.draft(for: "conv1")
        XCTAssertNil(cleared)
    }

    func test_clear_removesDraft() async throws {
        let coordinator = try makeCoordinator()
        let manager = ConversationDraftManager(cache: coordinator, debounce: 0.01)

        await manager.save("draft", for: "conv1")
        try await Task.sleep(nanoseconds: 80_000_000)
        let saved = await manager.draft(for: "conv1")
        XCTAssertEqual(saved, "draft")

        await manager.clear(for: "conv1")
        let afterClear = await manager.draft(for: "conv1")
        XCTAssertNil(afterClear)
    }

    func test_draft_isIsolatedPerConversation() async throws {
        let coordinator = try makeCoordinator()
        let manager = ConversationDraftManager(cache: coordinator, debounce: 0.01)

        await manager.save("for A", for: "convA")
        await manager.save("for B", for: "convB")
        try await Task.sleep(nanoseconds: 100_000_000)

        let a1 = await manager.draft(for: "convA")
        let b1 = await manager.draft(for: "convB")
        XCTAssertEqual(a1, "for A")
        XCTAssertEqual(b1, "for B")

        await manager.clear(for: "convA")
        let a2 = await manager.draft(for: "convA")
        let b2 = await manager.draft(for: "convB")
        XCTAssertNil(a2)
        XCTAssertEqual(b2, "for B")
    }
}
