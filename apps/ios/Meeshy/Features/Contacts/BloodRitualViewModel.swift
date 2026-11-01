import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// Le rituel du Sang, côté écran (#13938). Le serveur tient l'état — jeton, fenêtre de tenue de 15 s, double
/// confirmation, consentements — ; l'écran le PILOTE (`POST /relations/:userId/ritual`) et se synchronise sur les
/// événements `relation:ritual-*`.
///
/// ## L'ordre est celui du serveur, pas celui qu'on aurait dessiné
///
/// Le serveur n'accepte un `confirm` que sur une tenue fraîche (moins de 15 s) des DEUX côtés. Les consentements se
/// choisissent donc AVANT de tenir l'écran, et le scellement part TOUT SEUL dès que les deux tiennent : un écran de
/// consentement après la tenue ferait périmer la tenue, et le rituel serait abandonné à chaque fois.
///
/// ## Lâcher est calme
///
/// Si l'autre lâche (événement `lapsed`, ou refus `RELATION_RITUAL_LAPSED`), rien n'est enregistré et rien n'a changé :
/// l'écran le dit sans alarme et propose de recommencer.
@MainActor
final class BloodRitualViewModel: ObservableObject {

    enum Stage: Equatable {
        /// Les quatre partages, un à un, tous refusés au départ.
        case consent
        /// Prêt à ouvrir.
        case ready
        case opening
        /// Ouvert : on attend que l'autre ouvre et tienne l'écran, et que nous le tenions.
        case waiting
        /// Les deux tiennent : le scellement part.
        case synchronised
        /// Nous avons confirmé, l'autre pas encore.
        case awaitingOther
        case completed
        /// L'autre a lâché : rien n'est enregistré.
        case lapsed
        /// Le rituel ne peut pas se jouer (hors ligne, plus de demande, plus éligible…).
        case unavailable
    }

    let userId: String
    let displayName: String

    @Published private(set) var stage: Stage = .consent
    @Published private(set) var consents: RelationRitualConsents = .allRefused
    @Published private(set) var isHolding = false
    @Published private(set) var otherIsWaiting = false
    @Published private(set) var otherIsHolding = false
    @Published private(set) var refusal: RelationRefusal?
    @Published private(set) var isOfflineUnavailable = false
    @Published var notice: String?

    private let relations: RelationsProviding
    private let networkMonitor: any NetworkMonitorProviding
    private let sleep: @Sendable (UInt64) async -> Void
    private var token: String?
    private var holdWindowMs = 15_000
    private var holdTask: Task<Void, Never>?
    private var subscriptions: Set<AnyCancellable> = []

    /// Les singletons de production sont injectés par `init(userId:displayName:)` (`CirclesLive.swift`).
    init(
        userId: String,
        displayName: String,
        relations: RelationsProviding,
        networkMonitor: any NetworkMonitorProviding,
        sleep: @escaping @Sendable (UInt64) async -> Void = BloodRitualViewModel.wait,
        startedEvents: AnyPublisher<RelationRitualStartedEvent, Never> = RelationEvents.ritualStarted,
        progressEvents: AnyPublisher<RelationRitualProgressEvent, Never> = RelationEvents.ritualProgress,
        completedEvents: AnyPublisher<RelationRitualCompletedEvent, Never> = RelationEvents.ritualCompleted
    ) {
        self.userId = userId
        self.displayName = displayName
        self.relations = relations
        self.networkMonitor = networkMonitor
        self.sleep = sleep
        startedEvents.receive(on: DispatchQueue.main)
            .sink { [weak self] event in Task { @MainActor in self?.receive(started: event) } }
            .store(in: &subscriptions)
        progressEvents.receive(on: DispatchQueue.main)
            .sink { [weak self] event in Task { @MainActor in await self?.receive(progress: event) } }
            .store(in: &subscriptions)
        completedEvents.receive(on: DispatchQueue.main)
            .sink { [weak self] event in Task { @MainActor in self?.receive(completed: event) } }
            .store(in: &subscriptions)
    }

    nonisolated deinit {
        holdTask?.cancel()
    }

    /// L'attente de production d'une tenue : annulable, elle rend la main dès que la tenue prend fin.
    nonisolated static let wait: @Sendable (UInt64) async -> Void = { nanoseconds in
        do {
            try await Task.sleep(for: .nanoseconds(nanoseconds))
        } catch {
            return
        }
    }

    // MARK: - Les consentements d'abord

    func setConsent(_ key: RelationRitualConsentKey, to granted: Bool) {
        guard stage == .consent else { return }
        consents = consents.setting(key, to: granted)
    }

    func proceedFromConsents() {
        guard stage == .consent else { return }
        stage = .ready
    }

    // MARK: - Ouvrir

    func open() async {
        guard stage == .ready else { return }
        guard networkMonitor.isOnline else {
            isOfflineUnavailable = true
            stage = .unavailable
            return
        }
        stage = .opening
        do {
            let step = try await relations.ritual(userId: userId, phase: .start, token: nil, consents: nil)
            token = step.token
            holdWindowMs = step.holdWindowMs ?? holdWindowMs
            stage = .waiting
        } catch {
            handleOpenFailure(error)
        }
    }

    private func handleOpenFailure(_ error: Error) {
        switch RelationRefusal.from(error) {
        case .ritualBusy?:
            stage = .ready
            notice = String(localized: "circles.ritual.busy", defaultValue: "Le rituel se met à jour, réessaie dans un instant", bundle: .main)
        case let served?:
            refusal = served
            stage = .unavailable
        case nil:
            stage = .ready
            notice = String(localized: "circles.ritual.openFailed", defaultValue: "Impossible d'ouvrir le rituel", bundle: .main)
        }
    }

    // MARK: - Tenir l'écran

    func holdBegan() async {
        guard stage == .waiting, !isHolding, token != nil else { return }
        isHolding = true
        HapticFeedback.light()
        await postHold()
        guard isHolding else { return }
        startHoldLoop()
        await sealIfSynchronised()
    }

    func holdEnded() {
        stopHolding()
        if stage == .synchronised { stage = .waiting }
    }

    private func postHold() async {
        guard let token else { return }
        do {
            let step = try await relations.ritual(userId: userId, phase: .hold, token: token, consents: nil)
            holdWindowMs = step.holdWindowMs ?? holdWindowMs
        } catch {
            switch RelationRefusal.from(error) {
            case .ritualNoRequest?, .ritualInvalid?:
                stopHolding()
                refusal = RelationRefusal.from(error)
                stage = .unavailable
            default:
                break
            }
        }
    }

    /// Rejoue `hold` tant que le doigt reste posé : une tenue ne vaut que sa fenêtre.
    private func startHoldLoop() {
        holdTask?.cancel()
        let interval = UInt64(max(holdWindowMs / 3, 1_000)) * 1_000_000
        let sleep = self.sleep
        holdTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                await sleep(interval)
                guard !Task.isCancelled, let self, self.isHolding else { return }
                await self.postHold()
            }
        }
    }

    private func stopHolding() {
        holdTask?.cancel()
        holdTask = nil
        isHolding = false
    }

    // MARK: - Les événements de l'autre

    func receive(started event: RelationRitualStartedEvent) {
        guard event.userId == userId else { return }
        otherIsWaiting = true
    }

    func receive(progress event: RelationRitualProgressEvent) async {
        guard event.userId == userId, matchesToken(event.token) else { return }
        switch event.stage {
        case .held?:
            otherIsHolding = true
            await sealIfSynchronised()
        case .lapsed?:
            lapse()
        case .confirmed?, nil:
            break
        }
    }

    func receive(completed event: RelationRitualCompletedEvent) {
        guard event.userId == userId, matchesToken(event.token) else { return }
        complete()
    }

    private func matchesToken(_ served: String) -> Bool {
        token == nil || token == served
    }

    // MARK: - Sceller

    private func sealIfSynchronised() async {
        guard stage == .waiting, isHolding, otherIsHolding, let token else { return }
        stage = .synchronised
        do {
            let step = try await relations.ritual(userId: userId, phase: .confirm, token: token, consents: consents)
            guard stage != .completed else { return }
            if step.completed == true { complete() } else { stage = .awaitingOther }
        } catch {
            handleConfirmFailure(error)
        }
    }

    private func handleConfirmFailure(_ error: Error) {
        switch RelationRefusal.from(error) {
        case .ritualLapsed?:
            lapse()
        case .ritualNotSynchronised?:
            otherIsHolding = false
            stage = .waiting
        case .consentRequired?:
            stopHolding()
            stage = .consent
        case .ritualBusy?:
            stage = .waiting
        case let served?:
            stopHolding()
            refusal = served
            stage = .unavailable
        case nil:
            stage = .waiting
            notice = String(localized: "circles.ritual.sealFailed", defaultValue: "Le rituel n'a pas pu aboutir, tiens encore l'écran", bundle: .main)
        }
    }

    private func complete() {
        stopHolding()
        stage = .completed
        HapticFeedback.success()
    }

    private func lapse() {
        stopHolding()
        otherIsHolding = false
        stage = .lapsed
    }

    /// Recommencer après un lâcher : l'état du serveur n'a pas changé, il suffit de rouvrir.
    func retry() {
        guard stage == .lapsed else { return }
        stopHolding()
        token = nil
        otherIsHolding = false
        otherIsWaiting = false
        stage = .ready
    }
}
