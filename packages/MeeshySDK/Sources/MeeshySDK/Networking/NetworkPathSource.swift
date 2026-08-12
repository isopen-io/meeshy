import Foundation
import Network
import Combine

/// Photo brute du chemin réseau, telle que la rend `NWPath` — sans
/// interprétation. Chaque moniteur en dérive SA lecture (binaire en-ligne /
/// hors-ligne, ou qualité fine pour la politique de téléchargement).
public struct NetworkPathSnapshot: Sendable, Equatable {
    public let isSatisfied: Bool
    public let isConstrained: Bool
    public let isExpensive: Bool
    public let usesWiFi: Bool
    public let usesCellular: Bool
    public let usesWired: Bool

    public init(
        isSatisfied: Bool,
        isConstrained: Bool = false,
        isExpensive: Bool = false,
        usesWiFi: Bool = false,
        usesCellular: Bool = false,
        usesWired: Bool = false
    ) {
        self.isSatisfied = isSatisfied
        self.isConstrained = isConstrained
        self.isExpensive = isExpensive
        self.usesWiFi = usesWiFi
        self.usesCellular = usesCellular
        self.usesWired = usesWired
    }

    init(path: NWPath) {
        self.init(
            isSatisfied: path.status == .satisfied,
            isConstrained: path.isConstrained,
            isExpensive: path.isExpensive,
            usesWiFi: path.usesInterfaceType(.wifi),
            usesCellular: path.usesInterfaceType(.cellular),
            usesWired: path.usesInterfaceType(.wiredEthernet)
        )
    }
}

/// **Source unique du chemin réseau pour tout le SDK.**
///
/// Historique du doublon que ce type supprime : `NetworkMonitor` est né au
/// Sprint 4 avec le support hors-ligne (question binaire « suis-je en ligne »).
/// `NetworkConditionMonitor` est arrivé plus tard pour le moteur de politique
/// de téléchargement média, qui a besoin d'une lecture plus fine (`isConstrained`
/// / `isExpensive` → `badCellular`). Le second a démarré SON PROPRE
/// `NWPathMonitor` au lieu de dériver du premier.
///
/// Deux `NWPathMonitor` = deux vérités qui peuvent diverger, et elles ont
/// divergé : la pastille de synchronisation lit `NetworkMonitor`, tandis que le
/// videur d'outbox se gate sur `NetworkConditionMonitor`. L'utilisateur pouvait
/// donc voir « Hors ligne » pendant que la file se croyait autorisée à partir —
/// ou l'inverse, une file bloquée sans que rien ne l'indique.
///
/// Les deux moniteurs restent des types distincts — leurs lectures sont
/// légitimement différentes — mais ils observent désormais CE flux-ci.
public final class NetworkPathSource: @unchecked Sendable {
    public static let shared = NetworkPathSource()

    private let monitor: NWPathMonitor?
    private let queue = DispatchQueue(label: "me.meeshy.network-path", qos: .utility)
    /// `SendableCurrentValueSubject` et non `CurrentValueSubject` : le
    /// `pathUpdateHandler` est une closure `@Sendable`, et Combine ne marque pas
    /// ses sujets `Sendable`. Le wrapper maison du SDK sérialise l'accès.
    private let subject: SendableCurrentValueSubject<NetworkPathSnapshot>

    /// Photo d'amorçage, avant le premier rappel du système.
    ///
    /// **« Je ne sais pas encore » n'est pas « hors ligne ».** `NWPathMonitor`
    /// rend un chemin INSATISFAIT tant qu'il n'a rien évalué ; le prendre pour
    /// argent comptant, c'est déclarer l'appareil hors ligne au lancement. C'est
    /// exactement ce que faisait `NetworkConditionMonitor`, qui naissait
    /// `.offline` : toute mutation enfilée dans cette fenêtre était rejetée par
    /// le gate réseau du videur d'outbox, qui n'armait alors aucune reprise.
    ///
    /// Le défaut est donc OPTIMISTE sur la connectivité et PESSIMISTE sur la
    /// qualité, parce que les deux erreurs ne coûtent pas la même chose :
    /// - se croire hors ligne à tort **bloque** un envoi, et le blocage dure ;
    /// - se croire en ligne à tort coûte une tentative qui échoue vite et
    ///   repart en file ;
    /// - se croire sur un bon réseau à tort **consomme le forfait** de
    ///   l'utilisateur en téléchargeant une vidéo.
    ///
    /// `isConstrained: true` résout donc en `.badCellular` : en ligne, mais
    /// aucun auto-téléchargement de média lourd avant que la vérité arrive.
    static let unknownPath = NetworkPathSnapshot(isSatisfied: true, isConstrained: true)

    /// Dernière photo connue.
    public var current: NetworkPathSnapshot { subject.value }

    public var publisher: AnyPublisher<NetworkPathSnapshot, Never> {
        subject.publisher
    }

    /// - Parameter startMonitor: `false` en test — aucun `NWPathMonitor` réel
    ///   n'est démarré, donc aucun rappel système ne vient écraser une photo
    ///   posée à la main. Les doubles de test cessent de courir contre l'OS.
    init(startMonitor: Bool = true) {
        guard startMonitor else {
            self.monitor = nil
            self.subject = SendableCurrentValueSubject(NetworkPathSnapshot(isSatisfied: true))
            return
        }
        let monitor = NWPathMonitor()
        self.monitor = monitor
        // `monitor.currentPath` n'est PAS lu ici : avant le premier rappel il
        // rend un chemin insatisfait qui signifie « non évalué », pas
        // « déconnecté ». Cf. `unknownPath`.
        self.subject = SendableCurrentValueSubject(Self.unknownPath)
        monitor.pathUpdateHandler = { [subject] path in
            subject.send(NetworkPathSnapshot(path: path))
        }
        monitor.start(queue: queue)
    }

    deinit {
        monitor?.cancel()
    }

    /// Publie une photo arbitraire. Réservé aux tests et aux doubles :
    /// en production la source est le système.
    public func publish(_ snapshot: NetworkPathSnapshot) {
        subject.send(snapshot)
    }

    #if DEBUG
    /// Instance isolée, sans `NWPathMonitor` réel — pour les tests.
    public static func makeForTesting() -> NetworkPathSource {
        NetworkPathSource(startMonitor: false)
    }
    #endif
}
