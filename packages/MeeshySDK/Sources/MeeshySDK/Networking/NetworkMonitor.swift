import Foundation
import Network
import Combine
import os

// MARK: - NetworkMonitor Protocol (test seam)

/// Protocol providing testable network-state observation.
/// Conforming types must be `AnyObject` so mock implementations can mutate state.
///
/// `isOnline` is intentionally not isolated to `@MainActor` at the protocol level
/// so it can be read from actor contexts (e.g. `SettingsActionQueue`). Concrete
/// types that publish changes via Combine must hop to the main queue themselves.
public protocol NetworkMonitorProviding: AnyObject, Sendable {
    /// `true` when at least one usable network interface is available.
    var isOnline: Bool { get }
}

// MARK: - Network Monitor

public final class NetworkMonitor: ObservableObject, @unchecked Sendable, NetworkMonitorProviding {
    public static let shared = NetworkMonitor()

    @Published public private(set) var isOffline: Bool = false
    @Published public private(set) var connectionType: ConnectionType = .unknown

    /// Convenience inverse of `isOffline`. Satisfies `NetworkMonitorProviding`.
    public var isOnline: Bool { !isOffline }

    public enum ConnectionType: String, Sendable {
        case wifi
        case cellular
        case wired
        case unknown
    }

    private let monitor: NWPathMonitor
    private let monitorQueue = DispatchQueue(label: "com.meeshy.networkmonitor", qos: .utility)
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "network")

    private init() {
        monitor = NWPathMonitor()

        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }

            let offline = path.status != .satisfied
            let type: ConnectionType = {
                if path.usesInterfaceType(.wifi) { return .wifi }
                if path.usesInterfaceType(.cellular) { return .cellular }
                if path.usesInterfaceType(.wiredEthernet) { return .wired }
                return .unknown
            }()

            DispatchQueue.main.async {
                self.isOffline = offline
                self.connectionType = type
            }

            if offline {
                self.logger.info("Network: offline")
            } else {
                self.logger.info("Network: online via \(type.rawValue)")
            }
        }

        monitor.start(queue: monitorQueue)
    }

    deinit {
        monitor.cancel()
    }
}
