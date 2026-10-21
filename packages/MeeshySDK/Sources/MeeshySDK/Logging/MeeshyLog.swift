import Foundation
import os

public enum MeeshyLog {
    public static let subsystem = Subsystem.app.rawValue

    public static let recorder: any ErrorRecording = OSLogErrorRecorder()

    public static func address(_ category: Category, subsystem: Subsystem = .app) -> LogAddress {
        LogAddress(subsystem: subsystem.rawValue, category: category.rawValue)
    }

    public static func logger(_ category: Category, subsystem: Subsystem = .app) -> Logger {
        let target = address(category, subsystem: subsystem)
        return Logger(subsystem: target.subsystem, category: target.category)
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
