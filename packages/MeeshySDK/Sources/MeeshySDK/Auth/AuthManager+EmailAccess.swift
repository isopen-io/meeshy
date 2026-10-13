import Foundation
import os

/// Les portes qui passent par la boîte e-mail : le lien de connexion, et la
/// vérification d'adresse qui, depuis #8035, OUVRE la session.
extension AuthManager {

    // MARK: - Magic Link

    public func requestMagicLink(email: String) async -> Bool {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            _ = try await authService.requestMagicLink(email: email, deviceFingerprint: nil)
            return true
        } catch let error as MeeshyError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        return false
    }

    public func validateMagicLink(token: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            openSession(try await verifyMagicLink(token: token))
        } catch let error as MeeshyError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Valide le lien de connexion SANS poser la session (#8076) : un lien
    /// ouvert pendant qu'une présentation d'accès est affichée attend qu'elle
    /// se referme, sinon elle resterait orpheline sous la nouvelle racine.
    public func verifyMagicLink(token: String) async throws -> EmailProvenSession {
        let data = try await authService.validateMagicLink(token: token)
        guard let proven = try EmailProvenSession.served(by: data) else {
            throw MeeshyError.server(statusCode: 0, message: "Response missing token/user data")
        }
        return proven
    }

    // MARK: - Email Verification

    /// Vérifie l'adresse (code ou lien) et pose la session rendue, par le MÊME
    /// chemin qu'une connexion réussie. Rend `true` si une session est ouverte,
    /// `false` si la passerelle a vérifié sans session (réponse antérieure à
    /// #8035). Lève le refus de la passerelle (code faux, expiré, débit).
    @discardableResult
    public func confirmEmail(_ request: EmailVerificationRequest) async throws -> Bool {
        guard let proven = try await verifyEmail(request) else { return false }
        openSession(proven)
        return true
    }

    /// Vérifie l'adresse SANS poser la session (#8059) : l'écran qui a présenté
    /// la saisie du code doit d'abord se REFERMER. Ouvrir la session bascule la
    /// racine de l'app et démonte l'écran de connexion — une feuille encore
    /// présentée par lui resterait orpheline, figée, sans « Fermer » qui
    /// réponde. `nil` ⇒ vérifiée sans session (passerelle antérieure à #8035).
    ///
    /// Lève `SecondFactorRequired` quand le compte porte un second facteur
    /// (#10445) : l'adresse est prouvée, mais aucune session n'est rendue —
    /// ce n'est ni un refus ni un « Email vérifié ! ».
    public func verifyEmail(_ request: EmailVerificationRequest) async throws -> EmailProvenSession? {
        try EmailProvenSession.served(by: try await authService.confirmEmail(request))
    }

    // MARK: - Inscription, session tenue (#8288)

    /// Crée le compte SANS poser la session : l'écran d'inscription la tient
    /// le temps que sa carte reçoive le code, puis la pose par `openSession`.
    /// Mêmes drapeaux que `registerThrowing` (`isLoading`, `errorMessage`), et
    /// mêmes refus : `PhoneOwnershipConflict`, `MeeshyError`.
    public func registerHoldingSession(request: RegisterRequest) async throws -> RegistrationHold {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let data = try await authService.register(request: request)
            // Le conflit de numéro est un 200 qui n'a RIEN créé : le tester
            // avant `token`/`user` évite de le rendre comme une réponse tronquée.
            if data.phoneOwnershipConflict == true {
                throw PhoneOwnershipConflict()
            }
            if let pending = data.pendingEmailVerification(typedIdentifier: request.email) {
                return .verificationRequired(pending)
            }
            guard let token = data.token, let user = data.user else {
                throw MeeshyError.server(statusCode: 0, message: "Response missing token/user data")
            }
            let watch = data.pendingSessionToken.flatMap { $0.isEmpty ? nil : $0 }
            let proven = EmailProvenSession(token: token, sessionToken: data.sessionToken, user: user, origin: .registration)
            return .session(proven, pendingSessionToken: watch)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            throw error
        }
    }

    /// Pose la session prouvée par `verifyEmail`, comme une connexion réussie.
    public func openSession(_ proven: EmailProvenSession) {
        applySession(token: proven.token, sessionToken: proven.sessionToken, user: proven.user, origin: proven.origin)
    }

    // MARK: - Un lien qui ouvre un AUTRE compte (#10445)

    /// Passe à la session PROUVÉE d'un autre compte en GARDANT celle qu'on
    /// quitte : même sortie que « Changer de compte » (`suspendActiveSession`),
    /// le compte quitté reste au sélecteur et se reprend sans mot de passe.
    /// Rien n'est écrit au trousseau pour le compte entrant avant cet appel :
    /// la session rendue par la preuve n'existe qu'en mémoire jusque-là.
    public func switchToProvenAccount(_ proven: EmailProvenSession) async {
        guard isAuthenticated, proven.user.id != activeUserId else {
            openSession(proven)
            return
        }
        isSwitchingAccount = true
        defer { isSwitchingAccount = false }
        await suspendActiveSession()
        // Même image à l'état « sorti » que `switchAccount(to:)` : sans elle,
        // `false` puis `true` dans le même tour échappent aux observateurs.
        try? await Task.sleep(for: .milliseconds(150))
        await CacheAccountBinder.shared.bind(accountKey(for: proven.user.id)).value
        openSession(proven)
    }

    /// Ferme côté passerelle une session prouvée que l'utilisateur a REFUSÉE :
    /// la preuve a consommé le jeton et ouvert une session serveur, qui ne doit
    /// pas survivre à un « Annuler ». Rien ne change sur l'appareil.
    public func discardProvenSession(_ proven: EmailProvenSession) async {
        do {
            try await authService.logoutThrowing(token: proven.token)
        } catch {
            Logger.auth.warning("Refused proven session could not be closed server-side: \(error.localizedDescription, privacy: .public)")
        }
    }
}

/// La passerelle a prouvé l'adresse, mais le compte attend son second facteur
/// (`requires2FA`) : aucune session n'est rendue (#10445).
public struct SecondFactorRequired: Error, Equatable, Sendable {
    public let twoFactorToken: String?

    public init(twoFactorToken: String?) {
        self.twoFactorToken = twoFactorToken
    }
}

/// Une session que la preuve de l'adresse a rendue, pas encore posée (#8059).
public struct EmailProvenSession: Sendable {
    public let token: String
    public let sessionToken: String?
    public let user: MeeshyUser
    /// D'où vient la session qu'on posera — une preuve d'adresse ouvre une
    /// CONNEXION ; la carte de l'inscription (#8288) tient celle d'un compte
    /// qu'elle vient de CRÉER, et le report de la demande de notifications en dépend.
    public let origin: SessionOrigin

    public init(token: String, sessionToken: String?, user: MeeshyUser, origin: SessionOrigin = .login) {
        self.token = token
        self.sessionToken = sessionToken
        self.user = user
        self.origin = origin
    }

    /// La session que sert une réponse de preuve d'adresse. `nil` ⇒ adresse
    /// prouvée sans session (passerelle antérieure à #8035) ; lève
    /// `SecondFactorRequired` quand le compte attend son second facteur.
    static func served(by data: LoginResponseData) throws -> EmailProvenSession? {
        if data.requires2FA == true {
            throw SecondFactorRequired(twoFactorToken: data.twoFactorToken)
        }
        guard let token = data.token, let user = data.user else { return nil }
        return EmailProvenSession(token: token, sessionToken: data.sessionToken, user: user)
    }

    /// La même session, sous une autre origine.
    public func originating(from origin: SessionOrigin) -> EmailProvenSession {
        EmailProvenSession(token: token, sessionToken: sessionToken, user: user, origin: origin)
    }
}

/// Ce dont un écran de saisie du code a besoin : prouver l'adresse, puis — une
/// fois l'écran refermé — ouvrir la session (#8059).
@MainActor
public protocol EmailVerificationConfirming: AnyObject {
    func verifyEmail(_ request: EmailVerificationRequest) async throws -> EmailProvenSession?
    func openSession(_ proven: EmailProvenSession)
}

extension AuthManager: EmailVerificationConfirming {}
