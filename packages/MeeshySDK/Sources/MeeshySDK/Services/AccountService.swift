import Foundation

/// Le cycle de vie de la demande de suppression de compte.
///
/// `deleteAccount` visait `DELETE /me/delete-account`, qui ouvrait la demande
/// sans exiger la moindre preuve de présence : un jeton volé suffisait. Elle
/// annonçait par ailleurs « un e-mail a été envoyé » à un compte SANS adresse,
/// laissant la demande bloquée pour toujours — et le 409 « déjà en cours »
/// interdisait d'en rouvrir une, rendant le compte insupprimable (#4183).
public protocol AccountServiceProviding: Sendable {
    /// Ouvre une demande de suppression. Exige le mot de passe COURANT.
    func openDeletionRequest(confirmationPhrase: String, currentPassword: String) async throws -> AccountDeletionOpened
    /// L'état de la demande en cours, s'il y en a une.
    func deletionStatus() async throws -> AccountDeletionStatus
}

public final class AccountService: AccountServiceProviding, @unchecked Sendable {
    public static let shared = AccountService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func openDeletionRequest(
        confirmationPhrase: String,
        currentPassword: String
    ) async throws -> AccountDeletionOpened {
        let body = OpenAccountDeletionBody(
            confirmationPhrase: confirmationPhrase,
            currentPassword: currentPassword
        )
        let response: APIResponse<AccountDeletionOpened> = try await api.post(
            MeEndpoint.accountDeletion,
            body: body
        )
        return response.data
    }

    public func deletionStatus() async throws -> AccountDeletionStatus {
        let response: APIResponse<AccountDeletionStatus> = try await api.request(
            MeEndpoint.accountDeletion
        )
        return response.data
    }
}

struct OpenAccountDeletionBody: Encodable {
    let confirmationPhrase: String
    let currentPassword: String
}

public struct AccountDeletionOpened: Decodable, Sendable {
    public let message: String
    /// Le lien de confirmation MEURT. L'écran peut donc dire jusqu'à quand.
    public let tokenExpiresAt: Date?

    public init(message: String, tokenExpiresAt: Date? = nil) {
        self.message = message
        self.tokenExpiresAt = tokenExpiresAt
    }
}

/// L'état de la demande — `status == nil` signifie « aucune demande en cours ».
/// C'est une RÉPONSE, jamais une absence de ressource : le serveur rend 200.
public struct AccountDeletionStatus: Decodable, Sendable {
    public let status: String?
    public let confirmedAt: Date?
    public let gracePeriodEndsAt: Date?
    public let canCancelUntil: Date?

    public init(
        status: String? = nil,
        confirmedAt: Date? = nil,
        gracePeriodEndsAt: Date? = nil,
        canCancelUntil: Date? = nil
    ) {
        self.status = status
        self.confirmedAt = confirmedAt
        self.gracePeriodEndsAt = gracePeriodEndsAt
        self.canCancelUntil = canCancelUntil
    }
}
