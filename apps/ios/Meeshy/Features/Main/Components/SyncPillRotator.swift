import Foundation
import Combine

@MainActor
final class SyncPillRotator: ObservableObject {
    @Published private(set) var currentIndex: Int = 0
    /// Becomes `true` after the rotator has cycled through every item 3
    /// complete times since the last `setItemCount(_:)` reset. The hosting
    /// view binds visibility to `!hasCompletedAllCycles` so the user is no
    /// longer pestered after they've had time to read each queued item.
    /// Resets to `false` automatically when `setItemCount(_:)` is called
    /// with a count that differs from the current `itemCount` (i.e. a new
    /// item enqueued or an item drained).
    @Published private(set) var hasCompletedAllCycles: Bool = false
    private(set) var itemCount: Int = 0
    private(set) var cycleCount: Int = 0
    private(set) var autoRotationEnabled: Bool = true

    /// Number of full rotations through `itemCount` after which the pill
    /// auto-hides. Per product spec (2026-05-27): 3 cycles.
    static let maxCycles: Int = 3

    private var timer: AnyCancellable?
    private var userPauseUntil: Date?
    private let clock: () -> Date

    init(clock: @escaping () -> Date = Date.init) {
        self.clock = clock
    }

    func setItemCount(_ count: Int) {
        // Any change to the item list resets the auto-hide counter so the
        // user is shown new items immediately.
        if count != itemCount {
            cycleCount = 0
            hasCompletedAllCycles = false
        }
        itemCount = count
        if count == 0 {
            currentIndex = 0
            timer?.cancel()
            return
        }
        if currentIndex >= count { currentIndex = 0 }
        if count > 1 && autoRotationEnabled && !hasCompletedAllCycles {
            startTimer()
        } else {
            timer?.cancel()
        }
    }

    func setAutoRotation(_ enabled: Bool) {
        autoRotationEnabled = enabled
        if enabled && itemCount > 1 && !hasCompletedAllCycles {
            startTimer()
        } else {
            timer?.cancel()
        }
    }

    func advance() {
        guard itemCount > 1 else { return }
        incrementIndex()
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
        incrementIndex()
    }

    /// Single source of truth for `currentIndex` advancement. Bumps the
    /// cycle counter on wrap-around (N-1 → 0) and cancels the timer once
    /// `maxCycles` is reached.
    private func incrementIndex() {
        let next = (currentIndex + 1) % itemCount
        if next == 0 {
            cycleCount += 1
            if cycleCount >= Self.maxCycles {
                hasCompletedAllCycles = true
                timer?.cancel()
            }
        }
        currentIndex = next
    }

    private func startTimer() {
        timer?.cancel()
        timer = Timer.publish(every: 2.7, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in self?.simulateTick() }
    }
}
