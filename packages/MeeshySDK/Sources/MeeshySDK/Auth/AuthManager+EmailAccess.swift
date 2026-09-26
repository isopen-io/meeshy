import Foundation

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
            let data = try await authService.validateMagicLink(token: token)
            guard let token = data.token, let user = data.user else {
                throw MeeshyError.server(statusCode: 0, message: "Response missing token/user data")
            }
            applySession(token: token, sessionToken: data.sessionToken, user: user, origin: .login)
        } catch let error as MeeshyError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Email Verification

    /// Vérifie l'adresse (code ou lien) et pose la session rendue, par le MÊME
    /// chemin qu'une connexion réussie. Rend `true` si une session est ouverte,
    /// `false` si la passerelle a vérifié sans session (réponse antérieure à
    /// #8035). Lève le refus de la passerelle (code faux, expiré, débit).
    @discardableResult
    public func confirmEmail(_ request: EmailVerificationRequest) async throws -> Bool {
        let data = try await authService.confirmEmail(request)
        guard let token = data.token, let user = data.user else { return false }
        applySession(token: token, sessionToken: data.sessionToken, user: user, origin: .login)
        return true
    }
}

/// Ce dont un écran de saisie du code a besoin pour ouvrir la session.
@MainActor
public protocol EmailVerificationConfirming: AnyObject {
    func confirmEmail(_ request: EmailVerificationRequest) async throws -> Bool
}

extension AuthManager: EmailVerificationConfirming {}
