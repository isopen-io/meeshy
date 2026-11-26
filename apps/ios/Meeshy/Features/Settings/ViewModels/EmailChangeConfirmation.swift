import SwiftUI
import MeeshySDK
import MeeshyUI

/// LA fin d'un changement d'e-mail dans l'application (#4362).
///
/// La passerelle envoie à la nouvelle adresse un lien
/// `…/settings/verify-email-change?via=email#token=…` : le secret voyage dans
/// le FRAGMENT. Ce lien n'est revendiqué par aucune version publiée de l'app
/// (#10861) ; on le colle donc dans la Sécurité, ou le jeton seul, et ce
/// modèle le remet à `verifyEmailChange` puis relit la session — l'utilisateur
/// courant porte alors la nouvelle adresse, sans geste de plus.
@MainActor
final class EmailChangeConfirmation: ObservableObject {
    static let linkPath = "/settings/verify-email-change"
    static let minimumTokenLength = 32

    @Published var pastedLink = ""
    @Published private(set) var isConfirming = false
    @Published private(set) var error: String?

    private let userService: UserServiceProviding
    private let authManager: AuthManaging

    /// SE-0466 : même raison que `PhoneChangeFlowModel` — la deinit isolée
    /// double-libère sur iOS 26.1 quand la section se démonte.
    nonisolated deinit {}

    init(
        userService: UserServiceProviding = UserService.shared,
        authManager: AuthManaging = AuthManager.shared
    ) {
        self.userService = userService
        self.authManager = authManager
    }

    var canConfirm: Bool { Self.token(from: pastedLink) != nil && !isConfirming }

    /// Le jeton d'un lien de changement d'e-mail (fragment d'abord, requête
    /// pour les e-mails partis avant), ou le jeton collé seul. `nil` pour tout
    /// autre lien et pour un texte qui n'en est pas un.
    static func token(from pasted: String) -> String? {
        let trimmed = pasted.trimmingCharacters(in: .whitespacesAndNewlines)
        if let url = URL(string: trimmed), url.scheme != nil {
            guard url.path.hasSuffix(linkPath) else { return nil }
            return DeepLinkParser.linkSecret("token", in: url).flatMap(bareToken)
        }
        return bareToken(trimmed)
    }

    private static func bareToken(_ candidate: String) -> String? {
        let isToken = candidate.count >= minimumTokenLength && candidate.allSatisfy(\.isHexDigit)
        return isToken ? candidate : nil
    }

    /// Un envoi à la fois. Rend `true` quand l'adresse est changée.
    @discardableResult
    func confirm() async -> Bool {
        guard !isConfirming else { return false }
        error = nil
        guard let token = Self.token(from: pastedLink) else {
            HapticFeedback.error()
            error = Self.linkInvalid
            return false
        }
        isConfirming = true
        defer { isConfirming = false }
        do {
            _ = try await userService.verifyEmailChange(VerifyEmailChangeRequest(token: token))
            HapticFeedback.success()
            await authManager.checkExistingSession()
            pastedLink = ""
            return true
        } catch let failure as MeeshyError {
            HapticFeedback.error()
            switch failure {
            case .server(400, _):
                error = Self.linkInvalid
            default:
                error = failure.errorDescription
            }
            return false
        } catch {
            HapticFeedback.error()
            self.error = String(localized: "common.error.generic", defaultValue: "Une erreur est survenue", bundle: .main)
            return false
        }
    }

    private static var linkInvalid: String {
        String(localized: "settings.security.email.link_invalid", defaultValue: "Lien invalide ou expiré", bundle: .main)
    }
}
