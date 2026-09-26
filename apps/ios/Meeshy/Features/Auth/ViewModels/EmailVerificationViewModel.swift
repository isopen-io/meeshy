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
    /// #8083 — l'adresse a été prouvée AILLEURS (lien ouvert sur un autre
    /// appareil). L'écran le dit ; il ne connecte pas pour autant : décision
    /// porteur « si et seulement si », ce téléphone n'entre que par le code
    /// saisi sur lui ou le lien ouvert sur lui.
    @Published var addressProvenElsewhere = false

    /// Le jeton d'attente de CET appareil ; renouvelé à chaque nouvel envoi.
    @Published var pendingSessionToken: String?

    let email: String
    let accountCreated: Bool
    /// Le mot de passe tapé à la connexion : tenu en MÉMOIRE le temps de la
    /// saisie du code, jamais persisté, oublié dès la vérification réussie.
    private var password: String?
    /// La session que la preuve a rendue, en attente que l'écran se referme.
    private var provenSession: EmailProvenSession?
    private let authService: AuthServiceProviding
    private let confirmer: EmailVerificationConfirming
    private let watcher: EmailVerificationWatching
    /// ~3 s entre deux lectures de l'état, au premier plan seulement.
    private let watchInterval: Duration
    /// Borne d'une veille : la durée d'un code de connexion.
    private let watchLimit: Duration

    init(
        email: String,
        password: String? = nil,
        accountCreated: Bool = false,
        pendingSessionToken: String? = nil,
        authService: AuthServiceProviding = AuthService.shared,
        confirmer: EmailVerificationConfirming = AuthManager.shared,
        watcher: EmailVerificationWatching = AuthService.shared,
        watchInterval: Duration = .seconds(3),
        watchLimit: Duration = .seconds(15 * 60)
    ) {
        self.email = email
        self.password = password
        self.accountCreated = accountCreated
        self.pendingSessionToken = pendingSessionToken
        self.authService = authService
        self.confirmer = confirmer
        self.watcher = watcher
        self.watchInterval = watchInterval
        self.watchLimit = watchLimit
    }

    /// Interroge l'état de la preuve jusqu'à `proven`, la fin du jeton, la
    /// borne, le code vérifié — ou l'annulation de la tâche qui la porte.
    /// L'écran la lance dans un `.task` lié au premier plan : SwiftUI l'annule
    /// au démontage et au passage en arrière-plan, et la relance au retour —
    /// aucune lecture ne survit à l'écran.
    func watchProof() async {
        let clock = ContinuousClock()
        let deadline = clock.now.advanced(by: watchLimit)
        while !Task.isCancelled, !addressProvenElsewhere, !verificationSuccess, clock.now < deadline,
              let token = pendingSessionToken {
            switch try? await watcher.emailVerificationStatus(pendingSessionToken: token) {
            case .proven:
                addressProvenElsewhere = true
                return
            case .ended:
                return
            case .pending, nil:
                break
            }
            try? await Task.sleep(for: watchInterval)
        }
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
            self.error = EmailProofErrorText.codeMessage(for: error)
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
            self.error = EmailProofErrorText.resendMessage(for: error)
        }

        isResending = false
    }
}
