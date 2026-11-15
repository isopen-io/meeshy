import Foundation
import MeeshySDK

/// Ce que la passerelle rend d'un signal relayé : son identifiant opaque.
public struct E2EESignalReceipt: Decodable, Equatable, Sendable {
    public let signalId: String
    public let envelopes: Int

    public init(signalId: String, envelopes: Int) {
        self.signalId = signalId
        self.envelopes = envelopes
    }
}

/// Le transport d'un signal scellé (#13142) : la route UNIQUE
/// `POST /api/v1/e2ee/conversations/:id/signals`, quel que soit le signal. La
/// charge ne porte que les enveloppes, l'appareil émetteur, mes appareils non
/// approuvés et l'indicateur de réveil ; jamais le type du signal.
public protocol E2EESignalTransporting: Sendable {
    /// Un refus Sesame (409) remonte en `E2EEDevicesMismatch`, que le scelleur résout.
    func relay(_ sealed: E2EESealedMessage, conversationId: String, wake: Bool) async throws -> E2EESignalReceipt
}

public final class E2EESignalClient: E2EESignalTransporting {
    private let api: any APIClientProviding

    public init(api: any APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func relay(_ sealed: E2EESealedMessage, conversationId: String, wake: Bool) async throws -> E2EESignalReceipt {
        do {
            let response: APIResponse<E2EESignalReceipt> = try await api.post(
                E2EeEndpoint.conversationsByConversationIdSignals(conversationId: conversationId),
                body: E2EESignalRelayBody(sealed: sealed, wake: wake)
            )
            return response.data
        } catch MeeshyError.rejected(let rejection) {
            if let mismatch = rejection.e2eeMismatch { throw mismatch }
            throw MeeshyError.rejected(rejection)
        }
    }
}

struct E2EESignalRelayBody: Encodable {
    let protocolName = E2EEWire.libsignalProtocol
    let senderDeviceId: UInt32
    let envelopes: [E2EEOutgoingEnvelope]
    let unapprovedOwnDevices: [UInt32]
    let wake: Bool

    init(sealed: E2EESealedMessage, wake: Bool) {
        self.senderDeviceId = sealed.senderDeviceId
        self.envelopes = sealed.envelopes
        self.unapprovedOwnDevices = sealed.unapprovedOwnDevices
        self.wake = wake
    }

    private enum CodingKeys: String, CodingKey {
        case protocolName = "protocol"
        case senderDeviceId, envelopes, unapprovedOwnDevices, wake
    }
}
