import Foundation
import os
import MeeshySDK

/// Un lien reçu par e-mail qui CONNECTE : le lien de connexion historique, ou
/// le lien de l'e-mail « code + lien » qui vérifie l'adresse et ouvre la
/// session (#8035).
enum SignInLink: Equatable {
    case magic(token: String)
    case emailVerification(token: String, email: String)

    init?(_ destination: DeepLinkDestination?) {
        switch destination {
        case .magicLink(let token)?:
            self = .magic(token: token)
        case .emailVerificationLink(let token, let email)?:
            self = .emailVerification(token: token, email: email)
        default:
            return nil
        }
    }

    init?(_ link: DeepLink) {
        switch link {
        case .magicLink(let token):
            self = .magic(token: token)
        case .emailVerificationLink(let token, let email):
            self = .emailVerification(token: token, email: email)
        default:
            return nil
        }
    }

    /// Faut-il déconnecter le compte courant AVANT de valider ?
    ///
    /// Une session posée par-dessus celle d'un AUTRE compte ferait fuir ses
    /// caches, ses sockets et ses clés E2EE dans la nouvelle. Le lien de
    /// connexion ne dit pas pour qui il vaut : il déconnecte toujours. Le lien
    /// de vérification NOMME son adresse : celui de l'utilisateur déjà connecté
    /// est une rotation de session, pas un changement de compte.
    func requiresSignOut(isAuthenticated: Bool, currentEmail: String?) -> Bool {
        guard isAuthenticated else { return false }
        switch self {
        case .magic:
            return true
        case .emailVerification(_, let email):
            return currentEmail?.caseInsensitiveCompare(email) != .orderedSame
        }
    }
}

/// Ce dont l'ouverture d'un lien de connexion a besoin : déconnecter un autre
/// compte, PROUVER le lien sans poser la session, puis la poser (#8076).
@MainActor
protocol SignInLinkAuthorizing: AnyObject {
    var isAuthenticated: Bool { get }
    var currentUser: MeeshyUser? { get }
    func logout() async
    func verifyEmail(_ request: EmailVerificationRequest) async throws -> EmailProvenSession?
    func verifyMagicLink(token: String) async throws -> EmailProvenSession
    func openSession(_ proven: EmailProvenSession)
}

extension AuthManager: SignInLinkAuthorizing {}

/// Le site UNIQUE qui valide un lien de connexion et en dit l'issue — partagé
/// par la voie système (`MeeshyApp`, à froid comme à chaud) et la voie in-app
/// (`Router`, lien tapé dans un message).
///
/// Le lien suit la séquence du code (#8059) : prouver → refermer → ouvrir. La
/// session passe par `SessionOpeningGate`, qui la retient tant que l'écran de
/// connexion présente une porte d'accès et lui demande de la refermer (#8076).
@MainActor
enum SignInLinkOpener {
    private static let logger = Logger(subsystem: "me.meeshy.app", category: "sign-in-link")

    static func open(
        _ link: SignInLink,
        auth: SignInLinkAuthorizing = AuthManager.shared,
        toasts: FeedbackToastSurfacing = FeedbackToastManager.shared,
        sessionGate: SessionOpeningGate = .shared
    ) async {
        if link.requiresSignOut(isAuthenticated: auth.isAuthenticated, currentEmail: auth.currentUser?.email) {
            await auth.logout()
        }
        do {
            guard let proven = try await prove(link, auth: auth) else {
                toasts.showSuccess(String(localized: "emailVerification.success", defaultValue: "Email vérifié !", bundle: .main))
                return
            }
            sessionGate.open { auth.openSession(proven) }
            toasts.showSuccess(signedInMessage)
        } catch {
            toasts.showError(EmailProofErrorText.linkMessage(for: error))
            logger.error("Sign-in link validation failed")
        }
    }

    /// `nil` ⇒ adresse vérifiée sans session (passerelle antérieure à #8035).
    private static func prove(_ link: SignInLink, auth: SignInLinkAuthorizing) async throws -> EmailProvenSession? {
        switch link {
        case .magic(let token):
            return try await auth.verifyMagicLink(token: token)
        case .emailVerification(let token, let email):
            return try await auth.verifyEmail(.link(token: token, email: email))
        }
    }

    private static var signedInMessage: String {
        String(localized: "magicLink.success", defaultValue: "Connexion réussie !", bundle: .main)
    }
}
