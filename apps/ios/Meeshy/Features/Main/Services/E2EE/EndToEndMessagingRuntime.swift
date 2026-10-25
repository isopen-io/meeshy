import Combine
import Foundation
import MeeshyE2EE
import MeeshySDK
import os

/// L'E2EE libsignal de l'app (#3707, spec E2EE libsignal iOS/macOS § 4) vu par ses deux
/// consommateurs : l'envoi d'une conversation chiffrée, qui scelle pour chaque
/// appareil de la directe, et le fil, qui lit le clair que CET appareil a
/// déchiffré ou envoyé. Le serveur ne voit jamais ce clair : il ne vit que dans
/// la base scellée du groupe d'apps (`e2ee.sqlite`).
nonisolated protocol EndToEndMessagingProviding: Sendable {
    /// Scelle `content` pour les appareils de `peerUserId` et mes appareils
    /// approuvés, puis le remet par `deliver` ; un 409 Sesame rechiffre.
    func deliver<T: Sendable>(
        _ content: E2EEContent,
        from userId: String,
        to peerUserId: String,
        via deliver: @concurrent @Sendable (E2EESealedMessage) async throws -> T
    ) async throws -> T
    /// Range le clair d'un message que J'AI écrit : l'enveloppe ne revient pas
    /// à l'appareil émetteur, et l'écho du serveur ne porte que le littéral.
    func remember(_ content: E2EEContent, from senderUserId: String, as messageIds: [String]) async
    /// Ce que cet appareil sait de ces messages chiffrés.
    func plaintexts(for messageIds: [String]) async -> [String: E2EEPlaintextEntry]
    /// Chaque enveloppe ouverte, par la socket ou le rattrapage.
    var opened: AnyPublisher<E2EEOpenOutcome, Never> { get }
}

/// Une installation prête à chiffrer : enrôlée, et ses outils construits sur
/// l'identité de cet enrôlement.
nonisolated struct EndToEndReadyDevice: Sendable {
    let device: E2EELocalDevice
    let sealer: any E2EEMessageSealing
    let opener: any E2EEEnvelopeOpening
}

/// Ce qui fabrique une installation prête : le seul site qui touche au
/// trousseau, au groupe d'apps et à l'annuaire.
nonisolated protocol EndToEndDeviceProvisioning: Sendable {
    func ready(for userId: String) async throws -> EndToEndReadyDevice
    func plaintexts() throws -> any E2EEPlaintextStoring
    func registrar() throws -> any E2EEDeviceRegistering
}

/// Les appareils chiffrés de MON compte, pour en retirer un quand l'annuaire
/// est plein (`E2EE_DEVICE_LIMIT_REACHED`).
nonisolated protocol EndToEndDeviceManaging: Sendable {
    func ownDevices(of userId: String) async throws -> [E2EEDeviceListing]
    func retire(deviceId: UInt32) async throws
    /// Après un retrait : cet appareil retente de s'enrôler.
    func enroll(_ userId: String) async throws
}

actor EndToEndMessagingRuntime: EndToEndMessagingProviding, EndToEndDeviceManaging {
    static let shared = EndToEndMessagingRuntime(provisioning: LibsignalDeviceProvisioning())

    private let provisioning: any EndToEndDeviceProvisioning
    private var readyDevice: EndToEndReadyDevice?
    private var preparing: Preparation?
    /// La dernière préparation annulée, qui peut encore écrire le coffre : la
    /// suivante l'attend, quelle que soit la voie de l'annulation (audit #12769).
    private var draining: Task<EndToEndReadyDevice, any Error>?
    /// Change à chaque oubli et à chaque préparation remplacée : une
    /// préparation reprise sous une autre génération ne rend rien (#12769).
    private var generation = 0
    private var session: Session = .unbound
    private let relay = OutcomeRelay()

    /// La session que le pont a ouverte : un appel pour un autre compte, resté
    /// en file d'une session précédente, ne prépare ni ne rend rien (#12769).
    private enum Session: Equatable {
        /// Jamais liée (témoins, avant la première ouverture) : tout compte demandé.
        case unbound
        case open(String)
        case closed

        func admits(_ userId: String) -> Bool {
            switch self {
            case .unbound: true
            case .open(let current): current == userId
            case .closed: false
            }
        }
    }

    /// La préparation en vol, liée au compte qui l'a demandée.
    private struct Preparation {
        let userId: String
        let generation: Int
        let task: Task<EndToEndReadyDevice, any Error>
    }

    init(provisioning: any EndToEndDeviceProvisioning) {
        self.provisioning = provisioning
    }

    nonisolated var opened: AnyPublisher<E2EEOpenOutcome, Never> { relay.publisher }

    /// L'installation de ce compte, enrôlée une fois ; une préparation en cours
    /// pour CE compte est partagée. Celle d'un autre compte est annulée et
    /// remplacée, et un appareil n'est rendu, ni gardé, que s'il est celui du
    /// compte demandé sous la génération où il a été demandé (#12769).
    func ready(for userId: String) async throws -> EndToEndReadyDevice {
        guard session.admits(userId) else { throw CancellationError() }
        if let readyDevice, readyDevice.device.userId == userId { return readyDevice }
        let demandedUnder = preparation(for: userId)
        let outcome = await demandedUnder.task.result
        guard demandedUnder.generation == generation else { throw CancellationError() }
        if preparing?.task == demandedUnder.task { preparing = nil }
        let device = try outcome.get()
        guard device.device.userId == userId else { throw CancellationError() }
        readyDevice = device
        return device
    }

    /// Une préparation remplacée écrit encore le coffre et le trousseau
    /// partagés : la suivante attend sa fin avant de commencer (audit #12769).
    private func preparation(for userId: String) -> Preparation {
        if let preparing, preparing.userId == userId { return preparing }
        cancelPreparation()
        let previous = draining
        let preparation = Preparation(
            userId: userId, generation: generation,
            task: Task { [provisioning] in
                _ = await previous?.result
                try Task.checkCancellation()
                return try await provisioning.ready(for: userId)
            }
        )
        preparing = preparation
        return preparation
    }

    private func cancelPreparation() {
        guard let preparing else { return }
        preparing.task.cancel()
        draining = preparing.task
        self.preparing = nil
        generation += 1
    }

    /// À la fermeture de session : l'installation se relira, et se reliera, à
    /// la prochaine ; une préparation en vol est annulée et ne rendra rien.
    func forget() {
        readyDevice = nil
        cancelPreparation()
        generation += 1
    }

    /// L'ouverture d'une session : un autre compte que celui-ci n'est plus servi.
    func open(session userId: String) {
        if session != .open(userId) { forget() }
        session = .open(userId)
    }

    /// La fermeture de la session : plus aucun compte n'est servi jusqu'à la suivante.
    func close() {
        session = .closed
        forget()
    }

    /// La passerelle dit cet appareil délié pour CE compte : seul son appareil
    /// prêt est oublié, la préparation d'un autre compte continue.
    func forgetDevice(of userId: String) {
        guard readyDevice?.device.userId == userId else { return }
        readyDevice = nil
    }

    func deliver<T: Sendable>(
        _ content: E2EEContent,
        from userId: String,
        to peerUserId: String,
        via deliver: @concurrent @Sendable (E2EESealedMessage) async throws -> T
    ) async throws -> T {
        let device = try await ready(for: userId)
        do {
            return try await device.sealer.sealAndDeliver(content, to: peerUserId, deliver: deliver)
        } catch let error as MeeshyError where error.e2eeCode == E2EEErrorCode.deviceNotBound {
            forgetDevice(of: userId)
            throw error
        }
    }

    func remember(_ content: E2EEContent, from senderUserId: String, as messageIds: [String]) async {
        guard let store = try? provisioning.plaintexts() else { return }
        messageIds.forEach { id in try? store.save(.readable(content, senderUserId: senderUserId), for: id) }
    }

    func plaintexts(for messageIds: [String]) async -> [String: E2EEPlaintextEntry] {
        guard !messageIds.isEmpty, let store = try? provisioning.plaintexts() else { return [:] }
        return (try? store.entries(for: messageIds)) ?? [:]
    }

    /// Une enveloppe poussée par la socket de cet appareil.
    func receive(_ envelope: E2EEServedEnvelope, as userId: String) async {
        guard let device = try? await ready(for: userId) else { return }
        publish(await device.opener.receive(envelope))
    }

    /// Le rattrapage : au retour en ligne, chaque enveloppe en attente s'ouvre.
    func catchUp(as userId: String) async {
        do {
            let device = try await ready(for: userId)
            try await device.opener.catchUp().forEach(publish)
        } catch {
            Logger.e2ee.warning("e2ee catch-up deferred: \(String(describing: type(of: error)), privacy: .public)")
        }
    }

    func ownDevices(of userId: String) async throws -> [E2EEDeviceListing] {
        try await provisioning.registrar().ownDevices(userId: userId)
    }

    func retire(deviceId: UInt32) async throws {
        try await provisioning.registrar().retire(deviceId: deviceId)
    }

    func enroll(_ userId: String) async throws {
        forget()
        _ = try await ready(for: userId)
    }

    private func publish(_ outcome: E2EEOpenOutcome) {
        relay.send(outcome)
    }
}

/// Le relais des enveloppes ouvertes, lisible hors de l'acteur. Il n'est
/// alimenté QUE par l'acteur, donc jamais par deux fils à la fois.
/// unchecked: `PassthroughSubject` sérialise déjà ses envois, et `subject` n'est jamais réassigné après l'init.
nonisolated final class OutcomeRelay: @unchecked Sendable {
    private let subject = PassthroughSubject<E2EEOpenOutcome, Never>()
    var publisher: AnyPublisher<E2EEOpenOutcome, Never> { subject.eraseToAnyPublisher() }
    func send(_ outcome: E2EEOpenOutcome) { subject.send(outcome) }
}
