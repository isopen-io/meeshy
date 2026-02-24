import os

public extension Logger {
    static let network = Logger(subsystem: "com.meeshy.app", category: "network")
    static let auth = Logger(subsystem: "com.meeshy.app", category: "auth")
    static let messages = Logger(subsystem: "com.meeshy.app", category: "messages")
    static let media = Logger(subsystem: "com.meeshy.app", category: "media")
    static let socket = Logger(subsystem: "com.meeshy.app", category: "socket")
    static let cache = Logger(subsystem: "com.meeshy.app", category: "cache")
    static let ui = Logger(subsystem: "com.meeshy.app", category: "ui")
}
