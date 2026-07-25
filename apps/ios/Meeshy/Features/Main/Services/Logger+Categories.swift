import os

extension Logger {
    nonisolated static let messages = Logger(subsystem: "me.meeshy.app", category: "messages")
    nonisolated static let socket = Logger(subsystem: "me.meeshy.app", category: "socket")
    nonisolated static let e2ee = Logger(subsystem: "me.meeshy.app", category: "e2ee")
    nonisolated static let crash = Logger(subsystem: "me.meeshy.app", category: "crash")
    nonisolated static let network = Logger(subsystem: "me.meeshy.app", category: "network")
    nonisolated static let stories = Logger(subsystem: "me.meeshy.app", category: "stories")
    nonisolated static let navigation = Logger(subsystem: "me.meeshy.app", category: "navigation")
    nonisolated static let settings = Logger(subsystem: "me.meeshy.app", category: "settings")
}
