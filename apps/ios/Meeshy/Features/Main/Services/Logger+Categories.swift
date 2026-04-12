import os

extension Logger {
    nonisolated static let messages = Logger(subsystem: "me.meeshy.app", category: "messages")
    nonisolated static let socket = Logger(subsystem: "me.meeshy.app", category: "socket")
    nonisolated static let e2ee = Logger(subsystem: "me.meeshy.app", category: "e2ee")
}
