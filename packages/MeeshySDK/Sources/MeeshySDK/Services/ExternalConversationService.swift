import Foundation

// MARK: - Le port d'ouverture d'une conversation externe (#17118)
//
// `POST /conversations/external` (#17117) : `{ network, handle }` et RIEN
// d'autre (le schéma Zod de la passerelle est strict, un champ en trop est
// refusé). 201 ouverte, 200 retrouvée ; la réponse est fermée et ne recopie
// jamais le numéro. Le service rend l'issue que l'écran dessine
// (`ExternalOpeningOutcome`), jamais une erreur brute.

public protocol ExternalConversationServiceProviding: Sendable {
    /// Ouvre, ou retrouve, la conversation chiffrée de bout en bout avec l'ami
    /// joint par `handle` (E.164, déjà normalisé par `ExternalConversationEntry`).
    func open(network: ExternalNetwork, handle: String) async -> ExternalOpeningOutcome
}

public final class ExternalConversationService: ExternalConversationServiceProviding, Sendable {
    public static let shared = ExternalConversationService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func open(network: ExternalNetwork, handle: String) async -> ExternalOpeningOutcome {
        do {
            let response: APIResponse<ExternalOpening> = try await api.post(
                ConversationsEndpoint.external, body: Body(network: network.rawValue, handle: handle))
            return .of(response.data)
        } catch {
            return .of(error: error)
        }
    }

    private struct Body: Encodable {
        let network: String
        let handle: String
    }
}
