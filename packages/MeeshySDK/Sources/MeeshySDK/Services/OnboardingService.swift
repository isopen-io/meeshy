import Foundation

/// Lire et écrire l'état du parcours. Le serveur arbitre tout — éligibilité,
/// fin paresseuse au-delà de 7 jours, étapes pré-cochées — et chaque écriture
/// est IDEMPOTENTE : rejouer une carte vue ou une fin ne change rien.
public protocol OnboardingServiceProviding: Sendable {
    func fetchState() async throws -> APIOnboardingState
    func record(step: OnboardingStepId, outcome: OnboardingStepOutcome) async throws -> APIOnboardingState
    func finish() async throws -> APIOnboardingState
}

public final class OnboardingService: OnboardingServiceProviding, @unchecked Sendable {
    public static let shared = OnboardingService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func fetchState() async throws -> APIOnboardingState {
        let response: APIResponse<APIOnboardingState> = try await api.request(MeEndpoint.onboarding)
        return response.data
    }

    public func record(step: OnboardingStepId, outcome: OnboardingStepOutcome) async throws -> APIOnboardingState {
        try await send(.step(step, outcome))
    }

    public func finish() async throws -> APIOnboardingState {
        try await send(.finish)
    }

    private func send(_ update: OnboardingUpdate) async throws -> APIOnboardingState {
        let response: APIResponse<APIOnboardingState> = try await api.patch(MeEndpoint.onboarding, body: update)
        return response.data
    }
}
