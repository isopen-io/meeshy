import Foundation
import UIKit
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

    /// La session que ce lien ouvre est-elle une ARRIVÉE à célébrer (#8089) ?
    /// Seul le lien qui VÉRIFIE l'adresse l'est, et seulement s'il ouvre la
    /// session : le lien de connexion est un retour, et le lien du compte déjà
    /// connecté une rotation de session.
    func celebratesArrival(isAuthenticated: Bool) -> Bool {
        guard case .emailVerification = self else { return false }
        return !isAuthenticated
    }

    /// La session PROUVÉE est-elle celle d'un autre compte que le compte
    /// connecté (#8042, #10445) ? L'adresse écrite dans le lien se forge ; seul
    /// l'id rendu par la passerelle dit à qui appartient la session qu'on
    /// poserait — et rien ne se décide avant cette preuve.
    nonisolated static func replacesSignedInAccount(provenUserId: String, isAuthenticated: Bool, currentUserId: String?) -> Bool {
        guard isAuthenticated else { return false }
        return currentUserId != provenUserId
    }
}

/// Ce dont l'ouverture d'un lien de connexion a besoin : PROUVER le lien sans
/// poser la session, puis la poser (#8076) — ou, quand elle appartient à un
/// AUTRE compte que le compte connecté, y passer en gardant celui-ci, ou la
/// refermer côté passerelle si l'utilisateur refuse (#10445). Aucune
/// déconnexion : un lien ne fait jamais perdre le compte ouvert.
@MainActor
protocol SignInLinkAuthorizing: AnyObject {
    var isAuthenticated: Bool { get }
    var currentUser: MeeshyUser? { get }
    func verifyEmail(_ request: EmailVerificationRequest) async throws -> EmailProvenSession?
    func verifyMagicLink(token: String) async throws -> EmailProvenSession
    func openSession(_ proven: EmailProvenSession)
    func switchToProvenAccount(_ proven: EmailProvenSession) async
    func discardProvenSession(_ proven: EmailProvenSession) async
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
        sessionGate: SessionOpeningGate = .shared,
        celebration: ArrivalCelebrating = ArrivalCelebrationController.shared,
        confirmation: AccountReplacementConfirming = AccountReplacementAlert.shared
    ) async {
        let proven: EmailProvenSession?
        do {
            proven = try await prove(link, auth: auth)
        } catch {
            toasts.showError(EmailProofErrorText.linkMessage(for: error))
            logger.error("Sign-in link validation failed")
            return
        }
        guard let proven else {
            toasts.showSuccess(String(localized: "emailVerification.success", defaultValue: "Email vérifié !", bundle: .main))
            return
        }
        if SignInLink.replacesSignedInAccount(provenUserId: proven.user.id, isAuthenticated: auth.isAuthenticated, currentUserId: auth.currentUser?.id) {
            await offerAccountSwitch(to: proven, auth: auth, toasts: toasts, confirmation: confirmation)
            return
        }
        let celebrates = link.celebratesArrival(isAuthenticated: auth.isAuthenticated)
        sessionGate.open {
            auth.openSession(proven)
            if celebrates { celebration.begin(userId: proven.user.id) }
        }
        toasts.showSuccess(signedInMessage)
    }

    /// La session rendue n'existe qu'EN MÉMOIRE le temps de la question : rien
    /// n'en est écrit avant l'acceptation. Accepter passe à ce compte en
    /// GARDANT le compte quitté (réversible depuis le sélecteur) ; refuser ne
    /// change rien sur l'appareil et referme la session côté passerelle.
    private static func offerAccountSwitch(
        to proven: EmailProvenSession,
        auth: SignInLinkAuthorizing,
        toasts: FeedbackToastSurfacing,
        confirmation: AccountReplacementConfirming
    ) async {
        let accepted = await confirmation.confirmReplacing(
            signedIn: auth.currentUser?.username ?? "",
            with: proven.user.username
        )
        guard accepted else {
            await auth.discardProvenSession(proven)
            return
        }
        await auth.switchToProvenAccount(proven)
        toasts.showSuccess(signedInMessage)
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

/// La question posée avant qu'un lien n'ouvre un AUTRE compte que le compte
/// connecté (#10445) : « Ce lien ouvre le compte @x. Quitter @moi ? ».
@MainActor
protocol AccountReplacementConfirming: AnyObject {
    func confirmReplacing(signedIn current: String, with incoming: String) async -> Bool
}

/// Posée par UIKit, depuis le contrôleur le plus haut : une alerte SwiftUI
/// accrochée à la racine ne se présente pas quand une feuille l'est déjà, et la
/// question attendrait pour toujours (même raison que `EmailVerificationGateScreen`).
@MainActor
final class AccountReplacementAlert: AccountReplacementConfirming {
    nonisolated deinit {}
    static let shared = AccountReplacementAlert()

    func confirmReplacing(signedIn current: String, with incoming: String) async -> Bool {
        guard let top = Self.topMostController() else { return false }
        let alert = UIAlertController(
            title: String(localized: "signInLink.switchAccount.title", defaultValue: "Changer de compte ?", bundle: .main),
            message: Self.message(signedIn: current, incoming: incoming),
            preferredStyle: .alert
        )
        return await withCheckedContinuation { continuation in
            alert.addAction(UIAlertAction(
                title: String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main),
                style: .cancel
            ) { _ in continuation.resume(returning: false) })
            alert.addAction(UIAlertAction(
                title: String(localized: "signInLink.switchAccount.confirm", defaultValue: "Ouvrir ce compte", bundle: .main),
                style: .default
            ) { _ in continuation.resume(returning: true) })
            top.present(alert, animated: true)
        }
    }

    private static func message(signedIn current: String, incoming: String) -> String {
        guard !current.isEmpty else {
            return String(localized: "signInLink.switchAccount.messageUnknownCurrent", defaultValue: "Ce lien ouvre le compte @\(incoming). Quitter le compte ouvert ?", bundle: .main)
        }
        return String(localized: "signInLink.switchAccount.message", defaultValue: "Ce lien ouvre le compte @\(incoming). Quitter @\(current) ?", bundle: .main)
    }

    private static func topMostController() -> UIViewController? {
        var top = DeviceLayout.activeWindow?.rootViewController
        while let presented = top?.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
    }
}
