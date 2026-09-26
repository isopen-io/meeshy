import Foundation
import Combine
import MeeshySDK

/// La saisie du code reçu par e-mail (#8035) : il vérifie l'adresse ET ouvre la
/// session, que l'écran vienne d'une connexion sur une adresse inconnue ou de
/// la porte « e-mail seul ».
@MainActor
final class EmailVerificationViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var isVerifying = false
    @Published var isResending = false
    @Published var resendSuccess = false
    @Published var verificationSuccess = false
    /// La session a-t-elle été POSÉE ? Jamais par `verifyCode` (#8059) : par
    /// `openProvenSession`, une fois l'écran refermé.
    @Published var sessionOpened = false
    @Published var error: String?

    let email: String
    let accountCreated: Bool
    /// Le mot de passe tapé à la connexion : tenu en MÉMOIRE le temps de la
    /// saisie du code, jamais persisté, oublié dès la vérification réussie.
    private var password: String?
    /// La session que la preuve a rendue, en attente que l'écran se referme.
    private var provenSession: EmailProvenSession?
    private let authService: AuthServiceProviding
    private let confirmer: EmailVerificationConfirming

    init(
        email: String,
        password: String? = nil,
        accountCreated: Bool = false,
        authService: AuthServiceProviding = AuthService.shared,
        confirmer: EmailVerificationConfirming = AuthManager.shared
    ) {
        self.email = email
        self.password = password
        self.accountCreated = accountCreated
        self.authService = authService
        self.confirmer = confirmer
    }

    func verifyCode(_ code: String) async {
        isVerifying = true
        error = nil
        defer { isVerifying = false }

        do {
            provenSession = try await confirmer.verifyEmail(.code(code, email: email, password: password))
            password = nil
            verificationSuccess = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Ouvre la session prouvée — à appeler par l'HÔTE une fois la feuille
    /// refermée (#8059). Ouvrir la session bascule la racine de l'app et
    /// démonte l'écran de connexion : ce qu'il présente encore resterait
    /// orphelin, figé sur « Email vérifié ! ». Idempotent.
    func openProvenSession() {
        guard let proven = provenSession else { return }
        provenSession = nil
        confirmer.openSession(proven)
        sessionOpened = true
    }

    func resendCode() async {
        isResending = true
        error = nil

        do {
            try await authService.resendVerificationEmail(email: email)
            resendSuccess = true
            try? await Task.sleep(for: .seconds(3))
            resendSuccess = false
        } catch {
            self.error = (error as? MeeshyError)?.localizedDescription
                ?? String(localized: "emailVerification.error.resendFailed", defaultValue: "Impossible de renvoyer le code de vérification")
        }

        isResending = false
    }
}
