import Foundation
import Network
import Combine

/// État du réseau détecté par le monitor.
public enum NetworkCondition: String, Equatable, Sendable, Codable {
    case offline
    case badCellular
    case goodCellular
    case wifi
}

/// Singleton qui observe le réseau via `NWPathMonitor` et publie l'état
/// résolu. Consommé par `MediaDownloadPolicyEngine` pour décider de
/// l'auto-download des médias.
@MainActor
public final class NetworkConditionMonitor: ObservableObject {
    @MainActor public static let shared = NetworkConditionMonitor()

    @Published public private(set) var condition: NetworkCondition = .offline

    // `NWPathMonitor` / `DispatchQueue` sont des constantes `let` de type Sendable,
    // donc implicitement nonisolated : accessibles depuis le `pathUpdateHandler`
    // (closure non-main) sans annotation. Configurés une fois à l'init, jamais mutés ;
    // le handler hop sur MainActor via Task pour publier `condition`.
    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(
        label: "me.meeshy.network-condition", qos: .utility
    )

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let resolved = Self.resolve(path: path)
            Task { @MainActor in self?.condition = resolved }
        }
        monitor.start(queue: queue)
    }

    public var isOnline: Bool { condition != .offline }

    nonisolated public static func resolve(path: NWPath) -> NetworkCondition {
        resolveFromFlags(
            isSatisfied: path.status == .satisfied,
            isConstrained: path.isConstrained,
            isExpensive: path.isExpensive,
            usesWiFi: path.usesInterfaceType(.wifi),
            usesCellular: path.usesInterfaceType(.cellular)
        )
    }

    /// Pure resolution depuis les flags. Testable sans dépendre de `NWPath`
    /// qui n'est pas instanciable directement. `nonisolated` pour permettre
    /// l'appel depuis `pathUpdateHandler` (closure non-MainActor).
    nonisolated public static func resolveFromFlags(
        isSatisfied: Bool,
        isConstrained: Bool,
        isExpensive: Bool,
        usesWiFi: Bool,
        usesCellular: Bool
    ) -> NetworkCondition {
        guard isSatisfied else { return .offline }
        if usesWiFi && !isConstrained { return .wifi }
        if usesCellular {
            return isConstrained ? .badCellular : .goodCellular
        }
        if !isConstrained { return .wifi }
        return .badCellular
    }
}
