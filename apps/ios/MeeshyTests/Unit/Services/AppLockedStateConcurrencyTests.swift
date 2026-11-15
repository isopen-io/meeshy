import XCTest
import MeeshySDK
@testable import Meeshy

final class AppLockedStateConcurrencyTests: XCTestCase {

    private let iterations = 1000

    private func freshDefaults() -> UserDefaults {
        let name = "AppLockedStateConcurrencyTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    @MainActor
    func test_locallyHiddenMessagesStore_concurrentHide_keepsEveryId() async {
        let store = LocallyHiddenMessagesStore(userDefaults: freshDefaults())
        await withTaskGroup(of: Void.self) { group in
            for index in 0..<iterations {
                group.addTask { @MainActor in store.hide("message-\(index)") }
            }
        }
        XCTAssertEqual(store.allHiddenIds.count, iterations)
        XCTAssertTrue(store.isHidden("message-\(iterations - 1)"))
    }

    @MainActor
    func test_editHistoryStore_concurrentAppend_keepsEveryRevisionUpToItsBound() async {
        let store = EditHistoryStore(userDefaults: freshDefaults())
        await withTaskGroup(of: Void.self) { group in
            for index in 0..<20 {
                group.addTask { @MainActor in store.recordRevision(messageId: "m1", previousContent: "v\(index)") }
            }
        }
        XCTAssertEqual(store.revisions(for: "m1").count, 20)
    }

    func test_photoKitResumeLatch_concurrentClaim_hasExactlyOneWinner() async {
        let latch = PhotoKitResumeLatch()
        let winners = await withTaskGroup(of: Bool.self, returning: Int.self) { group in
            for _ in 0..<iterations { group.addTask { latch.claim() } }
            return await group.reduce(0) { $0 + ($1 ? 1 : 0) }
        }
        XCTAssertEqual(winners, 1)
    }

    func test_backgroundTaskCompletion_concurrentComplete_deliversOnce() async {
        let deliveries = Locked(0)
        let completion = BackgroundTaskCompletion { _ in deliveries.mutate { $0 += 1 } }
        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<iterations { group.addTask { completion.complete(success: true) } }
        }
        XCTAssertEqual(deliveries.read { $0 }, 1)
    }

    @MainActor
    func test_localLiveCallProvider_subscriberMayReenterWithoutDeadlock() {
        let provider = LocalLiveCallProvider()
        let seen = Locked(0)
        _ = provider.onChange { conversationId, _ in
            _ = provider.liveCallFor(conversationId: conversationId)
            seen.mutate { $0 += 1 }
        }
        provider.noteLiveCall(nil, for: "c1")
        XCTAssertEqual(seen.read { $0 }, 1)
    }

    func test_composerFrameGate_concurrentAdmit_neverCrashesAndKeepsFps() async {
        let gate = ComposerFrameGate(fps: 30)
        await withTaskGroup(of: Void.self) { group in
            for index in 0..<iterations {
                group.addTask { _ = gate.admit(presentedAt: Double(index) / 60) }
            }
        }
        gate.setFPS(60)
        XCTAssertEqual(gate.fps, 60)
    }
}
