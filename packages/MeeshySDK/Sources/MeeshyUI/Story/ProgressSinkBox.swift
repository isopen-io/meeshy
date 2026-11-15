import Foundation

public final class ProgressSinkBox: @unchecked Sendable {
    public let sink: (Double) -> Void

    public init(_ sink: @escaping (Double) -> Void) { self.sink = sink }

    nonisolated deinit {}
}
