import Foundation

public final class AccountService {
    public static let shared = AccountService()
    private init() {}
    private var api: APIClient { APIClient.shared }

    public func deleteAccount(confirmationPhrase: String) async throws {
        let body = DeleteAccountBody(confirmationPhrase: confirmationPhrase)
        let _: APIResponse<DeleteAccountResponse> = try await api.delete(endpoint: "/me/delete-account", body: body)
    }
}

struct DeleteAccountBody: Encodable {
    let confirmationPhrase: String
}

public struct DeleteAccountResponse: Decodable {
    public let message: String
}
