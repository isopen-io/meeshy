import Foundation

public struct RetryPolicy: Sendable, Equatable {
    public let maxAttempts: Int?
    public let firstDelay: TimeInterval
    public let maxDelay: TimeInterval
    public let maxJitter: TimeInterval

    public init(maxAttempts: Int?, firstDelay: TimeInterval, maxDelay: TimeInterval, maxJitter: TimeInterval = 0) {
        self.maxAttempts = maxAttempts
        self.firstDelay = firstDelay
        self.maxDelay = maxDelay
        self.maxJitter = maxJitter
    }

    public var deferral: TimeInterval { 0 }

    public func delay(afterFailure failures: Int, jitterSample: Double = .random(in: 0...1)) -> TimeInterval {
        0
    }

    public func isExhausted(afterFailures failures: Int) -> Bool {
        false
    }
}

public extension RetryPolicy {
    static let messageOutbox = RetryPolicy(maxAttempts: 5, firstDelay: 2, maxDelay: 30, maxJitter: 0.5)
    static let storyPublish = RetryPolicy(maxAttempts: 5, firstDelay: 0, maxDelay: 0)
    static let stateSync = RetryPolicy(maxAttempts: nil, firstDelay: 10, maxDelay: 60)
    static let socialEvents = RetryPolicy(maxAttempts: nil, firstDelay: 10, maxDelay: 300)
}
