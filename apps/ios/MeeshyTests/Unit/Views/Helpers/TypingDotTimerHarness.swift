import Foundation
import Combine

@MainActor
final class TypingDotTimerHarness {
    static let shared = TypingDotTimerHarness()

    private(set) var isActive = false

    func makeTimer() -> AnyCancellable {
        isActive = true
        return AnyCancellable {}
    }

    func invalidate(_ cancellable: AnyCancellable) {
        cancellable.cancel()
        isActive = false
    }
}
