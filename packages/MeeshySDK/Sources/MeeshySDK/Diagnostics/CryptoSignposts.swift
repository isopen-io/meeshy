import Foundation
import os.signpost

public enum CryptoSignposts {
    public enum Event: Sendable {
        case beginDecrypt(messageId: String)
        case endDecrypt(messageId: String, bytes: Int)
    }

    private static let log = OSLog(subsystem: "me.meeshy.app", category: .pointsOfInterest)

    private static let _testHook = TestHookStorage()

    public static var testHook: (@Sendable (Event) -> Void)? {
        get { _testHook.value }
        set { _testHook.value = newValue }
    }

    public static func beginDecrypt(messageId: String) {
        _testHook.value?(.beginDecrypt(messageId: messageId))
        os_signpost(.begin, log: log, name: "decrypt", "%{public}s", messageId)
    }

    public static func endDecrypt(messageId: String, bytes: Int) {
        _testHook.value?(.endDecrypt(messageId: messageId, bytes: bytes))
        os_signpost(.end, log: log, name: "decrypt", "bytes=%d", bytes)
    }
}

// MARK: - Private

private final class TestHookStorage: @unchecked Sendable {
    private let lock = NSLock()
    private var _value: (@Sendable (CryptoSignposts.Event) -> Void)?

    var value: (@Sendable (CryptoSignposts.Event) -> Void)? {
        get {
            lock.lock()
            defer { lock.unlock() }
            return _value
        }
        set {
            lock.lock()
            defer { lock.unlock() }
            _value = newValue
        }
    }
}
