import XCTest
@testable import MeeshySDK

private func makeDefaults() -> (defaults: UserDefaults, suite: String) {
    let suite = "locked-sweep-\(UUID().uuidString)"
    return (UserDefaults(suiteName: suite) ?? .standard, suite)
}

final class LockedSweepPersistedLedgersConcurrencyTests: XCTestCase {

    func test_noteReception_concurrentDatesForSameMessage_allReturnTheFirstStamp() async {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let ledger = EphemeralReceiptLedger(defaults: defaults)
        let base = Date()

        let stamps = await withTaskGroup(of: Date.self, returning: [Date].self) { group in
            for index in 0..<300 {
                group.addTask { ledger.noteReception(of: "m", at: base.addingTimeInterval(Double(index))) }
            }
            return await group.reduce(into: []) { $0.append($1) }
        }

        XCTAssertEqual(Set(stamps).count, 1)
        XCTAssertEqual(ledger.firstReception(of: "m"), stamps.first)
    }

    func test_noteDestruction_afterConcurrentReceptions_removesTheReceiptAndKeepsTheFirstDeath() async {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let ledger = EphemeralReceiptLedger(defaults: defaults)
        let base = Date()
        await withTaskGroup(of: Void.self) { group in
            for index in 0..<100 {
                group.addTask {
                    ledger.noteReception(of: "m\(index)", at: base)
                    ledger.noteDestruction(of: "m\(index)", at: base.addingTimeInterval(1))
                    ledger.noteDestruction(of: "m\(index)", at: base.addingTimeInterval(9))
                }
            }
        }

        XCTAssertNil(ledger.firstReception(of: "m7"))
        XCTAssertEqual(ledger.destruction(of: "m7"), base.addingTimeInterval(1))
    }

    func test_record_concurrentDistinctStories_allViewedAndPersisted() async {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let now = Date()
        let ledger = StoryViewedLedger(userDefaults: defaults, key: "k", now: { now })

        await withTaskGroup(of: Void.self) { group in
            for index in 0..<200 {
                group.addTask { ledger.record(storyId: "s\(index)", ownerId: "owner", at: now) }
            }
        }

        XCTAssertEqual(ledger.viewedStories(ownerId: "owner").count, 200)
        let reloaded = StoryViewedLedger(userDefaults: defaults, key: "k", now: { now })
        XCTAssertEqual(reloaded.viewedStories(ownerId: "owner").count, 200)
    }

    func test_append_concurrentEvents_drainReturnsEveryLine() async throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("locked-sweep-\(UUID().uuidString).jsonl")
        defer { try? FileManager.default.removeItem(at: file) }
        let inbox = SocialNotificationInbox(fileURL: file)
        let event = try XCTUnwrap(SocialNotificationEvents.event(.received, userInfo: ["notificationId": "a"], at: Date()))

        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<64 { group.addTask { inbox.append(event) } }
        }

        XCTAssertEqual(inbox.drain().count, 64)
        XCTAssertTrue(inbox.drain().isEmpty)
    }

    private enum Failure: Error { case network }

    private func makeFailingDependencies() -> PushDeliveryReceiptService.Dependencies {
        PushDeliveryReceiptService.Dependencies(
            markAsReceived: { _ in throw Failure.network },
            isAuthenticated: { true }
        )
    }

    func test_ack_concurrentFailuresForDistinctConversations_queueEveryReceipt() async {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let service = PushDeliveryReceiptService(dependencies: makeFailingDependencies(), defaults: defaults)

        await withTaskGroup(of: Void.self) { group in
            for index in 0..<100 {
                group.addTask { await service.ack(conversationId: "c\(index)", messageId: nil) }
            }
        }

        XCTAssertEqual(service._pendingCount(), 100)
    }

    func test_setDependencies_concurrentWithAck_neverCrashesAndEndsOnLastDependencies() async {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let service = PushDeliveryReceiptService(dependencies: makeFailingDependencies(), defaults: defaults)
        let failing = makeFailingDependencies()

        await withTaskGroup(of: Void.self) { group in
            for index in 0..<200 {
                group.addTask {
                    if index % 4 == 0 {
                        service._setDependencies(failing)
                    } else {
                        await service.ack(conversationId: "c\(index)", messageId: nil)
                    }
                }
            }
        }
        let anonymous = PushDeliveryReceiptService.Dependencies(markAsReceived: { _ in }, isAuthenticated: { false })
        service._setDependencies(anonymous)
        let before = service._pendingCount()
        await service.ack(conversationId: "last", messageId: nil)

        XCTAssertEqual(service._pendingCount(), before + 1)
    }
}
