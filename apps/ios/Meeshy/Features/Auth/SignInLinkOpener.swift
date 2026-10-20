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
    /// #10872 — lève `LinkConfirmationRequired` quand le lien n'a pas été
    /// demandé par cet appareil ; `confirmed` rejoue la preuve après le « oui ».
    func verifyMagicLink(token: String, confirmed: Bool) async throws -> EmailProvenSession
    /// `true` si la session est posée (#10450).
    @discardableResult
    func openSession(_ proven: EmailProvenSession) -> Bool
    /// `.switched` si la session prouvée est posée (#10450) ; sinon la RAISON
    /// (#10518) : rien du compte du lien n'est posé, et la session prouvée est
    /// refermée côté passerelle par l'implémentation. Seul `.expired` garantit
    /// que le compte ouvert l'est resté (`ProvenAccountSwitchRefusal`).
    @discardableResult
    func switchToProvenAccount(_ proven: EmailProvenSession) async -> ProvenAccountSwitchOutcome
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
    private static let logger = MeeshyLog.logger(.signInLink)

    static func open(
        _ link: SignInLink,
        auth: SignInLinkAuthorizing = AuthManager.shared,
        toasts: FeedbackToastSurfacing = FeedbackToastManager.shared,
        sessionGate: SessionOpeningGate = .shared,
        celebration: ArrivalCelebrating = ArrivalCelebrationController.shared,
        confirmation: AccountReplacementConfirming = AccountReplacementAlert.shared,
        signInConfirmation: LinkSignInConfirming = LinkSignInConfirmationSheet.shared
    ) async {
        let proof: LinkProof
        do {
            proof = try await proveWithConsent(link, auth: auth, signInConfirmation: signInConfirmation)
        } catch {
            toasts.showError(EmailProofErrorText.linkMessage(for: error))
            logger.error("Sign-in link validation failed")
            return
        }
        let proven: EmailProvenSession?
        let consentedAccountId: String?
        switch proof {
        case .declined:
            return
        case .unavailable:
            toasts.showError(EmailProofErrorText.sessionNotOpened())
            return
        case .proven(let session, let consented):
            proven = session
            consentedAccountId = consented
        }
        guard let proven else {
            toasts.showSuccess(String(localized: "emailVerification.success", defaultValue: "Email vérifié !", bundle: .main))
            return
        }
        if SignInLink.replacesSignedInAccount(provenUserId: proven.user.id, isAuthenticated: auth.isAuthenticated, currentUserId: auth.currentUser?.id) {
            // #10872 — la confirmation a déjà nommé le compte ouvert et celui
            // du lien : le « oui » vaut choix explicite, on ne redemande pas.
            if consentedAccountId == proven.user.id {
                await switchTo(proven, auth: auth, toasts: toasts)
            } else {
                await offerAccountSwitch(to: proven, auth: auth, toasts: toasts, confirmation: confirmation)
            }
            return
        }
        let celebrates = link.celebratesArrival(isAuthenticated: auth.isAuthenticated)
        // #10450 — le succès ne s'annonce qu'une fois la session POSÉE : une
        // session refusée par la garde du SDK ne dit pas « Connexion réussie ! ».
        sessionGate.open {
            guard auth.openSession(proven) else {
                toasts.showError(EmailProofErrorText.sessionNotOpened())
                return
            }
            if celebrates { celebration.begin(userId: proven.user.id) }
            toasts.showSuccess(Self.signedInMessage)
        }
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
        switch await confirmation.confirmReplacing(signedIn: auth.currentUser, with: proven.user) {
        case .accepted:
            await switchTo(proven, auth: auth, toasts: toasts)
        case .declined:
            await auth.discardProvenSession(proven)
        case .unavailable:
            // #10463 — la question n'a pas pu s'afficher : l'utilisateur n'a
            // rien refusé, il doit apprendre que le lien n'a rien ouvert.
            toasts.showError(EmailProofErrorText.sessionNotOpened())
            await auth.discardProvenSession(proven)
        }
    }

    /// #10518 — la fenêtre d'adoption (#10513) se juge à UN endroit, le SDK,
    /// qui referme lui-même la session qu'il ne pose pas ; l'écran dit la
    /// raison qu'il rend.
    private static func switchTo(_ proven: EmailProvenSession, auth: SignInLinkAuthorizing, toasts: FeedbackToastSurfacing) async {
        switch await auth.switchToProvenAccount(proven) {
        case .switched:
            toasts.showSuccess(signedInMessage)
        case .refused(let refusal):
            toasts.showError(EmailProofErrorText.accountSwitchMessage(for: refusal))
        }
    }

    /// Ce que la preuve a rendu, une fois la confirmation éventuelle passée.
    private enum LinkProof {
        /// `consentedAccountId` : le compte que l'utilisateur a confirmé.
        case proven(EmailProvenSession?, consentedAccountId: String?)
        case declined
        case unavailable
    }

    /// #10872 — un lien que cet appareil n'a pas demandé n'ouvre RIEN sans
    /// « oui » : la passerelle rend l'identité du compte, sans session et sans
    /// consommer le jeton. Le même compte que celui qui est ouvert se confirme
    /// seul — il n'y a rien à usurper.
    private static func proveWithConsent(
        _ link: SignInLink,
        auth: SignInLinkAuthorizing,
        signInConfirmation: LinkSignInConfirming
    ) async throws -> LinkProof {
        do {
            return .proven(try await prove(link, confirmed: false, auth: auth), consentedAccountId: nil)
        } catch let pending as LinkConfirmationRequired {
            let signedIn = auth.isAuthenticated ? auth.currentUser : nil
            if let signedIn, signedIn.id == pending.account.id {
                return .proven(try await prove(link, confirmed: true, auth: auth), consentedAccountId: nil)
            }
            switch await signInConfirmation.confirmSignIn(pending, signedIn: signedIn) {
            case .accepted:
                return .proven(try await prove(link, confirmed: true, auth: auth), consentedAccountId: pending.account.id)
            case .declined:
                return .declined
            case .unavailable:
                return .unavailable
            }
        }
    }

    /// `nil` ⇒ adresse vérifiée sans session (passerelle antérieure à #8035).
    private static func prove(_ link: SignInLink, confirmed: Bool, auth: SignInLinkAuthorizing) async throws -> EmailProvenSession? {
        switch link {
        case .magic(let token):
            return try await auth.verifyMagicLink(token: token, confirmed: confirmed)
        case .emailVerification(let token, let email):
            return try await auth.verifyEmail(.link(token: token, email: email, confirmed: confirmed))
        }
    }

    private static var signedInMessage: String {
        String(localized: "magicLink.success", defaultValue: "Connexion réussie !", bundle: .main)
    }
}

/// La question posée avant qu'un lien n'ouvre un AUTRE compte que le compte
/// connecté (#10445, #10450) : elle dit « un AUTRE compte », nomme les deux
/// comptes par leur nom affiché et leur @, et met « Annuler » en avant.
@MainActor
protocol AccountReplacementConfirming: AnyObject {
    func confirmReplacing(signedIn current: MeeshyUser?, with incoming: MeeshyUser) async -> AccountReplacementDecision
}

/// #10872 — la question posée avant qu'un lien que cet appareil n'a PAS
/// demandé n'ouvre un compte : « Se connecter en tant que @x ? ». Elle nomme
/// le compte du lien, et celui qui est ouvert s'il y en a un — et, pour une
/// revendication d'adresse (#10883), dit que l'adresse passe à ce compte.
@MainActor
protocol LinkSignInConfirming: AnyObject {
    func confirmSignIn(_ question: LinkConfirmationRequired, signedIn current: MeeshyUser?) async -> AccountReplacementDecision
}

/// Ce que rend la question (#10463) : la réponse de l'utilisateur, ou le
/// constat qu'elle n'a pas pu se poser — qui n'est pas un refus, et se dit.
nonisolated enum AccountReplacementDecision: Equatable, Sendable {
    case accepted
    case declined
    /// L'alerte ne s'est pas présentée : l'utilisateur n'a rien vu.
    case unavailable
}

/// Posée par UIKit, depuis le contrôleur le plus haut : une alerte SwiftUI
/// accrochée à la racine ne se présente pas quand une feuille l'est déjà, et la
/// question attendrait pour toujours (même raison que `EmailVerificationGateScreen`).
///
/// #10450 — la question rend UNE réponse, toujours : « non » si elle a été
/// retirée sans qu'un bouton soit touché (sa feuille refermée sous elle), et
/// `.unavailable` (#10463) si l'alerte n'a pas pu se présenter (contrôleur
/// déjà en présentation, hors fenêtre) ou si elle disparaît de la mémoire sans
/// réponse — l'appelant le dit alors à l'utilisateur, qui n'a rien refusé.
/// Une question restée sans réponse gardait la session prouvée en mémoire et
/// ouverte au serveur.
@MainActor
final class AccountReplacementAlert: AccountReplacementConfirming {
    nonisolated deinit {}
    static let shared = AccountReplacementAlert()

    /// Les gestionnaires d'un `UIAlertAction` s'exécutent APRÈS la sortie de
    /// l'alerte : le « non » d'une sortie sans bouton les attend.
    private static let unansweredDismissalGrace: Duration = .milliseconds(500)

    func confirmReplacing(signedIn current: MeeshyUser?, with incoming: MeeshyUser) async -> AccountReplacementDecision {
        await ask(
            title: String(localized: "signInLink.switchAccount.title", defaultValue: "Ouvrir un autre compte ?", bundle: .main),
            message: Self.message(signedIn: current, incoming: incoming),
            confirmTitle: String(localized: "signInLink.switchAccount.confirm", defaultValue: "Ouvrir ce compte", bundle: .main)
        )
    }

    /// Une question à deux réponses, « Annuler » mis en avant.
    private func ask(title: String, message: String, confirmTitle: String) async -> AccountReplacementDecision {
        guard let top = Self.topMostController() else { return .unavailable }
        let alert = AccountReplacementAlertController(title: title, message: message, preferredStyle: .alert)
        return await withCheckedContinuation { continuation in
            let answer = AccountReplacementAnswer(continuation)
            let cancel = UIAlertAction(
                title: String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main),
                style: .cancel
            ) { _ in answer.give(.declined) }
            alert.addAction(cancel)
            alert.addAction(UIAlertAction(
                title: confirmTitle,
                style: .default
            ) { _ in answer.give(.accepted) })
            alert.preferredAction = cancel
            alert.onDisappear = { [weak alert] in
                Task { @MainActor [weak alert] in
                    try? await Task.sleep(for: Self.unansweredDismissalGrace)
                    guard alert?.presentingViewController == nil else { return }
                    answer.give(.declined)
                }
            }
            top.present(alert, animated: true) { [weak alert] in
                if alert?.presentingViewController == nil { answer.give(.unavailable) }
            }
            // Une présentation refusée par UIKit ne rappelle jamais sa
            // complétion : elle se lit tout de suite, l'alerte n'a pas de parent.
            if alert.presentingViewController == nil { answer.give(.unavailable) }
        }
    }

    /// « Nom (@handle) », ou « @handle » quand le nom affiché manque ou le répète.
    nonisolated static func label(displayName: String?, username: String) -> String {
        let name = displayName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !name.isEmpty, name != username else { return "@\(username)" }
        return "\(name) (@\(username))"
    }

    private static func message(signedIn current: MeeshyUser?, incoming: MeeshyUser) -> String {
        let incomingLabel = label(displayName: incoming.displayName, username: incoming.username)
        guard let current, !current.username.isEmpty else {
            return String(localized: "signInLink.switchAccount.messageUnknownCurrent", defaultValue: "Ce lien ouvre un AUTRE compte que celui qui est ouvert : \(incomingLabel).\n\nN'ouvrez ce compte que s'il vous appartient.", bundle: .main)
        }
        let currentLabel = label(displayName: current.displayName, username: current.username)
        return String(localized: "signInLink.switchAccount.message", defaultValue: "Ce lien ouvre un AUTRE compte que le vôtre : \(incomingLabel).\n\nVous êtes connecté en tant que \(currentLabel). N'ouvrez ce compte que s'il vous appartient.", bundle: .main)
    }

    private static func topMostController() -> UIViewController? {
        var top = DeviceLayout.activeWindow?.rootViewController
        while let presented = top?.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
    }
}

/// L'alerte qui dit quand elle a QUITTÉ l'écran — un bouton touché, ou la
/// feuille qui la portait refermée sous elle.
final class AccountReplacementAlertController: UIAlertController {
    nonisolated deinit {}
    var onDisappear: (() -> Void)?

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        onDisappear?()
    }
}

/// La réponse UNIQUE à la question : la première donnée l'emporte, les
/// suivantes sont ignorées, et une question libérée sans réponse rend
/// `.unavailable` — personne n'a répondu, l'écran le dit (#10463).
nonisolated final class AccountReplacementAnswer: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<AccountReplacementDecision, Never>?

    init(_ continuation: CheckedContinuation<AccountReplacementDecision, Never>) {
        self.continuation = continuation
    }

    func give(_ answer: AccountReplacementDecision) {
        lock.lock()
        let pending = continuation
        continuation = nil
        lock.unlock()
        pending?.resume(returning: answer)
    }

    deinit {
        continuation?.resume(returning: .unavailable)
    }
}
