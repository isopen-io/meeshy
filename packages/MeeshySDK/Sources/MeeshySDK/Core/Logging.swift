import os

public extension Logger {
    static let network = Logger(subsystem: "me.meeshy.app", category: "network")
    static let auth = Logger(subsystem: "me.meeshy.app", category: "auth")
    static let messages = Logger(subsystem: "me.meeshy.app", category: "messages")
    static let media = Logger(subsystem: "me.meeshy.app", category: "media")
    static let socket = Logger(subsystem: "me.meeshy.app", category: "socket")
    static let cache = Logger(subsystem: "me.meeshy.app", category: "cache")
    static let ui = Logger(subsystem: "me.meeshy.app", category: "ui")
}
