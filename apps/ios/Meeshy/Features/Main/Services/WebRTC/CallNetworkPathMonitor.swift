import Foundation
import Network

protocol CallNetworkPathProviding: AnyObject {
    func start(onChange: @escaping @MainActor @Sendable (CallNetworkPath) -> Void)
    func stop()
}

/// Watches the OS path for the length of one call (#8697): a fresh
/// `NWPathMonitor` per `start`, since a cancelled monitor cannot restart.
final class CallNetworkPathMonitor: CallNetworkPathProviding {
    private var monitor: NWPathMonitor?
    private let queue = DispatchQueue(label: "me.meeshy.app.call-network-path", qos: .utility)

    func start(onChange: @escaping @MainActor @Sendable (CallNetworkPath) -> Void) {
        stop()
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { path in
            let snapshot = CallNetworkPath(isExpensive: path.isExpensive, isConstrained: path.isConstrained)
            Task { @MainActor in onChange(snapshot) }
        }
        monitor.start(queue: queue)
        self.monitor = monitor
    }

    func stop() {
        monitor?.cancel()
        monitor = nil
    }
}
