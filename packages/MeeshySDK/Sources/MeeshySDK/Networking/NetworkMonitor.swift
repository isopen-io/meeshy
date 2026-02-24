import Foundation
import Network
import Combine
import os

// MARK: - Network Monitor

public final class NetworkMonitor: ObservableObject {
    public static let shared = NetworkMonitor()

    @Published public private(set) var isOffline: Bool = false
    @Published public private(set) var connectionType: ConnectionType = .unknown

    public enum ConnectionType: String {
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
