import os

public extension Logger {
    nonisolated static let network = MeeshyLog.logger(.network)
    nonisolated static let auth = MeeshyLog.logger(.auth)
    nonisolated static let messages = MeeshyLog.logger(.messages)
    nonisolated static let media = MeeshyLog.logger(.media)
    nonisolated static let socket = MeeshyLog.logger(.socket)
    nonisolated static let cache = MeeshyLog.logger(.cache)
    nonisolated static let ui = MeeshyLog.logger(.ui)
    nonisolated static let pip = MeeshyLog.logger(.pip)
}
