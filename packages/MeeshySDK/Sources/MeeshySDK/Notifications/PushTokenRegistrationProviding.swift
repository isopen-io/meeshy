import Foundation

/// La couture réseau de l'enregistrement du jeton APNs (`POST
/// /users/register-device-token`), injectable pour que le témoin d'une réponse
/// périmée (#18911, ios-systeme-3) retienne un POST sans `APIClient.shared`.
protocol PushTokenRegistrationProviding: Sendable {
    func register(_ request: RegisterDeviceTokenRequest) async throws
}

struct APIPushTokenRegistrar: PushTokenRegistrationProviding {
    func register(_ request: RegisterDeviceTokenRequest) async throws {
        let _: APIResponse<RegisterDeviceTokenResponse> = try await APIClient.shared.post(
            UsersEndpoint.registerDeviceToken,
            body: request
        )
    }
}
