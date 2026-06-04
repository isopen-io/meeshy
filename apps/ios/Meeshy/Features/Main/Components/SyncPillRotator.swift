import Foundation
import Combine

@MainActor
final class SyncPillRotator: ObservableObject {
    @Published private(set) var currentIndex: Int = 0
    private(set) var itemCount: Int = 0
    private(set) var autoRotationEnabled: Bool = true

    private var timer: AnyCancellable?
    private var userPauseUntil: Date?
    private let clock: () -> Date

    init(clock: @escaping () -> Date = Date.init) {
        self.clock = clock
    }

    /// Updates the rotation list size. Cancels the timer when `count <= 1`,
    /// (re)starts it otherwise. The 3-cycle auto-hide was retired
    /// 2026-05-27 — the rotator now keeps rotating as long as the host
    /// supplies entries, and the host removes the pill entirely (not just
    /// hides it) when the entry list goes empty.
    func setItemCount(_ count: Int) {
        itemCount = count
        if count == 0 {
            currentIndex = 0
            timer?.cancel()
            return
        }
        if currentIndex >= count { currentIndex = 0 }
        if count > 1 && autoRotationEnabled {
            startTimer()
        } else {
            timer?.cancel()
        }
    }

    func setAutoRotation(_ enabled: Bool) {
        autoRotationEnabled = enabled
        if enabled && itemCount > 1 {
            startTimer()
        } else {
            timer?.cancel()
        }
    }

    func advance() {
        guard itemCount > 1 else { return }
        currentIndex = (currentIndex + 1) % itemCount
        userPauseUntil = clock().addingTimeInterval(5.0)
    }

    func rewind() {
        guard itemCount > 1 else { return }
        currentIndex = (currentIndex - 1 + itemCount) % itemCount
        userPauseUntil = clock().addingTimeInterval(5.0)
    }

    func simulateTick() {
        guard itemCount > 1 else { return }
        if let until = userPauseUntil, clock() < until { return }
        userPauseUntil = nil
        currentIndex = (currentIndex + 1) % itemCount
    }

    private func startTimer() {
        timer?.cancel()
        timer = Timer.publish(every: 2.7, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in self?.simulateTick() }
    }
}
