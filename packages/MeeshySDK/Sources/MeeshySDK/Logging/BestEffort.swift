import Foundation
import os

public struct RecordedFailure: Sendable, Equatable {
    public let context: String
    public let category: MeeshyLog.Category
    public let errorType: String
    public let message: String

    public init(context: String, category: MeeshyLog.Category, errorType: String, message: String) {
        self.context = context
        self.category = category
        self.errorType = errorType
        self.message = message
    }
}

public protocol ErrorRecording: Sendable {
    func record(_ failure: RecordedFailure)
}

public struct OSLogErrorRecorder: ErrorRecording {
    public init() {}

    public func record(_ failure: RecordedFailure) {
        MeeshyLog.logger(failure.category).error(
            "\(failure.context, privacy: .public) failed: \(failure.errorType, privacy: .public) \(failure.message, privacy: .public)"
        )
    }
}

@discardableResult
public func bestEffort<T>(
    _ context: StaticString,
    category: MeeshyLog.Category = .grdb,
    recorder: any ErrorRecording = MeeshyLog.recorder,
    _ operation: () throws -> T
) -> T? {
    do {
        return try operation()
    } catch is CancellationError {
        return nil
    } catch {
        MeeshyLog.record(error, context: context, category: category, recorder: recorder)
        return nil
    }
}

@_disfavoredOverload
@discardableResult
public func bestEffort<T>(
    _ context: StaticString,
    category: MeeshyLog.Category = .grdb,
    recorder: any ErrorRecording = MeeshyLog.recorder,
    _ operation: () async throws -> T
) async -> T? {
    do {
        return try await operation()
    } catch is CancellationError {
        return nil
    } catch {
        MeeshyLog.record(error, context: context, category: category, recorder: recorder)
        return nil
    }
}
