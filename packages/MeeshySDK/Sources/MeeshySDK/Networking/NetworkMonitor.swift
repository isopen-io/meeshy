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

    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "network")
    private var pathCancellable: AnyCancellable?

    fileprivate let isOfflineSubject = SendableCurrentValueSubject<Bool>(false)

    public nonisolated var isOfflinePublisher: AnyPublisher<Bool, Never> {
        isOfflineSubject.publisher
            .removeDuplicates()
            .debounce(for: .milliseconds(500), scheduler: DispatchQueue.global(qos: .utility))
            .eraseToAnyPublisher()
    }

    /// Lecture BINAIRE du chemin réseau. `NetworkConditionMonitor` en fait une
    /// lecture QUALITATIVE à partir de la même source — les deux ne peuvent
    /// donc plus se contredire. Cf. `NetworkPathSource` pour l'historique du
    /// doublon.
    internal init(source: NetworkPathSource = .shared) {
        // Amorçage SYNCHRONE, sans passer par `apply` : `isOffline` est
        // `@Published` et sa mutation doit rester sur le main thread une fois
        // le moniteur observable. Ici personne n'est encore abonné, et
        // l'initialisation d'un `static let` peut survenir hors main thread.
        let initial = source.current
        isOffline = !initial.isSatisfied
        connectionType = Self.connectionType(for: initial)
        isOfflineSubject.send(!initial.isSatisfied)

        pathCancellable = source.publisher
            .dropFirst()                       // la valeur courante vient d'être appliquée
            .receive(on: DispatchQueue.main)
            .sink { [weak self] snapshot in self?.apply(snapshot) }
    }

    /// Traduit une photo du chemin en état binaire + type d'interface.
    /// `nonisolated static` pour être exercé sans instancier le moniteur.
    nonisolated static func connectionType(for snapshot: NetworkPathSnapshot) -> ConnectionType {
        if snapshot.usesWiFi { return .wifi }
        if snapshot.usesCellular { return .cellular }
        if snapshot.usesWired { return .wired }
        return .unknown
    }

    private func apply(_ snapshot: NetworkPathSnapshot) {
        let offline = !snapshot.isSatisfied
        let type = Self.connectionType(for: snapshot)
        isOffline = offline
        connectionType = type
        isOfflineSubject.send(offline)
        if offline {
            logger.info("Network: offline")
        } else {
            logger.info("Network: online via \(type.rawValue)")
        }
    }
}

#if DEBUG
extension NetworkMonitor {
    /// Instance isolée du singleton, adossée à une source SANS `NWPathMonitor`
    /// réel : plus aucun rappel du système ne vient écraser un état simulé.
    /// C'était la course que documentait l'ancien `startMonitor: false` — elle
    /// vit désormais dans la source amont, donc une seule fois pour les deux
    /// moniteurs.
    public static func makeForTesting(source: NetworkPathSource = .makeForTesting()) -> NetworkMonitor {
        NetworkMonitor(source: source)
    }

    public func simulateOffline() {
        DispatchQueue.main.async {
            self.isOffline = true
            self.connectionType = .unknown
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
