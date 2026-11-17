import Combine
import Foundation
import MeeshySDK

/// L'état de l'historique d'un Sang : rien encore, servi, ou refusé avec ou sans réseau.
enum BloodHistoryState: Equatable {
    case loading
    case loaded
    case failed(offline: Bool)
}

/// LA POSITION DU SANG, CÔTÉ ÉCRAN (#18872, planche Carte-Sang), derrière `services.bloodLocation`. Elle lit
/// l'historique que ce Sang m'a consenti (trente jours), le range par jour et par fenêtre, le rejoue d'une tête de
/// lecture, et tient MON fantôme : un geste l'applique aussitôt, la passerelle confirme, un refus le rend.
///
/// Cache d'abord : l'historique déjà lu de cette personne se peint à la réouverture, le réseau le rafraîchit ensuite ;
/// rien ne s'écrit sur le disque (un historique de position ne quitte jamais la mémoire de la session).
@MainActor
final class BloodLocationModel: ObservableObject {

    @Published private(set) var points: [BloodLocationPoint] = []
    @Published private(set) var state: BloodHistoryState = .loading
    @Published var range: BloodHistoryRange = .today {
        didSet { progress = 1 }
    }
    @Published var progress: Double = 1
    @Published private(set) var isGhost: Bool
    @Published private(set) var consultations: BloodLocationConsultations?

    let userId: String
    /// La clé de la mémoire : le compte qui lit ET la personne lue — un autre compte ne voit jamais ce que le
    /// précédent a lu.
    private let memoryKey: String
    private let service: BloodLocationProviding
    private let ghostStore: BloodGhostStoring
    private let isOnline: () -> Bool
    private let now: () -> Date
    private let calendar: Calendar

    private static var memory: [String: [BloodLocationPoint]] = [:]

    nonisolated deinit {}

    init(userId: String, service: BloodLocationProviding = BloodLocationService.shared,
         ghostStore: BloodGhostStoring = UserDefaultsBloodGhostStore(), isOnline: @escaping () -> Bool = { NetworkMonitor.shared.isOnline },
         now: @escaping () -> Date = Date.init, calendar: Calendar = .current,
         account: String = AuthManager.shared.currentUser?.id ?? "") {
        self.userId = userId
        memoryKey = "\(account):\(userId)"
        self.service = service
        self.ghostStore = ghostStore
        self.isOnline = isOnline
        self.now = now
        self.calendar = calendar
        isGhost = ghostStore.isGhost
        if let cached = Self.memory[memoryKey] {
            points = cached
            state = .loaded
        }
    }

    /// Les points de la fenêtre choisie, dans l'ordre du temps.
    var shown: [BloodLocationPoint] {
        BloodHistoryRules.points(points, in: range.interval(now: now(), calendar: calendar))
    }

    var dailyDistances: [Double] {
        BloodHistoryRules.dailyDistances(points, now: now(), calendar: calendar)
    }

    var shownDistanceMeters: Double { BloodHistoryRules.distanceMeters(shown) }

    var stops: [Int] { BloodHistoryRules.stops(shown) }

    /// L'index du point sous la tête de lecture.
    var playheadIndex: Int? { BloodHistoryRules.index(atProgress: progress, in: shown) }

    func load() async {
        if points.isEmpty { state = .loading }
        let since = calendar.date(byAdding: .day, value: -BloodLocationContract.historyDays, to: now())
        do {
            let history = try await service.history(of: userId, since: since, limit: BloodLocationContract.historyMaxLimit)
            points = history.points
            Self.memory[memoryKey] = history.points
            state = .loaded
        } catch {
            guard points.isEmpty else { return }
            state = .failed(offline: !isOnline())
        }
        consultations = try? await service.consultations()
    }

    /// Le fantôme GLOBAL : on ne range plus rien de moi, et l'historique servi aux autres se tait.
    func setGhost(_ ghost: Bool) async {
        let previous = isGhost
        isGhost = ghost
        guard let change = BloodLocationSettingsChange(ghost: ghost) else { return }
        let accepted = (try? await service.update(change)) ?? false
        guard accepted else {
            isGhost = previous
            return
        }
        ghostStore.isGhost = ghost
    }

}

/// Où se garde la dernière valeur de MON fantôme, que la passerelle ne relit pas (aucune route ne le sert encore).
protocol BloodGhostStoring: AnyObject {
    var isGhost: Bool { get set }
}

final class UserDefaultsBloodGhostStore: BloodGhostStoring {
    private let defaults: UserDefaults
    private let key: String

    nonisolated deinit {}

    init(defaults: UserDefaults = .standard, account: String = AuthManager.shared.currentUser?.id ?? "") {
        self.defaults = defaults
        key = "bloodLocation.ghost.\(account)"
    }

    var isGhost: Bool {
        get { defaults.bool(forKey: key) }
        set { defaults.set(newValue, forKey: key) }
    }
}
