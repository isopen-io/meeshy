import Foundation

/// L'adresse de l'onboarding post-inscription (#7729).
///
/// **Écrite à la main, et provisoirement.** Les adresses du SDK sont générées
/// depuis `services/gateway/route-manifest.json` ; la route
/// `GET|PATCH /api/v1/me/onboarding` est livrée en parallèle par le lot
/// passerelle, et son entrée de manifeste n'existe pas encore sur `dev`. Dès
/// qu'elle y est, `MeEndpoint.onboarding` est généré et ce type disparaît :
/// un chemin s'écrit à un seul endroit.
public enum OnboardingEndpoint: MeeshyEndpoint, Sendable {
    case root

    public var path: String {
        switch self {
        case .root: return "/api/v1/me/onboarding"
        }
    }
}

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
        let response: APIResponse<APIOnboardingState> = try await api.request(OnboardingEndpoint.root)
        return response.data
    }

    public func record(step: OnboardingStepId, outcome: OnboardingStepOutcome) async throws -> APIOnboardingState {
        try await send(.step(step, outcome))
    }

    public func finish() async throws -> APIOnboardingState {
        try await send(.finish)
    }

    private func send(_ update: OnboardingUpdate) async throws -> APIOnboardingState {
        let response: APIResponse<APIOnboardingState> = try await api.patch(OnboardingEndpoint.root, body: update)
        return response.data
    }
}
