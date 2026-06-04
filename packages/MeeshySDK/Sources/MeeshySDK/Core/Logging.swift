import os

public extension Logger {
    nonisolated static let network = Logger(subsystem: "me.meeshy.app", category: "network")
    nonisolated static let auth = Logger(subsystem: "me.meeshy.app", category: "auth")
    nonisolated static let messages = Logger(subsystem: "me.meeshy.app", category: "messages")
    nonisolated static let media = Logger(subsystem: "me.meeshy.app", category: "media")
    nonisolated static let socket = Logger(subsystem: "me.meeshy.app", category: "socket")
    nonisolated static let cache = Logger(subsystem: "me.meeshy.app", category: "cache")
    nonisolated static let ui = Logger(subsystem: "me.meeshy.app", category: "ui")
}
