import Foundation
import MeeshySDK
import os

struct CallPersistedQualitySummary: Codable, Sendable {
    let callId: String?
    let remoteUser: String?
    let durationSeconds: TimeInterval
    let endReason: String
    let stats: CallStats?
}

protocol CallQualitySummaryStoring {
    func read() -> CallPersistedQualitySummary?
    func persist(stats: CallStats?, callId: String?, duration: TimeInterval, remote: String?, reason: CallEndReason)
}

struct CallQualitySummaryStore: CallQualitySummaryStoring {
    static let defaultsKey = "me.meeshy.lastCallQualitySummary"

    var defaults: UserDefaults = .standard

    func read() -> CallPersistedQualitySummary? {
        guard let data = defaults.data(forKey: Self.defaultsKey) else { return nil }
        return JSONDecoder().decodeOrLog(CallPersistedQualitySummary.self, from: data,
                                         field: "last call summary", logger: Logger.calls)
    }

    func persist(
        stats: CallStats?,
        callId: String?,
        duration: TimeInterval,
        remote: String?,
        reason: CallEndReason
    ) {
        let summary = CallPersistedQualitySummary(
            callId: callId,
            remoteUser: remote,
            durationSeconds: duration,
            endReason: String(describing: reason),
            stats: stats
        )
        guard let data = JSONEncoder().encodeOrLog(summary, field: "call summary",
                                                   id: callId ?? "-", logger: Logger.calls) else { return }
        defaults.set(data, forKey: Self.defaultsKey)
    }
}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
