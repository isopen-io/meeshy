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
    /// « Arrêter » n'a pas pu partir : l'intention est gardée, et le centre la fait partir dès le retour du réseau.
    case withdrawalPending
}

/// Réveille le centre après un délai : l'échéance de la personne la plus proche, ou le rejeu d'une échéance qui n'a pas
/// pu se solder. L'app le tient d'une `Task` ; un témoin le déclenche à la main.
@MainActor
protocol SharedLocationWakeScheduling: AnyObject {
    func schedule(after delay: TimeInterval, _ wake: @escaping @MainActor () async -> Void) -> AnyCancellable
}

final class TaskSharedLocationWakeScheduler: SharedLocationWakeScheduling {
    nonisolated deinit {}

    func schedule(after delay: TimeInterval, _ wake: @escaping @MainActor () async -> Void) -> AnyCancellable {
        let task = Task { @MainActor in
            do { try await Task.sleep(for: .seconds(delay)) } catch { return }
            await wake()
        }
        return AnyCancellable { task.cancel() }
    }
}

/// Un verrou d'ordre d'arrivée sur le MainActor : celui qui le tient le passe au premier qui attend.
@MainActor
private final class SharedLocationSerialGate {
    private var held = false
    private var waiting: [CheckedContinuation<Void, Never>] = []

    nonisolated deinit {}

    func tryEnter() -> Bool {
        guard !held else { return false }
        held = true
        return true
    }

    func enter() async {
        guard held else {
            held = true
            return
        }
        await withCheckedContinuation { waiting.append($0) }
    }

    func leave() {
        guard !waiting.isEmpty else {
            held = false
            return
        }
        waiting.removeFirst().resume()
    }
}

/// MON partage de position en cours (#16983), UN par compte connecté : la liste des personnes, l'émission, le suivi de
/// l'appareil et les échéances. Le serveur garde la position complète, scellée, et la tronque pour chaque personne ; ce
/// centre ne floute rien et ne décide d'aucun droit — la passerelle rejuge la loi à chaque envoi.
///
/// Trois lois de révocation (#18166, iso `SharedLocationSharingCenter.kt`) :
/// - UN verrou sérialise démarrages, arrêts, échéances et mises à jour : une mise à jour en vol ne peut pas effacer un
///   partage que le démarrage suivant vient de poser ;
/// - une réponse arrivée après que le compte a quitté l'appareil (`abandon()`) n'adopte rien, n'écrit rien et ne
///   rallume rien ;
/// - dans le doute, on ARRÊTE : sans relevé pour republier une liste réduite, tout le partage s'arrête ; un accusé perdu
///   garde « Arrêter » pour chaque personne que le serveur peut servir ; une échéance qui n'a pas pu se solder est
///   rejouée, et à chaque socket accrochée ; un « Arrêter » qui n'a pas pu partir devient un retrait en attente, gardé et
///   rejoué de la même façon (#18204).
@MainActor
final class SharedLocationSharingCenter: ObservableObject {

    /// Une échéance qui n'a pas pu se solder (hors ligne, refus) est rejouée à ce rythme, et à chaque socket accrochée.
    static let retryDelay: TimeInterval = 30
    /// Une seconde après l'échéance, pour que la personne soit bien sortie de la liste élaguée.
    private static let deadlineSlack: TimeInterval = 1

    @Published private(set) var roster: SharedLocationRoster = .empty
    @Published private(set) var isBusy = false

    private let emitter: SharedLocationEmitting
    private let fixes: SharedLocationFixProviding
    private let store: SharedLocationRosterStoring
    private let now: () -> Date
    private let wakes: SharedLocationWakeScheduling
    private let owner: String
    private let currentAccount: () -> String?
    private let gate = SharedLocationSerialGate()
    private var abandoned = false
    private var lastSent: SharedLocationUpdateGate.Sent?
    private var following = Set<AnyCancellable>()
    private var deadline: AnyCancellable?
    private var socketWatch = Set<AnyCancellable>()

    nonisolated deinit {}

    /// Une liste gardée d'un lancement précédent reprend : le partage serveur court toujours jusqu'à son terme, et
    /// « Arrêter » doit rester à un geste même après que l'app a été tuée. Une échéance passée pendant que l'app
    /// dormait se solde aussitôt, et de nouveau à chaque socket accrochée tant qu'elle n'a pas pu l'être.
    init(
        emitter: SharedLocationEmitting,
        fixes: SharedLocationFixProviding,
        store: SharedLocationRosterStoring,
        now: @escaping () -> Date = Date.init,
        owner: String = "",
        currentAccount: @escaping () -> String? = { nil },
        wakes: SharedLocationWakeScheduling = TaskSharedLocationWakeScheduler(),
        socketReady: AnyPublisher<Void, Never> = Empty().eraseToAnyPublisher()
    ) {
        self.emitter = emitter
        self.fixes = fixes
        self.store = store
        self.now = now
        self.wakes = wakes
        self.owner = owner
        self.currentAccount = currentAccount
        let restored = store.load() ?? .empty
        roster = restored
        let lane = OrderedEventLane()
        socketReady
            .relay(through: lane) { [weak self] _ in await self?.reconcile() }
            .store(in: &socketWatch)
        lane.store(in: &socketWatch)
        guard !restored.isEmpty else { return }
        if restored.hasRecipients { startFollowing() }
        scheduleDeadline()
    }

    func entry(for userId: String) -> SharedLocationRoster.Entry? {
        roster.pruned(now: now()).entry(for: userId)
    }

    /// La ligne de la fiche reste tant qu'un partage court vers cette personne, même si le cercle est descendu sous
    /// Ami : « Arrêter » ne disparaît jamais avant le partage.
    func showsRow(for userId: String, offered: Bool) -> Bool {
        offered || entry(for: userId) != nil
    }

    /// Montrer ma position à une personne, à cette précision et pour cette durée. `nil` : c'est parti.
    @discardableResult
    func share(with userId: String, precision: SharedLocationPrecision, duration: SharedLocationShareDuration) async -> SharedLocationShareProblem? {
        await locked {
            let fix: SharedLocationFix
            switch await self.fixes.currentFix() {
            case .fix(let current): fix = current
            case .denied: return .locationDenied
            case .unavailable: return .locationUnavailable
            }
            guard self.isLive else { return .refused(.failed) }
            let previous = self.roster
            let next = previous.pruned(now: self.now()).adding(userId: userId, precision: precision, duration: duration, now: self.now())
            return await self.publish(next, fix: fix, previous: previous)
        }
    }

    /// Ne plus montrer ma position à cette personne ; les autres gardent la leur. Si l'arrêt ne peut pas partir, la
    /// personne sort quand même de la liste et son retrait part dès que le réseau revient : on ne retouche jamais.
    @discardableResult
    func stopSharing(with userId: String) async -> SharedLocationShareProblem? {
        await locked {
            let problem = await self.withdrawingRepublish(self.roster.pruned(now: self.now()).removing(userId: userId))
            guard problem != nil, self.isLive, self.roster.entry(for: userId) != nil else { return problem }
            self.adopt(self.roster.withdrawing(userId: userId, now: self.now()))
            self.scheduleDeadline()
            if !self.roster.hasRecipients { self.stopFollowingDevice() }
            return .withdrawalPending
        }
    }

    /// Une échéance est passée ou un retrait attend : le faire partir, et rejouer plus tard si ça n'a pas pu se faire.
    func reconcile() async {
        _ = await locked {
            guard !self.roster.isSettled(now: self.now()) else { return nil }
            let pruned = self.roster.pruned(now: self.now())
            guard !pruned.isEmpty || self.roster.hasRecipients else {
                self.adopt(.empty)
                self.deadline = nil
                return nil
            }
            let problem = await self.withdrawingRepublish(pruned)
            if problem != nil, self.isLive { self.arm(after: Self.retryDelay) }
            return problem
        }
    }

    /// Un relevé de l'appareil pendant le partage ; sauté si une publication tient le verrou, le suivant passera. Rien ne
    /// part tant qu'un retrait attend : le serveur sert peut-être encore la personne retirée.
    func didMove(to fix: SharedLocationFix) async {
        guard gate.tryEnter() else { return }
        defer { gate.leave() }
        guard isLive, roster.hasRecipients, !roster.hasPendingWithdrawals, SharedLocationUpdateGate.shouldSend(fix, now: now(), last: lastSent) else { return }
        lastSent = .init(fix: fix, at: now())
        let verdict = await emitter.update(fix)
        if isLive, case .refused(.notSharing) = verdict { wipe() }
    }

    /// Le compte change : cet appareil cesse de suivre la position pour lui, toute réponse encore en vol est écartée, le
    /// terme serveur coupera son partage, et la liste gardée attend son retour pour qu'il puisse encore l'arrêter.
    func abandon() {
        abandoned = true
        deadline = nil
        socketWatch = []
        following = []
        fixes.stopFollowing()
    }

    /// Le centre n'agit que pour le compte qui l'a créé, et tant qu'il est connecté : la socket appartient au compte
    /// courant, et une émission au nom d'un autre partagerait SA position (#18166, iso du ticket Android).
    private var isLive: Bool {
        !abandoned && !owner.isEmpty && currentAccount() == owner
    }

    private func locked(_ operation: @MainActor () async -> SharedLocationShareProblem?) async -> SharedLocationShareProblem? {
        await gate.enter()
        defer { gate.leave() }
        guard isLive else { return .refused(.failed) }
        isBusy = true
        defer { isBusy = false }
        return await operation()
    }

    /// Redémarrer le partage serveur avec une liste réduite demande une position : la dernière envoyée, sinon celle de
    /// l'appareil. Sans l'une ni l'autre (permission retirée, aucun relevé), TOUT s'arrête : retirer une personne ne
    /// dépend jamais de la localisation.
    private func republish(_ wanted: SharedLocationRoster) async -> SharedLocationShareProblem? {
        let next = wanted.settled
        guard next.hasRecipients else { return await stopAll() }
        if let last = freshLastFix { return await publish(next, fix: last, previous: roster) }
        guard case .fix(let fix) = await fixes.currentFix() else { return await stopAll() }
        guard isLive else { return .refused(.failed) }
        return await publish(next, fix: fix, previous: roster)
    }

    /// La liste envoyée solde tous les retraits en attente : c'est elle que le serveur sert dès qu'il l'accepte.
    /// La dernière position envoyée, tant qu'elle a l'âge d'un battement : au-delà, la republier la ferait passer pour
    /// fraîche (le serveur la date de sa réception), on redemande l'appareil.
    private var freshLastFix: SharedLocationFix? {
        guard let lastSent, now().timeIntervalSince(lastSent.at) <= SharedLocationUpdateGate.heartbeat else { return nil }
        return lastSent.fix
    }

    /// Un retrait refusé pour une autre raison que le réseau (débit, liste invalide, partage indisponible) ne se rejoue
    /// pas des heures en laissant la personne servie : on ARRÊTE tout, et `stop` n'est pas limité en débit (#18204).
    private func withdrawingRepublish(_ wanted: SharedLocationRoster) async -> SharedLocationShareProblem? {
        let problem = await republish(wanted)
        guard isLive else { return problem }
        switch problem {
        case .refused(.offline), .refused(.unconfirmed), nil: return problem
        default: return await stopAll()
        }
    }

    private func publish(_ wanted: SharedLocationRoster, fix: SharedLocationFix, previous: SharedLocationRoster) async -> SharedLocationShareProblem? {
        let next = wanted.settled
        guard let request = SharedLocationStartRequest(recipients: next.recipients, duration: next.serverDuration(now: now()), fix: fix) else {
            return .refused(.invalid)
        }
        guard isLive else { return .refused(.failed) }
        let verdict = await emitter.start(request)
        guard isLive else { return .refused(.failed) }
        switch verdict {
        case .started:
            engage(next, fix: fix)
            return nil
        case .refused(.unconfirmed):
            engage(previous.union(next), fix: fix)
            return .refused(.unconfirmed)
        case .refused(let outcome):
            return .refused(outcome)
        }
    }

    private func stopAll() async -> SharedLocationShareProblem? {
        guard isLive else { return .refused(.failed) }
        let stopped = await emitter.stop()
        guard isLive else { return .refused(.failed) }
        guard stopped else { return .refused(.offline) }
        wipe()
        return nil
    }

    private func engage(_ next: SharedLocationRoster, fix: SharedLocationFix) {
        adopt(next)
        lastSent = .init(fix: fix, at: now())
        startFollowing()
        scheduleDeadline()
    }

    private func adopt(_ next: SharedLocationRoster) {
        roster = next
        store.save(next)
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

    /// L'échéance la plus proche réveille le centre ; un retrait en attente le réveille au rythme du rejeu, au plus tard.
    private func scheduleDeadline() {
        let untilDeadline = roster.nextDeadline.map { max(0, $0.timeIntervalSince(now())) + Self.deadlineSlack }
        let untilRetry: TimeInterval? = roster.hasPendingWithdrawals ? Self.retryDelay : nil
        guard let delay = [untilDeadline, untilRetry].compactMap({ $0 }).min() else {
            deadline = nil
            return
        }
        arm(after: delay)
    }

    /// Le minuteur ne fait que réveiller : la réconciliation tourne à part, pour qu'un nouveau minuteur ne l'annule pas.
    private func arm(after delay: TimeInterval) {
        deadline = wakes.schedule(after: delay) { [weak self] in
            guard let self else { return }
            Task { @MainActor in await self.reconcile() }
        }
    }

    private func wipe() {
        adopt(.empty)
        deadline = nil
        stopFollowingDevice()
    }

    private func stopFollowingDevice() {
        lastSent = nil
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
    nonisolated deinit {}

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
    private static var accountWatch: AnyCancellable?

    /// Le centre naît avec la session du compte, pas avec la première fiche ouverte : un retrait ou une échéance gardés
    /// d'un lancement précédent partent à la première socket accrochée, même si l'on n'ouvre aucun profil (#18204).
    static func followAccounts() {
        accountWatch = warmOnEachAccount(AuthManager.shared.$currentUser.map { $0?.id }.eraseToAnyPublisher()) { _ = center() }
    }

    /// Réveille `warm` une fois par compte connecté, jamais pour une session sans compte.
    static func warmOnEachAccount(_ accounts: AnyPublisher<String?, Never>, warm: @escaping () -> Void) -> AnyCancellable {
        accounts
            .compactMap { $0.flatMap { $0.isEmpty ? nil : $0 } }
            .removeDuplicates()
            .sink { _ in warm() }
    }

    static func center() -> SharedLocationSharingCenter {
        let userId = AuthManager.shared.currentUser?.id ?? ""
        if let current, current.userId == userId { return current.center }
        current?.center.abandon()
        let center = SharedLocationSharingCenter(
            emitter: SharedLocationSocketEmitter.shared,
            fixes: SharedLocationFixSource(),
            store: UserDefaultsSharedLocationRosterStore(userId: userId),
            owner: userId,
            currentAccount: { AuthManager.shared.currentUser?.id },
            socketReady: MessageSocketManager.shared.$connectionState
                .map { $0 == .connected }
                .removeDuplicates()
                .filter { $0 }
                .map { _ in () }
                .eraseToAnyPublisher()
        )
        current = (userId, center)
        return center
    }
}
