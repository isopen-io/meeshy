import Combine
import Foundation
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// Un double de l'E2EE libsignal de l'app : il « scelle » sans libsignal (le
/// texte n'apparaît dans aucune enveloppe), rejoue les refus Sesame qu'on lui
/// donne et range le clair en mémoire.
nonisolated final class MockEndToEndMessaging: EndToEndMessagingProviding, @unchecked Sendable {
    private let lock = NSLock()
    private let outcomes = PassthroughSubject<E2EEOpenOutcome, Never>()

    /// `nil` : le scellement réussit ; sinon l'erreur levée AVANT toute remise.
    var sealError: (any Error)?
    var senderDeviceId: UInt32 = 1
    var envelopes = [E2EEOutgoingEnvelope(userId: "00000000000000000000cd77", deviceId: 1, registrationId: 42, type: 3, body: "c2NlbGzDqQ==")]
    var unapprovedOwnDevices: [UInt32] = []
    /// Combien de refus Sesame la remise peut absorber avant d'abandonner.
    var maxAttempts = 3

    private(set) var deliverCallCount = 0
    private(set) var deliveredContents: [E2EEContent] = []
    private(set) var deliverAttempts = 0
    private var stored: [String: E2EEPlaintextEntry] = [:]

    var remembered: [String: E2EEPlaintextEntry] { lock.withLock { stored } }

    var opened: AnyPublisher<E2EEOpenOutcome, Never> { outcomes.eraseToAnyPublisher() }

    func publish(_ outcome: E2EEOpenOutcome) { outcomes.send(outcome) }

    func store(_ entry: E2EEPlaintextEntry, for messageId: String) {
        lock.withLock { stored[messageId] = entry }
    }

    func deliver<T: Sendable>(
        _ content: E2EEContent,
        from userId: String,
        to peerUserId: String,
        via deliver: @concurrent @Sendable (E2EESealedMessage) async throws -> T
    ) async throws -> T {
        let (error, sealed, attempts) = lock.withLock { () -> ((any Error)?, E2EESealedMessage, Int) in
            deliverCallCount += 1
            deliveredContents.append(content)
            return (sealError, E2EESealedMessage(senderDeviceId: senderDeviceId, envelopes: envelopes, unapprovedOwnDevices: unapprovedOwnDevices), maxAttempts)
        }
        if let error { throw error }
        for _ in 1...attempts {
            lock.withLock { deliverAttempts += 1 }
            do {
                return try await deliver(sealed)
            } catch is E2EEDevicesMismatch {
                continue
            }
        }
        throw E2EESealError.devicesMismatchUnresolved
    }

    func remember(_ content: E2EEContent, from senderUserId: String, as messageIds: [String]) async {
        lock.withLock { messageIds.forEach { stored[$0] = .readable(content, senderUserId: senderUserId) } }
    }

    func plaintexts(for messageIds: [String]) async -> [String: E2EEPlaintextEntry] {
        lock.withLock { stored.filter { messageIds.contains($0.key) } }
    }
}
