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

/// Lecture QUALITATIVE du réseau — consommée par `MediaDownloadPolicyEngine`
/// pour décider de l'auto-téléchargement des médias, et par le gate réseau du
/// videur d'outbox.
///
/// Observe `NetworkPathSource`, la source unique du SDK. Il démarrait
/// auparavant SON PROPRE `NWPathMonitor`, en concurrence avec celui de
/// `NetworkMonitor` : deux vérités pour une seule question, qui ont fini par
/// diverger à l'écran. Cf. `NetworkPathSource` pour l'historique.
@MainActor
public final class NetworkConditionMonitor: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @MainActor public static let shared = NetworkConditionMonitor()

    /// Amorcé depuis la photo COURANTE du chemin, jamais fabriqué.
    ///
    /// Ce champ valait `.offline` à la construction et le restait jusqu'au
    /// premier rappel du système. Le gate réseau du videur d'outbox lit cette
    /// valeur : toute mutation enfilée pendant cette fenêtre était rejetée, et
    /// comme le videur ne différait rien, aucune reprise n'était armée. Naître
    /// « hors ligne » suffisait à bloquer la file pour la session entière.
    @Published public private(set) var condition: NetworkCondition

    private var pathCancellable: AnyCancellable?

    init(source: NetworkPathSource = .shared) {
        condition = Self.resolve(snapshot: source.current)
        pathCancellable = source.publisher
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] snapshot in
                self?.condition = Self.resolve(snapshot: snapshot)
            }
    }

    public var isOnline: Bool { condition != .offline }

    nonisolated public static func resolve(snapshot: NetworkPathSnapshot) -> NetworkCondition {
        resolveFromFlags(
            isSatisfied: snapshot.isSatisfied,
            isConstrained: snapshot.isConstrained,
            isExpensive: snapshot.isExpensive,
            usesWiFi: snapshot.usesWiFi,
            usesCellular: snapshot.usesCellular
        )
    }

    nonisolated public static func resolve(path: NWPath) -> NetworkCondition {
        resolve(snapshot: NetworkPathSnapshot(path: path))
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
