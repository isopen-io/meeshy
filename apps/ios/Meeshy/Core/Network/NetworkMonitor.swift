//
//  NetworkMonitor.swift
//  Meeshy
//
//  Network connectivity monitor
//  iOS 16+
//  Swift 6 compliant with MainActor isolation
//

import Foundation
import Network

@MainActor
final class NetworkMonitor: ObservableObject {
    // MARK: - Singleton

    static let shared = NetworkMonitor()

    // MARK: - Published Properties

    @Published var isConnected = true
    @Published var connectionType: ConnectionType = .unknown
    @Published var status: AppState.NetworkStatus = .unknown

    // MARK: - Connection Type

    enum ConnectionType {
        case wifi
        case cellular
        case ethernet
        case unknown
    }

    // MARK: - Properties

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "NetworkMonitor")

    // MARK: - Initialization

    private init() {}

    // MARK: - Monitoring

    nonisolated func startMonitoring() {
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self = self else { return }

            Task { @MainActor [weak self] in
                guard let self = self else { return }
                self.isConnected = path.status == .satisfied
                self.updateConnectionType(path: path)
                self.updateStatus(path: path)
            }

            if path.status == .satisfied {
                apiLogger.info("Network connected")
            } else {
                apiLogger.warn("Network disconnected")
            }
        }

        monitor.start(queue: queue)
    }

    nonisolated func stopMonitoring() {
        monitor.cancel()
    }

    // MARK: - Private Methods

    private func updateConnectionType(path: NWPath) {
        if path.usesInterfaceType(.wifi) {
            connectionType = .wifi
        } else if path.usesInterfaceType(.cellular) {
            connectionType = .cellular
        } else if path.usesInterfaceType(.wiredEthernet) {
            connectionType = .ethernet
        } else {
            connectionType = .unknown
        }
    }

    private func updateStatus(path: NWPath) {
        if path.status != .satisfied {
            status = .notReachable
        } else if path.usesInterfaceType(.wifi) {
            status = .reachableViaWiFi
        } else if path.usesInterfaceType(.cellular) {
            status = .reachableViaCellular
        } else {
            status = .unknown
        }
    }
}
