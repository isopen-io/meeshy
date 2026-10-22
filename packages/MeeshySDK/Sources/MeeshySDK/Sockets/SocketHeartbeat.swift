import Foundation

protocol SocketHeartbeatProviding: Sendable {
    func start(emit: @escaping @MainActor @Sendable (Int64) -> Void)
    func stop()
}

/// Battement applicatif de la socket de messages : un `heartbeat` toutes les 30 s, qui porte `clientTime`
/// pour que la passerelle calcule le RTT et le rende dans `heartbeat:ack`. Possède sa boucle : une `Task`
/// annulable, jamais capturée par elle-même, donc relâchée avec son propriétaire.
final class SocketHeartbeat: SocketHeartbeatProviding {
    private let loop = Locked<Task<Void, Never>?>(nil)
    private let interval: Duration
    private let sleep: @Sendable @concurrent (Duration) async -> Bool
    private let now: @Sendable () -> Date

    init(
        interval: Duration = .seconds(30),
        sleep: @escaping @Sendable @concurrent (Duration) async -> Bool = { await cancellableSleep(for: $0) },
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.interval = interval
        self.sleep = sleep
        self.now = now
    }

    deinit {
        loop.read { $0 }?.cancel()
    }

    func start(emit: @escaping @MainActor @Sendable (Int64) -> Void) {
        let task = Task { @MainActor [interval = self.interval, sleep = self.sleep, now = self.now] in
            while await sleep(interval), !Task.isCancelled {
                emit(Int64(now().timeIntervalSince1970 * 1000))
            }
        }
        replaceLoop(with: task)
    }

    func stop() {
        replaceLoop(with: nil)
    }

    private func replaceLoop(with task: Task<Void, Never>?) {
        loop.mutate { (current: inout Task<Void, Never>?) -> Void in
            current?.cancel()
            current = task
        }
    }
}
