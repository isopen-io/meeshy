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

    func test_v2Hub_installedThenEmitted_deliversTheEvent_andConcurrentUseNeverCrashes() async throws {
        let hub = SocialEventsV2Hub()
        let recorder = Recorder()
        let event = try XCTUnwrap(SocialNotificationEvents.event(.received, userInfo: ["notificationId": "a"], at: Date()))
        hub.install { _ in recorder.hit() }

        await withTaskGroup(of: Void.self) { group in
            for index in 0..<400 {
                group.addTask {
                    if index % 4 == 0 {
                        hub.install { _ in recorder.hit() }
                    } else {
                        hub.emit(event)
                    }
                }
            }
        }

        XCTAssertEqual(recorder.count, 300)
    }

    func test_consentSource_withoutInstall_isNil_thenServesTheInstalledRule() async {
        let source = SocialEventsConsentSource()
        let before = await source.current()
        XCTAssertNil(before)

        source.install { nil }
        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<200 {
                group.addTask {
                    source.install { nil }
                    _ = await source.current()
                }
            }
        }
        let after = await source.current()
        XCTAssertNil(after)
    }
}
