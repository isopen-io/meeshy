import Combine

/// A thread-safe wrapper around `PassthroughSubject` that conforms to `Sendable`.
///
/// `PassthroughSubject` is internally thread-safe for `send(_:)` and subscriptions,
/// but does not declare `Sendable` conformance in the Combine framework. This wrapper
/// makes it usable as a `nonisolated` stored property inside Swift actors without
/// triggering strict-concurrency diagnostics.
public final class SendablePassthrough<Output: Sendable>: @unchecked Sendable {
    private let subject = PassthroughSubject<Output, Never>()

    public init() {}

    public func send(_ value: Output) {
        subject.send(value)
    }

    public func receive<S: Scheduler>(on scheduler: S) -> Publishers.ReceiveOn<PassthroughSubject<Output, Never>, S> {
        subject.receive(on: scheduler)
    }

    public func sink(receiveValue: @escaping (Output) -> Void) -> AnyCancellable {
        subject.sink(receiveValue: receiveValue)
    }

    public var publisher: AnyPublisher<Output, Never> {
        subject.eraseToAnyPublisher()
    }
}
