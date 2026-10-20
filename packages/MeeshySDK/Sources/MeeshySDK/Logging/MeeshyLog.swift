import Foundation
import os

public enum MeeshyLog {
    public static let subsystem = "me.meeshy.app"

    public enum Category: String, Sendable, CaseIterable {
        case network
        case auth
        case messages
        case media
        case socket
        case cache
        case ui
        case pip
        case grdb
    }

    public static let recorder: any ErrorRecording = OSLogErrorRecorder()

    public static func logger(_ category: Category) -> Logger {
        Logger(subsystem: subsystem, category: category.rawValue)
    }

    public static func record(
        _ error: any Error,
        context: StaticString,
        category: Category,
        recorder: any ErrorRecording = MeeshyLog.recorder
    ) {
        recorder.record(
            RecordedFailure(
                context: context.description,
                category: category,
                errorType: String(reflecting: type(of: error)),
                message: error.localizedDescription
            )
        )
    }
}
