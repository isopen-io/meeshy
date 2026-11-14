import Combine
import Foundation
import MeeshySDK

/// Ce que l'appareil rend quand on lui demande où il est.
enum SharedLocationFixResult: Equatable {
    case fix(SharedLocationFix)
    case denied
    case unavailable
}

/// La source des relevés de l'appareil. L'app la tient de CoreLocation (`SharedLocationFixSource`) ; un témoin la simule.
@MainActor
protocol SharedLocationFixProviding: AnyObject {
    var fixes: AnyPublisher<SharedLocationFix, Never> { get }
    /// Un relevé, demandant la permission « pendant l'utilisation » si elle n'a pas encore été donnée.
    func currentFix() async -> SharedLocationFixResult
    func follow()
    func stopFollowing()
}

/// Pourquoi un partage n'a pas démarré ou ne s'est pas arrêté.
enum SharedLocationShareProblem: Equatable {
    case locationDenied
    case locationUnavailable
    case refused(SharedLocationSendOutcome)
}

/// MON partage de position en cours (#16983), UN par compte connecté : la liste des personnes, l'émission, le suivi de
/// l'appareil et les échéances. Le serveur garde la position complète, scellée, et la tronque pour chaque personne ; ce
/// centre ne floute rien et ne décide d'aucun droit — la passerelle rejuge la loi à chaque envoi.
@MainActor
final class SharedLocationSharingCenter: ObservableObject {

    @Published private(set) var roster: SharedLocationRoster = .empty {
        didSet { store.save(roster) }
    }
    @Published private(set) var isBusy = false

    private let emitter: SharedLocationEmitting
    private let fixes: SharedLocationFixProviding
    private let store: SharedLocationRosterStoring
    private let now: () -> Date
    private let schedulesDeadlines: Bool
    private var lastSent: SharedLocationUpdateGate.Sent?
    private var following = Set<AnyCancellable>()
    private var deadline: Task<Void, Never>?

    nonisolated deinit {}

    /// Une liste gardée d'un lancement précédent reprend : le partage serveur court toujours jusqu'à son terme, et
    /// « Arrêter » doit rester à un geste même après que l'app a été tuée.
    init(
        emitter: SharedLocationEmitting,
        fixes: SharedLocationFixProviding,
        store: SharedLocationRosterStoring,
        now: @escaping () -> Date = Date.init,
        schedulesDeadlines: Bool = true
    ) {
        self.emitter = emitter
        self.fixes = fixes
        self.store = store
        self.now = now
        self.schedulesDeadlines = schedulesDeadlines
        let restored = store.load()?.pruned(now: now()) ?? .empty
        roster = restored
        guard !restored.isEmpty else { return }
        startFollowing()
        scheduleDeadline()
    }

    func entry(for userId: String) -> SharedLocationRoster.Entry? {
        roster.pruned(now: now()).entry(for: userId)
    }

    /// Montrer ma position à une personne, à cette précision et pour cette durée. `nil` : c'est parti.
    @discardableResult
    func share(with userId: String, precision: SharedLocationPrecision, duration: SharedLocationShareDuration) async -> SharedLocationShareProblem? {
        guard !isBusy else { return nil }
        isBusy = true
        defer { isBusy = false }
        let fix: SharedLocationFix
        switch await fixes.currentFix() {
        case .fix(let current): fix = current
        case .denied: return .locationDenied
        case .unavailable: return .locationUnavailable
        }
        let next = roster.pruned(now: now()).adding(userId: userId, precision: precision, duration: duration, now: now())
        return await publish(next, fix: fix)
    }

    /// Ne plus montrer ma position à cette personne ; les autres gardent la leur.
    @discardableResult
    func stopSharing(with userId: String) async -> SharedLocationShareProblem? {
        guard !isBusy else { return nil }
        isBusy = true
        defer { isBusy = false }
        let next = roster.pruned(now: now()).removing(userId: userId)
        return await publish(next, fix: next.isEmpty ? nil : await restartFix())
    }

    /// Une échéance est passée : la retirer du partage serveur.
    func reconcile() async {
        let pruned = roster.pruned(now: now())
        guard pruned != roster else { return }
        _ = await publish(pruned, fix: pruned.isEmpty ? nil : await restartFix())
    }

    /// Redémarrer le partage serveur demande une position : la dernière envoyée, sinon celle de l'appareil.
    private func restartFix() async -> SharedLocationFix? {
        if let last = lastSent?.fix { return last }
        if case .fix(let fix) = await fixes.currentFix() { return fix }
        return nil
    }

    /// Un relevé de l'appareil pendant le partage.
    func didMove(to fix: SharedLocationFix) async {
        guard !roster.isEmpty, SharedLocationUpdateGate.shouldSend(fix, now: now(), last: lastSent) else { return }
        lastSent = .init(fix: fix, at: now())
        if case .refused(.notSharing) = await emitter.update(fix) {
            clear()
        }
    }

    /// Le compte change : cet appareil cesse de suivre la position pour lui, le terme serveur coupera son partage, et
    /// la liste gardée attend son retour pour qu'il puisse encore l'arrêter.
    func abandon() {
        deadline?.cancel()
        deadline = nil
        following = []
        fixes.stopFollowing()
    }

    private func publish(_ next: SharedLocationRoster, fix: SharedLocationFix?) async -> SharedLocationShareProblem? {
        if next.isEmpty {
            guard await emitter.stop() else { return .refused(.offline) }
            clear()
            return nil
        }
        guard let fix, let request = SharedLocationStartRequest(recipients: next.recipients, duration: next.serverDuration(now: now()), fix: fix) else {
            return .locationUnavailable
        }
        if case .refused(let outcome) = await emitter.start(request) { return .refused(outcome) }
        roster = next
        lastSent = .init(fix: fix, at: now())
        startFollowing()
        scheduleDeadline()
        return nil
    }

    private func startFollowing() {
        guard following.isEmpty else { return }
        fixes.follow()
        let lane = OrderedEventLane()
        fixes.fixes
            .relay(through: lane) { [weak self] fix in await self?.didMove(to: fix) }
            .store(in: &following)
        lane.store(in: &following)
    }

    private func scheduleDeadline() {
        deadline?.cancel()
        guard schedulesDeadlines, let at = roster.nextDeadline else { return }
        let delay = max(0, at.timeIntervalSince(now()))
        deadline = Task { @MainActor [weak self] in
            do { try await Task.sleep(for: .seconds(delay + 1)) } catch { return }
            await self?.reconcile()
        }
    }

    private func clear() {
        roster = .empty
        lastSent = nil
        deadline?.cancel()
        deadline = nil
        following = []
        fixes.stopFollowing()
    }
}

/// Où la liste survit à un lancement : les identifiants et les échéances, jamais une position.
@MainActor
protocol SharedLocationRosterStoring: AnyObject {
    func load() -> SharedLocationRoster?
    func save(_ roster: SharedLocationRoster)
}

/// La liste d'UN compte, dans ses réglages locaux.
final class UserDefaultsSharedLocationRosterStore: SharedLocationRosterStoring {
    private let key: String
    private let defaults: UserDefaults

    init(userId: String, defaults: UserDefaults = .standard) {
        self.key = "sharedLocation.roster." + userId
        self.defaults = defaults
    }

    func load() -> SharedLocationRoster? {
        defaults.data(forKey: key).flatMap { try? JSONDecoder().decode(SharedLocationRoster.self, from: $0) }
    }

    func save(_ roster: SharedLocationRoster) {
        guard !roster.isEmpty, let data = try? JSONEncoder().encode(roster) else {
            defaults.removeObject(forKey: key)
            return
        }
        defaults.set(data, forKey: key)
    }
}

/// Le centre du compte connecté : un autre compte sur le même appareil repart d'une liste vide.
enum SharedLocationSharingHolder {
    private static var current: (userId: String, center: SharedLocationSharingCenter)?

    static func center() -> SharedLocationSharingCenter {
        let userId = AuthManager.shared.currentUser?.id ?? ""
        if let current, current.userId == userId { return current.center }
        current?.center.abandon()
        let center = SharedLocationSharingCenter(
            emitter: SharedLocationSocketEmitter.shared,
            fixes: SharedLocationFixSource(),
            store: UserDefaultsSharedLocationRosterStore(userId: userId)
        )
        current = (userId, center)
        return center
    }
}
