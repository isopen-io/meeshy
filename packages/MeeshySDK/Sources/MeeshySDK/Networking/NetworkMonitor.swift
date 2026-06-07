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

    /// Debounced offline-state publisher (500 ms) with duplicate suppression.
    /// Suitable for driving UI affordances that must not flicker on transient
    /// path-update bursts (e.g. sync pills, offline banners).
    var isOfflinePublisher: AnyPublisher<Bool, Never> { get }
}

extension NetworkMonitorProviding {
    /// Default no-op publisher for conformers (typically test doubles) that do
    /// not model offline transitions. Real implementations override this.
    public var isOfflinePublisher: AnyPublisher<Bool, Never> {
        Empty<Bool, Never>(completeImmediately: false).eraseToAnyPublisher()
    }
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

    fileprivate let isOfflineSubject = SendableCurrentValueSubject<Bool>(false)

    public nonisolated var isOfflinePublisher: AnyPublisher<Bool, Never> {
        isOfflineSubject.publisher
            .removeDuplicates()
            .debounce(for: .milliseconds(500), scheduler: DispatchQueue.global(qos: .utility))
            .eraseToAnyPublisher()
    }

    internal init(startMonitor: Bool = true) {
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
                self.isOfflineSubject.send(offline)
            }

            if offline {
                self.logger.info("Network: offline")
            } else {
                self.logger.info("Network: online via \(type.rawValue)")
            }
        }

        // En test, `startMonitor: false` évite de démarrer le vrai NWPathMonitor :
        // ses path-updates réels (réseau online → envoie `false`) entraient en
        // concurrence avec `simulateOffline()` (envoie `true`) et, via le
        // `debounce(500ms)` qui ne garde que la dernière valeur, pouvaient
        // coalescer en `false` → `filter { $0 }` ne fire jamais → timeout flaky.
        if startMonitor {
            monitor.start(queue: monitorQueue)
        }
    }

    deinit {
        monitor.cancel()
    }
}

#if DEBUG
extension NetworkMonitor {
    /// Bypasses the `.shared` singleton to produce an isolated instance for tests.
    /// Each instance starts its own `NWPathMonitor`; remember to drop the reference
    /// at the end of the test so the monitor cancels via `deinit`.
    public static func makeForTesting() -> NetworkMonitor {
        NetworkMonitor(startMonitor: false)
    }

    public func simulateOffline() {
        DispatchQueue.main.async {
            self.isOffline = true
            self.isOfflineSubject.send(true)
        }
    }

    public func simulateOnline() {
        DispatchQueue.main.async {
            self.isOffline = false
            self.isOfflineSubject.send(false)
        }
    }
}
#endif
