import XCTest
@testable import MeeshySDK

final class ConversationSyncEngineConcurrencyTests: XCTestCase {

    private func makeEngine() -> ConversationSyncEngine {
        ConversationSyncEngine(
            cache: .shared,
            conversationService: MockConversationService(),
            messageService: MockMessageService(),
            messageSocket: MockMessageSocket(),
            socialSocket: MockSocialSocket(),
            api: MockAPIClient(),
            syncDelta: MockSyncDeltaMuet()
        )
    }

    func test_concurrentOpenThenClose_leavesNothingOpenAndNeverNegativeTotal() async {
        let engine = makeEngine()
        let ids = (0..<20).map { "conc-\($0)" }
        await withTaskGroup(of: Void.self) { group in
            for index in 0..<400 {
                let id = ids[index % ids.count]
                group.addTask {
                    engine.openConversation(id)
                    engine.closeConversation(id)
                }
            }
        }
        XCTAssertTrue(engine.openConversationIds.isEmpty)
        XCTAssertTrue(ids.allSatisfy { !engine.isConversationOpen($0) })
        XCTAssertGreaterThanOrEqual(engine.totalConversationsUnreadValue, 0)
    }

    func test_nConcurrentOpens_keepTheIdOpenUntilTheNthClose() async {
        let engine = makeEngine()
        let count = 200
        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<count { group.addTask { engine.openConversation("conc-same") } }
        }
        for _ in 0..<(count - 1) { engine.closeConversation("conc-same") }
        XCTAssertTrue(engine.isConversationOpen("conc-same"))
        engine.closeConversation("conc-same")
        XCTAssertFalse(engine.isConversationOpen("conc-same"))
    }

    func test_concurrentArmReceiptWindow_succeedsExactlyOnce() async {
        let ledger = Locked(OpenConversationLedger())
        let armed = await withTaskGroup(of: Bool.self, returning: Int.self) { group in
            for _ in 0..<200 {
                group.addTask { ledger.mutate { $0.armReceiptWindow("conc-window") { Task {} } } }
            }
            return await group.reduce(0) { $0 + ($1 ? 1 : 0) }
        }
        XCTAssertEqual(armed, 1)
        ledger.mutate { $0.takeAllReceiptTasks() }.forEach { $0.cancel() }
    }
}
