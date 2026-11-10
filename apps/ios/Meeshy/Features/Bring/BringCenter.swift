import Combine
import Foundation
import MeeshySDK
import UIKit
import MeeshyUI

/// Ce qui fait (et cesse de faire) sonner l'appareil pendant un Bring. Le vrai son est la sonnerie d'appel,
/// RÉUTILISÉE (`RingbackTonePlayer`) ; un double la remplace dans les tests.
@MainActor
protocol BringRinging: AnyObject {
    func startRinging()
    func stopRinging()
}

/// Le Bring qui sonne CHEZ MOI : qui, jusqu'à quand.
struct BringIncoming: Equatable, Identifiable {
    let ring: BringRing
    var name: String?
    var avatarURL: String?
    let deadline: Date

    var id: String { ring.bringId }
}

/// LE BRING SUR iOS (#13936, sous-lot `proche-bring@ios`, iso du web #16589) — l'état des Brings en vol, des deux
/// côtés, pour toute la durée de l'app.
///
/// - **Recevoir** : `bring:ring` (socket) et le push `bring` au premier plan arrivent ICI, dédoublonnés par
///   `bringId` ; l'écran de sonnerie se monte par-dessus l'app, la sonnerie d'appel joue (elle ignore le
///   silencieux), et UN geste l'arrête chez tous les appareils (`DELETE`, optimiste).
/// - **Cesser** : `bring:stopped` (les deux côtés), ou `expiresAt` — aucun événement n'annonce l'expiration.
/// - **Envoyer** : `outgoing` garde, par destinataire, le Bring qui sonne chez lui, pour « Ça sonne chez X · Annuler ».
/// - Un Bring déjà arrêté ou expiré ne resonne JAMAIS, même si son push arrive après son arrêt.
@MainActor
final class BringCenter: ObservableObject {

    /// Borne de la mémoire des Brings vus : une session n'en voit que quelques-uns.
    private static let seenCap = 64

    @Published private(set) var incoming: BringIncoming?
    @Published private(set) var outgoing: [String: BringSent] = [:]

    private let service: BringProviding
    private let people: CirclePeopleResolving
    private let ringer: BringRinging
    private let now: () -> Date
    private let alarms: BringAlarmCoordinator
    private let isAppActive: @MainActor () -> Bool
    private var seen: [String] = []
    private var timers: [String: Task<Void, Never>] = [:]
    private var cancellables = Set<AnyCancellable>()

    nonisolated deinit {}

    init(
        service: BringProviding,
        people: CirclePeopleResolving,
        ringer: BringRinging,
        ringEvents: AnyPublisher<BringRing, Never> = BringEvents.ring,
        stoppedEvents: AnyPublisher<BringStopped, Never> = BringEvents.stopped,
        alarms: BringAlarmCoordinator = .inert,
        isAppActive: @escaping @MainActor () -> Bool = { UIApplication.shared.applicationState == .active },
        now: @escaping () -> Date = { Date() }
    ) {
        self.service = service
        self.people = people
        self.ringer = ringer
        self.now = now
        self.alarms = alarms
        self.isAppActive = isAppActive
        let lane = OrderedEventLane()
        ringEvents
            .relay(through: lane) { [weak self] ring in await self?.receive(ring) }
            .store(in: &cancellables)
        stoppedEvents
            .relay(through: lane) { [weak self] stopped in await self?.didStop(stopped.bringId) }
            .store(in: &cancellables)
        lane.store(in: &cancellables)
    }

    // MARK: - Recevoir

    /// Un Bring arrive (socket, ou push au premier plan). `name` / `avatarURL` : ce que le push a servi ; sans eux,
    /// les caches nomment la personne.
    func receive(_ ring: BringRing, name: String? = nil, avatarURL: String? = nil) {
        guard !seen.contains(ring.bringId), incoming?.id != ring.bringId else { return }
        let deadline = ring.deadline(now: now())
        guard deadline > now() else { return remember(ring.bringId) }
        if let previous = incoming { remember(previous.id) }
        incoming = BringIncoming(ring: ring, name: name.flatMap { $0.isEmpty ? nil : $0 }, avatarURL: avatarURL, deadline: deadline)
        ringer.startRinging()
        HapticFeedback.warning()
        schedule(ring.bringId, at: deadline)
        manageAlarm(for: ring, name: incoming?.name, deadline: deadline)
        if incoming?.name == nil { Task { await self.hydrate(ring) } }
    }

    /// « Arrêter » : un geste, optimiste — le son cesse ici avant que le réseau réponde, et l'arrêt se propage à mes
    /// autres appareils et à l'expéditeur.
    func stopIncoming() {
        guard let current = incoming else { return }
        end(current.id)
        let service = self.service
        Task { try? await service.stop(bringId: current.id) }
    }

    /// Le même geste, depuis le bouton « Arrêter » de l'alarme système (AlarmKit) : l'alarme se tait d'elle-même, le
    /// Bring s'arrête partout.
    func stop(bringId: String) {
        end(bringId)
        let service = self.service
        Task { try? await service.stop(bringId: bringId) }
    }

    /// Le même arrêt, attendu : l'action « Arrêter » d'une bannière s'exécute en arrière-plan, et le système ne la
    /// laisse vivre que le temps de sa réponse.
    func stopAndWait(bringId: String) async {
        end(bringId)
        try? await service.stop(bringId: bringId)
    }

    // MARK: - Envoyer

    func didSend(_ sent: BringSent) {
        outgoing[sent.toUserId] = sent
        let deadline = BringInstant.parse(sent.expiresAt) ?? now().addingTimeInterval(BringContract.ringWindow)
        schedule(sent.bringId, at: deadline)
    }

    /// « Annuler » : l'expéditeur arrête le Bring qui sonne chez l'autre. Optimiste.
    func cancelOutgoing(to userId: String) {
        guard let sent = outgoing[userId] else { return }
        end(sent.bringId)
        let service = self.service
        Task { try? await service.stop(bringId: sent.bringId) }
    }

    // MARK: - Cesser

    /// `bring:stopped` ou push `bring_stopped` : cesser de sonner, des deux côtés.
    func didStop(_ bringId: String) {
        end(bringId)
    }

    /// Ce qui a passé son `expiresAt` cesse — le minuteur l'appelle, sans événement du serveur.
    func expireDue() {
        let instant = now()
        if let current = incoming, current.deadline <= instant { end(current.id) }
        outgoing.values
            .filter { (BringInstant.parse($0.expiresAt) ?? .distantPast) <= instant }
            .forEach { end($0.bringId) }
    }

    private func end(_ bringId: String) {
        remember(bringId)
        let alarms = self.alarms
        Task { await alarms.cancel(bringId: bringId) }
        timers.removeValue(forKey: bringId)?.cancel()
        if incoming?.id == bringId {
            incoming = nil
            ringer.stopRinging()
        }
        outgoing = outgoing.filter { $0.value.bringId != bringId }
    }

    /// AlarmKit sonne là où la sonnerie de l'app ne le peut pas (silencieux, Concentration, app à l'arrière-plan) ; au
    /// premier plan, l'app sonne seule et retire l'alarme qu'une extension aurait posée — jamais deux sonneries.
    private func manageAlarm(for ring: BringRing, name: String?, deadline: Date) {
        let alarms = self.alarms
        let bringId = ring.bringId
        guard alarms.enabled else { return }
        let active = isAppActive()
        guard BringAlarmPlan.appShouldRingAlarm(enabled: alarms.enabled, appIsActive: active) else {
            Task {
                await alarms.cancel(bringId: bringId)
                await alarms.primeAuthorization()
            }
            return
        }
        let request = BringAlarmPlan.Request(
            bringId: bringId,
            title: BringAlarmWording.title(name: name),
            stopLabel: BringAlarmWording.stop,
            deadline: deadline
        )
        Task { await alarms.apply(.ring(request), mayAsk: false) }
    }

    private func remember(_ bringId: String) {
        guard !seen.contains(bringId) else { return }
        seen = Array((seen + [bringId]).suffix(Self.seenCap))
    }

    private func schedule(_ bringId: String, at deadline: Date) {
        timers.removeValue(forKey: bringId)?.cancel()
        let delay = max(0, deadline.timeIntervalSince(now()))
        timers[bringId] = Task { [weak self] in
            do {
                try await Task.sleep(for: .seconds(delay))
            } catch {
                return
            }
            self?.expireDue()
        }
    }

    private func hydrate(_ ring: BringRing) async {
        let known = await people.people(for: [ring.fromUserId])
        guard let person = known[ring.fromUserId], incoming?.id == ring.bringId, var current = incoming else { return }
        current.name = person.name
        current.avatarURL = current.avatarURL ?? person.avatarURL
        incoming = current
    }
}

// MARK: - Les pushes du Bring au premier plan

extension BringCenter {
    /// Les deux types de push que le centre consomme lui-même, sans bannière.
    nonisolated static func handlesPush(_ userInfo: [AnyHashable: Any]) -> Bool {
        guard let type = userInfo["type"] as? String else { return false }
        return type == BringContract.ringPushType || type == BringContract.stoppedPushType
    }

    /// Le push `bring` ou `bring_stopped` reçu par l'app vivante (premier plan, ou un toucher sur la bannière).
    func receive(push ring: BringRing?, stopped: BringStopped?, name: String?, avatarURL: String?) {
        if let stopped { didStop(stopped.bringId) }
        if let ring { receive(ring, name: name, avatarURL: avatarURL?.isEmpty == true ? nil : avatarURL) }
    }
}
