import Combine
import Foundation
import MeeshyE2EE
import MeeshySDK

/// Ce que la session ouverte branche sur l'E2EE libsignal (#3707) : à
/// l'ouverture, l'installation s'enrôle (une fois par compte et par identité)
/// et relit ses enveloppes en attente ; ensuite chaque enveloppe poussée par la
/// socket de CET appareil s'ouvre, et chaque reconnexion relance le rattrapage
/// (une émission perdue ne perd rien : l'enveloppe attend sur le serveur).
/// Elle apprend aussi chaque bascule du régime de chiffrement (#12522).
protocol EndToEndSessionBridging: AnyObject {
    func start(userId: String)
    func stop()
}

@MainActor
final class EndToEndSessionBridge: EndToEndSessionBridging {
    nonisolated deinit {}

    static let shared = EndToEndSessionBridge()

    private let runtime: EndToEndMessagingRuntime
    private let envelopes: AnyPublisher<E2EEServedEnvelope, Never>
    private let connections: AnyPublisher<Bool, Never>
    private let regimeChanges: AnyPublisher<ConversationEncryptionChangedEvent, Never>
    private let regimeLedger: EndToEndRegimeLedger
    private var subscriptions: Set<AnyCancellable> = []

    init(
        runtime: EndToEndMessagingRuntime = .shared,
        envelopes: AnyPublisher<E2EEServedEnvelope, Never> = E2EEEnvelopeChannel.shared.received.eraseToAnyPublisher(),
        connections: AnyPublisher<Bool, Never> = MessageSocketManager.shared.$isConnected.eraseToAnyPublisher(),
        regimeChanges: AnyPublisher<ConversationEncryptionChangedEvent, Never> = ConversationEncryptionChannel.shared.changed.eraseToAnyPublisher(),
        regimeLedger: EndToEndRegimeLedger = .shared
    ) {
        self.runtime = runtime
        self.envelopes = envelopes
        self.connections = connections
        self.regimeChanges = regimeChanges
        self.regimeLedger = regimeLedger
    }

    func start(userId: String) {
        stop()
        guard !userId.isEmpty else { return }
        let runtime = runtime
        envelopes
            .sink { envelope in Task { await runtime.receive(envelope, as: userId) } }
            .store(in: &subscriptions)
        connections
            .removeDuplicates()
            .filter { $0 }
            .sink { _ in Task { await runtime.catchUp(as: userId) } }
            .store(in: &subscriptions)
        // #12522 — chaque bascule du régime est apprise, conversation ouverte ou non.
        regimeLedger.listen(to: regimeChanges).store(in: &subscriptions)
        Task { await runtime.catchUp(as: userId) }
    }

    func stop() {
        subscriptions.removeAll()
        let runtime = runtime
        Task { await runtime.forget() }
    }
}
