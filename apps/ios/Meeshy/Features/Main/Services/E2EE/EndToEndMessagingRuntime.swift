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
    /// `false` quand il n'a pas pu être rangé : l'envoi chiffré ne part pas.
    @discardableResult
    func remember(_ content: E2EEContent, from senderUserId: String, as messageIds: [String]) async -> Bool
    /// Ce que cet appareil sait de ces messages chiffrés, pour `account`, que
    /// l'appelant affirme (#13000) : rien si ce n'est pas le compte de la
    /// session ouverte, ou si le coffre n'est pas enrôlé pour lui. L'appelant
    /// le dit parce que la session se ferme derrière une file : une interface
    /// déjà basculée vers un autre compte ne lit jamais le coffre du précédent.
    func plaintexts(for messageIds: [String], as account: String) async -> [String: E2EEPlaintextEntry]
    /// Retire du coffre de `account` le clair de ces messages, effacés sur cet
    /// appareil (#13001). `false` quand le coffre n'est pas le sien ou que sa
    /// session n'est pas ouverte : rien n'est retiré, l'effacement attend.
    func erase(_ messageIds: [String], as account: String) async -> Bool
    /// Les messages dont le coffre de `account` tient le clair ; `nil` si ce
    /// coffre n'est pas le sien.
    func storedMessageIds(as account: String) async -> [String]?
    /// Chaque enveloppe ouverte, par la socket ou le rattrapage.
    var opened: AnyPublisher<E2EEOpenOutcome, Never> { get }
    /// Le compte de chaque session qui s'ouvre (`nil` à la fermeture) : ce qui
    /// a lu le coffre avant elle le relit (#13000).
    var sessions: AnyPublisher<String?, Never> { get }
}

/// Une installation prête à chiffrer : enrôlée, et ses outils construits sur
/// l'identité de cet enrôlement — l'appairage de mes appareils (#13009)
/// partage le cipher, l'annuaire et les approbations du scelleur.
nonisolated struct EndToEndReadyDevice: Sendable {
    let device: E2EELocalDevice
    let sealer: any E2EEMessageSealing
    let opener: any E2EEEnvelopeOpening
    let linking: any E2EEOwnDeviceLinkingProviding
    /// Les métadonnées de mes appareils (`GET /e2ee/devices`) : elles nomment,
    /// elles n'approuvent jamais.
    let ownDeviceDetails: @concurrent @Sendable () async throws -> [E2EEOwnDeviceDetails]

    init(
        device: E2EELocalDevice,
        sealer: any E2EEMessageSealing,
        opener: any E2EEEnvelopeOpening,
        linking: any E2EEOwnDeviceLinkingProviding = UnavailableOwnDeviceLinking(),
        ownDeviceDetails: @escaping @concurrent @Sendable () async throws -> [E2EEOwnDeviceDetails] = { [] }
    ) {
        self.device = device
        self.sealer = sealer
        self.opener = opener
        self.linking = linking
        self.ownDeviceDetails = ownDeviceDetails
    }
}

/// Ce qui fabrique une installation prête : le seul site qui touche au
/// trousseau, au groupe d'apps et à l'annuaire.
nonisolated protocol EndToEndDeviceProvisioning: Sendable {
    func ready(for userId: String) async throws -> EndToEndReadyDevice
    /// Le coffre des clairs, servi au seul compte dont l'installation est enrôlée.
    func plaintexts(owner: String) throws -> any E2EEPlaintextStoring
    func registrar() throws -> any E2EEDeviceRegistering
}

/// Les appareils chiffrés de MON compte, pour en retirer un quand l'annuaire
/// est plein (`E2EE_DEVICE_LIMIT_REACHED`).
nonisolated protocol EndToEndDeviceManaging: Sendable {
    func ownDevices(of userId: String) async throws -> [E2EEDeviceListing]
    /// La génération lue est nommée : une place reprise depuis n'est pas retirée (#13036).
    func retire(deviceId: UInt32, registrationId: UInt32) async throws
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

        /// Le compte que la session sert ; aucun avant la première ouverture
        /// ni après la fermeture : le coffre ne se lit pour personne.
        var account: String? {
            guard case .open(let current) = self else { return nil }
            return current
        }

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
    nonisolated var sessions: AnyPublisher<String?, Never> { relay.sessions }

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
        relay.announce(userId)
    }

    /// La fermeture de la session : plus aucun compte n'est servi jusqu'à la suivante.
    func close() {
        session = .closed
        forget()
        relay.announce(nil)
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

    @discardableResult
    func remember(_ content: E2EEContent, from senderUserId: String, as messageIds: [String]) async -> Bool {
        guard let owner = session.account, owner == senderUserId else {
            Logger.e2ee.warning("e2ee own plaintext not stored: no open session for its author")
            return false
        }
        do {
            let store = try provisioning.plaintexts(owner: owner)
            // Un premier envoi peut précéder l'enrôlement de la session : il l'attend.
            if try !store.servesItsOwner() { _ = try await ready(for: owner) }
            try messageIds.forEach { id in try store.save(.readable(content, senderUserId: senderUserId), for: id) }
            return true
        } catch {
            Logger.e2ee.error("e2ee own plaintext not stored count=\(messageIds.count, privacy: .public): \(String(describing: type(of: error)), privacy: .public)")
            return false
        }
    }

    func plaintexts(for messageIds: [String], as account: String) async -> [String: E2EEPlaintextEntry] {
        guard !messageIds.isEmpty, let owner = session.account, owner == account else { return [:] }
        do {
            return try provisioning.plaintexts(owner: owner).entries(for: messageIds)
        } catch {
            Logger.e2ee.error("e2ee plaintexts unreadable count=\(messageIds.count, privacy: .public): \(String(describing: type(of: error)), privacy: .public)")
            return [:]
        }
    }

    func erase(_ messageIds: [String], as account: String) async -> Bool {
        guard let owner = session.account, owner == account else { return false }
        guard !messageIds.isEmpty else { return true }
        do {
            try provisioning.plaintexts(owner: owner).remove(messageIds)
            return true
        } catch {
            Logger.e2ee.warning("e2ee plaintexts not erased count=\(messageIds.count, privacy: .public): \(String(describing: type(of: error)), privacy: .public)")
            return false
        }
    }

    func storedMessageIds(as account: String) async -> [String]? {
        guard let owner = session.account, owner == account,
              let store = try? provisioning.plaintexts(owner: owner),
              let ids = try? store.storedMessageIds(), (try? store.servesItsOwner()) == true else { return nil }
        return ids
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

    func retire(deviceId: UInt32, registrationId: UInt32) async throws {
        try await provisioning.registrar().retire(deviceId: deviceId, registrationId: registrationId)
    }

    func enroll(_ userId: String) async throws {
        forget()
        _ = try await ready(for: userId)
    }

    /// Chaque issue d'une enveloppe laisse UNE ligne de journal, sans contenu (#12916).
    private func publish(_ outcome: E2EEOpenOutcome) {
        switch outcome {
        case .opened(let message):
            Logger.e2ee.info("e2ee envelope opened message=\(message.messageId, privacy: .public)")
        case .undecryptable(let messageId, _):
            Logger.e2ee.warning("e2ee envelope undecryptable message=\(messageId, privacy: .public)")
        case .notForThisDevice(let envelopeId):
            Logger.e2ee.info("e2ee envelope for another device id=\(envelopeId, privacy: .public)")
        case .deferred(let envelopeId):
            Logger.e2ee.warning("e2ee envelope deferred id=\(envelopeId, privacy: .public)")
        }
        relay.send(outcome)
    }
}

/// Le relais des enveloppes ouvertes, lisible hors de l'acteur. Il n'est
/// alimenté QUE par l'acteur, donc jamais par deux fils à la fois.
/// unchecked: `PassthroughSubject` sérialise déjà ses envois, et aucun des deux sujets n'est réassigné après l'init.
nonisolated final class OutcomeRelay: @unchecked Sendable {
    private let subject = PassthroughSubject<E2EEOpenOutcome, Never>()
    private let sessionSubject = PassthroughSubject<String?, Never>()
    var publisher: AnyPublisher<E2EEOpenOutcome, Never> { subject.eraseToAnyPublisher() }
    var sessions: AnyPublisher<String?, Never> { sessionSubject.eraseToAnyPublisher() }
    func send(_ outcome: E2EEOpenOutcome) { subject.send(outcome) }
    func announce(_ account: String?) { sessionSubject.send(account) }
}
