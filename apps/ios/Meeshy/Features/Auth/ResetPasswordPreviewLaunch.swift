#if DEBUG
import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Aperçu DEBUG du « Nouveau mot de passe »** (#10867), sans lien ni réseau —
/// pour vérifier au simulateur chaque état d'un compte protégé par la 2FA.
///
/// ```
/// xcrun simctl launch <udid> me.meeshy.app -MeeshyResetPasswordPreview code
/// ```
///
/// États : `code` (la saisie du code exigée d'emblée), `required` (le code
/// réclamé à l'envoi), `wrong` (code faux), `weak`, `exhausted`, `invalid`.
/// La passerelle fictive refuse tout envoi par « code faux » : aucun mot de
/// passe n'est jamais réinitialisé.
enum ResetPasswordPreviewLaunch {
    static let argument = "-MeeshyResetPasswordPreview"

    static var isActive: Bool {
        ProcessInfo.processInfo.arguments.contains(argument)
    }

    static var flow: PasswordResetFlow {
        let arguments = ProcessInfo.processInfo.arguments
        let value = arguments.firstIndex(of: argument)
            .flatMap { arguments.indices.contains($0 + 1) ? arguments[$0 + 1] : nil }
        switch value {
        case "required": return PasswordResetFlow().resolved(.secondFactorRequired)
        case "wrong": return PasswordResetFlow(requiresSecondFactor: true).resolved(.secondFactorInvalid)
        case "weak": return PasswordResetFlow(requiresSecondFactor: true).resolved(.weakPassword)
        case "exhausted": return PasswordResetFlow().resolved(.attemptsExhausted)
        case "invalid": return PasswordResetFlow().resolved(.invalidToken)
        default: return PasswordResetFlow(requiresSecondFactor: true)
        }
    }
}

struct ResetPasswordPreviewScreen: View {
    var body: some View {
        MeeshyNewPasswordView(
            resetToken: "preview-token",
            service: PreviewPasswordResetService(),
            initialFlow: ResetPasswordPreviewLaunch.flow,
            onSignIn: {}
        )
    }
}

nonisolated private final class PreviewPasswordResetService: PasswordResetProviding, @unchecked Sendable {
    func verifyResetToken(_ token: String) async throws -> ResetTokenVerification {
        ResetTokenVerification(valid: true, requires2FA: true)
    }

    func submitPasswordReset(token: String, newPassword: String, twoFactorCode: String?) async throws {
        throw MeeshyError.rejected(APIRejection(statusCode: 400, code: "TWO_FACTOR_INVALID", message: "Invalid 2FA code"))
    }
}

/// **Aperçu DEBUG de « Mot de passe oublié »** (#10885), sans réseau — pour
/// vérifier au simulateur que le bouton reste désactivé tant que la saisie est
/// incomplète.
///
/// ```
/// xcrun simctl launch <udid> me.meeshy.app -MeeshyForgotPasswordPreview
/// xcrun simctl launch <udid> me.meeshy.app -MeeshyForgotPasswordPreview ada@meeshy.me
/// ```
enum ForgotPasswordPreviewLaunch {
    static let argument = "-MeeshyForgotPasswordPreview"

    static var isActive: Bool {
        ProcessInfo.processInfo.arguments.contains(argument)
    }

    static var prefilledEmail: String {
        let arguments = ProcessInfo.processInfo.arguments
        guard let value = arguments.firstIndex(of: argument)
            .flatMap({ arguments.indices.contains($0 + 1) ? arguments[$0 + 1] : nil }),
              !value.hasPrefix("-") else { return "" }
        return value
    }
}

struct ForgotPasswordPreviewScreen: View {
    var body: some View {
        MeeshyForgotPasswordView(prefilledEmail: ForgotPasswordPreviewLaunch.prefilledEmail)
    }
}
#endif
