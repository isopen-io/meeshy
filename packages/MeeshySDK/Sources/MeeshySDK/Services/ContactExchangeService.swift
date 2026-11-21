import Foundation

// MARK: - Protocol

/// Le partage sans contact (#19205, #19484) : émettre le jeton de ce que je donne, accepter celui de l'autre.
/// Toute indisponibilité — drapeau éteint, jeton échu, rejoué, contrefait, bloqué — se lit `unavailable`.
public protocol ContactExchangeProviding: Sendable {
    /// `POST /me/contact-exchange` — n'envoie que les offres, jamais un champ de plus.
    func issue(offers: [ContactExchangeOffer]) async throws -> ContactExchangeIssued
    /// `POST /contact-exchange/:token/accept` — un jeton hors motif ne part pas.
    func accept(token: String) async throws -> ContactExchangeAccepted
}

public final class ContactExchangeService: ContactExchangeProviding, Sendable {
    public static let shared = ContactExchangeService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func issue(offers: [ContactExchangeOffer]) async throws -> ContactExchangeIssued {
        let ordered = ContactExchangeOffer.ordered(offers)
        guard !ordered.isEmpty else { throw ContactExchangeError.nothingChosen }
        let issued: ContactExchangeIssued = try await refusingAsUnavailable {
            let response: APIResponse<ContactExchangeIssued> = try await api.post(
                MeEndpoint.contactExchange, body: ContactExchangeIssueBody(offers: ordered)
            )
            return response.data
        }
        guard ContactExchangeToken.isWellFormed(issued.token) else { throw ContactExchangeError.unavailable }
        return issued
    }

    public func accept(token: String) async throws -> ContactExchangeAccepted {
        guard ContactExchangeToken.isWellFormed(token) else { throw ContactExchangeError.unavailable }
        return try await refusingAsUnavailable {
            let response: APIResponse<ContactExchangeAccepted> = try await api.post(
                ContactExchangeEndpoint.byTokenAccept(token: token), body: ContactExchangeEmptyBody()
            )
            return response.data
        }
    }

    private func refusingAsUnavailable<T>(_ call: () async throws -> T) async throws -> T {
        do {
            return try await call()
        } catch MeeshyError.server(let status, _) where status == 404 || status == 503 {
            throw ContactExchangeError.unavailable
        }
    }
}

private struct ContactExchangeIssueBody: Encodable, Sendable {
    let offers: [ContactExchangeOffer]
}

private struct ContactExchangeEmptyBody: Encodable, Sendable {}
