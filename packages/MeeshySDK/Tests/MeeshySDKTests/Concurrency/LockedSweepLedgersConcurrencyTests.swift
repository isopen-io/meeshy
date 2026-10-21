import XCTest
@testable import MeeshySDK

private func makeLimit(_ limit: Int) -> DailyGestureLimit {
    DailyGestureLimit(gesture: .comment, resetAt: nil, limit: limit)
}

final class LockedSweepLedgersConcurrencyTests: XCTestCase {

    func test_record_concurrentPastCapacity_keepsAtMostCapacity_andTakeIsOneShot() async {
        let ledger = DailyGestureLimitLedger()
        await withTaskGroup(of: Void.self) { group in
            for index in 0..<500 {
                group.addTask { ledger.record(makeLimit(index), clientMutationId: "m\(index)") }
            }
        }

        let taken = (0..<500).compactMap { ledger.take(clientMutationId: "m\($0)") }
        XCTAssertLessThanOrEqual(taken.count, 64)
        XCTAssertGreaterThan(taken.count, 0)
        XCTAssertTrue((0..<500).allSatisfy { ledger.take(clientMutationId: "m\($0)") == nil })
    }

    func test_note_concurrentSurfaces_listingFindsEveryPage() async {
        let ledger = ListingContextLedger()
        let surfaces = ReachSurface.allCases
        await withTaskGroup(of: Void.self) { group in
            for (offset, surface) in surfaces.enumerated() {
                group.addTask {
                    ledger.note(surface: surface, feedRequestId: "page-\(offset)", items: [ListedItem(id: "post-\(offset)")])
                }
            }
        }

        for (offset, surface) in surfaces.enumerated() {
            let listing = ledger.listing(on: surface, postId: "post-\(offset)", position: nil)
            XCTAssertEqual(listing?.feedRequestId, "page-\(offset)")
        }
    }

    func test_reset_afterConcurrentNotes_forgetsEverything() async {
        let ledger = ListingContextLedger()
        await withTaskGroup(of: Void.self) { group in
            for index in 0..<200 {
                group.addTask {
                    ledger.note(surface: .feed, feedRequestId: "p\(index)", items: [ListedItem(id: "post-\(index)")])
                }
            }
        }
        ledger.reset()

        XCTAssertNil(ledger.listing(on: .feed, postId: "post-0", position: nil))
    }

    func test_cancel_afterConcurrentRegister_cancelsEveryRegisteredTask() async {
        let dispatches = OutboxInflightDispatches()
        let tasks = (0..<100).map { _ in Task<Void, Error> { try await Task.sleep(nanoseconds: 60_000_000_000) } }
        await withTaskGroup(of: Void.self) { group in
            for (index, task) in tasks.enumerated() {
                group.addTask { dispatches.register(task, for: "row-\(index)") }
            }
        }

        (0..<100).forEach { dispatches.cancel("row-\($0)") }

        XCTAssertTrue(tasks.allSatisfy(\.isCancelled))
    }

    func test_unregister_foreignTask_leavesTheRegisteredOneCancellable() {
        let dispatches = OutboxInflightDispatches()
        let registered = Task<Void, Error> { try await Task.sleep(nanoseconds: 60_000_000_000) }
        let foreign = Task<Void, Error> { try await Task.sleep(nanoseconds: 60_000_000_000) }
        defer { registered.cancel(); foreign.cancel() }
        dispatches.register(registered, for: "row")

        dispatches.unregister(foreign, for: "row")
        dispatches.cancel("row")

        XCTAssertTrue(registered.isCancelled)
    }

    func test_digest_concurrentSameFile_returnsOneDigest_andCountIsOne() async throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("locked-sweep-\(UUID().uuidString).bin")
        try Data("payload".utf8).write(to: file)
        defer { try? FileManager.default.removeItem(at: file) }
        let memo = FileDigestMemo(capacity: 4)

        let digests = await withTaskGroup(of: String.self, returning: [String].self) { group in
            for _ in 0..<200 {
                group.addTask { (try? memo.digest(of: file, computing: { _ in "digest" })) ?? "failed" }
            }
            return await group.reduce(into: []) { $0.append($1) }
        }

        XCTAssertEqual(Set(digests), ["digest"])
        XCTAssertEqual(memo.count, 1)
    }

    func test_digest_distinctFilesPastCapacity_keepsAtMostCapacity() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("locked-sweep-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let files = try (0..<12).map { index -> URL in
            let url = directory.appendingPathComponent("f\(index).bin")
            try Data("p\(index)".utf8).write(to: url)
            return url
        }
        let memo = FileDigestMemo(capacity: 4)

        await withTaskGroup(of: Void.self) { group in
            for file in files {
                group.addTask { _ = try? memo.digest(of: file, computing: { $0.lastPathComponent }) }
            }
        }

        XCTAssertEqual(memo.count, 4)
    }

    func test_track_concurrentDistinctUsers_belowCapacity_keepsEveryMapping() async {
        let cache = UserDisplayNameCache(capacity: 1_000)
        await withTaskGroup(of: Void.self) { group in
            for index in 0..<300 {
                group.addTask { cache.track(username: "User\(index)", displayName: "Name \(index)") }
            }
        }

        XCTAssertEqual(cache.allMappings().count, 300)
        XCTAssertEqual(cache.displayName(for: "user7"), "Name 7")
    }

    func test_trackFromMentionedUsers_concurrentBatches_neverExceedsCapacity() async {
        let cache = UserDisplayNameCache(capacity: 64)
        let batches = (0..<20).map { batch in
            (0..<30).map { index in
                MentionedUser(userId: "id\(batch)-\(index)", username: "u\(batch)-\(index)", displayName: "N\(batch)-\(index)", avatar: nil)
            }
        }
        await withTaskGroup(of: Void.self) { group in
            for batch in batches {
                group.addTask { cache.trackFromMentionedUsers(batch) }
            }
        }

        XCTAssertLessThanOrEqual(cache.allMappings().count, 64)
        XCTAssertGreaterThan(cache.allMappings().count, 0)
    }
}
