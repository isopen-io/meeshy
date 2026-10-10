import SwiftUI
import MeeshySDK
import MeeshyUI

/// LE flux d'ajout ou de changement de numéro par SMS — une seule source pour
/// la Sécurité et pour la proposition faite avant la recherche de contacts
/// (#8843).
///
/// Extrait de `SecurityView` sans changer son comportement : saisie libre du
/// numéro (la passerelle le normalise, `normalizePhoneNumber`), envoi du code,
/// six chiffres, vérification, puis relecture de la session pour que
/// l'utilisateur courant porte le nouveau numéro. Les vues ne gardent que leur
/// présentation.
@MainActor
final class PhoneChangeFlowModel: ObservableObject {
    enum Step: Equatable {
        case idle
        case editing
        case codeSent
    }

    nonisolated static let codeLength = 6
    nonisolated static let minimumPhoneLength = 6

    @Published private(set) var step: Step = .idle
    @Published var newPhone = ""
    @Published var code = "" {
        didSet {
            let sanitized = Self.sanitizedCode(code)
            if sanitized != code { code = sanitized }
        }
    }
    @Published private(set) var isSending = false
    @Published private(set) var isVerifying = false
    @Published private(set) var error: String?

    private let userService: UserServiceProviding
    private let authManager: AuthManaging

    /// SE-0466 : sans elle, la deinit synthétisée est isolée au main actor et
    /// double-libère sur iOS 26.1 quand la feuille se démonte
    /// (`MainActorDeinitSourceGuardTests`). Corps vide : rien d'isolé à toucher.
    nonisolated deinit {}

    init(
        userService: UserServiceProviding = UserService.shared,
        authManager: AuthManaging = AuthManager.shared
    ) {
        self.userService = userService
        self.authManager = authManager
    }

    var canSend: Bool { newPhone.count >= Self.minimumPhoneLength && !isSending }
    var canVerify: Bool { code.count == Self.codeLength && !isVerifying }

    nonisolated static func sanitizedCode(_ raw: String) -> String {
        String(raw.filter(\.isNumber).prefix(codeLength))
    }

    // MARK: - Étapes

    func beginEditing() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            step = .editing
        }
    }

    func cancel() {
        withAnimation {
            step = .idle
            newPhone = ""
            code = ""
            error = nil
        }
    }

    /// « Vérifier » un numéro déjà enregistré mais jamais prouvé : renvoie le
    /// code au même numéro.
    func requestCode(for phone: String) async {
        newPhone = phone
        await sendCode()
    }

    func sendCode() async {
        isSending = true
        error = nil
        defer { isSending = false }
        do {
            _ = try await userService.changePhone(ChangePhoneRequest(newPhoneNumber: newPhone))
            HapticFeedback.success()
            withAnimation { step = .codeSent }
        } catch let failure as MeeshyError {
            HapticFeedback.error()
            error = failure.errorDescription
        } catch {
            HapticFeedback.error()
            self.error = Self.genericError
        }
    }

    /// Vérifie le code ; au succès, relit la session (l'utilisateur courant
    /// porte alors le numéro) et remet le flux au repos. Rend `true` au succès.
    @discardableResult
    func verifyCode() async -> Bool {
        isVerifying = true
        error = nil
        defer { isVerifying = false }
        do {
            _ = try await userService.verifyPhoneChange(VerifyPhoneChangeRequest(code: code))
            HapticFeedback.success()
            await authManager.checkExistingSession()
            withAnimation {
                step = .idle
                code = ""
                newPhone = ""
            }
            return true
        } catch let failure as MeeshyError {
            // `APIClient` ne lève que des `MeeshyError` : un 400 est un code
            // faux ou expiré, le reste garde sa description.
            HapticFeedback.error()
            switch failure {
            case .server(400, _):
                error = String(localized: "settings.security.phone.code_invalid", defaultValue: "Code incorrect ou expiré", bundle: .main)
            default:
                error = failure.errorDescription
            }
            return false
        } catch {
            HapticFeedback.error()
            self.error = Self.genericError
            return false
        }
    }

    private static var genericError: String {
        String(localized: "common.error.generic", defaultValue: "Une erreur est survenue", bundle: .main)
    }
}
