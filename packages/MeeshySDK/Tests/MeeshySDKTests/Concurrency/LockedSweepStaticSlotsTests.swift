import XCTest
@testable import MeeshySDK

final class LockedSweepStaticSlotsTests: XCTestCase {

    private final class Recorder: @unchecked Sendable {
        private let lock = NSLock()
        private var storedCount = 0
        func hit() { lock.withLock { storedCount += 1 } }
        var count: Int { lock.withLock { storedCount } }
    }

    func test_testHook_installedThenTriggered_receivesBothEvents() {
        let recorder = Recorder()
        CryptoSignposts.testHook = { _ in recorder.hit() }
        defer { CryptoSignposts.testHook = nil }

        CryptoSignposts.beginDecrypt(messageId: "m1")
        CryptoSignposts.endDecrypt(messageId: "m1", bytes: 12)

        XCTAssertEqual(recorder.count, 2)
    }

    func test_testHook_removed_receivesNothing() {
        let recorder = Recorder()
        CryptoSignposts.testHook = { _ in recorder.hit() }
        CryptoSignposts.testHook = nil

        CryptoSignposts.beginDecrypt(messageId: "m1")

        XCTAssertEqual(recorder.count, 0)
        XCTAssertNil(CryptoSignposts.testHook)
    }

    func test_testHook_concurrentInstallAndTrigger_neverCrashes() async {
        let recorder = Recorder()
        defer { CryptoSignposts.testHook = nil }
        await withTaskGroup(of: Void.self) { group in
            for index in 0..<500 {
                group.addTask {
                    if index % 3 == 0 {
                        CryptoSignposts.testHook = { _ in recorder.hit() }
                    } else if index % 3 == 1 {
                        CryptoSignposts.testHook = nil
                    } else {
                        CryptoSignposts.beginDecrypt(messageId: "m\(index)")
                    }
                }
            }
        }
        CryptoSignposts.testHook = { _ in recorder.hit() }
        let before = recorder.count
        CryptoSignposts.beginDecrypt(messageId: "last")
        XCTAssertEqual(recorder.count, before + 1)
    }
}
