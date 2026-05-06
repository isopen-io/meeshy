import Foundation
import Combine

@MainActor
final class TypingDotTimerHarness {
    static let shared = TypingDotTimerHarness()

    private(set) var isActive = false
    private var publisherCancellable: AnyCancellable?

    func makeTimer() -> AnyCancellable {
        isActive = true
        let cancellable = Timer.publish(every: 0.5, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in _ = self }
        publisherCancellable = cancellable
        return cancellable
    }

    func invalidate(_ cancellable: AnyCancellable) {
        cancellable.cancel()
        publisherCancellable = nil
        isActive = false
    }
}
