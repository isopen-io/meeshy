import Foundation
import Combine
import os

extension AuthManager {
    /// La variante LEVANTE de `register(request:)` — la seule qui rende un refus
    /// TYPÉ à son appelant.
    ///
    /// `register(request:)` avale toute erreur dans `errorMessage: String?`, ce
    /// qui suffit à un bandeau et à rien d'autre : un écran de formulaire qui
    /// doit poser « cette adresse est déjà utilisée » SOUS le champ e-mail a
    /// besoin du `code` et du `field`, pas d'une phrase. Elle lève donc :
    ///
    /// - `MeeshyError.rejected(APIRejection)` — 400/409 typés (`VALIDATION_ERROR`,
    ///   `PHONE_INVALID`, `USERNAME_TAKEN`, `EMAIL_TAKEN`), parce que
    ///   `AuthEndpoint.register` déclare `rejectionPolicy == .structured` ;
    /// - `PhoneOwnershipConflict` — le refus servi en 200 sans compte créé ;
    /// - `MeeshyError.network(…)` — réseau indisponible.
    ///
    /// Elle tient les mêmes drapeaux (`isLoading`, `errorMessage`) que sa
    /// jumelle, pour qu'un écran branché sur l'un ou l'autre voie le même
    /// `AuthManager`.
    ///
    /// Rend `.verificationRequired` quand le compte, créé SANS numéro,
    /// attend la preuve de son adresse : aucune session n'est appliquée, et
    /// l'écran présente la saisie du code (le mot de passe est déjà sur le
    /// compte). `.authenticated` quand la session est appliquée.
    @discardableResult
    public func registerThrowing(request: RegisterRequest) async throws -> RegistrationOutcome {
        switch try await registerHoldingSession(request: request) {
        case .session(let proven, _):
            try installClosingRefused(proven)
            return .authenticated
        case .verificationRequired(let pending):
            return .verificationRequired(pending)
        }
    }

    public func register(request: RegisterRequest) async {
        guard !isSwitchingAccount else {
            errorMessage = AccountSwitchUnderway().errorDescription
            return
        }
        isLoading = true
        errorMessage = nil

        do {
            let data = try await authService.register(request: request)
            // Compte créé sans numéro : aucune session, rien d'une panne.
            if data.pendingEmailVerification(typedIdentifier: request.email) != nil {
                isLoading = false
                return
            }
            if let token = data.token, let user = data.user {
                try installClosingRefused(EmailProvenSession(
                    token: token, sessionToken: data.sessionToken, user: user, origin: .registration))
            } else {
                throw MeeshyError.server(statusCode: 0, message: "Response missing token/user data")
            }
        } catch let error as MeeshyError {
            // P1 — `APIClient` only ever throws `MeeshyError` (never the
            // legacy `APIError`); the previous `catch let error as APIError`
            // here was dead code that silently fell through to the generic
            // `catch` below. Behaviourally identical (both paths read
            // `errorDescription`), but explicit about the real error type.
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    public func requestPasswordReset(email: String) async -> Bool {
        isLoading = true
        errorMessage = nil

        do {
            try await authService.requestPasswordReset(email: email)
            isLoading = false
            return true
        } catch let error as MeeshyError {
            // P1 — `APIClient` only ever throws `MeeshyError` (never the
            // legacy `APIError`); the previous `catch let error as APIError`
            // here was dead code that silently fell through to the generic
            // `catch` below. Behaviourally identical (both paths read
            // `errorDescription`), but explicit about the real error type.
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
        return false
    }
}
