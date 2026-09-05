import Foundation
@testable import Meeshy
@testable import MeeshySDK

/// Test double pour `SignupRegistering`.
///
/// Il existe pour une raison précise : `AuthManagerSignupRegistrar` appelle
/// `AuthManager.shared.registerThrowing`, qui écrit dans le trousseau RÉEL et
/// bascule la session de tout le processus de test. Une suite qui exercerait le
/// vrai chemin déconnecterait `ZZEndStateConnectedSessionTests` — la phase 3 du
/// gate, dont l'app relancée hérite.
///
/// Convention `apps/ios/CLAUDE.md` : `Result<T, Error>` + compteur d'appels +
/// dernier paramètre reçu, plus un `reset()`.
@MainActor
final class MockSignupRegistrar: SignupRegistering {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au démontage
    // hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    var registerResult: Result<Void, Error> = .success(())
    private(set) var registerCallCount = 0
    /// La charge EXACTE que le ViewModel a composée — c'est elle que les
    /// témoins de contrat inspectent, pas un état interne.
    private(set) var lastRegisterRequest: RegisterRequest?

    func register(_ request: RegisterRequest) async throws {
        registerCallCount += 1
        lastRegisterRequest = request
        try registerResult.get()
    }

    func reset() {
        registerResult = .success(())
        registerCallCount = 0
        lastRegisterRequest = nil
    }
}

/// Test double pour `PushPermissionDeferring` — un marqueur EN MÉMOIRE.
///
/// Le vrai report écrit dans `UserDefaults.standard`, où il survivrait d'un test
/// à l'autre et ferait dépendre le verdict de l'ORDRE d'exécution.
@MainActor
final class MockPushPermissionDeferral: PushPermissionDeferring {
    nonisolated deinit {}

    var isPending: Bool = false
    private(set) var postponeCallCount = 0
    private(set) var resolveCallCount = 0

    func postpone() {
        postponeCallCount += 1
        isPending = true
    }

    func resolve() {
        resolveCallCount += 1
        isPending = false
    }

    func reset() {
        isPending = false
        postponeCallCount = 0
        resolveCallCount = 0
    }
}
