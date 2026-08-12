import XCTest
import Combine
import MeeshySDK
@testable import MeeshyUI

@MainActor
final class SharedAVPlayerWatchSampleTests: XCTestCase {
    func test_emitWatchSample_publishesPositionAndOffset() {
        let manager = SharedAVPlayerManager.shared
        var received: [WatchSample] = []
        let c = manager.watchSamples.sink { received.append($0) }
        defer { c.cancel() }

        manager.emitWatchSampleForTesting(positionMs: 2500, atMs: 2500)

        XCTAssertEqual(received.count, 1)
        XCTAssertEqual(received.first?.positionMs, 2500)
        XCTAssertEqual(received.first?.atMs, 2500)
    }
}
