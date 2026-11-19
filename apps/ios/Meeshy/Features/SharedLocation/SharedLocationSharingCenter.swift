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
    /// Un relevé SANS jamais demander la permission (#18714) : un retrait ou une échéance ne la fait pas surgir. `nil`
    /// tant que la localisation « pendant l'utilisation » n'est pas déjà accordée, ou sans relevé.
    func silentFix() async -> SharedLocationFix?
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
/// - dans le doute, on ARRÊTE : une liste réduite part SEULE (#19287), et sans relevé pour la republier devant une
///   passerelle d'avant, tout le partage s'arrête ; un accusé perdu
///   garde « Arrêter » pour chaque personne que le serveur peut servir ; une échéance qui n'a pas pu se solder est
///   rejouée, et à chaque socket accrochée ; un « Arrêter » qui n'a pas pu partir devient un retrait en attente, gardé et
///   rejoué de la même façon (#18204).
///
/// PLUSIEURS APPAREILS, UN PARTAGE (#18389, #18578, iso `shared-location-sharing.ts` du web) : la passerelle n'en connaît
/// qu'un par compte, et c'est lui qui fait foi. `sync()` relit ce qu'elle sert (à chaque socket accrochée et à chaque
/// `location:share-own-changed`) et s'y recale, retraits en attente d'ici gagnants : un retrait fait ailleurs s'applique
/// ici, un ajout fait ailleurs n'est plus effacé par la liste périmée de cet appareil. Une liste REÇUE d'un autre appareil
/// ne fait jamais partir la position d'ici : ni suivi, ni reprise au lancement, et une échéance s'y solde sans rien
/// envoyer — la passerelle tient l'échéance de chacun (#18205). Seul un geste d'ici (« Partager », « Arrêter ») envoie
/// quelque chose ; « Partager » fait de cet appareil celui qui publie.
@MainActor
final class SharedLocationSharingCenter: ObservableObject {

    /// Une échéance qui n'a pas pu se solder (hors ligne, refus) est rejouée à ce rythme, et à chaque socket accrochée.
    static let retryDelay: TimeInterval = 30
    /// Une seconde après l'échéance, pour que la personne soit bien sortie de la liste élaguée.
    private static let deadlineSlack: TimeInterval = 1

    @Published private(set) var roster: SharedLocationRoster = .empty
    @Published private(set) var isBusy = false
    /// La passerelle sert-elle « Prévenir » et la batterie (#19204) ? `nil` : on ne sait pas encore (on les propose) ;
    /// `false` : elle a refusé leurs clés, l'écran ne les propose plus.
    @Published private(set) var servesShareOptions: Bool?
    /// La passerelle accepte-t-elle un point choisi à la main (`acceptsManualSource`, #19557) ? Tant qu'elle ne l'a pas
    /// dit, « Choisir sur la carte » n'est pas proposé (#19558).
    @Published private(set) var servesFixedPoint = false
    /// La passerelle accepte-t-elle un partage sans fin entre Sangs (`acceptsUntilStopped`, #19616) ? Tant qu'elle ne
    /// l'a pas dit, « Jusqu'à ce que j'arrête » reste verrouillé.
    @Published private(set) var servesUntilStopped = false

    private let emitter: SharedLocationEmitting
    private let fixes: SharedLocationFixProviding
    private let store: SharedLocationRosterStoring
    private let now: () -> Date
    private let wakes: SharedLocationWakeScheduling
    private let owner: String
    private let currentAccount: () -> String?
    private let served: @MainActor () async -> SharedLocationOwnSnapshot?
    private let gate = SharedLocationSerialGate()
    private var abandoned = false
    private var lastSent: SharedLocationUpdateGate.Sent?
    /// Le point choisi à la main que le partage montre, en mémoire seulement : une liste réduite se republie avec lui.
    private var pinnedFix: SharedLocationFix?
    /// La liste vient d'un autre appareil du compte : celui-ci ne publie pas sa position (#18578).
    private var received: Bool
    /// Le dernier démarrage avec position que CET appareil a fait accepter (`startedAt` de l'accusé, #18580) ; `nil` :
    /// inconnu (accusé perdu), le démarrage servi est alors pris pour le sien. Gardé avec la marque « reçue » (#19681) :
    /// relancé après qu'un autre appareil a repris le partage, celui-ci ne prend pas le démarrage de l'autre pour le sien.
    private var publishedStart: String? {
        didSet { if publishedStart != oldValue { store.savePublishedStart(publishedStart) } }
    }
    /// Relancé avec une liste qu'il publiait, l'appareil suit sa position mais n'en envoie rien avant d'avoir relu ce que
    /// la passerelle sert (#19767) : un autre appareil a pu reprendre le partage pendant qu'il dormait. Une relecture qui
    /// n'aboutit pas (hors ligne, passerelle d'avant) lève l'attente, comme un « Partager » d'ici.
    private var awaitsServedTruth = false
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
        socketReady: AnyPublisher<Void, Never> = Empty().eraseToAnyPublisher(),
        ownChanged: AnyPublisher<Void, Never> = Empty().eraseToAnyPublisher(),
        served: @escaping @MainActor () async -> SharedLocationOwnSnapshot? = { nil }
    ) {
        self.emitter = emitter
        self.fixes = fixes
        self.store = store
        self.now = now
        self.wakes = wakes
        self.owner = owner
        self.currentAccount = currentAccount
        self.served = served
        let restored = store.load() ?? .empty
        roster = restored
        received = store.loadReceived()
        publishedStart = store.loadPublishedStart()
        let lane = OrderedEventLane()
        socketReady
            .relay(through: lane) { [weak self] _ in
                await self?.sync()
                await self?.reconcile()
            }
            .store(in: &socketWatch)
        ownChanged
            .relay(through: lane) { [weak self] _ in await self?.sync() }
            .store(in: &socketWatch)
        lane.store(in: &socketWatch)
        guard !restored.isEmpty else { return }
        if restored.hasRecipients, !received, !restored.isFixedPoint {
            awaitsServedTruth = true
            startFollowing()
        }
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

    /// Montrer ma position à une personne, à cette précision et pour cette durée. `nil` : c'est parti. `notify` la
    /// prévient (#19204) ; `battery` accorde ou retire ma batterie pour tout le partage, `nil` garde l'accord en cours.
    @discardableResult
    func share(
        with userId: String,
        precision: SharedLocationPrecision,
        duration: SharedLocationShareDuration,
        notify: Bool = false,
        battery: Bool? = nil
    ) async -> SharedLocationShareProblem? {
        await share(with: userId, precision: precision, term: .bounded(duration), notify: notify, battery: battery)
    }

    /// Le même geste pour un terme : une durée servie, ou « jusqu'à ce que j'arrête » (#19616), refusé tant que la
    /// passerelle ne l'annonce pas. Le cercle Sang est rejugé par elle.
    @discardableResult
    func share(
        with userId: String,
        precision: SharedLocationPrecision,
        term: SharedLocationShareTerm,
        notify: Bool = false,
        battery: Bool? = nil
    ) async -> SharedLocationShareProblem? {
        await locked {
            guard self.accepts(term) else { return .refused(.unavailable) }
            let fix: SharedLocationFix
            switch await self.fixes.currentFix() {
            case .fix(let current): fix = current
            case .denied: return .locationDenied
            case .unavailable: return .locationUnavailable
            }
            guard self.isLive else { return .refused(.failed) }
            let next = self.adding(userId, precision: precision, term: term, battery: battery).withFixedPoint(false)
            return await self.publish(next, fix: fix, previous: self.roster, claimsPublishing: true, notify: notify)
        }
    }

    /// Montrer à une personne un point CHOISI à la main sur la carte (#19558) : aucun relevé n'est demandé à l'appareil,
    /// donc aucune permission, et l'appareil n'est jamais suivi. Refusé tant que la passerelle n'accepte pas un point.
    @discardableResult
    func sharePoint(
        _ point: SharedLocationFix,
        with userId: String,
        precision: SharedLocationPrecision,
        duration: SharedLocationShareDuration,
        notify: Bool = false,
        battery: Bool? = nil
    ) async -> SharedLocationShareProblem? {
        await sharePoint(point, with: userId, precision: precision, term: .bounded(duration), notify: notify, battery: battery)
    }

    @discardableResult
    func sharePoint(
        _ point: SharedLocationFix,
        with userId: String,
        precision: SharedLocationPrecision,
        term: SharedLocationShareTerm,
        notify: Bool = false,
        battery: Bool? = nil
    ) async -> SharedLocationShareProblem? {
        await locked {
            guard self.servesFixedPoint, self.accepts(term) else { return .refused(.unavailable) }
            let next = self.adding(userId, precision: precision, term: term, battery: battery).withFixedPoint(true)
            return await self.publish(next, fix: point, previous: self.roster, claimsPublishing: true, notify: notify)
        }
    }

    private func adding(
        _ userId: String,
        precision: SharedLocationPrecision,
        term: SharedLocationShareTerm,
        battery: Bool?
    ) -> SharedLocationRoster {
        let added = roster.pruned(now: now()).adding(userId: userId, precision: precision, term: term, now: now())
        return battery.map { added.withBattery($0) } ?? added
    }

    private func accepts(_ term: SharedLocationShareTerm) -> Bool {
        term != .untilStopped || servesUntilStopped
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
                self.markReceived(false)
                self.publishedStart = nil
                self.deadline = nil
                return nil
            }
            if self.received, !pruned.hasPendingWithdrawals {
                if pruned.isEmpty { self.wipe() } else { self.adopt(pruned) }
                self.scheduleDeadline()
                return nil
            }
            let problem = await self.withdrawingRepublish(pruned)
            if problem != nil, self.isLive { self.arm(after: Self.retryDelay) }
            return problem
        }
    }

    /// Se recale sur le partage que la passerelle sert : un autre appareil du compte a pu le changer (#18578). Une
    /// relecture qui échoue (hors ligne, passerelle d'avant #18389) ne change rien.
    func sync() async {
        _ = await locked {
            let read = await self.served()
            guard self.isLive else { return nil }
            self.awaitsServedTruth = false
            guard let truth = read else { return nil }
            if truth.shareBattery != nil { self.servesShareOptions = true }
            if truth.acceptsManualSource { self.servesFixedPoint = true }
            if truth.acceptsUntilStopped { self.servesUntilStopped = true }
            let before = self.roster
            let next = before.withServed(truth, now: self.now())
            guard next != before else {
                if !self.received, next.hasRecipients { self.followServedStart(truth.startedAt) }
                return nil
            }
            self.adopt(next)
            if !next.hasRecipients {
                self.stopFollowingDevice()
                self.markReceived(false)
                self.publishedStart = nil
            } else if !before.hasRecipients {
                self.markReceived(true)
            } else if !self.received {
                self.followServedStart(truth.startedAt)
            }
            self.scheduleDeadline()
            return nil
        }
    }

    /// Un relevé de l'appareil pendant le partage ; sauté si une publication tient le verrou, le suivant passera. Rien ne
    /// part tant qu'un retrait attend : le serveur sert peut-être encore la personne retirée.
    func didMove(to fix: SharedLocationFix) async {
        guard gate.tryEnter() else { return }
        defer { gate.leave() }
        guard isLive, !received, !awaitsServedTruth, roster.hasRecipients, !roster.isFixedPoint, !roster.hasPendingWithdrawals, SharedLocationUpdateGate.shouldSend(fix, now: now(), last: lastSent) else { return }
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

    /// Retirer quelqu'un ou solder une échéance republie la LISTE SEULE (#19287, iso du web #19284) : la passerelle
    /// reprend le point qu'elle garde, et cet appareil n'envoie pas sa position — il peut n'avoir fait que recevoir la
    /// liste d'un autre appareil (#18580), et aucun retrait ne demande la permission de localisation (#18714).
    /// « Pas de partage » : la passerelle dit ce qui court (`settleNotSharing`). Une passerelle d'avant refuse la
    /// liste seule (`INVALID`) : la liste repart avec une position, la dernière envoyée, sinon celle de l'appareil ;
    /// sans l'une ni l'autre (permission retirée, aucun relevé), TOUT s'arrête : retirer une personne ne dépend jamais
    /// de la localisation. Un point choisi se republie lui-même, jamais un relevé (#19558) ; perdu avec un lancement,
    /// on arrête. Relancé et pas encore relu (#19767), l'appareil ne republie pas SA position à la place de la liste :
    /// le retrait reste en attente et se rejoue après la relecture.
    private func republish(_ wanted: SharedLocationRoster) async -> SharedLocationShareProblem? {
        let next = wanted.settled
        guard next.hasRecipients else { return await stopAll() }
        switch await publishListOnly(next) {
        case .refused(.invalid): break
        case .refused(.notSharing): return await settleNotSharing()
        case let problem: return problem
        }
        guard isLive else { return .refused(.failed) }
        if next.isFixedPoint {
            guard let pinnedFix else { return await stopAll() }
            return await publish(next, fix: pinnedFix, previous: roster)
        }
        if let last = freshLastFix { return await publish(next, fix: last, previous: roster) }
        guard !awaitsServedTruth else { return .refused(.unconfirmed) }
        guard let fix = await fixes.silentFix() else { return await stopAll() }
        guard isLive else { return .refused(.failed) }
        return await publish(next, fix: fix, previous: roster)
    }

    /// La liste seule, sans « Prévenir » (elle n'ajoute personne) et sans repli : une passerelle qui la connaît connaît
    /// aussi les options et les échéances par personne. La batterie accordée part avec elle ; absente, la passerelle
    /// garde la sienne.
    private func publishListOnly(_ wanted: SharedLocationRoster) async -> SharedLocationShareProblem? {
        let next = wanted.settled.withBattery(wanted.sharesBattery && servesShareOptions != false)
        let instant = now()
        guard let request = SharedLocationStartRequest(
            listOnly: next.deadlinedRecipients(now: instant), duration: next.serverDuration(now: instant),
            shareBattery: next.sharesBattery, untilStopped: next.isOpenEnded
        ) else {
            return .refused(.invalid)
        }
        guard isLive else { return .refused(.failed) }
        let previous = roster
        let verdict = await emitter.start(request)
        guard isLive else { return .refused(.failed) }
        return settle(verdict, next: next, fix: nil, previous: previous, claimsPublishing: false)
    }

    /// « Pas de partage » à une liste seule couvre aussi une session remplacée par un autre appareil pendant l'envoi : la
    /// passerelle dit ce qui court. Un partage servi ⇒ le retrait reste en attente et se rejoue (la liste seule ignore
    /// qui n'est plus servi), comme une relecture qui ne conclut pas : vider sur la foi d'une panne laisserait la
    /// personne servie. Seul un partage servi VIDE vide la liste, sans arrêt ni relevé.
    private func settleNotSharing() async -> SharedLocationShareProblem? {
        let truth = await served()
        guard isLive else { return .refused(.failed) }
        guard let truth, truth.recipients.isEmpty else { return .refused(.unconfirmed) }
        wipe()
        return nil
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

    /// `claimsPublishing` : le geste « Partager » d'ici fait de cet appareil celui qui publie — mais seulement une fois le
    /// démarrage accepté (ou son accusé perdu) : un « Partager » refusé laisse un appareil qui n'a fait que RECEVOIR la
    /// liste muet, même au prochain lancement.
    private func publish(
        _ wanted: SharedLocationRoster,
        fix: SharedLocationFix,
        previous: SharedLocationRoster,
        claimsPublishing: Bool = false,
        notify: Bool = false
    ) async -> SharedLocationShareProblem? {
        let offersOptions = servesShareOptions != false
        let next = wanted.settled.withBattery(wanted.sharesBattery && offersOptions)
        let instant = now()
        let recipients = next.deadlinedRecipients(now: instant)
        guard let request = SharedLocationStartRequest(
            recipients: recipients, duration: next.serverDuration(now: instant), fix: fix,
            notifyRecipients: notify && offersOptions, shareBattery: next.sharesBattery,
            source: next.isFixedPoint ? .manual : .device, untilStopped: next.isOpenEnded
        ) else {
            return .refused(.invalid)
        }
        guard isLive else { return .refused(.failed) }
        let verdict = await startTolerant(request)
        guard isLive else { return .refused(.failed) }
        return settle(verdict, next: next.withBattery(next.sharesBattery && servesShareOptions != false), fix: fix,
                      previous: previous, claimsPublishing: claimsPublishing)
    }

    private func settle(
        _ verdict: SharedLocationStartVerdict,
        next: SharedLocationRoster,
        fix: SharedLocationFix?,
        previous: SharedLocationRoster,
        claimsPublishing: Bool
    ) -> SharedLocationShareProblem? {
        switch verdict {
        case .started(_, let startedAt):
            if claimsPublishing { claimPublishing() }
            if fix != nil { publishedStart = startedAt }
            engage(next, fix: fix)
            return nil
        case .refused(.unconfirmed):
            if claimsPublishing { claimPublishing() }
            forgetPublishedStart(ifSent: fix)
            engage(previous.union(next), fix: fix)
            return .refused(.unconfirmed)
        case .refused(let outcome):
            forgetPublishedStart(ifSent: fix)
            return .refused(outcome)
        }
    }

    /// La passerelle a PU appliquer un démarrage avec position qu'elle refuse ensuite (accusé perdu, panne après la
    /// prise, session remplacée) : dans le doute, inconnu — deux appareils publient plutôt qu'aucun (#18580).
    private func forgetPublishedStart(ifSent fix: SharedLocationFix?) {
        if fix != nil { publishedStart = nil }
    }

    /// Une passerelle d'avant #19204 refuse « Prévenir » et la batterie, une d'avant #18205 l'échéance par personne
    /// (`INVALID`) : la même liste repart sans les options, puis sans les échéances, et le centre retire chacun à son
    /// échéance, comme avant. Ce que la passerelle a pris ou refusé des options se retient.
    private func startTolerant(_ request: SharedLocationStartRequest) async -> SharedLocationStartVerdict {
        var verdict = await emitter.start(request)
        var sent = request
        for fallback in request.legacyFallbacks where verdict == .refused(.invalid) && isLive {
            sent = fallback
            verdict = await emitter.start(fallback)
        }
        learnOptions(asked: request, sent: sent, verdict: verdict)
        return verdict
    }

    private func learnOptions(asked: SharedLocationStartRequest, sent: SharedLocationStartRequest, verdict: SharedLocationStartVerdict) {
        guard isLive, asked.carriesExtras, case .started = verdict else { return }
        servesShareOptions = sent.carriesExtras
    }

    private func stopAll() async -> SharedLocationShareProblem? {
        guard isLive else { return .refused(.failed) }
        let stopped = await emitter.stop()
        guard isLive else { return .refused(.failed) }
        guard stopped else { return .refused(.offline) }
        wipe()
        return nil
    }

    /// `fix` nul : une liste seule, qui n'a rien envoyé de nouveau — le point choisi et la dernière position envoyée
    /// restent ceux d'avant.
    private func engage(_ next: SharedLocationRoster, fix: SharedLocationFix?) {
        adopt(next)
        let pinned = fix ?? pinnedFix
        if next.isFixedPoint { stopFollowingDevice() }
        pinnedFix = next.isFixedPoint ? pinned : nil
        if let fix { lastSent = .init(fix: fix, at: now()) }
        if next.hasRecipients, !received, !next.isFixedPoint { startFollowing() }
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

    private func claimPublishing() {
        awaitsServedTruth = false
        markReceived(false)
    }

    private func markReceived(_ next: Bool) {
        received = next
        store.saveReceived(next)
    }

    private func wipe() {
        adopt(.empty)
        markReceived(false)
        publishedStart = nil
        deadline = nil
        stopFollowingDevice()
    }

    /// UN SEUL APPAREIL PUBLIE (#18580, iso `followServedStart` du web) : celui du dernier « Partager ». La passerelle
    /// nomme ce démarrage (`startedAt`), l'accusé de cet appareil en a gardé un ; s'ils diffèrent, un autre appareil a
    /// partagé après lui. « Arrêter » reste à un geste, la position ne part plus — sinon la personne verrait le point
    /// sauter d'un appareil à l'autre. Sans accusé lisible, le démarrage servi est pris pour le sien ; sans `startedAt`
    /// (passerelle d'avant), rien ne change. Aucune horloge n'est comparée.
    private func followServedStart(_ served: String?) {
        guard let served else { return }
        guard let mine = publishedStart else {
            publishedStart = served
            return
        }
        guard served != mine else { return }
        markReceived(true)
        publishedStart = nil
        stopFollowingDevice()
    }

    private func stopFollowingDevice() {
        lastSent = nil
        pinnedFix = nil
        following = []
        fixes.stopFollowing()
    }
}

/// Où la liste survit à un lancement : les identifiants et les échéances, jamais une position.
@MainActor
protocol SharedLocationRosterStoring: AnyObject {
    func load() -> SharedLocationRoster?
    func save(_ roster: SharedLocationRoster)
    /// La liste vient-elle d'un autre appareil du compte (#18578) ? Survit au lancement : un appareil qui n'a fait que
    /// RECEVOIR la liste ne se remet jamais à publier sa position en se relançant.
    func loadReceived() -> Bool
    func saveReceived(_ received: Bool)
    /// Le démarrage que CET appareil a fait accepter (#19681) : survit au lancement avec la marque « reçue », s'efface
    /// avec elle (arrêt, cession), et vit sous la clé du compte comme la liste.
    func loadPublishedStart() -> String?
    func savePublishedStart(_ startedAt: String?)
}

/// La liste d'UN compte, dans ses réglages locaux. Les réglages partent dans la sauvegarde iCloud : un iPhone restauré
/// depuis la sauvegarde d'un AUTRE appareil du compte y retrouverait la liste, la marque « reçue » et le démarrage de
/// celui-ci, et publierait avec lui (#19767). La liste porte donc l'identifiant d'installation de l'appareil qui l'a
/// écrite (trousseau `ThisDeviceOnly`, jamais restauré ailleurs) : lue sur un autre appareil, elle est REÇUE, sans
/// démarrage gardé — seul un « Partager » d'ici le refait publier. Une liste d'avant cette marque est adoptée telle quelle.
final class UserDefaultsSharedLocationRosterStore: SharedLocationRosterStoring {
    nonisolated deinit {}

    private let key: String
    private let defaults: UserDefaults

    /// La liste écrite ailleurs devient REÇUE et perd son démarrage dans les réglages AVANT que la marque passe à cet
    /// appareil : déduite sans être écrite, la cession ne tiendrait qu'un lancement.
    init(userId: String, deviceId: String?, defaults: UserDefaults = .standard) {
        self.key = "sharedLocation.roster." + userId
        self.defaults = defaults
        let marker = key + ".device"
        let stamped = defaults.string(forKey: marker)
        if Self.isWrittenElsewhere(stamped: stamped, device: deviceId) {
            if load()?.hasRecipients == true { saveReceived(true) }
            savePublishedStart(nil)
        }
        if let deviceId, !deviceId.isEmpty, stamped != deviceId { defaults.set(deviceId, forKey: marker) }
    }

    static func isWrittenElsewhere(stamped: String?, device: String?) -> Bool {
        guard let stamped, !stamped.isEmpty, let device, !device.isEmpty else { return false }
        return stamped != device
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

    func loadReceived() -> Bool { defaults.bool(forKey: key + ".received") }

    func saveReceived(_ received: Bool) {
        if received { defaults.set(true, forKey: key + ".received") } else { defaults.removeObject(forKey: key + ".received") }
    }

    func loadPublishedStart() -> String? { defaults.string(forKey: key + ".publishedStart") }

    func savePublishedStart(_ startedAt: String?) {
        if let startedAt { defaults.set(startedAt, forKey: key + ".publishedStart") } else { defaults.removeObject(forKey: key + ".publishedStart") }
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
            emitter: SharedLocationMotionTaggingEmitter(inner: SharedLocationSocketEmitter.shared, motion: SharedLocationMotionSource()),
            fixes: SharedLocationFixSource(),
            store: UserDefaultsSharedLocationRosterStore(userId: userId, deviceId: PushDeviceIdentity.current().deviceId),
            owner: userId,
            currentAccount: { AuthManager.shared.currentUser?.id },
            socketReady: MessageSocketManager.shared.$connectionState
                .map { $0 == .connected }
                .removeDuplicates()
                .filter { $0 }
                .map { _ in () }
                .eraseToAnyPublisher(),
            ownChanged: SharedLocationEvents.ownChanged,
            served: { try? await RelationsService.shared.ownSharedLocation() }
        )
        current = (userId, center)
        return center
    }
}
