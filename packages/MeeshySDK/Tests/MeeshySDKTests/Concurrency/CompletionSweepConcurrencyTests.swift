import XCTest
@testable import MeeshySDK

final class CompletionSweepConcurrencyTests: XCTestCase {

    private static let accesses = 500

    func test_storyDraftStore_concurrentFailureReadsAndClears_endConsistent() async {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("CompletionSweep-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = StoryDraftStore(
            dbPath: root.appendingPathComponent("absent-dir/nested.db").path,
            mediaDirectory: root.appendingPathComponent("media")
        )
        XCTAssertNotNil(store.lastPersistFailure)

        await withTaskGroup(of: Void.self) { group in
            for index in 0..<Self.accesses {
                group.addTask { @Sendable @concurrent in
                    if index.isMultiple(of: 3) {
                        store.clearPersistFailure()
                    } else {
                        _ = store.lastPersistFailure
                    }
                }
            }
        }

        store.clearPersistFailure()
        XCTAssertNil(store.lastPersistFailure)
    }

    func test_mediaSessionCoordinator_concurrentProbeAssignments_neverCrash() async {
        let coordinator = MediaSessionCoordinator.shared
        defer { coordinator.testProbe = nil }
        let probe = MediaSessionCoordinatorTestProbe()

        await withTaskGroup(of: Void.self) { group in
            for index in 0..<Self.accesses {
                group.addTask { @Sendable @concurrent in
                    coordinator.testProbe = index.isMultiple(of: 2) ? probe : nil
                    _ = coordinator.testProbe
                }
            }
        }

        coordinator.testProbe = probe
        XCTAssertTrue(coordinator.testProbe === probe)
    }
}
