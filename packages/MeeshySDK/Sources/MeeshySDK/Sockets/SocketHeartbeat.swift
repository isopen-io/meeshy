import Foundation

/// Battement applicatif de la socket de messages : un `heartbeat` toutes les 30 s, qui porte `clientTime`
/// pour que la passerelle calcule le RTT et le rende dans `heartbeat:ack`. Possède son minuteur.
final class SocketHeartbeat: @unchecked Sendable {
    private var timer: Timer?

    deinit {
        timer?.invalidate()
        timer = nil
    }

    func start(emit: @escaping @Sendable (Int64) -> Void) {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { _ in
            // Include clientTime so the gateway can compute round-trip latency
            // and return it in heartbeat:ack for connection quality monitoring.
            let clientTimeMs = Int64(Date().timeIntervalSince1970 * 1000)
            emit(clientTimeMs)
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }
}
