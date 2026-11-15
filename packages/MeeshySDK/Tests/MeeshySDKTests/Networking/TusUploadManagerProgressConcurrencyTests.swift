import XCTest
import Combine
@testable import MeeshySDK

final class TusUploadManagerProgressConcurrencyTests: XCTestCase {

    private func makeManager() -> TusUploadManager {
        TusUploadManager(baseURL: URL(string: "https://127.0.0.1:9")!)
    }

    private func subscribeConcurrently(
        to manager: TusUploadManager,
        count: Int,
        received: Locked<[Int]>,
        bag: Locked<[AnyCancellable]>
    ) async {
        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<count {
                group.addTask {
                    let token = manager.progressPublisher.sink { progress in
                        received.mutate { $0.append(progress.totalFiles) }
                    }
                    bag.mutateUnchecked { $0.append(token) }
                }
            }
        }
    }

    func test_subscribersAttachedBeforeTheEmission_allReceiveTheExpectedBatch() async {
        let manager = makeManager()
        let received = Locked([Int]())
        let bag = Locked(uncheckedState: [AnyCancellable]())
        await subscribeConcurrently(to: manager, count: 100, received: received, bag: bag)

        await manager.setExpectedBatch(totalFiles: 3, totalBytes: 30)

        let values = received.read { $0 }
        XCTAssertEqual(values.count, 100)
        XCTAssertTrue(values.allSatisfy { $0 == 3 })
    }

    func test_subscribingWhileTheActorEmits_neverCrashesNorDeliversATornValue() async {
        let manager = makeManager()
        let received = Locked([Int]())
        let bag = Locked(uncheckedState: [AnyCancellable]())
        async let emission: Void = manager.setExpectedBatch(totalFiles: 3, totalBytes: 30)
        await subscribeConcurrently(to: manager, count: 100, received: received, bag: bag)
        await emission

        XCTAssertTrue(received.read { $0 }.allSatisfy { $0 == 3 })
    }
}
