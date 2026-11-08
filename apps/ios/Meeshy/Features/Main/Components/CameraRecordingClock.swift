import Foundation

/// Le chrono d'une prise : un tic toutes les 0,5 s sur le fil principal, qui ne
/// part qu'APRÈS que le segment est lancé et s'arrête à la clôture de la prise.
@MainActor
final class CameraRecordingClock {
    static let interval: TimeInterval = 0.5
    private var timer: Timer?

    nonisolated deinit {}

    func start(onTick: @escaping @MainActor @Sendable () -> Void) {
        stop()
        timer = Timer.scheduledTimer(withTimeInterval: Self.interval, repeats: true) { _ in
            Task { @MainActor in onTick() }
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }
}
