import Foundation
import os.signpost

public enum CryptoSignposts {
    public enum Event: Sendable {
        case beginDecrypt(messageId: String)
        case endDecrypt(messageId: String, bytes: Int)
    }

    private static let log = OSLog(subsystem: "me.meeshy.app", category: .pointsOfInterest)

    private static let testHookSlot = Locked<(@Sendable (Event) -> Void)?>(nil)

    public static var testHook: (@Sendable (Event) -> Void)? {
        get { testHookSlot.read { $0 } }
        set { testHookSlot.mutate { $0 = newValue } }
    }

    public static func beginDecrypt(messageId: String) {
        testHook?(.beginDecrypt(messageId: messageId))
        os_signpost(.begin, log: log, name: "decrypt", "%{public}s", messageId)
    }

    public static func endDecrypt(messageId: String, bytes: Int) {
        testHook?(.endDecrypt(messageId: messageId, bytes: bytes))
        os_signpost(.end, log: log, name: "decrypt", "bytes=%d", bytes)
    }
}
