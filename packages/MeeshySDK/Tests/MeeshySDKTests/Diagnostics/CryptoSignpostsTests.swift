import XCTest
@testable import MeeshySDK

final class CryptoSignpostsTests: XCTestCase {

    func test_decryptInterval_emitsSignpost() {
        let counter = SignpostCounter()
        CryptoSignposts.testHook = { event in counter.record(event) }
        defer { CryptoSignposts.testHook = nil }

        CryptoSignposts.beginDecrypt(messageId: "msg-1")
        CryptoSignposts.endDecrypt(messageId: "msg-1", bytes: 256)

        XCTAssertEqual(counter.events, ["begin:msg-1", "end:msg-1:256"])
    }
}

private final class SignpostCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var _events: [String] = []
    var events: [String] {
        lock.lock(); defer { lock.unlock() }
        return _events
    }
    func record(_ event: CryptoSignposts.Event) {
        lock.lock(); defer { lock.unlock() }
        switch event {
        case .beginDecrypt(let id): _events.append("begin:\(id)")
        case .endDecrypt(let id, let bytes): _events.append("end:\(id):\(bytes)")
        }
    }
}
