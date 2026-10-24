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
    private var preparing: Task<EndToEndReadyDevice, any Error>?
    private let relay = OutcomeRelay()

    init(provisioning: any EndToEndDeviceProvisioning) {
        self.provisioning = provisioning
    }

    nonisolated var opened: AnyPublisher<E2EEOpenOutcome, Never> { relay.publisher }

    /// L'installation de ce compte, enrôlée une fois ; une préparation en cours est partagée.
    func ready(for userId: String) async throws -> EndToEndReadyDevice {
        if let readyDevice, readyDevice.device.userId == userId { return readyDevice }
        if let preparing { return try await preparing.value }
        let task = Task { [provisioning] in try await provisioning.ready(for: userId) }
        preparing = task
        defer { preparing = nil }
        let device = try await task.value
        readyDevice = device
        return device
    }

    /// À la fermeture de session : l'installation se relira, et se reliera, à la prochaine.
    func forget() {
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
            forget()
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
