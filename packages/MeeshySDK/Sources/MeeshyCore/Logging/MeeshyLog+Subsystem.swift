public extension MeeshyLog {
    enum Subsystem: String, Sendable, CaseIterable {
        case app = "me.meeshy.app"
        case sdk = "me.meeshy.sdk"
        case legacySDK = "com.meeshy.sdk"
        case legacyApp = "com.meeshy.app"
        case legacyIOS = "com.meeshy.ios"
        case notificationContent = "me.meeshy.app.notification-content"
    }
}

public struct LogAddress: Equatable, Sendable {
    public let subsystem: String
    public let category: String

    public init(subsystem: String, category: String) {
        self.subsystem = subsystem
        self.category = category
    }
}
