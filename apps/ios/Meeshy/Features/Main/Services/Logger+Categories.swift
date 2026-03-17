import os

extension Logger {
    static let messages = Logger(subsystem: "me.meeshy.app", category: "messages")
    static let socket = Logger(subsystem: "me.meeshy.app", category: "socket")
}
